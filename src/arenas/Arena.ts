import type { ArenaData, TeamId } from '../data/types';
import { ARENA_H, ARENA_SCALE, ARENA_W, PORTAL } from '../data/arenas';
import type { Rect } from '../core/math';
import { pointInRect } from '../core/math';

export interface Wall extends Rect {
  id: number;
  dynamic: boolean;
  hp: number;
  maxHp: number;
  expiresAt: number;     // match time, Infinity for static
  team: TeamId | -1;
  border?: boolean;
  /** destructible crate (drops power-ups) */
  crate?: boolean;
}

export interface Hazard extends Rect {
  kind: 'lava' | 'ice' | 'teleport' | 'boost' | 'jump';
  pair: number;
  active: boolean;
  /** lava cycle phase offset */
  phase: number;
  temporary: boolean;
  expiresAt: number;
}

export interface PortalZone extends Rect { team: TeamId }


/** Runtime arena geometry built from ArenaData (pure data -> world). */
export class Arena {
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  walls: Wall[] = [];
  bushes: Rect[] = [];
  hazards: Hazard[] = [];
  shrines: { x: number; y: number }[] = [];
  portals: [PortalZone, PortalZone];
  spawns: [{ x: number; y: number }[], { x: number; y: number }[]];
  center: { x: number; y: number };
  /** crates destroyed since the last call to update() (consumed by the Match for power-up drops) */
  brokenCrates: Wall[] = [];
  private wallSeq = 1;
  /** Bumped every time walls change so nav grids can rebuild lazily. */
  version = 0;

  constructor(public data: ArenaData) {
    const S = (this.scale = data.scale ?? ARENA_SCALE);
    const W = (this.w = Math.round(ARENA_W * S)), H = (this.h = Math.round(ARENA_H * S));
    this.center = { x: W / 2, y: H / 2 };
    const sc = (r: [number, number, number, number]): [number, number, number, number] => [r[0] * S, r[1] * S, r[2] * S, r[3] * S];
    const mir = (r: [number, number, number, number]): [number, number, number, number] => [W - r[0] - r[2], r[1], r[2], r[3]];
    const PH = Math.round(PORTAL.height * Math.min(S, 1.15)), PD = PORTAL.depth;
    const py = (H - PH) / 2;
    this.portals = [
      { x: 0, y: py, w: PD, h: PH, team: 0 },
      { x: W - PD, y: py, w: PD, h: PH, team: 1 },
    ];
    const sx = 300 * S;
    const spawnY = [H / 2, H / 2 - 270 * S, H / 2 + 270 * S];
    this.spawns = [spawnY.map((y) => ({ x: sx, y })), spawnY.map((y) => ({ x: W - sx, y }))];

    // Border walls (top/bottom full, left/right with portal openings)
    const T = 60;
    this.addStatic({ x: -T, y: -T, w: W + 2 * T, h: T }, true);
    this.addStatic({ x: -T, y: H, w: W + 2 * T, h: T }, true);
    this.addStatic({ x: -T, y: 0, w: T, h: py }, true);
    this.addStatic({ x: -T, y: py + PH, w: T, h: H - py - PH }, true);
    this.addStatic({ x: W, y: 0, w: T, h: py }, true);
    this.addStatic({ x: W, y: py + PH, w: T, h: H - py - PH }, true);
    // back of the portals so nothing exits the world
    this.addStatic({ x: -T * 2, y: py - 10, w: T, h: PH + 20 }, true);
    this.addStatic({ x: W + T, y: py - 10, w: T, h: PH + 20 }, true);

    for (const r of data.walls) { this.addStaticArr(sc(r)); this.addStaticArr(mir(sc(r))); }
    for (const r of data.centerWalls ?? []) this.addStaticArr(sc(r));
    for (const r of data.bushes) { this.bushes.push(toRect(sc(r))); this.bushes.push(toRect(mir(sc(r)))); }
    for (const r of data.crates ?? []) for (const q of [sc(r), mir(sc(r))]) {
      this.walls.push({ x: q[0], y: q[1], w: q[2], h: q[3], id: this.wallSeq++, dynamic: true, hp: 2400, maxHp: 2400, expiresAt: Infinity, team: -1, crate: true });
      this.version++;
    }
    for (const [x, y] of data.shrines ?? []) { this.shrines.push({ x: x * S, y: y * S }); this.shrines.push({ x: W - x * S, y: y * S }); }
    let i = 0;
    for (const hz of data.hazards) {
      this.hazards.push(mkHazard(hz.kind, sc(hz.rect), hz.pair ?? 0, i++ * 1.7));
      if (hz.mirror) this.hazards.push(mkHazard(hz.kind, mir(sc(hz.rect)), hz.pair ?? 0, i++ * 1.7));
    }
  }

