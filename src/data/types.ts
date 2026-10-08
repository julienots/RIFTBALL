/**
 * Content data contracts. Every gameplay / economy value lives in /src/data and follows these types,
 * so designers (or a future live-ops server) can change content without touching game code.
 */

export type TeamId = 0 | 1; // 0 = BLUE, 1 = RED
export const TEAM_NAMES = ['BLUE', 'RED'] as const;

export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

// ---------------------------------------------------------------- Characters / abilities

export type AttackKind = 'bolt' | 'spread' | 'melee' | 'lob' | 'chain' | 'boomerang' | 'wave' | 'blades';

export interface AttackData {
  kind: AttackKind;
  damage: number;
  range: number;          // world units
  cooldown: number;       // seconds between attacks (cadence)
  projectileSpeed: number;
  projectiles?: number;   // spread count
  spreadDeg?: number;
  radius?: number;        // projectile / area radius
  knockback?: number;
  slow?: number;          // 0..1 slow factor applied on hit
  slowDuration?: number;
  pierce?: boolean;
  healAllies?: number;    // wave heals allies it touches
  bounces?: number;       // chain
}

/** Abilities and ultimates are implemented by `effect` id in /src/abilities; numbers are tuned here. */
export interface AbilityData {
  id: string;
  name: string;
  description: string;
  effect: string;
  cooldown: number;       // ability cooldown (ults use charge instead)
  range: number;
  params: Record<string, number>;
  aim: 'direction' | 'point' | 'self';
  /** Hint used by bots to decide when the ability is worth casting. */
  aiHint: 'pull_rift' | 'dash_offense' | 'dash_escape' | 'wall_block' | 'phase' | 'zone_enemy' | 'self_buff' | 'heal_team' | 'nuke' | 'leap' | 'rift_play' | 'reveal';
}

export interface PassiveData {
  id: string;
  name: string;
  description: string;
  params: Record<string, number>;
}

export interface CharacterData {
  id: string;
  name: string;
  title: string;
  role: 'CONTROL' | 'ASSASSIN' | 'BUILDER' | 'STEALTH' | 'DAMAGE' | 'SUPPORT' | 'TANK' | 'ARTILLERY';
  lore: string;
  hp: number;
  speed: number;          // world units / second
  radius: number;
  attack: AttackData;
  ability: AbilityData;
  ultimate: AbilityData;
  passive: PassiveData;
  /** Unique power: limited charges per match (GADGET button). */
  gadget?: AbilityData & { charges: number };
  ultChargePerHit: number;   // % gained per successful hit
  palette: { primary: string; secondary: string; accent: string; skin: string; eyes: string };
  model: 'magnet' | 'blink' | 'block' | 'shade' | 'volt' | 'flux' | 'titan' | 'arc' | 'pulse' | 'vortex' | 'ember' | 'nova' | 'frost'
    | 'koko' | 'zip' | 'mecha' | 'luna' | 'chef' | 'chronos' | 'seraph' | 'riftborn' | 'golem' | 'minion' | 'turret';
  /** Collection rarity (display only — never affects stats). */
  rarity?: Rarity;
  /** How it is obtained. Characters are NEVER sold for premium currency (anti pay-to-win). */
  unlock: { type: 'starter' } | { type: 'trophies'; trophies: number } | { type: 'coins'; price: number } | { type: 'season'; season: string; passTier: number };
  hidden?: boolean;       // bosses / minions
}

// ---------------------------------------------------------------- Rift

export type RiftState = 'IDLE' | 'ROAM' | 'FLEE' | 'CHASE' | 'ATTRACTED' | 'CARRIED' | 'DROPPED' | 'FRENZY' | 'MUTATING' | 'CLONING' | 'PORTAL';
export type MutationId = 'NORMAL' | 'FURY' | 'CLONE' | 'ELECTRIC' | 'GRAVITY' | 'PORTAL' | 'PHASE' | 'CHAOS';

export interface RiftMutationData {
  id: MutationId;
  name: string;
  tagline: string;
  color: string;
  duration: number;
  weight: number;         // random selection weight
  params: Record<string, number>;
}

