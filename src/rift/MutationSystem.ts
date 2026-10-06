import type { Match } from '../game/Match';
import type { MutationId } from '../data/types';
import { MUTATIONS, getMutation } from '../data/mutations';
import { applyDamage } from '../combat/Combat';
import { createRift, setRiftState } from './Rift';
import { dist2 } from '../core/math';

const ANNOUNCE = 1.8;

/** Drives the signature mechanic: scheduled Rift mutations that change the match rules temporarily. */
export class MutationSystem {
  pending: MutationId | null = null;
  pendingAt = 0;
  nextAt: number;
  until = 0;
  last: MutationId = 'NORMAL';
  private nextZap = 0;
  count = 0;

  constructor(private m: Match, private interval: number, firstAt: number) {
    this.nextAt = interval > 0 ? firstAt : Infinity;
  }

  /** Force a mutation now (tutorial, debug, events). */
  trigger(id?: MutationId) {
    this.nextAt = this.m.time;
    if (id) this.forced = id;
  }
  private forced: MutationId | null = null;

  update(dt: number) {
    const m = this.m;
    if (m.phase !== 'play' && m.phase !== 'overtime') return;

    if (m.mutation !== 'NORMAL' && m.time >= this.until) this.end();

    if (this.pending && m.time >= this.pendingAt) this.start(this.pending);

    if (!this.pending && m.mutation === 'NORMAL' && m.time >= this.nextAt) {
      const id = this.forced ?? this.pick();
      this.forced = null;
      this.pending = id;
      this.pendingAt = m.time + ANNOUNCE;
      const r = m.mainRift();
      if (r && r.carrier < 0 && r.state !== 'PORTAL') setRiftState(m, r, 'MUTATING');
      m.emit({ t: 'mutation_warn', mutation: id });
    }

    if (m.mutation === 'ELECTRIC' && m.time >= this.nextZap) {
      const p = m.mutationParams;
      this.nextZap = m.time + p.interval;
      for (const r of m.rifts) {
        if (!r.alive || r.clone) continue;
        const carrier = r.carrier >= 0 ? m.heroById(r.carrier) : null;
        for (const h of m.heroes) {
          if (!h.alive || (carrier && h.team === carrier.team)) continue;
          if (dist2(h.x, h.y, r.x, r.y) < p.radius * p.radius) {
            applyDamage(m, h, p.damage, null, { slow: 0.2, slowDuration: 0.5 });
            m.emit({ t: 'zap', x: r.x, y: r.y, tx: h.x, ty: h.y });
          }
        }
        if (carrier) applyDamage(m, carrier, p.carrierDamage, null, { noUlt: true });
      }
    }

    if (m.mutation === 'GRAVITY') {
      const r = m.mainRift();
      const p = m.mutationParams;
      if (r) for (const h of m.heroes) {
        if (!h.alive || h.id === r.carrier) continue;
        const dx = r.x - h.x, dy = r.y - h.y, d = Math.hypot(dx, dy);
        if (d > 60 && d < p.radius) { h.x += (dx / d) * p.pull * dt; h.y += (dy / d) * p.pull * dt; }
      }
    }
  }

  private pick(): MutationId {
    const pool = MUTATIONS.filter((x) => x.weight > 0 && x.id !== this.last);
    let total = 0;
    for (const x of pool) total += x.weight;
    let roll = this.m.rng.range(0, total);
    for (const x of pool) { roll -= x.weight; if (roll <= 0) return x.id; }
    return pool[0].id;
  }

  private start(id: MutationId) {
    const m = this.m;
    const data = getMutation(id);
    this.pending = null;
    this.last = id;
    this.count++;
    m.mutation = id;
    m.mutationParams = data.params;
    this.until = m.time + data.duration;
    const r = m.mainRift();
    if (r && (r.state === 'MUTATING')) setRiftState(m, r, r.carrier >= 0 ? 'CARRIED' : 'ROAM');
    m.emit({ t: 'mutation_start', mutation: id });

    switch (id) {
      case 'CLONE': {
        if (!r) break;
        setRiftState(m, r, r.carrier >= 0 ? 'CARRIED' : 'CLONING');
        for (let i = 0; i < data.params.clones; i++) {
          const a = (i / data.params.clones) * Math.PI * 2 + m.rng.range(0, 1);
          const c = createRift(m.nextRiftId(), r.x + Math.cos(a) * 40, r.y + Math.sin(a) * 40, true);
          c.vx = Math.cos(a) * 520; c.vy = Math.sin(a) * 520;
          c.state = 'DROPPED';
          c.dieAt = m.time + data.params.cloneLife;
          m.rifts.push(c);
        }
        m.emit({ t: 'explosion', x: r.x, y: r.y, radius: 160, color: data.color });
        // the main rift resumes after the split
        if (r.carrier < 0) { r.state = 'ROAM'; }
        break;
      }
      case 'PORTAL': {
        for (let i = 0; i < data.params.pairs; i++) {
          const a = this.freeSpot(), b = this.freeSpot();
          const pair = 100 + this.count * 10 + i;
          m.arena.addTempHazard('teleport', { x: a.x - 55, y: a.y - 55, w: 110, h: 110 }, this.until, pair);
          m.arena.addTempHazard('teleport', { x: b.x - 55, y: b.y - 55, w: 110, h: 110 }, this.until, pair);
        }
        break;
      }
      case 'CHAOS': {
        for (let i = 0; i < data.params.blocks; i++) {
          const s = this.freeSpot();
          const w = m.arena.addDynamicWall({ x: s.x - 50, y: s.y - 50, w: 100, h: 100 }, 3000, this.until, -1 as any);
          if (w) m.emit({ t: 'wall', x: w.x, y: w.y, w: w.w, h: w.h });
        }
        for (let i = 0; i < data.params.hazards; i++) {
          const s = this.freeSpot();
          m.arena.addTempHazard(m.rng.chance(0.5) ? 'lava' : 'ice', { x: s.x - 90, y: s.y - 90, w: 180, h: 180 }, this.until);
        }
        m.unstickFromWalls();
        break;
      }
      case 'ELECTRIC':
        this.nextZap = m.time + 0.5;
        break;
    }
  }

  private freeSpot() {
    const m = this.m;
    for (let tries = 0; tries < 40; tries++) {
      const x = m.rng.range(400, m.arena.w - 400), y = m.rng.range(150, m.arena.h - 150);
      if (m.arena.pointBlocked(x, y, 90)) continue;
      let near = false;
      for (const h of m.heroes) if (h.alive && dist2(h.x, h.y, x, y) < 130 * 130) near = true;
      for (const r of m.rifts) if (r.alive && dist2(r.x, r.y, x, y) < 130 * 130) near = true;
      if (!near) return { x, y };
    }
    return { x: m.arena.center.x, y: m.arena.center.y - 300 };
  }

  end() {
    const m = this.m;
    const prev = m.mutation;
    if (prev === 'NORMAL') return;
    m.mutation = 'NORMAL';
    m.mutationParams = {};
    this.nextAt = m.time + this.interval;
    // clean temporary geometry right away
    for (const w of m.arena.walls) if (w.dynamic && w.team === (-1 as any)) w.expiresAt = m.time;
    for (const h of m.arena.hazards) if (h.temporary) h.expiresAt = m.time;
    m.emit({ t: 'mutation_end', mutation: prev });
  }

  /** Called when a goal resets the field. */
  resetAfterGoal() {
    if (this.pending) { this.pending = null; }
    if (this.m.mutation !== 'NORMAL') this.end();
  }
}
