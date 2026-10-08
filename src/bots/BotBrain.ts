import type { Match } from '../game/Match';
import type { Hero, RiftEntity } from '../game/entities';
import type { BotProfile } from '../data/types';
import { dist, dist2 } from '../core/math';
import { nearestEnemy } from '../combat/Combat';

type Role = 'CARRIER' | 'CHASER' | 'ESCORT' | 'INTERCEPT' | 'DEFEND' | 'SUPPORT' | 'PVE';

/**
 * Utility-style team AI. Every `reaction` seconds the bot re-evaluates its role from the global
 * situation (who has the Rift, distances, HP), picks a destination and decides on attacks / abilities.
 * Between decisions it follows an A* path and strafes when fighting.
 */
export class BotBrain {
  role: Role = 'CHASER';
  private nextThink = 0;
  private nextPath = 0;
  private path: number[] = [];
  private pathIdx = 0;
  private goalX = 0; goalY = 0;
  private strafe = 1;
  private target: Hero | null = null;
  private stuckT = 0;
  private lastX = 0; private lastY = 0;

  constructor(private m: Match, private h: Hero, public profile: BotProfile) {
    this.nextThink = m.rng.range(0, profile.reaction);
    this.strafe = m.rng.chance(0.5) ? 1 : -1;
  }

  update(dt: number) {
    const m = this.m, h = this.h, c = h.cmd;
    if (m.time >= this.nextThink) {
      this.nextThink = m.time + this.profile.reaction * m.rng.range(0.8, 1.25);
      this.think();
    }
    // follow path
    if (m.time >= this.nextPath || this.pathIdx >= this.path.length) {
      this.nextPath = m.time + this.profile.repath;
      this.path = m.nav.findPath(h.x, h.y, this.goalX, this.goalY, true);
      this.pathIdx = 0;
    }
    let mx = 0, my = 0;
    while (this.pathIdx < this.path.length) {
      const px = this.path[this.pathIdx], py = this.path[this.pathIdx + 1];
      const d = dist(h.x, h.y, px, py);
      if (d < 34 && this.pathIdx < this.path.length - 2) { this.pathIdx += 2; continue; }
      if (d > 8) { mx = (px - h.x) / d; my = (py - h.y) / d; }
      break;
    }
    // combat strafing
    if (this.target && this.target.alive && this.role !== 'CARRIER' && this.profile.dodge > 0) {
      const tx = this.target.x - h.x, ty = this.target.y - h.y, tl = Math.hypot(tx, ty) || 1;
      if (tl < h.def.attack.range) {
        const s = this.profile.dodge * 0.8;
        mx += (-ty / tl) * this.strafe * s;
        my += (tx / tl) * this.strafe * s;
        if (m.rng.chance(dt * 0.8)) this.strafe *= -1;
        // keep preferred distance
        const pref = h.def.attack.range * (h.def.attack.kind === 'melee' ? 0.4 : 0.7);
        const k = (tl - pref) / pref;
        mx += (tx / tl) * k * 0.6; my += (ty / tl) * k * 0.6;
      }
    }
    // stuck detection
    if (dist2(h.x, h.y, this.lastX, this.lastY) < 4 && (mx || my)) {
      this.stuckT += dt;
      if (this.stuckT > 0.6) { this.nextPath = 0; this.stuckT = 0; mx += m.rng.range(-1, 1); my += m.rng.range(-1, 1); }
    } else this.stuckT = 0;
    this.lastX = h.x; this.lastY = h.y;
    const l = Math.hypot(mx, my);
    c.mx = l > 1 ? mx / l : mx; c.my = l > 1 ? my / l : my;
  }