// ---------------------------------------------------------------- Arenas

export interface ArenaData {
  id: string;
  name: string;
  description: string;
  theme: {
    floorA: string; floorB: string; wallTop: string; wallSide: string; border: string;
    fog: string; light: string; ambient: number; accent: string; bush?: string;
  };
  /** Rects defined for the LEFT half (x < width/2); mirrored automatically for symmetry. */
  walls: [number, number, number, number][];
  /** Rects placed exactly as given (center pieces). */
  centerWalls?: [number, number, number, number][];
  bushes: [number, number, number, number][];
  hazards: { kind: 'lava' | 'ice' | 'teleport' | 'boost' | 'jump'; rect: [number, number, number, number]; pair?: number; mirror?: boolean }[];
  /** Destructible crates (left half, mirrored). They can drop power-ups. */
  crates?: [number, number, number, number][];
  /** Power-up altars (left half, mirrored): a power-up appears there regularly. */
  shrines?: [number, number][];
  /** World scale applied to the authored 2400x1300 layout (bigger maps). */
  scale?: number;
  special: 'none' | 'lava_cycle' | 'ice' | 'void_portals' | 'jungle' | 'canyon' | 'sky' | 'docks';
  music: 'battle' | 'battle_hot' | 'battle_cold' | 'battle_void' | 'battle_jungle';
  isNew?: boolean;
}

// ---------------------------------------------------------------- Modes

export type ModeId = 'RIFTBALL' | 'RIFT_RUSH' | 'RIFT_CHAOS' | 'RIFT_DUEL' | 'RIFT_BOSS' | 'SURVIVAL' | 'RIFT_KING' | 'TUTORIAL';

export interface ModeData {
  id: ModeId;
  name: string;
  description: string;
  teamSize: number;
  duration: number;           // seconds
  mutationInterval: number;   // seconds between mutations (0 = none)
  firstMutationAt: number;
  riftSpeedMul: number;
  ranked: boolean;            // gives/takes trophies
  suddenDeath: boolean;
  respawnTime: number;
  icon: string;
  color: string;
  unlockLevel: number;
}

// ---------------------------------------------------------------- Cosmetics

export type CosmeticType = 'skin' | 'emote' | 'spray' | 'effect' | 'banner' | 'title' | 'icon';

export interface CosmeticData {
  id: string;
  type: CosmeticType;
  name: string;
  rarity: Rarity;
  heroId?: string;                // skins
  /** Visual payload: palette override for skins, emoji/glyph for emotes/sprays, colors for effects/banners. */
  visual: Record<string, string>;
  source: 'default' | 'shop' | 'pass_free' | 'pass_premium' | 'pass_plus' | 'mastery' | 'event' | 'crate' | 'trophy_road' | 'achievement';
  priceCoins?: number;
  priceGems?: number;
  season?: string;
}

/** Back-compat alias required by the content spec. */
export type SkinData = CosmeticData;

// ---------------------------------------------------------------- Economy / shop

export type Currency = 'coins' | 'gems';

export type RewardItem =
  | { kind: 'coins'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'passXp'; amount: number }
  | { kind: 'cosmetic'; id: string }
  | { kind: 'hero'; id: string }
  | { kind: 'crate'; id: string; count: number };

export interface ProductData {
  /** Store product id (Google Play). Change here to match the Play Console. */
  id: string;
  type: 'consumable' | 'non_consumable' | 'subscription';
  title: string;
  description: string;
  /** Fallback display price used offline / before the store answers. Store price always wins. */
  fallbackPrice: string;
  grants: RewardItem[];
  /** One-time products (starter pack, passes) */
  oneTimeKey?: string;
}

