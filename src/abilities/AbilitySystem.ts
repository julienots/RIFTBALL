import type { Match } from '../game/Match';
import type { Hero } from '../game/entities';
import type { AbilityData } from '../data/types';
import { applyDamage, healHero, nearestEnemy, spawnLob } from '../combat/Combat';
import { dist2 } from '../core/math';

/**
 * Ability / ultimate implementations keyed by AbilityData.effect.
 * Numbers come from data; this file only contains behaviour.
 */
export function castAbility(m: Match, h: Hero, ab: AbilityData, isUlt: boolean, dx: number, dy: number, aimDist: number): boolean {
  const P = ab.params;
  const pointDist = aimDist > 0 ? Math.min(aimDist, ab.range) : autoPointDistance(m, h, ab.range, dx, dy);
  const px = h.x + dx * pointDist, py = h.y + dy * pointDist;
  h.anim.castT = 0.35;
  h.facing = Math.atan2(dy, dx);

  switch (ab.effect) {
    case 'none': return false;

    case 'pull_rift': {
      let best = null as ReturnType<Match['mainRift']> | null, bd = ab.range * ab.range;
      for (const r of m.rifts) {
        if (!r.alive || r.state === 'PORTAL' || r.state === 'MUTATING') continue;
        if (r.carrier >= 0) {
          const c = m.heroById(r.carrier);
          if (!c || c.team === h.team) {
            // rip it from an enemy carrier if close enough
            if (dist2(h.x, h.y, r.x, r.y) > (ab.range * 0.5) ** 2) continue;
          } else continue;
        }
        const d = dist2(h.x, h.y, r.x, r.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) return false;
      if (best.carrier >= 0) { const c = m.heroById(best.carrier); if (c) m.dropCarried(c); }
      m.attractRift(best, h.id, P.force, P.duration);
      break;
    }

    case 'magnet_field': m.addZone('magnet_field', h, px, py, P.radius, P.duration, { damage: P.damage, pull: P.pull, tickEvery: 0.4 }); break;
    case 'black_hole': m.addZone('black_hole', h, px, py, P.radius, P.duration, { damage: P.damage, pull: P.pull, tickEvery: 0.35 }); break;
    case 'slow_zone': m.addZone('slow', h, px, py, P.radius, P.duration, { damage: P.damage, slow: P.slow, tickEvery: 0.4 }); break;
    case 'heal_zone': m.addZone('heal', h, px, py, P.radius, P.duration, { heal: P.heal / (P.duration / 0.5), tickEvery: 0.5 }); break;
    case 'thunderstorm': m.addZone('storm', h, px, py, P.radius, P.duration, { damage: P.damage, stun: P.stun, tickEvery: 0.6 }); break;
    case 'eruption': m.addZone('eruption', h, px, py, P.radius, P.duration, { damage: P.burn, tickEvery: 0.5, delay: 0.55, burst: P.damage }); break;

    case 'teleport': {
      const fx = h.x, fy = h.y;
      const [tx, ty] = m.castToFree(h, dx, dy, P.distance);
      h.x = tx; h.y = ty;
      if (h.def.passive.id === 'afterimage') { h.speedBuff = h.def.passive.params.speedBonus; h.speedBuffUntil = m.time + h.def.passive.params.duration; }
      m.emit({ t: 'teleport', hero: h.id, fx, fy, x: tx, y: ty });
      break;
    }

    case 'blink_chain':
      h.dash = { dx, dy, remaining: P.distance * P.jumps * 0.6, speed: 2600, dmg: P.damage, kb: 200, stun: 0, kind: 'blink', hit: new Set() };
      h.phaseUntil = m.time + 0.6;
      if (h.def.passive.id === 'afterimage') { h.speedBuff = h.def.passive.params.speedBonus; h.speedBuffUntil = m.time + 2; }
      break;

    case 'charge':
      h.dash = { dx, dy, remaining: P.distance, speed: 1500, dmg: P.damage, kb: P.knockback, stun: P.stun, kind: 'charge', hit: new Set() };
      break;

    case 'electric_dash':
    case 'fire_dash': {
      h.dash = { dx, dy, remaining: P.distance, speed: 1400, dmg: 0, kb: 0, stun: 0, kind: ab.effect, hit: new Set() };
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        m.addZone(ab.effect === 'fire_dash' ? 'fire' : 'electric_trail', h, h.x + dx * P.distance * t, h.y + dy * P.distance * t, 70, 2.6, { damage: P.damage / 4, slow: P.slow ?? 0, tickEvery: 0.5 });
      }
      break;
    }

    case 'build_wall': {
      const cx = h.x + dx * ab.range, cy = h.y + dy * ab.range;
      const horizontal = Math.abs(dx) < Math.abs(dy); // wall perpendicular to aim
      const w = horizontal ? P.length : P.thickness, hh = horizontal ? P.thickness : P.length;
      const wall = m.arena.addDynamicWall({ x: cx - w / 2, y: cy - hh / 2, w, h: hh }, P.hp, m.time + P.duration, h.team);
      if (!wall) return false;
      m.unstickFromWalls();
      m.emit({ t: 'wall', x: wall.x, y: wall.y, w: wall.w, h: wall.h });
      break;
    }

    case 'fortress': {
      const n = P.segments;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / n;
        const cx = h.x + Math.cos(a) * P.radius, cy = h.y + Math.sin(a) * P.radius;
        const wall = m.arena.addDynamicWall({ x: cx - 45, y: cy - 45, w: 90, h: 90 }, P.hp, m.time + P.duration, h.team);
        if (wall) m.emit({ t: 'wall', x: wall.x, y: wall.y, w: wall.w, h: wall.h });
      }
      m.unstickFromWalls();
      h.shield = P.shield; h.shieldUntil = m.time + P.duration;
      break;
    }

    case 'phase':
      h.phaseUntil = m.time + P.duration;
      h.speedBuff = P.speedBonus; h.speedBuffUntil = m.time + P.duration;
      break;

    case 'shadow_realm':
      h.invisUntil = m.time + P.duration;
      h.speedBuff = P.speedBonus; h.speedBuffUntil = m.time + P.duration;
      h.dmgMulNext = P.damageMul;
      break;

    case 'absorb_shield':
      h.shield = P.shield; h.shieldUntil = m.time + P.duration;
      h.absorbUntil = m.time + P.duration; h.absorbConvert = P.convert;
      break;

    case 'nova':
      radial(m, h, h.x, h.y, P.radius, P.damage, P.knockback, 0);
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: P.radius, color: h.def.palette.primary });
      break;

    case 'slam':
      radial(m, h, h.x, h.y, P.radius, P.damage, 260, P.stun);
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: P.radius, color: h.def.palette.accent });
      break;

    case 'leap': {
      const tx = Math.max(60, Math.min(m.arena.w - 60, px)), ty = Math.max(60, Math.min(m.arena.h - 60, py));
      h.leap = { fx: h.x, fy: h.y, tx, ty, t: 0, dur: P.duration, dmg: P.damage };
      break;
    }

    case 'barrage': {
      for (let i = 0; i < P.shells; i++) {
        const a = m.rng.range(0, Math.PI * 2), r = m.rng.range(0, P.spread);
        spawnLob(m, h, h.team, h.id, h.x, h.y, px + Math.cos(a) * r, py + Math.sin(a) * r, 0.55 + i * 0.12, P.radius, P.damage, 'shell');
      }
      break;
    }

    case 'overdrive':
      for (const a of m.heroes) {
        if (!a.alive || a.team !== h.team) continue;
        a.speedBuff = P.speedBonus; a.speedBuffUntil = m.time + P.duration;
        a.dmgReduction = P.damageReduction; a.dmgReductionUntil = m.time + P.duration;
        a.overdriveUntil = m.time + P.duration;
        healHero(m, a, P.heal, h);
      }
      break;

    case 'summon':
      m.modeRules.summonMinions(m, h, P.count);
      break;

    default:
      console.warn('Unknown ability effect', ab.effect);
      return false;
  }
  if (isUlt) h.stats.ults++; else h.stats.abilities++;
  h.revealedUntil = m.time + 1;
  m.emit({ t: 'ability', hero: h.id, effect: ab.effect, x: px, y: py, ult: isUlt });
  return true;
}