  private addStaticArr(r: [number, number, number, number]) { this.addStatic(toRect(r)); }
  private addStatic(r: Rect, border = false) {
    this.walls.push({ ...r, id: this.wallSeq++, dynamic: false, hp: Infinity, maxHp: Infinity, expiresAt: Infinity, team: -1, border });
    this.version++;
  }

  addDynamicWall(r: Rect, hp: number, expiresAt: number, team: TeamId): Wall | null {
    // never block portals or the inside of another wall completely
    for (const p of this.portals) if (overlaps(r, inflate(p, 40))) return null;
    if (r.x < 0 || r.y < 0 || r.x + r.w > this.w || r.y + r.h > this.h) return null;
    const w: Wall = { ...r, id: this.wallSeq++, dynamic: true, hp, maxHp: hp, expiresAt, team };
    this.walls.push(w);
    this.version++;
    return w;
  }

  removeWall(w: Wall) {
    const i = this.walls.indexOf(w);
    if (i >= 0) { this.walls.splice(i, 1); this.version++; }
  }

  addTempHazard(kind: Hazard['kind'], r: Rect, expiresAt: number, pair = 0) {
    const h = mkHazard(kind, [r.x, r.y, r.w, r.h], pair, 0);
    h.temporary = true; h.expiresAt = expiresAt;
    this.hazards.push(h);
    return h;
  }

  update(time: number) {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.dynamic && (time >= w.expiresAt || w.hp <= 0)) { if (w.crate) this.brokenCrates.push(w); this.walls.splice(i, 1); this.version++; }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (h.temporary && time >= h.expiresAt) { this.hazards.splice(i, 1); continue; }
      if (h.kind === 'lava' && this.data.special === 'lava_cycle' && !h.temporary) {
        // 6s cycle: 3.5s dormant, 0.8s warning (inactive), 1.7s active
        const t = (time + h.phase) % 6;
        h.active = t > 4.3;
      }
    }
  }

  /** Lava "about to erupt" state for visuals. */
  lavaWarning(h: Hazard, time: number) {
    if (h.kind !== 'lava' || this.data.special !== 'lava_cycle' || h.temporary) return false;
    const t = (time + h.phase) % 6;
    return t > 3.5 && t <= 4.3;
  }

  inBush(x: number, y: number) {
    for (const b of this.bushes) if (pointInRect(x, y, b)) return true;
    return false;
  }

  hazardAt(x: number, y: number, kind: Hazard['kind']): Hazard | null {
    for (const h of this.hazards) if (h.kind === kind && h.active && pointInRect(x, y, h)) return h;
    return null;
  }

  pointBlocked(x: number, y: number, pad = 0) {
    for (const w of this.walls) {
      if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) return true;
    }
    return false;
  }

  /** Teams attack towards the enemy portal: BLUE (0) scores in RED's portal (1). */
  enemyPortal(team: TeamId) { return this.portals[team === 0 ? 1 : 0]; }
  ownPortal(team: TeamId) { return this.portals[team]; }
}

function toRect(r: [number, number, number, number]): Rect { return { x: r[0], y: r[1], w: r[2], h: r[3] }; }
function mkHazard(kind: Hazard['kind'], r: [number, number, number, number], pair: number, phase: number): Hazard {
  return { x: r[0], y: r[1], w: r[2], h: r[3], kind, pair, active: true, phase, temporary: false, expiresAt: Infinity };
}
export function overlaps(a: Rect, b: Rect) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
export function inflate(r: Rect, d: number): Rect { return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }; }
