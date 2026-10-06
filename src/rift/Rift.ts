import type { Match } from '../game/Match';
import type { RiftEntity } from '../game/entities';
import type { RiftState } from '../data/types';
import { circleRectPush, dist2, pointInRect } from '../core/math';

const BASE = {
  roamSpeed: 95,
  fleeSpeed: 215,
  chaseSpeed: 170,
  frenzySpeed: 420,
  fleeRange: 250,
  throwSpeed: 1050,
  friction: 2.1,
  radius: 24,
};

export function createRift(id: number, x: number, y: number, clone = false): RiftEntity {
  return {
    id, x, y, vx: 0, vy: 0, radius: clone ? 16 : BASE.radius, state: 'IDLE', stateTime: 0, carrier: -1,
    lastTouchTeam: -1, lastTouchAt: -99, lastThrower: -1, pickupLockUntil: 0, pickupLockHero: -1, clone, alive: true, dieAt: Infinity,
    targetX: x, targetY: y, attractX: 0, attractY: 0, attractForce: 0, attractUntil: 0, portalTeam: -1, look: 0, mood: 0,
  };
}

export function setRiftState(m: Match, r: RiftEntity, s: RiftState) {
  if (r.state === s) return;
  r.state = s;
  r.stateTime = 0;
  if (!r.clone) m.emit({ t: 'rift_state', rift: r.id, state: s });
}

const tmp = { x: 0, y: 0 };

/**
 * Rift AI state machine:
 * IDLE -> ROAM <-> FLEE / CHASE ; ATTRACTED (pulled) ; CARRIED -> DROPPED -> ROAM ; FRENZY (FURY mutation) ;
 * MUTATING / CLONING (mutation announce) ; PORTAL (being absorbed by a goal).
 */
