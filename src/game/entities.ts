import type { CharacterData, MutationId, RiftState, TeamId } from '../data/types';

export interface HeroCommand {
  mx: number; my: number;          // movement intent (-1..1)
  aimX: number; aimY: number;      // aim direction (unit) — 0,0 = auto aim
  aimDist: number;                 // for point-targeted abilities (0 = auto)
  attack: boolean;
  ability: boolean;
  ult: boolean;
  gadget: boolean;
  roll: boolean;
}

export const emptyCommand = (): HeroCommand => ({ mx: 0, my: 0, aimX: 0, aimY: 0, aimDist: 0, attack: false, ability: false, ult: false, gadget: false, roll: false });

export type PickupKind = 'speed' | 'shield' | 'power' | 'ult';
export interface Pickup { id: number; kind: PickupKind; x: number; y: number; alive: boolean; shrine: number; dieAt: number; born: number }

export interface HeroStats {
  kills: number; deaths: number; goals: number; assists: number; damage: number; heal: number;
  abilities: number; ults: number; captures: number; throws: number; interceptions: number;
  gadgets: number; bossDamage: number; kingPoints: number;
}

export const emptyStats = (): HeroStats => ({ kills: 0, deaths: 0, goals: 0, assists: 0, damage: 0, heal: 0, abilities: 0, ults: 0, captures: 0, throws: 0, interceptions: 0, gadgets: 0, bossDamage: 0, kingPoints: 0 });

export class Hero {
  x = 0; y = 0;
  vx = 0; vy = 0;           // last movement velocity (for visuals / prediction)
  kx = 0; ky = 0;           // knockback velocity (decays)
  hp: number;
  maxHp: number;
  alive = true;
  respawnAt = 0;
  facing = 0;               // radians
  atkCd = 0;
  abCd = 0;
  ult = 0;                  // 0..100
  shield = 0;
  shieldUntil = 0;
  slowUntil = 0; slowMul = 1;
  stunUntil = 0;
  phaseUntil = 0;
  invisUntil = 0;
  speedBuffUntil = 0; speedBuff = 0;
  dmgReductionUntil = 0; dmgReduction = 0;
  dmgMulNext = 1;           // shade ult
  absorbUntil = 0; absorbConvert = 0;
  overdriveUntil = 0;
  leap: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number; dmg: number; r?: number; heal?: number } | null = null;
  dash: { dx: number; dy: number; remaining: number; speed: number; dmg: number; kb: number; stun: number; kind: string; hit: Set<number> } | null = null;
  lastDamageAt = -99;
  lastHitBy = -1;
  recentAttackers = new Map<number, number>(); // heroId -> time (assists)
  inBush = false;
  revealedUntil = 0;
  carrying = false;
  spawnIndex = 0;
  cmd: HeroCommand = emptyCommand();
  stats: HeroStats = emptyStats();
  /** Visual-only animation state */
  anim = { attackT: 0, hitT: 0, castT: 0, walk: 0, emote: '', emoteT: 0 };
  /** Boss/minion behaviour flags */
  pve = false;
  /** false for tutorial dummies: can never pick up the Rift */
  canCarry = true;
  /** unique power (gadget) charges left this match */
  gadgetCharges = 0;
  gadgetCd = 0;
  /** universal dodge roll */
  rollCd = 0;
  /** POWER pickup: +25% damage */
  powerUntil = 0;
  /** kills since last death (3+ = bounty) */
  streak = 0;
  blazeUntil = 0;
  pierceNext = false;
  jumpCd = 0;
  /** roll i-frames */
  dodgeUntil = 0;
  worth = 0;
  /** ECLIPSE: no ability / ult / gadget */
  silenceUntil = 0;
  /** RIFTBORN ult: giant form */
  avatarUntil = 0;
  /** boss: busy casting a telegraphed attack (cannot move) */
  channelUntil = 0;
  /** summons (turrets) disappear at this time */
  expireAt = Infinity;
  /** summon owner (turret -> GEAR) */
  ownerId = -1;
  /** SERAPH passive used */
  reviveUsed = false;
  /** CHRONOS rewind history: [time, x, y, hp] every 0.25 s */
  history: number[] = [];
  /** RIFT KING: currently crowned */
  king = false;

  constructor(
    public id: number,
    public team: TeamId,
    public def: CharacterData,
    public name: string,
    public isBot: boolean,
    public skinId: string,
  ) {
    this.hp = def.hp;
    this.maxHp = def.hp;
  }

  get radius() { return this.def.radius; }
}

export type ProjectileKind = 'bolt' | 'spread' | 'lob' | 'boomerang' | 'wave' | 'blades' | 'boss' | 'shell';

export class Projectile {
  active = false;
  kind: ProjectileKind = 'bolt';
  owner = -1;
  team: TeamId = 0;
  x = 0; y = 0; vx = 0; vy = 0;
  sx = 0; sy = 0;            // start pos
  range = 0;
  traveled = 0;
  radius = 10;
  damage = 0;
  knockback = 0;
  slow = 0; slowDuration = 0;
  pierce = false;
  healAllies = 0;
  ultScale = 1;
  hit = new Set<number>();
  // lob
  tx = 0; ty = 0; t = 0; dur = 0; areaRadius = 0;
  // boomerang
  returning = false;
  phase = false;             // ignores walls
  color = '#fff';
  id = 0;
}

