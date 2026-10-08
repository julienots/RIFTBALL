import type { Match } from '../game/Match';
import { Hero, Projectile, type ProjectileKind } from '../game/entities';
import { clamp, dist2, segmentHitsRect } from '../core/math';
import type { TeamId } from '../data/types';
import { isBoss } from '../data/characters';

/** Bosses and turrets never get knocked back. */
const immovable = (h: Hero) => isBoss(h) || h.def.id === 'turret';

export interface DamageOpts {
  kbX?: number; kbY?: number; kb?: number;
  slow?: number; slowDuration?: number;
  stun?: number;
  noUlt?: boolean;
  kind?: string;
  ultScale?: number;
}

const LOG_ATTACKER_WINDOW = 5;

/** Central damage pipeline: shields, phase, reductions, ult charge, kills. Returns damage dealt. */
export function applyDamage(m: Match, target: Hero, amount: number, source: Hero | null, opts: DamageOpts = {}): number {
  if (!target.alive || amount <= 0) return 0;
  if (target.phaseUntil > m.time || target.dodgeUntil > m.time) return 0;
  if (source && source.team === target.team) return 0;
  if (m.phase === 'goal' || m.phase === 'ended') return 0;

  let dmg = amount;
  if (source && source.dmgMulNext !== 1) { dmg *= source.dmgMulNext; source.dmgMulNext = 1; }
  if (source && source.powerUntil > m.time) dmg *= 1.25;
  if (source && source.def.passive.id === 'steady' && dist2(source.x, source.y, target.x, target.y) > source.def.passive.params.range ** 2) dmg *= 1 + source.def.passive.params.mul;
  if (source && source.def.passive.id === 'chill' && !opts.slow) { opts = { ...opts, slow: source.def.passive.params.slow, slowDuration: 1 }; }
  if (source && source.avatarUntil > m.time) dmg *= 1 + (source.def.ultimate.params.damage ?? 0.4);
  if (target.dmgReductionUntil > m.time) dmg *= 1 - target.dmgReduction;
  if (target.def.passive.id === 'thick_hide' && target.hp > target.maxHp * target.def.passive.params.threshold) dmg *= 1 - target.def.passive.params.reduction;
  if (isBoss(target)) dmg *= m.bossArmor;
  dmg = Math.round(dmg);

  if (target.absorbUntil > m.time) target.ult = clamp(target.ult + dmg * target.absorbConvert, 0, 100);
  if (target.shield > 0 && target.shieldUntil > m.time) {
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
  }
  target.hp -= dmg;
  target.lastDamageAt = m.time;
  target.revealedUntil = m.time + 1.2;
  target.anim.hitT = 0.18;

  // summons (turrets) credit their owner
  const credit = source && source.ownerId >= 0 ? m.heroById(source.ownerId) ?? source : source;
  if (credit) {
    credit.stats.damage += amount;
    if (isBoss(target)) credit.stats.bossDamage += dmg;
  }
  if (source) {
    target.lastHitBy = source.id;
    target.recentAttackers.set(source.id, m.time);
    if (!opts.noUlt) {
      const mul = source.def.passive.id === 'overcharge' && opts.kind === 'chain' ? source.def.passive.params.ultMul : 1;
      source.ult = clamp(source.ult + source.def.ultChargePerHit * mul * (opts.ultScale ?? 1) * (source.overdriveUntil > m.time ? 1.2 : 1), 0, 100);
    }
  }
  const unstoppable = target.avatarUntil > m.time;
  if (opts.kb && opts.kb > 0 && !immovable(target) && !unstoppable) {
    const l = Math.hypot(opts.kbX ?? 0, opts.kbY ?? 0) || 1;
    target.kx += ((opts.kbX ?? 0) / l) * opts.kb;
    target.ky += ((opts.kbY ?? 0) / l) * opts.kb;
  }
  if (opts.slow && opts.slow > 0 && !unstoppable) {
    const active = target.slowUntil > m.time;
    target.slowMul = active ? Math.min(target.slowMul, 1 - opts.slow) : 1 - opts.slow;
    target.slowUntil = Math.max(target.slowUntil, m.time + (opts.slowDuration ?? 1));
  }
  if (opts.stun && opts.stun > 0 && !isBoss(target) && !unstoppable) {
    // limited stun: never more than 1.2s, and stun immunity right after
    const cap = Math.min(opts.stun, 1.2);
    if (target.stunUntil < m.time - 0.6) target.stunUntil = m.time + cap;
    if (target.carrying) m.dropCarried(target);
  }
  m.emit({ t: 'hit', x: target.x, y: target.y, target: target.id, amount: Math.round(amount), source: source ? source.id : -1 });
  if (isBoss(target)) m.emit({ t: 'boss_hit', amount: dmg });

  if (target.hp <= 0) killHero(m, target, source);
  return dmg;
}