export interface ShopOfferData {
  id: string;
  name: string;
  tag: 'STARTER' | 'WEEKLY' | 'EVENT' | 'SEASON' | 'LEGENDARY' | 'DAILY';
  items: RewardItem[];
  /** Either a real-money product or a virtual currency price. */
  price: { productId: string } | { currency: Currency; amount: number };
  limit: number;              // purchases allowed per window
  window: 'once' | 'daily' | 'weekly' | 'season' | 'event';
  durationHours?: number;     // shown countdown (from window start)
  eventId?: string;
  minLevel?: number;
  color: string;
}

export interface DailyShopConfig {
  slots: { type: CosmeticType | 'bundle'; count: number }[];
  refreshHourUtc: number;
  seed: string;               // changing the seed reshuffles the rotation (server-controlled)
  priceByRarity: Record<Rarity, { coins?: number; gems?: number }>;
}

export interface CrateData {
  id: string;
  name: string;
  priceCoins: number;
  color: string;
  /** Displayed drop table — percentages sum to 100. */
  table: { rarity: Rarity; chance: number }[];
  items: number;              // rolls per crate
  duplicateCoins: Record<Rarity, number>;
}

// ---------------------------------------------------------------- Pass / missions / events / seasons

export interface BattlePassRewardData {
  tier: number;
  free?: RewardItem;
  premium?: RewardItem;
  plus?: RewardItem;
}

export type MissionStat =
  | 'matches' | 'wins' | 'goals' | 'abilities' | 'ults' | 'kills' | 'captures' | 'damage' | 'heal'
  | 'mutations_seen' | 'mode_RIFTBALL' | 'mode_RIFT_RUSH' | 'mode_RIFT_CHAOS' | 'mode_RIFT_DUEL' | 'mode_RIFT_BOSS' | 'mode_SURVIVAL' | 'mode_RIFT_KING'
  | 'throws' | 'interceptions' | 'gadgets' | 'mvps' | 'boss_damage' | 'boss_wins' | 'boss_top' | 'king_points' | 'king_wins' | 'survival_waves'
  | 'mythic_matches' | 'mythic_wins' | 'win_streak' | 'perfect_wins';

export interface MissionData {
  id: string;
  /** challenge = permanent gem challenge (never resets) · challenge_weekly = gem challenge renewed every week */
  scope: 'daily' | 'weekly' | 'season' | 'event' | 'challenge' | 'challenge_weekly';
  /** challenges: difficulty tier shown in the UI */
  tier?: 1 | 2 | 3 | 4;
  text: string;
  stat: MissionStat;
  target: number;
  heroId?: string;
  reward: RewardItem[];
  eventId?: string;
}

export interface EventModifiers {
  riftSpeedMul?: number;
  xpMul?: number;
  coinMul?: number;
  mutationIntervalMul?: number;
  forcedMode?: ModeId;
  arenaBias?: string;
  passXpMul?: number;
  /** gameplay modifiers (events) */
  heroSpeedMul?: number;
  ultChargeMul?: number;
  pickupRateMul?: number;
  damageMul?: number;
  /** every hero playable during the event (free trial) */
  allHeroes?: boolean;
}

export interface EventData {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  /** ISO dates (UTC). Recurring events use `recurring` instead. */
  start?: string;
  end?: string;
  recurring?: { everyDays: number; offsetDays: number; lengthDays: number };
  modifiers: EventModifiers;
  shopOffers?: string[];
  rewards?: RewardItem[];
}

export interface SeasonData {
  id: string;
  number: number;
  name: string;
  theme: string;
  start: string;
  end: string;
  color: string;
  icon?: string;
  /** featured hero / arena of the season */
  newHero: string;
  newArena: string;
  passTiers: number;
  passXpPerTier: number;
  passPriceGems: number;
  passPlusPriceGems: number;
  rewards: BattlePassRewardData[];
  events: string[];
}

export interface TrophyRoadReward { trophies: number; reward: RewardItem }

export interface BotProfile {
  id: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
  reaction: number;       // seconds between decisions
  aimError: number;       // radians
  abilityUse: number;     // probability per decision to use ability when relevant
  ultUse: number;
  dodge: number;          // 0..1 strafing skill
  repath: number;         // seconds
  teamwork: number;       // 0..1 escort/defense discipline
}