export type ZoneKind = 'magnet_field' | 'storm' | 'heal' | 'slow' | 'black_hole' | 'fire' | 'eruption' | 'electric_trail' | 'lava_burst' | 'mine' | 'ice_floor' | 'blizzard'
  | 'vines' | 'smoke' | 'eclipse' | 'sanctuary' | 'moon_well' | 'oil' | 'boss_warn' | 'gravity_well';

export class Zone {
  active = false;
  kind: ZoneKind = 'heal';
  owner = -1;
  team: TeamId = 0;
  x = 0; y = 0; radius = 100;
  until = 0;
  born = 0;
  tickEvery = 0.4;
  nextTick = 0;
  damage = 0;         // per tick to enemies
  heal = 0;           // per tick to allies
  pull = 0;           // pull speed toward center (enemies + rift)
  slow = 0;
  stun = 0;
  delay = 0;          // eruption delay before damage
  burst = 0;          // one-shot damage (mines, boss telegraphs)
  reduce = 0;         // damage reduction granted to allies inside (sanctuary)
  id = 0;
}

export interface RiftEntity {
  id: number;
  x: number; y: number; vx: number; vy: number;
  radius: number;
  state: RiftState;
  stateTime: number;
  carrier: number;           // hero id or -1
  lastTouchTeam: TeamId | -1;
  lastTouchAt: number;
  lastThrower: number;
  pickupLockUntil: number;
  pickupLockHero: number;
  clone: boolean;
  alive: boolean;
  dieAt: number;
  targetX: number; targetY: number;
  attractX: number; attractY: number; attractForce: number; attractUntil: number;
  portalTeam: TeamId | -1;   // portal being entered (PORTAL state)
  carryTime: number;         // seconds carried by the same team (overcharge)
  charged: boolean;          // overcharged Rift = goal worth 2
  /** CHRONOS time stop */
  frozenUntil?: number;
  /** RIFTBORN decoy: explodes on enemy pickup, never scores */
  decoy?: { team: TeamId; owner: number; damage: number; stun: number };
  look: number;              // eye direction (visual)
  mood: number;              // -1 scared .. 1 angry (visual)
}

export type MatchEvent =
  | { t: 'hit'; x: number; y: number; target: number; amount: number; crit?: boolean; source: number }
  | { t: 'heal'; x: number; y: number; target: number; amount: number }
  | { t: 'shot'; hero: number; kind: string; x: number; y: number; angle: number }
  | { t: 'melee'; hero: number; x: number; y: number; angle: number; range: number }
  | { t: 'chain'; points: number[]; team: TeamId }
  | { t: 'explosion'; x: number; y: number; radius: number; color: string }
  | { t: 'kill'; killer: number; victim: number; x: number; y: number }
  | { t: 'respawn'; hero: number }
  | { t: 'capture'; hero: number; rift: number; interception: boolean }
  | { t: 'drop'; hero: number; rift: number }
  | { t: 'throw'; hero: number; rift: number }
  | { t: 'goal'; team: TeamId; scorer: number; rift: number; x: number; y: number; worth: number }
  | { t: 'ability'; hero: number; effect: string; x: number; y: number; ult: boolean }
  | { t: 'teleport'; hero: number; fx: number; fy: number; x: number; y: number }
  | { t: 'mutation_warn'; mutation: MutationId }
  | { t: 'mutation_start'; mutation: MutationId }
  | { t: 'mutation_end'; mutation: MutationId }
  | { t: 'rift_state'; rift: number; state: RiftState }
  | { t: 'zap'; x: number; y: number; tx: number; ty: number }
  | { t: 'wall'; x: number; y: number; w: number; h: number }
  | { t: 'wall_break'; x: number; y: number }
  | { t: 'countdown'; n: number }
  | { t: 'kickoff' }
  | { t: 'sudden_death' }
  | { t: 'wave'; n: number }
  | { t: 'boss_hit'; amount: number }
  | { t: 'emote'; hero: number; emote: string }
  | { t: 'pickup'; hero: number; kind: PickupKind; x: number; y: number }
  | { t: 'pickup_spawn'; kind: PickupKind; x: number; y: number }
  | { t: 'rift_charged'; rift: number; team: TeamId }
  | { t: 'bounty'; hero: number; streak: number }
  | { t: 'bounty_claim'; killer: number; victim: number }
  | { t: 'roll'; hero: number }
  | { t: 'gadget'; hero: number; effect: string; x: number; y: number }
  | { t: 'jump'; hero: number; x: number; y: number; tx: number; ty: number }
  | { t: 'crate_break'; x: number; y: number }
  | { t: 'laser'; x: number; y: number; tx: number; ty: number; team: TeamId }
  | { t: 'boss_phase'; phase: number }
  | { t: 'boss_attack'; name: string; x: number; y: number }
  | { t: 'beam_warn'; x: number; y: number; tx: number; ty: number; dur: number; width: number }
  | { t: 'revive'; hero: number }
  | { t: 'time_stop'; x: number; y: number; radius: number; dur: number }
  | { t: 'avatar'; hero: number }
  | { t: 'king'; hero: number; team: TeamId }
  | { t: 'end' };