export function healHero(m: Match, target: Hero, amount: number, source: Hero | null) {
  if (!target.alive || amount <= 0) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const done = target.hp - before;
  if (done > 0) {
    if (source) { source.stats.heal += done; source.ult = clamp(source.ult + done / 160, 0, 100); }
    // LUNA: healed allies get a short speed boost
    if (source && source !== target && source.def.passive.id === 'moonlight') {
      const p = source.def.passive.params;
      if (target.speedBuffUntil < m.time || target.speedBuff < p.speedBonus) { target.speedBuff = p.speedBonus; target.speedBuffUntil = m.time + p.duration; }
    }
    m.emit({ t: 'heal', x: target.x, y: target.y, target: target.id, amount: Math.round(done) });
  }
}

export function killHero(m: Match, victim: Hero, killer: Hero | null) {
  // SERAPH: once per match, come back instead of dying
  if (victim.def.passive.id === 'resurrection' && !victim.reviveUsed && !victim.pve) {
    victim.reviveUsed = true;
    victim.hp = Math.round(victim.maxHp * victim.def.passive.params.hp);
    victim.phaseUntil = m.time + 1.5;
    victim.stunUntil = 0;
    m.emit({ t: 'revive', hero: victim.id });
    m.emit({ t: 'explosion', x: victim.x, y: victim.y, radius: 220, color: '#ffe66d' });
    return;
  }
  if (killer && killer.ownerId >= 0) killer = m.heroById(killer.ownerId) ?? killer;
  // summons simply break
  if (victim.def.id === 'turret') {
    victim.hp = 0; victim.alive = false; victim.respawnAt = Infinity;
    m.emit({ t: 'explosion', x: victim.x, y: victim.y, radius: 90, color: '#f77f00' });
    m.emit({ t: 'kill', killer: -1, victim: victim.id, x: victim.x, y: victim.y });
    return;
  }
  victim.hp = 0;
  victim.alive = false;
  victim.stats.deaths++;
  victim.shield = 0;
  victim.dash = null;
  victim.leap = null;
  if (victim.carrying) m.dropCarried(victim);
  victim.respawnAt = victim.pve ? Infinity : m.time + m.respawnTime(victim);
  if (killer) {
    killer.stats.kills++;
    killer.ult = clamp(killer.ult + 12, 0, 100);
    // BOUNTY: 3 kills without dying puts a price on your head
    if (victim.streak >= 3) { killer.ult = clamp(killer.ult + 40, 0, 100); killer.shield = Math.max(killer.shield, 600); killer.shieldUntil = m.time + 4; m.emit({ t: 'bounty_claim', killer: killer.id, victim: victim.id }); }
    if (!killer.pve) { killer.streak++; if (killer.streak === 3) m.emit({ t: 'bounty', hero: killer.id, streak: killer.streak }); }
  }
  victim.streak = 0;
  for (const [hid, t] of victim.recentAttackers) {
    if (killer && hid === killer.id) continue;
    if (m.time - t <= LOG_ATTACKER_WINDOW) { const h = m.heroById(hid); if (h) h.stats.assists++; }
  }
  victim.recentAttackers.clear();
  m.emit({ t: 'kill', killer: killer ? killer.id : -1, victim: victim.id, x: victim.x, y: victim.y });
}

