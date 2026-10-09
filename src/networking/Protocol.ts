import type { Match } from '../game/Match';
import { Hero, Projectile, Zone, type MatchEvent, type RiftEntity } from '../game/entities';
import type { ModeId, MutationId, RiftState, TeamId } from '../data/types';
import { getCharacter } from '../data/characters';
import { createRift } from '../rift/Rift';
import type { Hazard, Wall } from '../arenas/Arena';
import type { MatchResult, MatchPhase } from '../game/Match';
import type { HeroStats } from '../game/entities';

/**
 * Online protocol (JSON over WebSocket). The server runs the authoritative Match; clients send inputs
 * and receive compact snapshots (20 Hz) + gameplay events used for FX/audio.
 */
export const PROTOCOL_VERSION = 3;
export const SNAPSHOT_HZ = 20;

export interface RosterSlot { slot: number; heroId: string; skinId: string; name: string; team: TeamId; isBot: boolean; trophies: number; heroEntityId: number }

export type ClientMsg =
  | { t: 'hello'; v: number; playerId: string; name: string; trophies: number }
  | { t: 'queue'; mode: ModeId; heroId: string; skinId: string; botLevel?: string }
  | { t: 'cancel' }
  | { t: 'in'; s: number; mx: number; my: number }
  | { t: 'act'; s: number; slot: 'attack' | 'ability' | 'ult' | 'gadget' | 'roll'; ax: number; ay: number; ad: number }
  | { t: 'emote'; e: string }
  | { t: 'leave' }
  | { t: 'ping'; c: number };

export type ServerMsg =
  | { t: 'welcome'; v: number; online: number }
  | { t: 'queue'; found: number; humans: number; needed: number; waitLeft: number; online: number }
  | { t: 'found'; matchId: string; mode: ModeId; arenaId: string; seed: number; roster: RosterSlot[]; you: number }
  | { t: 'snap'; s: Snapshot }
  | { t: 'end'; result: MatchResult; stats: Record<number, HeroStats> }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };

export interface Snapshot {
  t: number; ph: MatchPhase; pu: number; ck: number; sc: [number, number]; ot: boolean; mu: MutationId; mut: number;
  ack: number; // last processed movement input seq for the receiving player
  h: (string | number)[][];
  r: number[][];
  p: (string | number)[][];
  z: (string | number)[][];
  w: number[][];
  hz: (string | number)[][];
  pk: (string | number)[][];
  ev: MatchEvent[];
}

const RIFT_STATES: RiftState[] = ['IDLE', 'ROAM', 'FLEE', 'CHASE', 'ATTRACTED', 'CARRIED', 'DROPPED', 'FRENZY', 'MUTATING', 'CLONING', 'PORTAL'];
const r2 = (n: number) => Math.round(n * 10) / 10;

// hero flags bitfield
const F = { ALIVE: 1, CARRY: 2, STUN: 4, PHASE: 8, INVIS: 16, BUSH: 32, REVEAL: 64, LEAP: 128, DASH: 256, SPEED: 512, OVER: 1024, SHIELD: 2048, POWER: 4096, DODGE: 8192, BLAZE: 16384, SILENCE: 32768, AVATAR: 65536, KING: 131072, CHANNEL: 262144, DMGRED: 524288 };

