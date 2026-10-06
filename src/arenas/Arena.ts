import type { ArenaData, TeamId } from '../data/types';
import { ARENA_H, ARENA_W, PORTAL } from '../data/arenas';
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
}

export interface Hazard extends Rect {
  kind: 'lava' | 'ice' | 'teleport' | 'boost';
  pair: number;
  active: boolean;
  /** lava cycle phase offset */
  phase: number;
  temporary: boolean;
  expiresAt: number;
}

export interface PortalZone extends Rect { team: TeamId }

const mirrorRect = (r: [number, number, number, number]): [number, number, number, number] => [ARENA_W - r[0] - r[2], r[1], r[2], r[3]];

/** Runtime arena geometry built from ArenaData (pure data -> world). */
export class Arena {
  readonly w = ARENA_W;
  readonly h = ARENA_H;
  walls: Wall[] = [];
  bushes: Rect[] = [];
  hazards: Hazard[] = [];
  portals: [PortalZone, PortalZone];
  spawns: [{ x: number; y: number }[], { x: number; y: number }[]];
  center = { x: ARENA_W / 2, y: ARENA_H / 2 };
  private wallSeq = 1;
  /** Bumped every time walls change so nav grids can rebuild lazily. */
  version = 0;

  constructor(public data: ArenaData) {
    const py = (ARENA_H - PORTAL.height) / 2;
    this.portals = [
      { x: 0, y: py, w: PORTAL.depth, h: PORTAL.height, team: 0 },
      { x: ARENA_W - PORTAL.depth, y: py, w: PORTAL.depth, h: PORTAL.height, team: 1 },
    ];
    const sx = 300;
    const spawnY = [ARENA_H / 2, ARENA_H / 2 - 260, ARENA_H / 2 + 260];
    this.spawns = [spawnY.map((y) => ({ x: sx, y })), spawnY.map((y) => ({ x: ARENA_W - sx, y }))];

    // Border walls (top/bottom full, left/right with portal openings)
    const T = 60;
    this.addStatic({ x: -T, y: -T, w: ARENA_W + 2 * T, h: T }, true);
    this.addStatic({ x: -T, y: ARENA_H, w: ARENA_W + 2 * T, h: T }, true);
    this.addStatic({ x: -T, y: 0, w: T, h: py }, true);
    this.addStatic({ x: -T, y: py + PORTAL.height, w: T, h: ARENA_H - py - PORTAL.height }, true);
    this.addStatic({ x: ARENA_W, y: 0, w: T, h: py }, true);
    this.addStatic({ x: ARENA_W, y: py + PORTAL.height, w: T, h: ARENA_H - py - PORTAL.height }, true);
    // back of the portals so nothing exits the world
    this.addStatic({ x: -T * 2, y: py - 10, w: T, h: PORTAL.height + 20 }, true);
    this.addStatic({ x: ARENA_W + T, y: py - 10, w: T, h: PORTAL.height + 20 }, true);

    for (const r of data.walls) { this.addStaticArr(r); this.addStaticArr(mirrorRect(r)); }
    for (const r of data.centerWalls ?? []) this.addStaticArr(r);
    for (const r of data.bushes) { this.bushes.push(toRect(r)); this.bushes.push(toRect(mirrorRect(r))); }
    let i = 0;
    for (const hz of data.hazards) {
      this.hazards.push(mkHazard(hz.kind, hz.rect, hz.pair ?? 0, i++ * 1.7));
      if (hz.mirror) this.hazards.push(mkHazard(hz.kind, mirrorRect(hz.rect), hz.pair ?? 0, i++ * 1.7));
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
    if (r.x < 0 || r.y < 0 || r.x + r.w > ARENA_W || r.y + r.h > ARENA_H) return null;
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
      if (w.dynamic && (time >= w.expiresAt || w.hp <= 0)) { this.walls.splice(i, 1); this.version++; }
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