/** Nearest visible, alive enemy within range (optionally inside an aim cone). */
export function nearestEnemy(m: Match, hero: Hero, range: number, dirX = 0, dirY = 0, coneCos = -2): Hero | null {
  let best: Hero | null = null, bd = range * range;
  for (const e of m.heroes) {
    if (!e.alive || e.team === hero.team || !m.isVisibleTo(e, hero.team)) continue;
    const d = dist2(hero.x, hero.y, e.x, e.y);
    if (d > bd) continue;
    if (coneCos > -2) {
      const l = Math.sqrt(d) || 1;
      if (((e.x - hero.x) * dirX + (e.y - hero.y) * dirY) / l < coneCos) continue;
    }
    bd = d; best = e;
  }
  return best;
}

export function spawnProjectile(m: Match, owner: Hero, kind: ProjectileKind, x: number, y: number, dx: number, dy: number, speed: number, range: number, radius: number, damage: number): Projectile {
  const p = m.allocProjectile();
  p.kind = kind; p.owner = owner.id; p.team = owner.team;
  p.x = p.sx = x; p.y = p.sy = y;
  p.vx = dx * speed; p.vy = dy * speed;
  p.range = range; p.traveled = 0; p.radius = radius; p.damage = damage;
  p.knockback = 0; p.slow = 0; p.slowDuration = 0; p.pierce = false; p.healAllies = 0;
  p.returning = false; p.phase = false; p.t = 0; p.dur = 0; p.areaRadius = 0; p.ultScale = 1;
  p.color = owner.def.palette.accent;
  p.hit.clear();
  return p;
}

export function spawnLob(m: Match, owner: Hero | null, team: TeamId, ownerId: number, x: number, y: number, tx: number, ty: number, dur: number, area: number, damage: number, kind: ProjectileKind = 'lob', color = '#ffd23f'): Projectile {
  const p = m.allocProjectile();
  p.kind = kind; p.owner = ownerId; p.team = team;
  p.x = p.sx = x; p.y = p.sy = y; p.tx = tx; p.ty = ty; p.t = 0; p.dur = dur;
  p.areaRadius = area; p.damage = damage; p.radius = 16; p.vx = 0; p.vy = 0; p.range = 1e9; p.traveled = 0;
  p.knockback = 0; p.slow = 0; p.pierce = false; p.healAllies = 0; p.returning = false; p.phase = true; p.ultScale = kind === 'shell' ? 0.25 : 1;
  p.color = owner ? owner.def.palette.accent : color;
  p.hit.clear();
  return p;
}