/** Server: serialize the match for one viewer. */
export function encodeSnapshot(m: Match, events: MatchEvent[], ack: number): Snapshot {
  const now = m.time;
  return {
    t: r2(now * 100) / 100, ph: m.phase, pu: m.phaseUntil, ck: r2(m.clock), sc: [m.score[0], m.score[1]], ot: m.overtime, mu: m.mutation, mut: m.mutations.until, ack,
    h: m.heroes.map((h) => {
      let f = 0;
      if (h.alive) f |= F.ALIVE; if (h.carrying) f |= F.CARRY; if (h.stunUntil > now) f |= F.STUN; if (h.phaseUntil > now) f |= F.PHASE;
      if (h.invisUntil > now) f |= F.INVIS; if (h.inBush) f |= F.BUSH; if (h.revealedUntil > now) f |= F.REVEAL; if (h.leap) f |= F.LEAP;
      if (h.dash) f |= F.DASH; if (h.speedBuffUntil > now) f |= F.SPEED; if (h.overdriveUntil > now) f |= F.OVER; if (h.shield > 0 && h.shieldUntil > now) f |= F.SHIELD;
      if (h.powerUntil > now) f |= F.POWER; if (h.dodgeUntil > now) f |= F.DODGE; if (h.blazeUntil > now) f |= F.BLAZE;
      if (h.silenceUntil > now) f |= F.SILENCE; if (h.avatarUntil > now) f |= F.AVATAR; if (h.king) f |= F.KING; if (h.channelUntil > now) f |= F.CHANNEL;
      if (h.dmgReductionUntil > now) f |= F.DMGRED;
      return [h.id, h.def.id, h.team, h.name, h.skinId, r2(h.x), r2(h.y), r2(h.vx), r2(h.vy), Math.round(h.hp), h.maxHp, r2(h.facing * 100) / 100, f, r2(h.ult), r2(h.abCd), r2(h.atkCd),
        Math.round(h.shield), r2(h.anim.walk), r2(h.anim.attackT * 100) / 100, r2(h.anim.castT * 100) / 100, r2(h.anim.hitT * 100) / 100, h.respawnAt === Infinity ? -1 : r2(h.respawnAt), h.pve ? 1 : 0,
        h.leap ? r2((h.leap.t / h.leap.dur) * 100) / 100 : 0, h.gadgetCharges, r2(h.gadgetCd), r2(h.rollCd), h.streak,
        Math.round(h.stats.bossDamage), h.stats.kingPoints, h.ownerId, h.reviveUsed ? 1 : 0, Math.round(h.stats.damage), h.stats.kills, h.stats.deaths, h.stats.goals];
    }),
    r: m.rifts.filter((r) => r.alive).map((r) => [r.id, r2(r.x), r2(r.y), r2(r.vx), r2(r.vy), RIFT_STATES.indexOf(r.state), r.carrier, r.clone ? 1 : 0, r2(r.look * 100) / 100, r2(r.mood * 100) / 100, r.portalTeam, r2(r.stateTime * 100) / 100, r.charged ? 1 : 0, r2(r.carryTime),
      r.decoy ? r.decoy.team : -1, r.frozenUntil && r.frozenUntil > now ? 1 : 0, r.radius]),
    p: m.projectiles.filter((p) => p.active).map((p) => [p.id, p.kind, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), p.color, r2(p.t * 100) / 100, r2(p.dur * 100) / 100, r2(p.sx), r2(p.sy), r2(p.tx), r2(p.ty), p.team, p.areaRadius]),
    z: m.zones.filter((z) => z.active).map((z) => [z.id, z.kind, r2(z.x), r2(z.y), z.radius, r2(z.until), r2(z.born), z.team, z.delay]),
    w: m.arena.walls.filter((w) => w.dynamic).map((w) => [w.id, w.x, w.y, w.w, w.h, Math.round(w.hp), w.maxHp, w.team, w.expiresAt === Infinity ? -1 : w.expiresAt, w.crate ? 1 : 0]),
    hz: m.arena.hazards.filter((h) => h.temporary).map((h) => [h.kind, h.x, h.y, h.w, h.h, h.pair, h.expiresAt]),
    pk: m.pickups.filter((p) => p.alive).map((p) => [p.id, p.kind, r2(p.x), r2(p.y), p.shrine]),
    ev: events,
  };
}

/** Client-side mirror state (object identity is kept between snapshots so the renderer can track things). */
export class MirrorState {
  proj = new Map<number, Projectile>();
  zones = new Map<number, Zone>();
  walls = new Map<number, Wall>();
  hazards = new Map<string, Hazard>();
}

/**
 * Client: apply a snapshot onto a local "mirror" Match (never stepped). The predicted own hero keeps its
 * client-side position (reconciled separately by the session).
 */