function radial(m: Match, h: Hero, x: number, y: number, r: number, dmg: number, kb: number, stun: number) {
  for (const e of m.heroes) {
    if (!e.alive || e.team === h.team) continue;
    if (dist2(x, y, e.x, e.y) <= (r + e.radius) ** 2) applyDamage(m, e, dmg, h, { kb, kbX: e.x - x, kbY: e.y - y, stun });
  }
}

function autoPointDistance(m: Match, h: Hero, range: number, dx: number, dy: number) {
  if (range <= 0) return 0;
  const e = nearestEnemy(m, h, range, dx, dy, 0.7);
  return e ? Math.hypot(e.x - h.x, e.y - h.y) : range * 0.7;
}

/** Called by Match every step for heroes that are dashing. */
export function updateDash(m: Match, h: Hero, dt: number) {
  const d = h.dash!;
  const step = Math.min(d.remaining, d.speed * dt);
  const nx = h.x + d.dx * step, ny = h.y + d.dy * step;
  const phasing = h.phaseUntil > m.time;
  if (!phasing && m.arena.pointBlocked(nx, ny, h.radius * 0.6)) { h.dash = null; return; }
  h.x = nx; h.y = ny;
  d.remaining -= step;
  if (d.dmg > 0 || d.kb > 0) {
    for (const e of m.heroes) {
      if (!e.alive || e.team === h.team || d.hit.has(e.id)) continue;
      if (dist2(h.x, h.y, e.x, e.y) <= (h.radius + e.radius + 10) ** 2) {
        d.hit.add(e.id);
        applyDamage(m, e, d.dmg, h, { kb: d.kb, kbX: d.dx, kbY: d.dy, stun: d.stun });
      }
    }
  }
  if (d.remaining <= 0.5) h.dash = null;
}

export function updateLeap(m: Match, h: Hero, dt: number) {
  const L = h.leap!;
  L.t += dt;
  const k = Math.min(1, L.t / L.dur);
  h.x = L.fx + (L.tx - L.fx) * k;
  h.y = L.fy + (L.ty - L.fy) * k;
  if (k >= 1) {
    h.leap = null;
    radial(m, h, h.x, h.y, 150, L.dmg, 300, 0);
    m.emit({ t: 'explosion', x: h.x, y: h.y, radius: 150, color: h.def.palette.accent });
    m.unstickFromWalls();
  }
}