/** Normal attack (or throw when carrying the Rift). dir must be normalized. */
export function performAttack(m: Match, h: Hero, dx: number, dy: number, aimDist: number) {
  const a = h.def.attack;
  h.facing = Math.atan2(dy, dx);
  h.anim.attackT = 0.22;
  h.revealedUntil = m.time + 1;
  const ox = h.x + dx * h.radius * 0.8, oy = h.y + dy * h.radius * 0.8;
  switch (a.kind) {
    case 'bolt': case 'boomerang': case 'wave': {
      const kind = a.kind === 'bolt' ? (isBoss(h) ? 'boss' : 'bolt') : a.kind;
      const p = spawnProjectile(m, h, kind, ox, oy, dx, dy, a.projectileSpeed, a.range, a.radius ?? 12, a.damage);
      p.pierce = !!a.pierce || h.pierceNext; p.healAllies = a.healAllies ?? 0; p.knockback = a.knockback ?? 0;
      if (h.pierceNext) { h.pierceNext = false; p.radius *= 1.5; p.color = '#ffbe0b'; }
      break;
    }
    case 'spread': case 'blades': {
      const n = a.projectiles ?? 3, spread = ((a.spreadDeg ?? 20) * Math.PI) / 180;
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) {
        const ang = base + (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1));
        const p = spawnProjectile(m, h, a.kind, ox, oy, Math.cos(ang), Math.sin(ang), a.projectileSpeed, a.range, a.radius ?? 10, a.damage);
        p.slow = a.slow ?? 0; p.slowDuration = a.slowDuration ?? 0; p.ultScale = 1.6 / n;
      }
      break;
    }
    case 'lob': {
      const d = aimDist > 0 ? Math.min(aimDist, a.range) : autoLobDistance(m, h, a.range, dx, dy);
      spawnLob(m, h, h.team, h.id, ox, oy, h.x + dx * d, h.y + dy * d, Math.max(0.35, d / a.projectileSpeed), a.radius ?? 70, a.damage);
      break;
    }
    case 'chain': {
      const pts: number[] = [ox, oy];
      let cur: Hero | null = nearestEnemy(m, h, a.range, dx, dy, Math.cos(0.6));
      const hitIds = new Set<number>();
      let dmg = a.damage, bounces = a.bounces ?? 2;
      let fromX = ox, fromY = oy;
      if (!cur) { pts.push(h.x + dx * a.range * 0.8, h.y + dy * a.range * 0.8); }
      while (cur && bounces >= 0) {
        if (m.lineBlocked(fromX, fromY, cur.x, cur.y)) break;
        pts.push(cur.x, cur.y);
        hitIds.add(cur.id);
        applyDamage(m, cur, dmg, h, { kind: 'chain' });
        fromX = cur.x; fromY = cur.y;
        dmg *= 0.75; bounces--;
        let next: Hero | null = null, nd = 320 * 320;
        for (const e of m.heroes) {
          if (!e.alive || e.team === h.team || hitIds.has(e.id)) continue;
          const d = dist2(fromX, fromY, e.x, e.y);
          if (d < nd) { nd = d; next = e; }
        }
        cur = next;
      }
      m.emit({ t: 'chain', points: pts, team: h.team });
      break;
    }
    case 'melee': {
      const cone = Math.cos((((a.spreadDeg ?? 90) / 2) * Math.PI) / 180);
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team) continue;
        const ddx = e.x - h.x, ddy = e.y - h.y;
        const d = Math.hypot(ddx, ddy);
        if (d > a.range + e.radius) continue;
        if (d > 1 && (ddx * dx + ddy * dy) / d < cone) continue;
        applyDamage(m, e, a.damage, h, { kb: a.knockback ?? 0, kbX: ddx, kbY: ddy });
      }
      for (const w of m.arena.walls) {
        if (!w.dynamic || w.team === h.team) continue;
        const cx = Math.max(w.x, Math.min(h.x + dx * a.range * 0.6, w.x + w.w)), cy = Math.max(w.y, Math.min(h.y + dy * a.range * 0.6, w.y + w.h));
        if (dist2(cx, cy, h.x + dx * a.range * 0.6, h.y + dy * a.range * 0.6) < (a.range * 0.6) ** 2) damageWall(m, w, a.damage);
      }
      m.emit({ t: 'melee', hero: h.id, x: h.x, y: h.y, angle: h.facing, range: a.range });
      return;
    }
  }
  m.emit({ t: 'shot', hero: h.id, kind: a.kind, x: ox, y: oy, angle: h.facing });
}

function autoLobDistance(m: Match, h: Hero, range: number, dx: number, dy: number) {
  const e = nearestEnemy(m, h, range * 1.05, dx, dy, 0.8);
  return e ? Math.min(range, Math.hypot(e.x - h.x, e.y - h.y)) : range * 0.85;
}

export function damageWall(m: Match, w: { hp: number; x: number; y: number; w: number; h: number; dynamic: boolean }, amount: number) {
  if (!w.dynamic) return;
  w.hp -= amount;
  if (w.hp <= 0) m.emit({ t: 'wall_break', x: w.x + w.w / 2, y: w.y + w.h / 2 });
}