export function updateRift(m: Match, r: RiftEntity, dt: number) {
  r.stateTime += dt;
  const speedMul = m.riftSpeedMul();

  if (r.clone && m.time >= r.dieAt) {
    if (r.carrier >= 0) { const c = m.heroById(r.carrier); if (c) c.carrying = false; r.carrier = -1; }
    r.alive = false; m.emit({ t: 'explosion', x: r.x, y: r.y, radius: 40, color: '#00f5d4' }); return; }

  switch (r.state) {
    case 'IDLE':
      r.vx *= 0.8; r.vy *= 0.8;
      r.x += (m.arena.center.x - r.x) * Math.min(1, dt * 4);
      r.y += (m.arena.center.y - r.y) * Math.min(1, dt * 4);
      if (m.phase === 'play' || m.phase === 'overtime') setRiftState(m, r, 'ROAM');
      updateLook(m, r, dt);
      return;

    case 'MUTATING':
    case 'CLONING':
      r.vx *= 0.85; r.vy *= 0.85;
      updateLook(m, r, dt);
      if (r.carrier >= 0) followCarrier(m, r);
      return;

    case 'PORTAL': {
      // sucked into the portal
      const p = m.arena.portals[r.portalTeam as 0 | 1];
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      r.x += (cx - r.x) * Math.min(1, dt * 6);
      r.y += (cy - r.y) * Math.min(1, dt * 6);
      return;
    }

    case 'CARRIED':
      followCarrier(m, r);
      updateLook(m, r, dt);
      return;
  }

  // ---- Free rift ----
  if (m.phase !== 'play' && m.phase !== 'overtime' && m.phase !== 'countdown') { r.vx *= 0.9; r.vy *= 0.9; integrate(m, r, dt); return; }
  if (m.phase === 'countdown') { r.vx *= 0.9; r.vy *= 0.9; return; }

  if (r.attractUntil > m.time) {
    setRiftState(m, r, 'ATTRACTED');
    const hero = m.heroById(r.attractX);
    let tx = r.attractY, ty = 0;
    if (hero && hero.alive) { tx = hero.x; ty = hero.y; } else { r.attractUntil = 0; }
    if (r.attractUntil > m.time) {
      const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(r.attractForce, d * 6);
      r.vx += ((dx / d) * sp - r.vx) * Math.min(1, dt * 10);
      r.vy += ((dy / d) * sp - r.vy) * Math.min(1, dt * 10);
    }
  } else if (r.state === 'DROPPED') {
    const f = Math.exp(-BASE.friction * dt * (m.isOnIce(r.x, r.y) ? 0.25 : 1));
    r.vx *= f; r.vy *= f;
    if (r.stateTime > 0.6 && Math.hypot(r.vx, r.vy) < 160) setRiftState(m, r, 'ROAM');
  } else if (m.mutation === 'FURY' && !r.clone) {
    setRiftState(m, r, 'FRENZY');
    // erratic dashes, ricochets on walls
    if (r.stateTime > 0.45 || Math.hypot(r.vx, r.vy) < 50) {
      const a = m.rng.range(0, Math.PI * 2);
      r.vx = Math.cos(a) * BASE.frenzySpeed * speedMul;
      r.vy = Math.sin(a) * BASE.frenzySpeed * speedMul;
      r.stateTime = 0;
    }
  } else {
    if (r.state === 'FRENZY' || r.state === 'ATTRACTED') setRiftState(m, r, 'ROAM');
    // perception
    let nearest = -1, nd = Infinity, nx = 0, ny = 0;
    for (const h of m.heroes) {
      if (!h.alive || h.pve) continue;
      const d = dist2(h.x, h.y, r.x, r.y);
      if (d < nd) { nd = d; nearest = h.id; nx = h.x; ny = h.y; }
    }
    const fleeRange = BASE.fleeRange * (r.clone ? 1.2 : 1);
    if (r.state === 'CHASE') {
      if (r.stateTime > 1.6 || nearest < 0) setRiftState(m, r, 'ROAM');
      else steer(r, nx, ny, BASE.chaseSpeed * speedMul, dt);
    } else if (nearest >= 0 && nd < fleeRange * fleeRange) {
      if (r.state !== 'FLEE') {
        // personality: sometimes the Rift is curious and comes to you
        if (m.rng.chance(0.12)) { setRiftState(m, r, 'CHASE'); return; }
        setRiftState(m, r, 'FLEE');
      }
      const dx = r.x - nx, dy = r.y - ny, d = Math.hypot(dx, dy) || 1;
      // flee away but bias toward the arena center to avoid corners and portals
      let fx = dx / d, fy = dy / d;
      const cx = m.arena.center.x - r.x, cy = m.arena.center.y - r.y, cd = Math.hypot(cx, cy) || 1;
      fx += (cx / cd) * 0.55; fy += (cy / cd) * 0.55;
      const fl = Math.hypot(fx, fy) || 1;
      steerDir(r, fx / fl, fy / fl, BASE.fleeSpeed * speedMul, dt);
    } else {
      if (r.state !== 'ROAM') setRiftState(m, r, 'ROAM');
      if (dist2(r.x, r.y, r.targetX, r.targetY) < 40 * 40 || r.stateTime > 4) {
        r.targetX = m.arena.center.x + m.rng.range(-550, 550);
        r.targetY = m.arena.center.y + m.rng.range(-420, 420);
        r.stateTime = 0;
      }
      steer(r, r.targetX, r.targetY, BASE.roamSpeed * speedMul, dt);
    }
  }
  integrate(m, r, dt);
  updateLook(m, r, dt);
}

function steer(r: RiftEntity, tx: number, ty: number, speed: number, dt: number) {
  const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy) || 1;
  steerDir(r, dx / d, dy / d, speed, dt);
}
function steerDir(r: RiftEntity, dx: number, dy: number, speed: number, dt: number) {
  const k = Math.min(1, dt * 4);
  r.vx += (dx * speed - r.vx) * k;
  r.vy += (dy * speed - r.vy) * k;
}

function integrate(m: Match, r: RiftEntity, dt: number) {
  r.x += r.vx * dt;
  r.y += r.vy * dt;
  const phase = m.mutation === 'PHASE';
  for (const w of m.arena.walls) {
    if (phase && !w.border) continue;
    if (circleRectPush(r.x, r.y, r.radius, w, tmp)) {
      r.x += tmp.x; r.y += tmp.y;
      // bounce
      const l = Math.hypot(tmp.x, tmp.y) || 1;
      const nx = tmp.x / l, ny = tmp.y / l;
      const vn = r.vx * nx + r.vy * ny;
      if (vn < 0) { r.vx -= 1.7 * vn * nx; r.vy -= 1.7 * vn * ny; }
    }
  }
  // world clamp (portal mouths are open but the back walls hold it)
  r.y = Math.max(r.radius, Math.min(m.arena.h - r.radius, r.y));
  r.x = Math.max(-80, Math.min(m.arena.w + 80, r.x));
  m.applyTeleporters(r, -1);
}

