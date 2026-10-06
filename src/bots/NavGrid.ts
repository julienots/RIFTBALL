import type { Arena } from '../arenas/Arena';

/**
 * Coarse occupancy grid + A* used by bots. Rebuilt lazily when arena walls change.
 * Buffers are preallocated: pathfinding performs no per-call allocations except the result path.
 */
export class NavGrid {
  readonly cell = 50;
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  private lava: Uint8Array;
  private g: Float32Array;
  private f: Float32Array;
  private parent: Int32Array;
  private closed: Uint8Array;
  private open: Int32Array; // binary heap of indices
  private openSize = 0;
  private stamp: Uint32Array;
  private curStamp = 1;
  private builtVersion = -1;

  constructor(private arena: Arena, private pad = 30) {
    this.cols = Math.ceil(arena.w / this.cell);
    this.rows = Math.ceil(arena.h / this.cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.lava = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.open = new Int32Array(n);
    this.stamp = new Uint32Array(n);
  }

  rebuildIfNeeded() {
    if (this.builtVersion === this.arena.version) return;
    this.builtVersion = this.arena.version;
    const c = this.cell;
    for (let r = 0; r < this.rows; r++) {
      for (let q = 0; q < this.cols; q++) {
        const x = q * c + c / 2, y = r * c + c / 2;
        this.blocked[r * this.cols + q] = this.arena.pointBlocked(x, y, this.pad) ? 1 : 0;
        let lava = 0;
        for (const h of this.arena.hazards) if (h.kind === 'lava' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) lava = 1;
        this.lava[r * this.cols + q] = lava;
      }
    }
  }

  isBlockedAt(x: number, y: number) {
    const q = Math.floor(x / this.cell), r = Math.floor(y / this.cell);
    if (q < 0 || r < 0 || q >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + q] === 1;
  }

  /** Returns waypoints (world coords) from start to goal, or [] if unreachable. Max ~2.5k node expansions. */
  findPath(sx: number, sy: number, gx: number, gy: number, avoidLava: boolean): number[] {
    this.rebuildIfNeeded();
    const cols = this.cols, rows = this.rows, c = this.cell;
    let s = this.nearestFree(Math.floor(sx / c), Math.floor(sy / c));
    let t = this.nearestFree(Math.floor(gx / c), Math.floor(gy / c));
    if (s < 0 || t < 0) return [];
    if (s === t) return [gx, gy];
    this.curStamp++;
    const st = this.curStamp;
    this.openSize = 0;
    const tq = t % cols, tr = (t / cols) | 0;
    const h = (i: number) => { const dq = Math.abs((i % cols) - tq), dr = Math.abs(((i / cols) | 0) - tr); return (dq + dr) + (Math.SQRT2 - 2) * Math.min(dq, dr); };
    this.touch(s, st); this.g[s] = 0; this.f[s] = h(s); this.parent[s] = -1; this.push(s);
    let expansions = 0;
    while (this.openSize > 0 && expansions < 2500) {
      const cur = this.pop();
      if (cur === t) break;
      if (this.closed[cur]) continue;
      this.closed[cur] = 1;
      expansions++;
      const cq = cur % cols, cr = (cur / cols) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
        if (!dq && !dr) continue;
        const nq = cq + dq, nr = cr + dr;
        if (nq < 0 || nr < 0 || nq >= cols || nr >= rows) continue;
        const n = nr * cols + nq;
        if (this.blocked[n]) continue;
        if (dq && dr && (this.blocked[cr * cols + nq] || this.blocked[nr * cols + cq])) continue; // no corner cutting
        this.touch(n, st);
        if (this.closed[n]) continue;
        const cost = (dq && dr ? Math.SQRT2 : 1) + (avoidLava && this.lava[n] ? 6 : 0);
        const ng = this.g[cur] + cost;
        if (ng < this.g[n]) { this.g[n] = ng; this.f[n] = ng + h(n); this.parent[n] = cur; this.push(n); }
      }
    }
    if (this.stamp[t] !== st || this.parent[t] === -1 && t !== s) return [];
    // reconstruct
    const cells: number[] = [];
    let cur = t, guard = 0;
    while (cur !== -1 && guard++ < 4000) { cells.push(cur); cur = this.parent[cur]; }
    cells.reverse();
    const out: number[] = [];
    // simple string-pulling: skip cells that are visible in straight line
    let anchor = 0;
    for (let i = 1; i < cells.length; i++) {
      if (i === cells.length - 1 || !this.lineFree(cells[anchor], cells[i + 1])) {
        out.push((cells[i] % cols) * c + c / 2, ((cells[i] / cols) | 0) * c + c / 2);
        anchor = i;
      }
    }
    out[out.length - 2] = gx; out[out.length - 1] = gy;
    if (out.length === 0) out.push(gx, gy);
    return out;
  }

  private lineFree(a: number, b: number) {
    const cols = this.cols;
    let x0 = a % cols, y0 = (a / cols) | 0;
    const x1 = b % cols, y1 = (b / cols) | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, guard = 0;
    while (guard++ < 200) {
      if (this.blocked[y0 * cols + x0] || this.lava[y0 * cols + x0]) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return false;
  }

  private nearestFree(q: number, r: number): number {
    q = Math.max(0, Math.min(this.cols - 1, q)); r = Math.max(0, Math.min(this.rows - 1, r));
    for (let rad = 0; rad < 6; rad++) {
      for (let dr = -rad; dr <= rad; dr++) for (let dq = -rad; dq <= rad; dq++) {
        if (Math.max(Math.abs(dq), Math.abs(dr)) !== rad) continue;
        const nq = q + dq, nr = r + dr;
        if (nq < 0 || nr < 0 || nq >= this.cols || nr >= this.rows) continue;
        const i = nr * this.cols + nq;
        if (!this.blocked[i]) return i;
      }
    }
    return -1;
  }

  private touch(i: number, st: number) {
    if (this.stamp[i] !== st) { this.stamp[i] = st; this.g[i] = Infinity; this.closed[i] = 0; this.parent[i] = -1; }
  }
  private push(i: number) {
    let k = this.openSize++;
    this.open[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[this.open[p]] <= this.f[this.open[k]]) break;
      const tmp = this.open[p]; this.open[p] = this.open[k]; this.open[k] = tmp; k = p;
    }
  }
  private pop(): number {
    const top = this.open[0];
    this.open[0] = this.open[--this.openSize];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < this.openSize && this.f[this.open[l]] < this.f[this.open[m]]) m = l;
      if (r < this.openSize && this.f[this.open[r]] < this.f[this.open[m]]) m = r;
      if (m === k) break;
      const tmp = this.open[m]; this.open[m] = this.open[k]; this.open[k] = tmp; k = m;
    }
    return top;
  }
}