/** Advance every active projectile. */
export function updateProjectiles(m: Match, dt: number) {
  const gravity = m.mutation === 'GRAVITY' ? m.mainRift() : null;
  const bend = m.mutationParams.projectileBend ?? 0;
  for (const p of m.projectiles) {
    if (!p.active) continue;
    if (p.kind === 'lob' || p.kind === 'shell') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) {
        explode(m, p);
        p.active = false;
      }
      continue;
    }
    if (gravity && !gravity.clone) {
      const ddx = gravity.x - p.x, ddy = gravity.y - p.y, d = Math.hypot(ddx, ddy) || 1;
      if (d < 600) { p.vx += (ddx / d) * bend * dt; p.vy += (ddy / d) * bend * dt; }
    }
    if (p.kind === 'boomerang' && p.returning) {
      const o = (m.heroById(p.owner) ?? null);
      if (!o || !o.alive) { p.active = false; continue; }
      const ddx = o.x - p.x, ddy = o.y - p.y, d = Math.hypot(ddx, ddy);
      if (d < o.radius) { p.active = false; continue; }
      const sp = Math.hypot(p.vx, p.vy);
      p.vx = (ddx / d) * sp; p.vy = (ddy / d) * sp;
    }
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (!p.phase) {
      let hitWall = false;
      for (const w of m.arena.walls) {
        if (segmentHitsRect(p.x, p.y, nx, ny, w)) {
          hitWall = true;
          if (w.dynamic && w.team !== p.team) damageWall(m, w, p.damage * 0.5);
          break;
        }
      }
      if (hitWall) {
        if (p.kind === 'boomerang' && !p.returning) { p.returning = true; p.hit.clear(); continue; }
        m.emit({ t: 'explosion', x: p.x, y: p.y, radius: 18, color: p.color });
        p.active = false; continue;
      }
    }
    p.traveled += Math.hypot(nx - p.x, ny - p.y);
    p.x = nx; p.y = ny;
    // hits
    for (const e of m.heroes) {
      if (!e.alive || p.hit.has(e.id)) continue;
      const rr = (p.radius + e.radius) * (p.radius + e.radius);
      if (dist2(p.x, p.y, e.x, e.y) > rr) continue;
      if (e.team === p.team) {
        if (p.healAllies > 0 && e.id !== p.owner) { p.hit.add(e.id); healHero(m, e, p.healAllies, (m.heroById(p.owner) ?? null)); }
        continue;
      }
      if (e.phaseUntil > m.time) continue;
      p.hit.add(e.id);
      const owner = (m.heroById(p.owner) ?? null);
      applyDamage(m, e, p.damage, owner, { kb: p.knockback, kbX: p.vx, kbY: p.vy, slow: p.slow, slowDuration: p.slowDuration, ultScale: p.ultScale });
      if (!p.pierce) { p.active = false; break; }
    }
    if (!p.active) continue;
    if (p.traveled >= p.range) {
      if (p.kind === 'boomerang' && !p.returning) { p.returning = true; p.hit.clear(); }
      else p.active = false;
    }
  }
}

function explode(m: Match, p: Projectile) {
  const owner = (m.heroById(p.owner) ?? null);
  const r2 = p.areaRadius * p.areaRadius;
  for (const e of m.heroes) {
    if (!e.alive || e.team === p.team) continue;
    if (dist2(p.x, p.y, e.x, e.y) <= r2 + e.radius * e.radius) applyDamage(m, e, p.damage, owner, { kb: 180, kbX: e.x - p.x, kbY: e.y - p.y });
  }
  for (const w of m.arena.walls) {
    if (!w.dynamic || w.team === p.team) continue;
    const cx = Math.max(w.x, Math.min(p.x, w.x + w.w)), cy = Math.max(w.y, Math.min(p.y, w.y + w.h));
    if (dist2(cx, cy, p.x, p.y) < r2) damageWall(m, w, p.damage);
  }
  m.emit({ t: 'explosion', x: p.x, y: p.y, radius: p.areaRadius, color: p.color });
}