export function applySnapshot(m: Match, s: Snapshot, st: MirrorState, predictedId: number) {
  m.time = s.t; m.phase = s.ph; m.phaseUntil = s.pu; m.clock = s.ck; m.score = [s.sc[0], s.sc[1]]; m.overtime = s.ot;
  m.mutation = s.mu; m.mutations.until = s.mut;
  const seen = new Set<number>();
  for (const row of s.h) {
    const [id, defId, team, name, skinId, x, y, vx, vy, hp, maxHp, facing, f, ult, abCd, atkCd, shield, walk, atkT, castT, hitT, respawnAt, pve, leapK, gch, gcd, rcd, streak,
      bossDmg, kingPts, ownerId, revived, dmgTot, kills, deaths, goals] = row as any[];
    seen.add(id);
    let h = m.heroById(id);
    if (!h) {
      h = new Hero(id, team, getCharacter(defId), name, true, skinId);
      h.pve = !!pve;
      m.addHero(h);
    }
    // FIFIX roulette: the server swapped this hero
    if (h.def.id !== defId) { h.def = getCharacter(defId); h.skinId = skinId; }
    if (id !== predictedId || !(f & F.ALIVE) || !h.alive) { h.x = x; h.y = y; }
    h.vx = vx; h.vy = vy; h.hp = hp; h.maxHp = maxHp; if (id !== predictedId) h.facing = facing;
    h.alive = !!(f & F.ALIVE); h.carrying = !!(f & F.CARRY);
    const now = s.t, soon = now + 0.15;
    h.stunUntil = f & F.STUN ? soon : 0; h.phaseUntil = f & F.PHASE ? soon : 0; h.invisUntil = f & F.INVIS ? soon : 0;
    h.inBush = !!(f & F.BUSH); h.revealedUntil = f & F.REVEAL ? soon : 0;
    h.speedBuffUntil = f & F.SPEED ? soon : 0; h.overdriveUntil = f & F.OVER ? soon : 0;
    h.shield = shield; h.shieldUntil = f & F.SHIELD ? soon : 0;
    h.ult = ult; h.abCd = abCd; h.atkCd = atkCd; h.gadgetCharges = gch ?? 0; h.gadgetCd = gcd ?? 0; h.rollCd = rcd ?? 0; h.streak = streak ?? 0;
    h.powerUntil = f & F.POWER ? soon : 0; h.dodgeUntil = f & F.DODGE ? soon : 0; h.blazeUntil = f & F.BLAZE ? soon : 0;
    h.silenceUntil = f & F.SILENCE ? soon : 0; h.avatarUntil = f & F.AVATAR ? soon : 0; h.king = !!(f & F.KING); h.channelUntil = f & F.CHANNEL ? soon : 0;
    h.dmgReductionUntil = f & F.DMGRED ? soon : 0;
    h.ownerId = ownerId ?? -1; h.reviveUsed = !!revived;
    // live scoreboard values (boss damage ranking, king points, end screen)
    h.stats.bossDamage = bossDmg ?? 0; h.stats.kingPoints = kingPts ?? 0;
    { h.stats.damage = dmgTot ?? h.stats.damage; h.stats.kills = kills ?? h.stats.kills; h.stats.deaths = deaths ?? h.stats.deaths; h.stats.goals = goals ?? h.stats.goals; }
    h.anim.walk = walk; h.anim.attackT = Math.max(h.anim.attackT, atkT); h.anim.castT = Math.max(h.anim.castT, castT); h.anim.hitT = Math.max(h.anim.hitT, hitT);
    h.respawnAt = respawnAt < 0 ? Infinity : respawnAt;
    h.leap = f & F.LEAP ? { fx: x, fy: y, tx: x, ty: y, t: leapK, dur: 1, dmg: 0 } : null;
    h.dash = f & F.DASH ? (h.dash ?? { dx: 0, dy: 0, remaining: 0, speed: 0, dmg: 0, kb: 0, stun: 0, kind: 'net', hit: new Set() }) : null;
  }
  for (const h of m.heroes.slice()) if (!seen.has(h.id)) m.removeHero(h);

  const rifts: RiftEntity[] = [];
  for (const row of s.r) {
    const [id, x, y, vx, vy, st2, carrier, clone, look, mood, portalTeam, stateTime, charged, carryTime, decoyTeam, frozen, radius] = row;
    let r = m.rifts.find((q) => q.id === id);
    if (!r) r = createRift(id, x, y, !!clone);
    r.x = x; r.y = y; r.vx = vx; r.vy = vy; r.state = RIFT_STATES[st2] ?? 'ROAM'; r.carrier = carrier; r.look = look; r.mood = mood; r.portalTeam = portalTeam as any; r.stateTime = stateTime; r.alive = true; r.charged = !!charged; r.carryTime = carryTime ?? 0;
    r.decoy = decoyTeam !== undefined && decoyTeam >= 0 ? { team: decoyTeam as TeamId, owner: -1, damage: 0, stun: 0 } : undefined;
    r.frozenUntil = frozen ? s.t + 0.15 : 0;
    if (radius) r.radius = radius;
    rifts.push(r);
  }
  m.rifts = rifts;

  const pseen = new Set<number>();
  for (const row of s.p) {
    const [id, kind, x, y, vx, vy, color, t, dur, sx, sy, tx, ty, team, area] = row as any[];
    pseen.add(id);
    let p = st.proj.get(id);
    if (!p) { p = new Projectile(); p.id = id; st.proj.set(id, p); m.projectiles.push(p); }
    Object.assign(p, { active: true, kind, x, y, vx, vy, color, t, dur, sx, sy, tx, ty, team, areaRadius: area });
  }
  for (const [id, p] of st.proj) if (!pseen.has(id)) { p.active = false; st.proj.delete(id); }
  if (m.projectiles.length > 200) m.projectiles = m.projectiles.filter((p) => p.active);

  const zseen = new Set<number>();
  for (const row of s.z) {
    const [id, kind, x, y, radius, until, born, team, delay] = row as any[];
    zseen.add(id);
    let z = st.zones.get(id);
    if (!z) { z = new Zone(); z.id = id; st.zones.set(id, z); m.zones.push(z); }
    Object.assign(z, { active: true, kind, x, y, radius, until, born, team, delay });
  }
  for (const [id, z] of st.zones) if (!zseen.has(id)) { z.active = false; st.zones.delete(id); }
  if (m.zones.length > 80) m.zones = m.zones.filter((z) => z.active);

  const wseen = new Set<number>();
  for (const [id, x, y, w, hgt, hp, maxHp, team, exp, crate] of s.w) {
    wseen.add(id);
    let wall = st.walls.get(id);
    if (!wall) { const local = m.arena.walls.find((q) => q.id === id && q.dynamic); if (local) { wall = local; st.walls.set(id, wall); } }
    if (!wall) { wall = { id, x, y, w, h: hgt, hp, maxHp, team: team as any, dynamic: true, expiresAt: exp < 0 ? Infinity : exp, crate: !!crate }; st.walls.set(id, wall); m.arena.walls.push(wall); m.arena.version++; }
    wall.hp = hp;
  }
  for (const [id, wall] of st.walls) if (!wseen.has(id)) { m.arena.removeWall(wall); st.walls.delete(id); }
  // crates exist locally from the arena data: drop those the server no longer has
  for (const w of m.arena.walls.slice()) if (w.crate && !st.walls.has(w.id) && !wseen.has(w.id)) m.arena.removeWall(w);

  const pseen2 = new Set<number>();
  for (const [id, kind, x, y, shrine] of s.pk ?? []) {
    pseen2.add(id as number);
    let p = m.pickups.find((q) => q.id === id);
    if (!p) { p = { id: id as number, kind: kind as any, x: x as number, y: y as number, alive: true, shrine: shrine as number, dieAt: Infinity, born: m.time }; m.pickups.push(p); }
  }
  for (const p of m.pickups) if (!pseen2.has(p.id)) p.alive = false;
  m.pickups = m.pickups.filter((p) => p.alive);

  const hseen = new Set<string>();
  for (const [kind, x, y, w, hgt, pair, exp] of s.hz) {
    const key = `${kind}:${x}:${y}`;
    hseen.add(key);
    if (!st.hazards.has(key)) st.hazards.set(key, m.arena.addTempHazard(kind as any, { x: x as number, y: y as number, w: w as number, h: hgt as number }, exp as number, pair as number));
  }
  for (const [key, hz] of st.hazards) if (!hseen.has(key)) { const i = m.arena.hazards.indexOf(hz); if (i >= 0) m.arena.hazards.splice(i, 1); st.hazards.delete(key); }
  m.arena.update(m.time);
}
