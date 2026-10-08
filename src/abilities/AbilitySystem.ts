import type { Match } from '../game/Match';
import type { Hero } from '../game/entities';
import type { AbilityData } from '../data/types';
import { applyDamage, healHero, nearestEnemy, spawnLob } from '../combat/Combat';
import { dist2 } from '../core/math';
import { createRift, setRiftState } from '../rift/Rift';
import { Hero as HeroClass } from '../game/entities';
import { getCharacter, isBoss } from '../data/characters';
import { BotBrain } from '../bots/BotBrain';
import { BOT_PROFILES } from '../data/bots';

/**
 * Ability / ultimate implementations keyed by AbilityData.effect.
 * Numbers come from data; this file only contains behaviour.
 */
export function castAbility(m: Match, h: Hero, ab: AbilityData, isUlt: boolean, dx: number, dy: number, aimDist: number, isGadget = false): boolean {
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

    // ---------------------------------------------------------------- unique powers (gadgets) & new heroes
    case 'repulse':
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team || (e.pve && e.def.id === 'boss_golem')) continue;
        const ddx = e.x - h.x, ddy = e.y - h.y, d = Math.hypot(ddx, ddy) || 1;
        if (d > P.radius + e.radius) continue;
        e.kx += (ddx / d) * P.knockback; e.ky += (ddy / d) * P.knockback;
        if (e.carrying) m.dropCarried(e);
      }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: P.radius, color: h.def.palette.primary });
      break;

    case 'vanish':
      h.invisUntil = m.time + P.duration;
      h.speedBuff = P.speedBonus; h.speedBuffUntil = m.time + P.duration;
      break;

    case 'rift_cage': {
      const r = m.mainRift();
      if (!r || r.carrier >= 0 || r.state === 'PORTAL' || dist2(h.x, h.y, r.x, r.y) > ab.range * ab.range) return false;
      r.vx = r.vy = 0;
      const S = 95, T = 34;
      const boxes = [
        { x: r.x - S, y: r.y - S, w: 2 * S, h: T }, { x: r.x - S, y: r.y + S - T, w: 2 * S, h: T },
        { x: r.x - S, y: r.y - S + T, w: T, h: 2 * S - 2 * T }, { x: r.x + S - T, y: r.y - S + T, w: T, h: 2 * S - 2 * T },
      ];
      for (const b of boxes) { const w = m.arena.addDynamicWall(b, P.hp, m.time + P.duration, h.team); if (w) m.emit({ t: 'wall', x: w.x, y: w.y, w: w.w, h: w.h }); }
      m.unstickFromWalls();
      break;
    }

    case 'swap': {
      let best: Hero | null = null, bd = P.range * P.range;
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team || (e.pve && e.def.id === 'boss_golem') || !m.isVisibleTo(e, h.team)) continue;
        const d = dist2(h.x, h.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return false;
      const fx = h.x, fy = h.y;
      h.x = best.x; h.y = best.y; best.x = fx; best.y = fy;
      m.emit({ t: 'teleport', hero: h.id, fx, fy, x: h.x, y: h.y });
      m.emit({ t: 'teleport', hero: best.id, fx: h.x, fy: h.y, x: fx, y: fy });
      break;
    }

    case 'emp':
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team || dist2(h.x, h.y, e.x, e.y) > (P.radius + e.radius) ** 2) continue;
        e.shield = 0; e.shieldUntil = 0; e.absorbUntil = 0;
        applyDamage(m, e, P.damage, h, { slow: P.slow, slowDuration: 1.5, noUlt: true });
      }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: P.radius, color: '#00f0ff' });
      break;

    case 'transfusion': {
      healHero(m, h, h.maxHp * P.heal, h);
      let best: Hero | null = null, br = 1;
      for (const a of m.heroes) if (a !== h && a.alive && a.team === h.team && dist2(a.x, a.y, h.x, h.y) < ab.range * ab.range && a.hp / a.maxHp < br) { br = a.hp / a.maxHp; best = a; }
      if (best) healHero(m, best, best.maxHp * P.heal, h);
      break;
    }

    case 'hook': {
      let best: Hero | null = null, bd = P.range * P.range;
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team || (e.pve && e.def.id === 'boss_golem') || !m.isVisibleTo(e, h.team)) continue;
        const d = dist2(h.x, h.y, e.x, e.y) * (e.carrying ? 0.4 : 1); // prefer the Rift carrier
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return false;
      const ddx = best.x - h.x, ddy = best.y - h.y, d = Math.hypot(ddx, ddy) || 1;
      const fx = best.x, fy = best.y;
      best.x = h.x + (ddx / d) * (h.radius + best.radius + 10); best.y = h.y + (ddy / d) * (h.radius + best.radius + 10);
      m.collideWalls(best, false);
      m.emit({ t: 'chain', points: [fx, fy, h.x, h.y], team: h.team });
      applyDamage(m, best, P.damage, h, { stun: P.stun, noUlt: true });
      break;
    }

    case 'mine': m.addZone('mine', h, h.x, h.y, P.radius, P.duration, { burst: P.damage, tickEvery: 99 }); break;

    case 'team_shield':
      for (const a of m.heroes) if (a.alive && a.team === h.team && dist2(a.x, a.y, h.x, h.y) < P.radius * P.radius) { a.shield = Math.max(a.shield, P.shield); a.shieldUntil = m.time + P.duration; }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: 300, color: '#7fd8ff' });
      break;

    case 'rift_gust': {
      let best = null as ReturnType<Match['mainRift']> | null, bd = ab.range * ab.range;
      for (const r of m.rifts) {
        if (!r.alive || r.state === 'PORTAL') continue;
        if (r.carrier >= 0) { const c = m.heroById(r.carrier); if (!c || c.team === h.team || dist2(h.x, h.y, r.x, r.y) > P.steal * P.steal) continue; }
        const d = dist2(h.x, h.y, r.x, r.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) return false;
      if (best.carrier >= 0) { const c = m.heroById(best.carrier); if (c) m.dropCarried(c); }
      best.vx = dx * P.speed; best.vy = dy * P.speed;
      best.lastTouchTeam = h.team; best.lastTouchAt = m.time; best.lastThrower = h.id;
      best.pickupLockUntil = m.time + 0.3; best.pickupLockHero = -2;
      setRiftState(m, best, 'DROPPED');
      m.emit({ t: 'throw', hero: h.id, rift: best.id });
      break;
    }

    case 'blaze':
      h.blazeUntil = m.time + P.duration;
      h.speedBuff = P.speedBonus; h.speedBuffUntil = m.time + P.duration;
      break;

    case 'focus_shot':
      h.dmgMulNext = P.mul; h.pierceNext = true; h.atkCd = Math.min(h.atkCd, 0.1);
      break;

    case 'laser': {
      const len = P.length, ex = h.x + dx * len, ey = h.y + dy * len;
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team) continue;
        const t = Math.max(0, Math.min(1, ((e.x - h.x) * dx + (e.y - h.y) * dy) / len));
        const px2 = h.x + dx * len * t, py2 = h.y + dy * len * t;
        if (dist2(px2, py2, e.x, e.y) <= (P.width + e.radius) ** 2) applyDamage(m, e, P.damage, h, { kb: 300, kbX: dx, kbY: dy });
      }
      for (const w of m.arena.walls) if (w.dynamic && w.team !== h.team) w.hp -= P.damage * 0.5;
      m.emit({ t: 'laser', x: h.x, y: h.y, tx: ex, ty: ey, team: h.team });
      break;
    }

    case 'flare':
      for (const e of m.heroes) if (e.team !== h.team && e.alive) { e.revealedUntil = m.time + P.duration; e.invisUntil = 0; }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: 600, color: '#ffbe0b' });
      break;

    case 'ice_floor': {
      m.arena.addTempHazard('ice', { x: px - P.radius, y: py - P.radius, w: P.radius * 2, h: P.radius * 2 }, m.time + P.duration);
      m.addZone('ice_floor', h, px, py, P.radius, P.duration, { slow: P.slow, tickEvery: 0.4 });
      break;
    }

    case 'blizzard': m.addZone('blizzard', h, px, py, P.radius, P.duration, { damage: P.damage, stun: P.stun, slow: P.slow, tickEvery: 0.5 }); break;

    case 'ice_block':
      h.phaseUntil = m.time + P.duration; h.stunUntil = m.time + P.duration; h.dodgeUntil = m.time + P.duration;
      healHero(m, h, h.maxHp * P.heal, h);
      break;

    // ---------------------------------------------------------------- v1.0.4 heroes
    case 'vines': m.addZone('vines', h, px, py, P.radius, P.duration, { damage: P.damage, stun: P.root, slow: 0.4, tickEvery: 0.5 }); break;

    case 'stampede':
      h.dash = { dx, dy, remaining: P.distance, speed: 1700, dmg: P.damage, kb: P.knockback, stun: P.stun, kind: 'charge', hit: new Set() };
      h.dmgReduction = P.reduction; h.dmgReductionUntil = m.time + 1.6;
      break;

    case 'harden':
      h.dmgReduction = P.reduction; h.dmgReductionUntil = m.time + P.duration;
      break;

    case 'snatch_dash':
      h.dash = { dx, dy, remaining: P.distance, speed: 1600, dmg: P.damage, kb: 150, stun: 0, kind: 'snatch', hit: new Set() };
      break;

    case 'turbo':
      h.speedBuff = P.speedBonus; h.speedBuffUntil = m.time + P.duration;
      h.slowUntil = 0; h.rollCd = 0;
      break;

    case 'smoke': m.addZone('smoke', h, h.x, h.y, P.radius, P.duration, { slow: P.slow, tickEvery: 0.25 }); break;

    case 'grease':
      m.arena.addTempHazard('ice', { x: px - P.radius, y: py - P.radius, w: P.radius * 2, h: P.radius * 2 }, m.time + P.duration);
      m.addZone('oil', h, px, py, P.radius, P.duration, { damage: P.damage, slow: 0.15, tickEvery: 0.5 });
      break;

    case 'feast':
      for (const a of m.heroes) {
        if (!a.alive || a.team !== h.team || a.pve) continue;
        healHero(m, a, a.maxHp * P.heal, h);
        a.powerUntil = Math.max(a.powerUntil, m.time + P.duration);
      }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: 320, color: '#fcbf49' });
      break;

    case 'moon_well':
      m.addZone('moon_well', h, px, py, P.radius, P.duration, { heal: P.heal / (P.duration / 0.5), tickEvery: 0.5 });
      for (const a of m.heroes) if (a.alive && a.team === h.team && dist2(a.x, a.y, px, py) < P.radius * P.radius) a.slowUntil = 0;
      break;

    case 'eclipse': m.addZone('eclipse', h, px, py, P.radius, P.duration, { damage: P.damage, slow: P.slow, tickEvery: 0.5 }); break;

    case 'ally_warp': {
      let best: Hero | null = null, br = 2;
      for (const a of m.heroes) {
        if (a === h || !a.alive || a.team !== h.team || a.pve || dist2(a.x, a.y, h.x, h.y) > P.range * P.range) continue;
        const ratio = a.hp / a.maxHp - (a.carrying ? 0.3 : 0);
        if (ratio < br) { br = ratio; best = a; }
      }
      if (!best) return false;
      const fx = h.x, fy = h.y;
      const ang = Math.atan2(h.y - best.y, h.x - best.x);
      h.x = best.x + Math.cos(ang) * (best.radius + h.radius + 8); h.y = best.y + Math.sin(ang) * (best.radius + h.radius + 8);
      m.collideWalls(h, false);
      for (const t of [h, best]) { t.shield = Math.max(t.shield, P.shield); t.shieldUntil = m.time + P.duration; }
      m.emit({ t: 'teleport', hero: h.id, fx, fy, x: h.x, y: h.y });
      break;
    }

    case 'deploy_turret': {
      // one turret per GEAR: the old one breaks
      for (const t of m.heroes) if (t.def.id === 'turret' && t.ownerId === h.id && t.alive) { t.expireAt = m.time; }
      const [tx, ty] = m.castToFree(h, dx, dy, Math.min(ab.range, Math.max(60, pointDist)));
      const t = new HeroClass(m.nextHeroId(), h.team, getCharacter('turret'), 'Tourelle', true, 'turret_default');
      t.pve = true; t.ownerId = h.id; t.x = tx; t.y = ty; t.facing = h.facing;
      t.maxHp = t.hp = P.hp; t.expireAt = m.time + P.duration; t.canCarry = false;
      m.addHero(t);
      m.brains.set(t.id, new BotBrain(m, t, BOT_PROFILES.HARD));
      m.emit({ t: 'wall', x: tx - 30, y: ty - 30, w: 60, h: 60 });
      break;
    }

    case 'rewind': {
      // history: [t, x, y, hp] every 0.25 s — find the snapshot P.seconds ago
      const H = h.history, target = m.time - P.seconds;
      let i = 0;
      while (i + 4 < H.length && H[i + 4] <= target) i += 4;
      if (H.length < 4) return false;
      const fx = h.x, fy = h.y;
      h.x = H[i + 1]; h.y = H[i + 2];
      h.hp = Math.max(h.hp, Math.min(h.maxHp, H[i + 3]));
      h.slowUntil = 0; h.stunUntil = 0; h.dash = null;
      if (h.carrying) m.dropCarried(h);
      m.collideWalls(h, false);
      m.emit({ t: 'teleport', hero: h.id, fx, fy, x: h.x, y: h.y });
      break;
    }

    case 'time_stop': {
      for (const e of m.heroes) {
        if (!e.alive || e.team === h.team || dist2(e.x, e.y, h.x, h.y) > (P.radius + e.radius) ** 2) continue;
        if (isBoss(e)) { e.slowMul = 0.3; e.slowUntil = m.time + P.duration; continue; }
        if (e.avatarUntil > m.time) continue;
        e.stunUntil = m.time + P.duration; e.dash = null;
        if (e.carrying) m.dropCarried(e);
      }
      for (const r of m.rifts) if (r.alive && r.carrier < 0 && dist2(r.x, r.y, h.x, h.y) < P.radius * P.radius) { r.frozenUntil = m.time + P.duration; r.vx = r.vy = 0; }
      m.emit({ t: 'time_stop', x: h.x, y: h.y, radius: P.radius, dur: P.duration });
      break;
    }

    case 'haste':
      for (const a of m.heroes) {
        if (!a.alive || a.team !== h.team || dist2(a.x, a.y, h.x, h.y) > P.radius * P.radius) continue;
        a.speedBuff = Math.max(a.speedBuffUntil > m.time ? a.speedBuff : 0, P.speedBonus); a.speedBuffUntil = m.time + P.duration;
        a.atkCd = 0;
      }
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: P.radius * 0.6, color: '#4cc9f0' });
      break;

    case 'judgement': {
      const tx = Math.max(60, Math.min(m.arena.w - 60, px)), ty = Math.max(60, Math.min(m.arena.h - 60, py));
      h.leap = { fx: h.x, fy: h.y, tx, ty, t: 0, dur: P.duration, dmg: P.damage, r: P.radius, heal: P.heal };
      h.phaseUntil = m.time + P.duration;
      if (h.carrying) m.dropCarried(h);
      break;
    }

    case 'sanctuary': {
      const z = m.addZone('sanctuary', h, h.x, h.y, P.radius, P.duration, { heal: P.heal / (P.duration / 0.5), tickEvery: 0.5 });
      z.reduce = P.reduction;
      break;
    }

    case 'rift_call': {
      let best = null as ReturnType<Match['mainRift']> | null, bd = P.range * P.range;
      for (const r of m.rifts) {
        if (!r.alive || r.decoy || r.state === 'PORTAL' || r.state === 'MUTATING' || r.state === 'CLONING') continue;
        if (r.carrier >= 0) { const c = m.heroById(r.carrier); if (!c || c.team === h.team || dist2(h.x, h.y, r.x, r.y) > P.steal * P.steal) continue; }
        const d = dist2(h.x, h.y, r.x, r.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best || h.carrying) return false;
      if (best.carrier >= 0) { const c = m.heroById(best.carrier); if (c) m.dropCarried(c); }
      m.emit({ t: 'zap', x: best.x, y: best.y, tx: h.x, ty: h.y });
      best.x = h.x; best.y = h.y; best.vx = best.vy = 0; best.attractUntil = 0;
      best.pickupLockUntil = 0;
      setRiftState(m, best, 'DROPPED');
      break;
    }

    case 'avatar':
      h.avatarUntil = m.time + P.duration;
      healHero(m, h, h.maxHp * P.heal, h);
      h.stunUntil = 0; h.slowUntil = 0;
      m.emit({ t: 'avatar', hero: h.id });
      m.emit({ t: 'explosion', x: h.x, y: h.y, radius: 260, color: '#9b5de5' });
      break;

    case 'rift_decoy': {
      for (const r of m.rifts) if (r.decoy && r.decoy.owner === h.id) r.alive = false; // one decoy at a time
      const c = createRift(m.nextRiftId(), h.x + dx * 60, h.y + dy * 60, true);
      c.vx = dx * 650; c.vy = dy * 650; c.state = 'DROPPED';
      c.dieAt = m.time + P.life;
      c.decoy = { team: h.team, owner: h.id, damage: P.damage, stun: P.stun };
      c.lastTouchTeam = -1;
      m.rifts.push(c);
      break;
    }

    default:
      console.warn('Unknown ability effect', ab.effect);
      return false;
  }
  if (isUlt) h.stats.ults++; else if (isGadget) h.stats.gadgets++; else h.stats.abilities++;
  if (ab.effect !== 'vanish' && ab.effect !== 'ice_block') h.revealedUntil = m.time + 1;
  if (isGadget) m.emit({ t: 'gadget', hero: h.id, effect: ab.effect, x: px, y: py });
  else m.emit({ t: 'ability', hero: h.id, effect: ab.effect, x: px, y: py, ult: isUlt });
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
        // ZIP: snatch the Rift from the carrier
        if (d.kind === 'snatch' && e.carrying && !h.carrying && h.canCarry) {
          const r = m.rifts.find((q) => q.carrier === e.id);
          if (r) { e.carrying = false; r.carrier = h.id; h.carrying = true; r.lastTouchTeam = h.team; r.carryTime = 0; r.charged = false; h.stats.captures++; h.stats.interceptions++; m.emit({ t: 'capture', hero: h.id, rift: r.id, interception: true }); }
        }
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
    const rad = L.r ?? 150;
    if (L.dmg > 0) radial(m, h, h.x, h.y, rad, L.dmg, 300, L.r ? 0.5 : 0);
    if (L.heal) for (const a of m.heroes) if (a.alive && a.team === h.team && dist2(a.x, a.y, h.x, h.y) < rad * rad) healHero(m, a, L.heal, h);
    if (L.dmg > 0 || L.heal) m.emit({ t: 'explosion', x: h.x, y: h.y, radius: rad, color: h.def.palette.accent });
    m.unstickFromWalls();
  }
}