function followCarrier(m: Match, r: RiftEntity) {
  const c = m.heroById(r.carrier);
  if (!c || !c.alive) { r.carrier = -1; setRiftState(m, r, 'DROPPED'); return; }
  const off = c.radius + r.radius * 0.6;
  r.x = c.x + Math.cos(c.facing) * off * 0.6;
  r.y = c.y + Math.sin(c.facing) * off * 0.6 - 2;
  r.vx = c.vx; r.vy = c.vy;
}

function updateLook(m: Match, r: RiftEntity, dt: number) {
  let tx = 0, ty = 0, nd = Infinity;
  for (const h of m.heroes) {
    if (!h.alive) continue;
    const d = dist2(h.x, h.y, r.x, r.y);
    if (d < nd) { nd = d; tx = h.x; ty = h.y; }
  }
  if (nd < Infinity) {
    const target = Math.atan2(ty - r.y, tx - r.x);
    let diff = target - r.look;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    r.look += diff * Math.min(1, dt * 6);
  }
  const moodTarget = r.state === 'FLEE' ? -1 : r.state === 'FRENZY' || m.mutation === 'FURY' || m.mutation === 'ELECTRIC' ? 1 : r.state === 'CHASE' ? 0.5 : 0;
  r.mood += (moodTarget - r.mood) * Math.min(1, dt * 3);
}

/** Pickup test against every hero. */
export function checkPickup(m: Match, r: RiftEntity) {
  if (!r.alive || r.carrier >= 0 || r.state === 'PORTAL' || r.state === 'MUTATING' || r.state === 'CLONING' || r.state === 'IDLE') return;
  if (m.phase !== 'play' && m.phase !== 'overtime') return;
  for (const h of m.heroes) {
    if (!h.alive || h.carrying || (h.pve && !m.modeRules.pveCanCarry) || h.stunUntil > m.time || h.leap) continue;
    if (r.pickupLockUntil > m.time && (r.pickupLockHero === h.id || r.pickupLockHero === -2)) continue;
    const bonus = h.def.passive.id === 'long_grip' ? 1 + h.def.passive.params.pickupBonus : 1;
    const reach = (h.radius + r.radius) * bonus;
    if (dist2(h.x, h.y, r.x, r.y) <= reach * reach) {
      const interception = r.state === 'DROPPED' && r.lastTouchTeam !== -1 && r.lastTouchTeam !== h.team && r.lastThrower >= 0;
      r.carrier = h.id;
      r.attractUntil = 0;
      r.lastTouchTeam = h.team;
      r.lastTouchAt = m.time;
      h.carrying = true;
      h.stats.captures++;
      if (interception) h.stats.interceptions++;
      h.ult = Math.min(100, h.ult + 5);
      setRiftState(m, r, 'CARRIED');
      m.emit({ t: 'capture', hero: h.id, rift: r.id, interception });
      return;
    }
  }
}

/** Goal detection; free rifts only score if last touched by the attacking team recently (no accidental own goals). */
export function checkGoal(m: Match, r: RiftEntity) {
  if (r.state === 'PORTAL' || !r.alive) return;
  if (m.phase !== 'play' && m.phase !== 'overtime') return;
  for (const p of m.arena.portals) {
    if (!pointInRect(r.x, r.y, p)) continue;
    let scoringTeam: 0 | 1 | -1 = -1, scorer = -1;
    if (r.carrier >= 0) {
      const c = m.heroById(r.carrier)!;
      if (c.team !== p.team) { scoringTeam = c.team; scorer = c.id; }
    } else if (r.lastTouchTeam !== -1 && r.lastTouchTeam !== p.team && m.time - r.lastTouchAt < 4) {
      scoringTeam = r.lastTouchTeam; scorer = r.lastThrower;
    }
    if (scoringTeam === -1) {
      if (r.carrier < 0) { // push back out
        const dir = p.team === 0 ? 1 : -1;
        r.x = p.team === 0 ? p.x + p.w + r.radius + 4 : p.x - r.radius - 4;
        r.vx = Math.abs(r.vx) * dir + dir * 120;
      }
      return;
    }
    m.scoreGoal(r, scoringTeam, scorer, p.team);
    return;
  }
}

export const RIFT_TUNING = BASE;
