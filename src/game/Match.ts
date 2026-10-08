import { Arena } from '../arenas/Arena';
import { getArena } from '../data/arenas';
import { getCharacter } from '../data/characters';
import { getMode } from '../data/modes';
import type { EventModifiers, ModeData, ModeId, MutationId, TeamId } from '../data/types';
import { Rng } from '../core/Rng';
import { circleRectPush, dist2, pointInRect, segmentHitsRect } from '../core/math';
import { Hero, Projectile, Zone, type MatchEvent, type Pickup, type PickupKind, type RiftEntity, type ZoneKind } from './entities';
import { applyDamage, healHero, nearestEnemy, performAttack, updateProjectiles } from '../combat/Combat';
import { castAbility, updateDash, updateLeap } from '../abilities/AbilitySystem';
import { checkGoal, checkPickup, createRift, RIFT_TUNING, setRiftState, updateRift } from '../rift/Rift';
import { MutationSystem } from '../rift/MutationSystem';
import { BotBrain } from '../bots/BotBrain';
import { NavGrid } from '../bots/NavGrid';
import { BOT_PROFILES } from '../data/bots';
import type { BotProfile } from '../data/types';
import { createModeRules, type ModeRules } from '../gamemodes/ModeRules';
import { isBoss } from '../data/characters';

export interface PlayerSlot {
  heroId: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  skinId?: string;
  human?: boolean;
  botLevel?: BotProfile['id'];
}

export interface MatchOptions {
  mode: ModeId;
  arenaId: string;
  seed: number;
  players: PlayerSlot[];
  modifiers?: EventModifiers;
  durationOverride?: number;
}

export type MatchPhase = 'countdown' | 'play' | 'goal' | 'overtime' | 'ended';

export interface MatchResult {
  winner: TeamId | -1;
  score: [number, number];
  duration: number;
  overtime: boolean;
  mvp: number;
  mode: ModeId;
  arena: string;
  extra: Record<string, number>;
}

const tmp = { x: 0, y: 0 };

/**
 * Authoritative, deterministic match simulation (no DOM, no rendering). The same class can run on a
 * future dedicated server; the client only renders its state and sends HeroCommands.
 */