  private think() {
    const m = this.m, h = this.h, c = h.cmd, P = this.profile;
    if (h.pve) return this.thinkPve();
    const rift = this.bestRift();
    const myPortal = m.arena.ownPortal(h.team), enemyPortal = m.arena.enemyPortal(h.team);
    const egx = enemyPortal.x + enemyPortal.w / 2, egy = enemyPortal.y + enemyPortal.h / 2;
    const ogx = myPortal.x + myPortal.w / 2 + (h.team === 0 ? 160 : -160), ogy = myPortal.y + myPortal.h / 2;
    const carrier = rift && rift.carrier >= 0 ? m.heroById(rift.carrier) ?? null : null;
    const pveMode = m.mode.id === 'RIFT_BOSS' || m.mode.id === 'SURVIVAL';

    // ----- role selection
    if (h.carrying) this.role = 'CARRIER';
    else if (carrier && carrier.team === h.team) this.role = h.def.role === 'SUPPORT' ? 'SUPPORT' : 'ESCORT';
    else if (carrier && carrier.team !== h.team) this.role = this.isClosestTeammateTo(carrier.x, carrier.y, 2) || m.rng.chance(1 - P.teamwork) ? 'INTERCEPT' : 'DEFEND';
    else if (rift) this.role = this.isClosestTeammateTo(rift.x, rift.y, 1) || m.rng.chance(1 - P.teamwork) || m.mode.teamSize === 1 ? 'CHASER' : (h.def.role === 'SUPPORT' || h.def.role === 'TANK') && !pveMode ? 'DEFEND' : 'ESCORT';
    else this.role = 'DEFEND';
    if (pveMode && this.role === 'DEFEND') this.role = 'ESCORT';

    // ----- destination
    switch (this.role) {
      case 'CARRIER': {
        if (m.mode.id === 'RIFT_KING') { this.kingCarrier(); break; }
        this.goalX = egx; this.goalY = egy;
        // throw when close to the goal with line of sight, or pass when threatened
        const dGoal = dist(h.x, h.y, egx, egy);
        const threat = nearestEnemy(m, h, 260);
        if (dGoal < 620 && !m.lineBlocked(h.x, h.y, egx, egy) && m.rng.chance(0.55 + P.teamwork * 0.4)) {
          this.aimAt(egx, egy, 0.6); c.attack = true;
        } else if (threat && h.hp < h.maxHp * 0.45 && m.rng.chance(P.teamwork)) {
          c.aimX = 0; c.aimY = 0; c.attack = true; // auto pass
        }
        break;
      }
      case 'CHASER': this.goalX = rift!.x + rift!.vx * 0.3; this.goalY = rift!.y + rift!.vy * 0.3; break;
      case 'ESCORT': {
        const ref = carrier ?? rift;
        if (ref) {
          const ahead = h.team === 0 ? 1 : -1;
          const side = (h.spawnIndex % 2 === 0 ? 1 : -1) * 170;
          this.goalX = ref.x + ahead * 200; this.goalY = ref.y + side;
        } else { this.goalX = m.arena.center.x; this.goalY = m.arena.center.y; }
        break;
      }
      case 'SUPPORT': if (carrier) { this.goalX = carrier.x - (h.team === 0 ? 120 : -120); this.goalY = carrier.y + 80; } break;
      case 'INTERCEPT': if (carrier) { this.goalX = carrier.x + carrier.vx * 0.4; this.goalY = carrier.y + carrier.vy * 0.4; } break;
      case 'DEFEND': {
        const ref = carrier ?? rift;
        const t = ref ? 0.35 : 0;
        this.goalX = ogx + ((ref?.x ?? ogx) - ogx) * t; this.goalY = ogy + ((ref?.y ?? ogy) - ogy) * t;
        break;
      }
    }

    // ----- combat
    this.target = carrier && carrier.team !== h.team && dist2(h.x, h.y, carrier.x, carrier.y) < (h.def.attack.range * 1.05) ** 2 && m.isVisibleTo(carrier, h.team)
      ? carrier : nearestEnemy(m, h, h.def.attack.range * 1.05);
    if (!h.carrying && this.target && h.atkCd <= 0) {
      this.aimLead(this.target);
      c.attack = true;
    }
    this.considerAbilities(rift, carrier);
  }

  /** RIFT KING: the King keeps away from enemies, close to teammates; passes only when about to die. */
  private kingCarrier() {
    const m = this.m, h = this.h, c = h.cmd;
    let ex = 0, ey = 0, n = 0, ax = 0, ay = 0, na = 0;
    for (const o of m.heroes) {
      if (!o.alive || o === h) continue;
      if (o.team !== h.team && dist2(o.x, o.y, h.x, h.y) < 900 * 900) { ex += o.x; ey += o.y; n++; }
      else if (o.team === h.team && !o.pve) { ax += o.x; ay += o.y; na++; }
    }
    let gx = na ? ax / na : h.x, gy = na ? ay / na : h.y;
    if (n) {
      ex /= n; ey /= n;
      const dx = h.x - ex, dy = h.y - ey, l = Math.hypot(dx, dy) || 1;
      gx = h.x + (dx / l) * 380 + (gx - h.x) * 0.3; gy = h.y + (dy / l) * 380 + (gy - h.y) * 0.3;
    }
    this.goalX = Math.max(120, Math.min(m.arena.w - 120, gx));
    this.goalY = Math.max(120, Math.min(m.arena.h - 120, gy));
    if (h.hp < h.maxHp * 0.3 && n > 0 && na > 0 && m.rng.chance(this.profile.teamwork)) { c.aimX = 0; c.aimY = 0; c.attack = true; }
  }

  private thinkPve() {
    const m = this.m, h = this.h, c = h.cmd;
    if (h.def.id === 'turret') {
      const t = nearestEnemy(m, h, h.def.attack.range);
      this.target = t; this.goalX = h.x; this.goalY = h.y;
      if (t) { this.aimLead(t); c.attack = true; }
      return;
    }
    // chase nearest player, boss also uses slam / summon
    const t = nearestEnemy(m, h, 3000);
    this.target = t;
    if (t) { this.goalX = t.x; this.goalY = t.y; } else { this.goalX = m.arena.center.x; this.goalY = m.arena.center.y; }
    if (h.def.id === 'boss_golem' && t) {
      // keep center-ish
      this.goalX = (t.x + m.arena.w * 0.62) / 2; this.goalY = t.y;
      if (dist(h.x, h.y, t.x, t.y) < h.def.attack.range) { this.aimLead(t); c.attack = true; }
      if (dist(h.x, h.y, t.x, t.y) < 360 && h.abCd <= 0) c.ability = true;
    } else if (t && dist(h.x, h.y, t.x, t.y) < h.def.attack.range + t.radius) { this.aimLead(t); c.attack = true; }
  }

  private considerAbilities(rift: RiftEntity | null, carrier: Hero | null) {
    const m = this.m, h = this.h, c = h.cmd, P = this.profile;
    const tryCast = (hint: string, isUlt: boolean): boolean => {
      const t = this.target;
      const dRift = rift ? dist(h.x, h.y, rift.x, rift.y) : Infinity;
      switch (hint) {
        case 'pull_rift': return !!rift && !h.carrying && ((rift.carrier < 0 && dRift > 250 && dRift < 850) || (!!carrier && carrier.team !== h.team && dRift < 420));
        case 'dash_offense':
          if (h.carrying) { const ep = m.arena.enemyPortal(h.team); this.aimAt(ep.x + ep.w / 2, ep.y + ep.h / 2, 0); return true; }
          if (t && dist(h.x, h.y, t.x, t.y) < 420) { this.aimAt(t.x, t.y, 0); return true; }
          if (this.role === 'CHASER' && rift && dRift > 300 && dRift < 500) { this.aimAt(rift.x, rift.y, 0); return true; }
          return false;
        case 'leap': if (h.carrying) { const ep = m.arena.enemyPortal(h.team); this.aimAt(ep.x + ep.w / 2, ep.y + ep.h / 2, 450); return true; } return !!t && dist(h.x, h.y, t.x, t.y) < 450 && h.hp > h.maxHp * 0.5 && (this.aimAt(t.x, t.y, dist(h.x, h.y, t.x, t.y)), true);
        case 'wall_block':
          if (carrier && carrier.team !== h.team && dist(h.x, h.y, carrier.x, carrier.y) < 380) { this.aimAt(carrier.x, carrier.y, 0); return true; }
          if (h.carrying && t) { this.aimAt(t.x, t.y, 0); return true; }
          return false;
        case 'phase': return (h.hp < h.maxHp * 0.4 && !!t) || (h.carrying && !!t && dist(h.x, h.y, t.x, t.y) < 300);
        case 'zone_enemy':
          if (carrier && carrier.team !== h.team && dist(h.x, h.y, carrier.x, carrier.y) < 600) { this.aimAt(carrier.x, carrier.y, dist(h.x, h.y, carrier.x, carrier.y)); return true; }
          if (t && dist(h.x, h.y, t.x, t.y) < 600) { this.aimAt(t.x, t.y, dist(h.x, h.y, t.x, t.y)); return true; }
          return false;
        case 'self_buff': return !!t && dist(h.x, h.y, t.x, t.y) < 450 || (h.carrying && !!t);
        case 'heal_team': {
          let hurt = 0;
          for (const a of m.heroes) if (a.alive && a.team === h.team && a.hp < a.maxHp * 0.6 && dist2(a.x, a.y, h.x, h.y) < 450 * 450) { hurt++; if (!isUlt) this.aimAt(a.x, a.y, dist(h.x, h.y, a.x, a.y)); }
          return hurt >= (isUlt ? 2 : 1) || (isUlt && h.carrying);
        }
        case 'rift_play': {
          if (h.def.gadget?.effect === 'rift_decoy') {
            const chaser = m.heroes.find((e) => e.alive && e.team !== h.team && dist2(e.x, e.y, h.x, h.y) < 500 * 500);
            if (!chaser) return false;
            this.aimAt(chaser.x, chaser.y, 0); return true;
          }
          if (!rift || rift.carrier >= 0 && (!carrier || carrier.team === h.team)) return false;
          if (dRift > 700) return false;
          if (h.def.gadget?.effect === 'rift_gust') { const ep = m.arena.enemyPortal(h.team); this.aimAt(ep.x + ep.w / 2, ep.y + ep.h / 2, 0); return true; }
          // cage the Rift when an enemy is closer to it than we are
          return m.heroes.some((e) => e.alive && e.team !== h.team && dist(e.x, e.y, rift.x, rift.y) < dRift);
        }
        case 'reveal': return !t && m.heroes.some((e) => e.alive && e.team !== h.team && !m.isVisibleTo(e, h.team) && dist(e.x, e.y, h.x, h.y) < 800);
        case 'nuke': {
          let n = 0;
          for (const e of m.heroes) if (e.alive && e.team !== h.team && dist2(e.x, e.y, h.x, h.y) < 330 * 330) n++;
          return n >= (isUlt ? 1 : 1) && (n >= 2 || !!carrier || (t !== null && t.hp < t.maxHp * 0.6));
        }
      }
      return false;
    };
    if (h.abCd <= 0 && m.rng.chance(P.abilityUse) && tryCast(h.def.ability.aiHint, false)) c.ability = true;
    else if (h.ult >= 100 && m.rng.chance(P.ultUse) && tryCast(h.def.ultimate.aiHint, true)) c.ult = true;
    else if (h.def.gadget && h.gadgetCharges > 0 && h.gadgetCd <= 0 && m.rng.chance(P.abilityUse * 0.45) && tryCast(h.def.gadget.aiHint, false)) c.gadget = true;
    // dodge roll: escape when hurt, or burst toward the portal when carrying
    const threat = this.target && this.target.alive && dist(h.x, h.y, this.target.x, this.target.y) < 320;
    if (h.rollCd <= 0 && threat && m.rng.chance(P.dodge * 0.5) && (h.hp < h.maxHp * 0.5 || h.carrying)) c.roll = true;
  }