export class Match {
  readonly rng: Rng;
  readonly mode: ModeData;
  readonly arena: Arena;
  readonly nav: NavGrid;
  readonly modeRules: ModeRules;
  readonly mutations: MutationSystem;
  readonly modifiers: EventModifiers;
  heroes: Hero[] = [];
  pickups: Pickup[] = [];
  private pickupSeq = 1;
  private shrineNext: number[] = [];
  rifts: RiftEntity[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  brains = new Map<number, BotBrain>();
  events: MatchEvent[] = [];
  score: [number, number] = [0, 0];
  time = 0;
  clock: number;
  phase: MatchPhase = 'countdown';
  phaseUntil = 3;
  mutation: MutationId = 'NORMAL';
  mutationParams: Record<string, number> = {};
  overtime = false;
  result: MatchResult | null = null;
  humanId = -1;
  bossArmor = 1;
  private riftSeq = 1;
  private projSeq = 1;
  private lastCountdown = -1;
  private heroMap = new Map<number, Hero>();
  frame = 0;

  constructor(public opts: MatchOptions) {
    this.rng = new Rng(opts.seed);
    this.mode = getMode(opts.mode);
    this.modifiers = opts.modifiers ?? {};
    this.arena = new Arena(getArena(opts.arenaId));
    this.nav = new NavGrid(this.arena);
    this.clock = opts.durationOverride ?? this.mode.duration;
    this.modeRules = createModeRules(this.mode.id);
    const interval = this.mode.mutationInterval * (this.modifiers.mutationIntervalMul ?? 1);
    this.mutations = new MutationSystem(this, interval, this.mode.firstMutationAt * (this.modifiers.mutationIntervalMul ?? 1));

    let id = 1;
    const perTeam: [number, number] = [0, 0];
    for (const slot of opts.players) {
      const h = new Hero(id++, slot.team, getCharacter(slot.heroId), slot.name, slot.isBot, slot.skinId ?? `${slot.heroId}_default`);
      h.spawnIndex = perTeam[slot.team]++;
      h.gadgetCharges = h.def.gadget?.charges ?? 0;
      this.addHero(h);
      if (slot.human) this.humanId = h.id;
      if (slot.isBot) this.brains.set(h.id, new BotBrain(this, h, BOT_PROFILES[slot.botLevel ?? 'NORMAL']));
    }
    this.rifts.push(createRift(this.riftSeq++, this.arena.center.x, this.arena.center.y));
    this.shrineNext = this.arena.shrines.map((_, i) => 14 + i * 3);
    this.modeRules.setup(this);
    this.resetPositions();
    this.emit({ t: 'countdown', n: 3 });
  }

  // ------------------------------------------------------------------ helpers

  addHero(h: Hero) { this.heroes.push(h); this.heroMap.set(h.id, h); }
  removeHero(h: Hero) {
    const i = this.heroes.indexOf(h);
    if (i >= 0) this.heroes.splice(i, 1);
    this.heroMap.delete(h.id);
    this.brains.delete(h.id);
  }
  nextHeroId() { let max = 0; for (const h of this.heroes) max = Math.max(max, h.id); return max + 1; }
  heroById(id: number) { return this.heroMap.get(id); }
  get human() { return this.heroMap.get(this.humanId); }
  emit(e: MatchEvent) { this.events.push(e); }
  nextRiftId() { return this.riftSeq++; }
  mainRift(): RiftEntity | undefined { for (const r of this.rifts) if (!r.clone) return r; return undefined; }
  respawnTime(h: Hero) { return this.mode.respawnTime + (this.overtime ? 1 : 0) + (h.pve ? 0 : 0); }
  riftSpeedMul() {
    let m = this.mode.riftSpeedMul * (this.modifiers.riftSpeedMul ?? 1);
    if (this.mutation === 'FURY') m *= this.mutationParams.speedMul ?? 2;
    if (this.overtime) m *= 1.15;
    return m;
  }
  isOnIce(x: number, y: number) { return !!this.arena.hazardAt(x, y, 'ice'); }

  allocProjectile(): Projectile {
    for (const p of this.projectiles) if (!p.active) { p.active = true; p.id = this.projSeq++; return p; }
    const p = new Projectile();
    p.active = true; p.id = this.projSeq++;
    this.projectiles.push(p);
    return p;
  }

  addZone(kind: ZoneKind, owner: Hero | null, x: number, y: number, radius: number, duration: number, o: { damage?: number; heal?: number; pull?: number; slow?: number; stun?: number; tickEvery?: number; delay?: number; burst?: number } = {}) {
    let z = this.zones.find((q) => !q.active);
    if (!z) { z = new Zone(); this.zones.push(z); }
    z.active = true; z.kind = kind; z.owner = owner ? owner.id : -1; z.team = owner ? owner.team : 1;
    z.x = x; z.y = y; z.radius = radius; z.born = this.time; z.until = this.time + duration;
    z.tickEvery = o.tickEvery ?? 0.5; z.nextTick = this.time + (o.delay ?? 0);
    z.damage = o.damage ?? 0; z.heal = o.heal ?? 0; z.pull = o.pull ?? 0; z.slow = o.slow ?? 0; z.stun = o.stun ?? 0;
    z.delay = kind === 'eruption' ? o.burst ?? 0 : 0; // eruption burst damage stored in delay slot when used
    z.burst = o.burst ?? 0;
    z.id = this.projSeq++;
    return z;
  }

  attractRift(r: RiftEntity, heroId: number, force: number, duration: number) {
    r.attractX = heroId; r.attractY = 0;
    r.attractForce = force; r.attractUntil = this.time + duration;
    r.lastTouchAt = this.time;
  }

  /** Visibility rules: invisibility, bushes (revealed when an enemy is close, or after attacking/being hit). */
  isVisibleTo(target: Hero, viewerTeam: TeamId): boolean {
    if (target.team === viewerTeam) return true;
    if (target.invisUntil > this.time) return false;
    if (!target.inBush) return true;
    if (target.revealedUntil > this.time) return true;
    const reveal = target.def.passive.id === 'umbra' ? 0 : 210;
    if (reveal <= 0) return false;
    for (const h of this.heroes) {
      if (!h.alive || h.team !== viewerTeam) continue;
      if (dist2(h.x, h.y, target.x, target.y) < reveal * reveal) return true;
    }
    return false;
  }

  lineBlocked(x0: number, y0: number, x1: number, y1: number) {
    for (const w of this.arena.walls) if (segmentHitsRect(x0, y0, x1, y1, w)) return true;
    return false;
  }

  /** Furthest free point along a direction (teleports). */
  castToFree(h: Hero, dx: number, dy: number, distance: number): [number, number] {
    let bx = h.x, by = h.y;
    for (let d = distance; d >= 0; d -= 20) {
      const x = h.x + dx * d, y = h.y + dy * d;
      if (x < h.radius || y < h.radius || x > this.arena.w - h.radius || y > this.arena.h - h.radius) continue;
      if (!this.arena.pointBlocked(x, y, h.radius)) { bx = x; by = y; break; }
    }
    return [bx, by];
  }

  unstickFromWalls() {
    for (const h of this.heroes) if (h.alive) this.collideWalls(h, false);
    for (const r of this.rifts) {
      if (!r.alive || r.carrier >= 0) continue;
      for (const w of this.arena.walls) if (circleRectPush(r.x, r.y, r.radius, w, tmp)) { r.x += tmp.x; r.y += tmp.y; }
    }
  }

  applyTeleporters(e: { x: number; y: number; id: number }, heroOrRift: number) {
    // per-entity cooldown stored in a small map
    const key = heroOrRift === -1 ? -e.id - 1000 : e.id;
    const cd = this.tpCooldown.get(key) ?? 0;
    if (cd > this.time) return;
    for (const hz of this.arena.hazards) {
      if (hz.kind !== 'teleport' || !pointInRect(e.x, e.y, hz)) continue;
      for (const other of this.arena.hazards) {
        if (other === hz || other.kind !== 'teleport' || other.pair !== hz.pair) continue;
        const fx = e.x, fy = e.y;
        e.x = other.x + other.w / 2; e.y = other.y + other.h / 2;
        this.tpCooldown.set(key, this.time + 1.2);
        if (heroOrRift !== -1) this.emit({ t: 'teleport', hero: e.id, fx, fy, x: e.x, y: e.y });
        return;
      }
    }
  }
  private tpCooldown = new Map<number, number>();

  dropCarried(h: Hero) {
    for (const r of this.rifts) {
      if (r.carrier !== h.id) continue;
      r.carrier = -1;
      h.carrying = false;
      r.vx = (this.rng.next() - 0.5) * 300; r.vy = (this.rng.next() - 0.5) * 300;
      r.pickupLockUntil = this.time + 0.45; r.pickupLockHero = h.id;
      r.lastThrower = -1;
      setRiftState(this, r, 'DROPPED');
      this.emit({ t: 'drop', hero: h.id, rift: r.id });
    }
    h.carrying = false;
  }

  throwRift(h: Hero, dx: number, dy: number) {
    for (const r of this.rifts) {
      if (r.carrier !== h.id) continue;
      r.carrier = -1;
      h.carrying = false;
      const sp = RIFT_TUNING.throwSpeed * (this.mutation === 'FURY' ? this.mutationParams.throwMul ?? 1 : 1);
      r.x = h.x + dx * (h.radius + r.radius + 4);
      r.y = h.y + dy * (h.radius + r.radius + 4);
      r.vx = dx * sp; r.vy = dy * sp;
      r.pickupLockUntil = this.time + 0.4; r.pickupLockHero = h.id;
      r.lastTouchTeam = h.team; r.lastTouchAt = this.time; r.lastThrower = h.id;
      setRiftState(this, r, 'DROPPED');
      h.stats.throws++;
      h.anim.attackT = 0.25;
      this.emit({ t: 'throw', hero: h.id, rift: r.id });
      return;
    }
  }

  scoreGoal(r: RiftEntity, team: TeamId, scorer: number, portalTeam: TeamId) {
    const worth = r.charged && !r.clone ? 2 : 1;
    r.charged = false; r.carryTime = 0;
    const carrier = r.carrier >= 0 ? this.heroById(r.carrier) : null;
    if (carrier) carrier.carrying = false;
    r.carrier = -1;
    r.portalTeam = portalTeam;
    setRiftState(this, r, 'PORTAL');
    const s = this.heroById(scorer);
    if (s) { s.stats.goals++; s.ult = Math.min(100, s.ult + 20); }
    this.emit({ t: 'goal', team, scorer, rift: r.id, x: r.x, y: r.y, worth });
    const outcome = this.modeRules.onGoal(this, r, team, scorer);
    if (outcome === 'reset') {
      this.score[team] += worth;
      if (this.overtime) { this.finish(team); return; }
      this.phase = 'goal';
      this.phaseUntil = this.time + 2.6;
      this.mutations.resetAfterGoal();
    } else if (outcome === 'clone') {
      this.score[team] += worth;
      r.alive = false;
    }
  }

  resetPositions() {
    for (const h of this.heroes) {
      if (h.pve) continue;
      const sp = this.arena.spawns[h.team][h.spawnIndex % 3];
      h.x = sp.x; h.y = sp.y + Math.floor(h.spawnIndex / 3) * 60;
      h.facing = h.team === 0 ? 0 : Math.PI;
      h.kx = h.ky = 0; h.dash = null; h.leap = null; h.carrying = false;
      h.stunUntil = 0; h.slowUntil = 0;
      if (!h.alive) { h.alive = true; h.hp = h.maxHp; }
    }
    // remove clones, recenter main rift
    this.rifts = this.rifts.filter((r) => !r.clone);
    const r = this.mainRift()!;
    r.alive = true; r.carrier = -1; r.x = this.arena.center.x; r.y = this.arena.center.y; r.vx = r.vy = 0;
    r.lastTouchTeam = -1; r.attractUntil = 0; r.charged = false; r.carryTime = 0;
    setRiftState(this, r, 'IDLE');
    for (const p of this.projectiles) p.active = false;
    for (const z of this.zones) z.active = false;
  }

  finish(winner: TeamId | -1) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    let mvp = -1, best = -1;
    for (const h of this.heroes) {
      if (h.pve) continue;
      const s = h.stats;
      const v = s.goals * 3 + s.kills * 1.5 + s.assists + s.captures * 0.5 + s.damage / 2500 + s.heal / 2000 + s.interceptions + s.kingPoints * 0.25 + s.bossDamage / 4000;
      if (v > best) { best = v; mvp = h.id; }
    }
    this.result = {
      winner, score: [this.score[0], this.score[1]], duration: this.time, overtime: this.overtime, mvp,
      mode: this.mode.id, arena: this.arena.data.id, extra: this.modeRules.extraResult(this),
    };
    this.emit({ t: 'end' });
  }