  private bestRift(): RiftEntity | null {
    const m = this.m, h = this.h;
    let best: RiftEntity | null = null, bd = Infinity;
    for (const r of m.rifts) {
      if (!r.alive || r.state === 'PORTAL') continue;
      // the main rift matters more than clones
      const d = dist2(h.x, h.y, r.x, r.y) * (r.clone ? 1.6 : 1);
      if (r.decoy && r.decoy.team === h.team) continue;
      if (r.carrier >= 0) { const c = m.heroById(r.carrier); if (c && c.team === h.team && c !== h && r.clone) continue; }
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  private isClosestTeammateTo(x: number, y: number, n: number) {
    const m = this.m, h = this.h;
    const d = dist2(h.x, h.y, x, y);
    let closer = 0;
    for (const o of m.heroes) if (o !== h && o.alive && o.team === h.team && !o.carrying && dist2(o.x, o.y, x, y) < d) closer++;
    return closer < n;
  }

  private aimAt(x: number, y: number, d: number) {
    const h = this.h, err = this.m.rng.range(-this.profile.aimError, this.profile.aimError);
    const a = Math.atan2(y - h.y, x - h.x) + err;
    h.cmd.aimX = Math.cos(a); h.cmd.aimY = Math.sin(a); h.cmd.aimDist = d;
  }

  private aimLead(t: Hero) {
    const h = this.h, a = h.def.attack;
    const d = dist(h.x, h.y, t.x, t.y);
    const tt = a.projectileSpeed > 0 ? d / a.projectileSpeed : 0;
    const lead = 1 - this.profile.aimError; // better bots lead targets
    this.aimAt(t.x + t.vx * tt * lead, t.y + t.vy * tt * lead, a.kind === 'lob' ? d : 0);
  }
}