  // ------------------------------------------------------------------ main step

  step(dt: number) {
    if (this.phase === 'ended') return;
    this.frame++;
    this.time += dt;

    // phase machine
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.phaseUntil - this.time);
      if (n !== this.lastCountdown && n > 0) { this.lastCountdown = n; if (n < 3) this.emit({ t: 'countdown', n }); }
      if (this.time >= this.phaseUntil) { this.phase = this.overtime ? 'overtime' : 'play'; this.lastCountdown = -1; this.emit({ t: 'kickoff' }); }
    } else if (this.phase === 'goal') {
      if (this.time >= this.phaseUntil) {
        if (this.modeRules.checkEnd(this)) return;
        this.resetPositions();
        this.phase = 'countdown';
        this.phaseUntil = this.time + 2;
      }
    } else {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        const res = this.modeRules.onTimeUp(this);
        if (res === 'overtime') {
          this.overtime = true;
          this.clock = 60;
          this.phase = 'overtime';
          this.emit({ t: 'sudden_death' });
        } else { this.finish(res); return; }
      }
      if (this.modeRules.checkEnd(this)) return;
    }

    this.arena.update(this.time);
    this.updatePickups();
    this.modeRules.update(this, dt);

    const canAct = this.phase === 'play' || this.phase === 'overtime';
    // bots think
    if (canAct) for (const [id, brain] of this.brains) { const h = this.heroMap.get(id); if (h && h.alive) brain.update(dt); }

    for (const h of this.heroes) this.updateHero(h, dt, canAct);
    this.separateHeroes();

    updateProjectiles(this, dt);
    this.updateZones();
    this.mutations.update(dt);

    for (const r of this.rifts) {
      if (!r.alive) continue;
      if (r.frozenUntil && r.frozenUntil > this.time && r.carrier < 0) { r.vx = r.vy = 0; checkPickup(this, r); continue; }
      updateRift(this, r, dt);
      if (!r.alive) continue;
      checkPickup(this, r);
      checkGoal(this, r);
      // OVERCHARGE: holding the Rift long enough makes the next goal worth 2
      if (r.carrier >= 0 && !r.clone && (this.phase === 'play' || this.phase === 'overtime')) {
        r.carryTime += dt;
        if (!r.charged && r.carryTime >= 8) {
          r.charged = true;
          const c = this.heroById(r.carrier);
          if (c) this.emit({ t: 'rift_charged', rift: r.id, team: c.team });
        }
      }
    }
    if (this.frame % 60 === 0) {
      this.rifts = this.rifts.filter((r) => r.alive);
      for (let i = this.heroes.length - 1; i >= 0; i--) {
        const h = this.heroes[i];
        if (h.pve && !h.alive && this.time - h.lastDamageAt > 1.5) this.removeHero(h);
      }
    }
  }

  private updateHero(h: Hero, dt: number, canAct: boolean) {
    const a = h.anim;
    a.attackT = Math.max(0, a.attackT - dt); a.hitT = Math.max(0, a.hitT - dt); a.castT = Math.max(0, a.castT - dt);
    if (a.emoteT > 0) a.emoteT -= dt;
    if (!h.alive) {
      if (this.time >= h.respawnAt && this.phase !== 'ended') this.respawn(h);
      return;
    }
    // summons (turrets) expire
    if (h.expireAt <= this.time) { h.alive = false; h.hp = 0; h.respawnAt = Infinity; h.lastDamageAt = this.time; this.emit({ t: 'explosion', x: h.x, y: h.y, radius: 80, color: '#f77f00' }); return; }
    const cdMul = h.def.passive.id === 'timekeeper' ? h.def.passive.params.mul : 1;
    h.atkCd -= dt; h.abCd -= dt * cdMul; h.gadgetCd -= dt * cdMul; h.rollCd -= dt; h.jumpCd -= dt;
    // CHRONOS: remember where we were (rewind)
    if (h.def.ability.effect === 'rewind' && this.frame % 15 === 0) {
      h.history.push(this.time, h.x, h.y, h.hp);
      if (h.history.length > 96) h.history.splice(0, 4);
    }
    // RIFTBORN: the Rift heals its child
    if (h.carrying && h.def.passive.id === 'rift_bond') h.hp = Math.min(h.maxHp, h.hp + h.maxHp * h.def.passive.params.regen * dt);
    if (h.blazeUntil > this.time && this.frame % 12 === 0 && h.def.gadget) this.addZone('fire', h, h.x, h.y, 75, 2.2, { damage: h.def.gadget.params.damage ?? 150, tickEvery: 0.5 });
    if (h.shieldUntil <= this.time) h.shield = 0;
    if (canAct && !h.pve) h.ult = Math.min(100, h.ult + dt * 0.9);

    // regen out of combat
    if (this.time - h.lastDamageAt > 3.5 && h.hp < h.maxHp && !h.pve) {
      const mul = h.def.passive.id === 'recycler' ? h.def.passive.params.regenMul : 1;
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.13 * mul * dt);
    }
    // pulse aura
    if (h.def.passive.id === 'aura' && this.frame % 30 === 0) {
      const p = h.def.passive.params;
      for (const o of this.heroes) if (o !== h && o.alive && o.team === h.team && dist2(o.x, o.y, h.x, h.y) < p.range * p.range && o.hp < o.maxHp) healHero(this, o, p.regen * 0.5, h);
    }
    // block passive
    if (h.def.passive.id === 'mason' && this.frame % 30 === 0) {
      const p = h.def.passive.params;
      for (const w of this.arena.walls) {
        if (w.dynamic && w.team === h.team && dist2(w.x + w.w / 2, w.y + w.h / 2, h.x, h.y) < p.range * p.range) {
          if (h.shield < p.shield) { h.shield = p.shield; h.shieldUntil = this.time + 1.2; }
          break;
        }
      }
    }
    // lava
    const lava = this.arena.hazardAt(h.x, h.y, 'lava');
    if (lava && !h.leap && h.phaseUntil <= this.time) applyDamage(this, h, 1100 * dt * (h.pve ? 0.2 : 1), null, { noUlt: true });

    if (h.leap) { updateLeap(this, h, dt); this.updateBush(h); return; }
    if (h.dash) { updateDash(this, h, dt); this.collideWalls(h, h.phaseUntil > this.time); this.updateBush(h); return; }

    const stunned = h.stunUntil > this.time || h.channelUntil > this.time || !canAct;
    const c = h.cmd;
    // movement
    let speed = h.def.speed;
    if (h.carrying) {
      const pid = h.def.passive.id;
      const slow = pid === 'porter' || pid === 'rift_bond' ? 0 : pid === 'courier' ? -h.def.passive.params.carryBonus : 0.15;
      speed *= 1 - slow + (this.mutation === 'FURY' ? this.mutationParams.carrierSpeed ?? 0 : 0);
    }
    if (h.carrying) { const cr = this.rifts.find((q) => q.carrier === h.id); if (cr?.charged) { speed *= 0.9; h.revealedUntil = this.time + 0.2; } }
    if (h.slowUntil > this.time) speed *= h.slowMul;
    if (h.speedBuffUntil > this.time) speed *= 1 + h.speedBuff;
    if (h.def.passive.id === 'kindling' && h.hp / h.maxHp < h.def.passive.params.threshold) speed *= 1 + h.def.passive.params.speedBonus;
    if (this.arena.hazardAt(h.x, h.y, 'boost')) speed *= 1.35;

    let mx = stunned ? 0 : c.mx, my = stunned ? 0 : c.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const tvx = mx * speed, tvy = my * speed;
    const ice = this.isOnIce(h.x, h.y);
    const accel = ice ? 2.2 : 18;
    const k = Math.min(1, accel * dt);
    h.vx += (tvx - h.vx) * k;
    h.vy += (tvy - h.vy) * k;
    h.x += (h.vx + h.kx) * dt;
    h.y += (h.vy + h.ky) * dt;
    const kd = Math.exp(-8 * dt);
    h.kx *= kd; h.ky *= kd;
    if (ml > 0.1) { a.walk += dt * speed * 0.03; if (!c.attack && a.attackT <= 0) h.facing = Math.atan2(my, mx); }

    const phasing = h.phaseUntil > this.time || (h.carrying && this.mutation === 'PHASE');
    this.collideWalls(h, phasing);
    this.applyTeleporters(h, h.id);
    this.applyJumpPads(h);
    this.updateBush(h);

    if (stunned) { c.attack = c.ability = c.ult = c.gadget = c.roll = false; return; }

    // universal dodge roll (short dash with invulnerability frames)
    if (c.roll) {
      c.roll = false;
      if (h.rollCd <= 0 && !h.pve) {
        let rx = mx, ry = my;
        if (Math.hypot(rx, ry) < 0.2) { rx = Math.cos(h.facing); ry = Math.sin(h.facing); }
        const rl = Math.hypot(rx, ry) || 1;
        h.dash = { dx: rx / rl, dy: ry / rl, remaining: 300, speed: 1700, dmg: 0, kb: 0, stun: 0, kind: 'roll', hit: new Set() };
        h.dodgeUntil = this.time + 0.3;
        h.rollCd = h.carrying ? 5.5 : 4;
        h.facing = Math.atan2(ry, rx);
        this.emit({ t: 'roll', hero: h.id });
      }
    }
    // ECLIPSE: silenced heroes can only move, attack and roll
    if (h.silenceUntil > this.time) { c.ability = c.ult = c.gadget = false; }
    // unique power (gadget)
    if (c.gadget) {
      c.gadget = false;
      const g = h.def.gadget;
      if (g && h.gadgetCharges > 0 && h.gadgetCd <= 0) {
        const [dx, dy] = this.resolveAim(h, c, Math.max(g.range, 400));
        if (castAbility(this, h, g, false, dx, dy, c.aimDist, true)) { h.gadgetCharges--; h.gadgetCd = g.cooldown; }
      }
    }

    // aim
    let ax = c.aimX, ay = c.aimY;
    const manual = ax !== 0 || ay !== 0;

    if (c.attack) {
      c.attack = false;
      if (h.carrying) {
        if (!manual) {
          const target = this.autoThrowTarget(h);
          ax = target.x - h.x; ay = target.y - h.y;
        }
        const l = Math.hypot(ax, ay) || 1;
        this.throwRift(h, ax / l, ay / l);
      } else if (h.atkCd <= 0) {
        if (!manual) {
          const e = nearestEnemy(this, h, h.def.attack.range * 1.1);
          if (e) {
            // precise auto-aim: lead moving targets by projectile travel time
            const sp = h.def.attack.projectileSpeed;
            const t = sp > 0 ? Math.min(0.6, Math.hypot(e.x - h.x, e.y - h.y) / sp) : 0;
            ax = e.x + e.vx * t * 0.85 - h.x; ay = e.y + e.vy * t * 0.85 - h.y;
          } else { ax = Math.cos(h.facing); ay = Math.sin(h.facing); }
        }
        const l = Math.hypot(ax, ay) || 1;
        performAttack(this, h, ax / l, ay / l, c.aimDist);
        h.atkCd = h.def.attack.cooldown;
        // GEAR: faster attacks next to his turret
        if (h.def.passive.id === 'overclock') {
          const P2 = h.def.passive.params;
          if (this.heroes.some((t) => t.alive && t.ownerId === h.id && dist2(t.x, t.y, h.x, h.y) < P2.range * P2.range)) h.atkCd *= P2.mul;
        }
      }
    }
    if (c.ability) {
      c.ability = false;
      if (h.abCd <= 0) {
        const [dx, dy] = this.resolveAim(h, c, h.def.ability.range);
        if (castAbility(this, h, h.def.ability, false, dx, dy, c.aimDist)) h.abCd = h.def.ability.cooldown;
      }
    }
    if (c.ult) {
      c.ult = false;
      if (!h.pve && h.ult >= 100) {
        const [dx, dy] = this.resolveAim(h, c, h.def.ultimate.range);
        if (castAbility(this, h, h.def.ultimate, true, dx, dy, c.aimDist)) h.ult = 0;
      }
    }
  }

  private resolveAim(h: Hero, c: { aimX: number; aimY: number }, range: number): [number, number] {
    let ax = c.aimX, ay = c.aimY;
    if (ax === 0 && ay === 0) {
      const e = nearestEnemy(this, h, Math.max(range, 450) * 1.2);
      if (e) { ax = e.x - h.x; ay = e.y - h.y; }
      else if (Math.hypot(h.vx, h.vy) > 20) { ax = h.vx; ay = h.vy; }
      else { const p = this.arena.enemyPortal(h.team); ax = p.x + p.w / 2 - h.x; ay = p.y + p.h / 2 - h.y; }
    }
    const l = Math.hypot(ax, ay) || 1;
    return [ax / l, ay / l];
  }

  /** Auto-throw: toward the enemy portal if close, otherwise to the best-placed teammate. */
  autoThrowTarget(h: Hero) {
    const p = this.arena.enemyPortal(h.team);
    const gx = p.x + p.w / 2, gy = p.y + p.h / 2;
    if (dist2(h.x, h.y, gx, gy) < 750 * 750 && !this.lineBlocked(h.x, h.y, gx, gy)) return { x: gx, y: gy };
    let best: Hero | null = null, bestD = dist2(h.x, h.y, gx, gy);
    for (const o of this.heroes) {
      if (o === h || !o.alive || o.team !== h.team) continue;
      const d = dist2(o.x, o.y, gx, gy);
      if (d < bestD - 200 * 200 && dist2(o.x, o.y, h.x, h.y) < 650 * 650 && !this.lineBlocked(h.x, h.y, o.x, o.y)) { bestD = d; best = o; }
    }
    if (best) return { x: best.x + best.vx * 0.3, y: best.y + best.vy * 0.3 };
    return { x: gx, y: gy };
  }

  private updateBush(h: Hero) { h.inBush = this.arena.inBush(h.x, h.y); }

  collideWalls(h: Hero, phasing: boolean) {
    for (const w of this.arena.walls) {
      if (phasing && !w.border) continue;
      if (circleRectPush(h.x, h.y, h.radius, w, tmp)) { h.x += tmp.x; h.y += tmp.y; }
    }
    h.x = Math.max(h.radius, Math.min(this.arena.w - h.radius, h.x));
    h.y = Math.max(h.radius, Math.min(this.arena.h - h.radius, h.y));
  }

  private separateHeroes() {
    const hs = this.heroes;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (!a.alive || a.leap) continue;
      for (let j = i + 1; j < hs.length; j++) {
        const b = hs[j];
        if (!b.alive || b.leap) continue;
        const r = a.radius + b.radius;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (r - d) / 2;
        const nx = dx / d, ny = dy / d;
        const wa = isBoss(a) || a.def.id === 'turret' ? 0.05 : 1, wb = isBoss(b) || b.def.id === 'turret' ? 0.05 : 1;
        a.x -= nx * push * wa; a.y -= ny * push * wa;
        b.x += nx * push * wb; b.y += ny * push * wb;
      }
    }
  }

  private respawn(h: Hero) {
    if (h.pve) return;
    const sp = this.arena.spawns[h.team][h.spawnIndex % 3];
    h.x = sp.x; h.y = sp.y;
    h.alive = true; h.hp = h.maxHp; h.kx = h.ky = 0;
    h.stunUntil = 0; h.slowUntil = 0; h.phaseUntil = this.time + 1.5; // spawn protection
    h.shield = 0; h.carrying = false;
    this.emit({ t: 'respawn', hero: h.id });
  }

  // ------------------------------------------------------------------ map mechanics

  /** Jump pads launch heroes (leap, ignores walls) to the paired pad. */
  private applyJumpPads(h: Hero) {
    if (h.leap || h.jumpCd > 0 || h.pve) return;
    for (const hz of this.arena.hazards) {
      if (hz.kind !== 'jump' || h.x < hz.x || h.x > hz.x + hz.w || h.y < hz.y || h.y > hz.y + hz.h) continue;
      const other = this.arena.hazards.find((o) => o !== hz && o.kind === 'jump' && o.pair === hz.pair);
      if (!other) return;
      const tx = other.x + other.w / 2, ty = other.y + other.h / 2;
      h.leap = { fx: h.x, fy: h.y, tx, ty, t: 0, dur: 0.85, dmg: 0 };
      h.jumpCd = 1.6;
      h.dash = null;
      this.emit({ t: 'jump', hero: h.id, x: h.x, y: h.y, tx, ty });
      return;
    }
  }

  spawnPickup(kind: PickupKind, x: number, y: number, shrine: number) {
    const p: Pickup = { id: this.pickupSeq++, kind, x, y, alive: true, shrine, dieAt: shrine >= 0 ? Infinity : this.time + 14, born: this.time };
    this.pickups.push(p);
    this.emit({ t: 'pickup_spawn', kind, x, y });
    return p;
  }

  private updatePickups() {
    // destroyed crates may drop a power-up
    for (const w of this.arena.brokenCrates) {
      this.emit({ t: 'crate_break', x: w.x + w.w / 2, y: w.y + w.h / 2 });
      if (this.rng.chance(0.65)) this.spawnPickup(this.rng.pick(['speed', 'shield', 'power', 'ult'] as const), w.x + w.w / 2, w.y + w.h / 2, -1);
    }
    this.arena.brokenCrates.length = 0;
    if (this.phase !== 'play' && this.phase !== 'overtime') return;
    // altars spawn a power-up every ~14 s when empty
    this.arena.shrines.forEach((sh, i) => {
      if (this.time < this.shrineNext[i] || this.pickups.some((p) => p.alive && p.shrine === i)) return;
      this.shrineNext[i] = this.time + 14;
      this.spawnPickup(this.rng.pick(['speed', 'shield', 'power', 'ult'] as const), sh.x, sh.y, i);
    });
    for (const p of this.pickups) {
      if (!p.alive) continue;
      if (this.time >= p.dieAt) { p.alive = false; continue; }
      if (this.time - p.born < 0.4) continue;
      for (const h of this.heroes) {
        if (!h.alive || h.pve || dist2(h.x, h.y, p.x, p.y) > (h.radius + 34) ** 2) continue;
        p.alive = false;
        if (p.shrine >= 0) this.shrineNext[p.shrine] = this.time + 14;
        this.applyPickup(h, p.kind);
        this.emit({ t: 'pickup', hero: h.id, kind: p.kind, x: p.x, y: p.y });
        break;
      }
    }
    if (this.frame % 120 === 0) this.pickups = this.pickups.filter((p) => p.alive);
  }

  private applyPickup(h: Hero, kind: PickupKind) {
    switch (kind) {
      case 'speed': h.speedBuff = Math.max(h.speedBuffUntil > this.time ? h.speedBuff : 0, 0.3); h.speedBuffUntil = this.time + 5; break;
      case 'shield': h.shield = Math.max(h.shield, 1000); h.shieldUntil = this.time + 6; break;
      case 'power': h.powerUntil = this.time + 6; break;
      case 'ult': h.ult = Math.min(100, h.ult + 35); break;
    }
    if (h.def.passive.id === 'hearty') healHero(this, h, h.maxHp * h.def.passive.params.heal, h);
  }

  private updateZones() {
    for (const z of this.zones) {
      if (!z.active) continue;
      const owner = z.owner >= 0 ? this.heroById(z.owner) ?? null : null;
      if (this.time >= z.until) {
        // boss telegraph: the hit lands when the warning circle is full
        if (z.kind === 'boss_warn') {
          for (const h of this.heroes) if (h.alive && h.team !== z.team && dist2(z.x, z.y, h.x, h.y) <= (z.radius + h.radius) ** 2) applyDamage(this, h, z.burst, owner, { stun: z.stun, kb: 420, kbX: h.x - z.x, kbY: h.y - z.y, noUlt: true });
          this.emit({ t: 'explosion', x: z.x, y: z.y, radius: z.radius, color: '#ff2e63' });
        }
        z.active = false; continue;
      }
      if (z.kind === 'boss_warn') continue;
      // auras refreshed every frame
      if (z.kind === 'smoke' || z.kind === 'sanctuary' || z.kind === 'eclipse') {
        for (const h of this.heroes) {
          if (!h.alive || dist2(z.x, z.y, h.x, h.y) > (z.radius + h.radius) ** 2) continue;
          if (h.team === z.team) {
            if (z.kind === 'smoke' && !h.carrying) h.invisUntil = Math.max(h.invisUntil, this.time + 0.25);
            if (z.kind === 'sanctuary') { h.dmgReduction = Math.max(h.dmgReductionUntil > this.time ? h.dmgReduction : 0, z.reduce); h.dmgReductionUntil = this.time + 0.3; }
          } else if (z.kind === 'eclipse' && !isBoss(h)) h.silenceUntil = this.time + 0.3;
        }
      }
      // continuous pull (heroes + rift)
      if (z.pull > 0) {
        const dt = 1 / 60;
        for (const h of this.heroes) {
          if (!h.alive || h.team === z.team || isBoss(h) || h.def.id === 'turret' || h.avatarUntil > this.time) continue;
          const dx = z.x - h.x, dy = z.y - h.y, d = Math.hypot(dx, dy);
          if (d < z.radius && d > 10) { h.x += (dx / d) * z.pull * dt; h.y += (dy / d) * z.pull * dt; }
        }
        for (const r of this.rifts) {
          if (!r.alive || r.carrier >= 0 || r.state === 'PORTAL') continue;
          const dx = z.x - r.x, dy = z.y - r.y, d = Math.hypot(dx, dy);
          if (d < z.radius && d > 10) { r.vx += (dx / d) * z.pull * 3 * dt; r.vy += (dy / d) * z.pull * 3 * dt; }
        }
      }
      if (z.kind === 'mine') {
        if (this.time - z.born < 0.8) continue;
        const victim = this.heroes.find((h) => h.alive && h.team !== z.team && dist2(z.x, z.y, h.x, h.y) < (z.radius + h.radius) ** 2);
        if (victim) {
          for (const h of this.heroes) if (h.alive && h.team !== z.team && dist2(z.x, z.y, h.x, h.y) < (z.radius * 1.6 + h.radius) ** 2) applyDamage(this, h, z.burst, owner, { kb: 500, kbX: h.x - z.x, kbY: h.y - z.y, noUlt: true });
          this.emit({ t: 'explosion', x: z.x, y: z.y, radius: z.radius * 1.6, color: '#ffd23f' });
          z.active = false;
        }
        continue;
      }
      if (this.time < z.nextTick) continue;
      const first = z.nextTick <= z.born + 0.001 || (z.kind === 'eruption' && z.delay > 0);
      z.nextTick = this.time + z.tickEvery;
      for (const h of this.heroes) {
        if (!h.alive) continue;
        if (dist2(z.x, z.y, h.x, h.y) > (z.radius + h.radius) ** 2) continue;
        if (h.team === z.team) { if (z.heal > 0) healHero(this, h, z.heal, owner); continue; }
        let dmg = z.damage;
        if (z.kind === 'eruption' && z.delay > 0) dmg += z.delay;
        if (dmg > 0) applyDamage(this, h, dmg, owner, { slow: z.slow, slowDuration: 0.6, stun: first ? z.stun : 0, noUlt: true });
        else if (z.slow > 0 && h.avatarUntil <= this.time && !isBoss(h)) { h.slowMul = h.slowUntil > this.time ? Math.min(h.slowMul, 1 - z.slow) : 1 - z.slow; h.slowUntil = Math.max(h.slowUntil, this.time + 0.6); }
      }
      if (z.kind === 'eruption' && z.delay > 0) { this.emit({ t: 'explosion', x: z.x, y: z.y, radius: z.radius, color: '#ff6b35' }); z.delay = 0; }
    }
  }

  /** Remaining-time label helper for UI */
  get mutationTimeLeft() { return this.mutation === 'NORMAL' ? 0 : Math.max(0, this.mutations.until - this.time); }
}
