import { DEFAULT_SETTINGS, type GameSettings } from '../core/Settings';
import { STARTER_HEROES, PLAYABLE } from '../data/characters';
import { DEFAULT_COSMETICS } from '../data/cosmetics';

export const SAVE_VERSION = 4;

export interface LedgerEntry {
  id: string;                 // unique transaction id (store orderId, offer purchase id, reward id)
  kind: 'grant' | 'spend' | 'revoke';
  amount: number;             // gems
  source: string;             // product id / offer id / reward
  at: number;
  verified: boolean;          // true when backed by a validated store receipt or server response
}

export interface HeroProgress {
  unlocked: boolean;
  masteryXp: number;
  masteryLevel: number;
  skin: string;
  matches: number; wins: number; goals: number; kills: number;
  trophies: number;
}

export interface Notification { id: string; at: number; kind: 'skin' | 'mission' | 'pass' | 'event' | 'reward' | 'shop' | 'level' | 'crew' | 'friend'; title: string; body: string; read: boolean }

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  playerId: string;
  profile: { name: string; icon: string; banner: string; title: string; favoriteHero: string; region: string };
  coins: number;
  /** Cached gem balance — ALWAYS recomputed from the ledger on load. */
  gems: number;
  ledger: LedgerEntry[];
  xp: number;
  level: number;
  trophies: number;
  bestTrophies: number;
  heroes: Record<string, HeroProgress>;
  cosmetics: string[];
  equipped: { emotes: string[]; spray: string; effect: string; companion: string };
  entitlements: Record<string, { source: 'iap' | 'gems' | 'reward'; txn: string; at: number }>;
  pass: { seasonId: string; xp: number; claimedFree: number[]; claimedPremium: number[]; claimedPlus: number[] };
  missions: { dailyKey: string; weeklyKey: string; seasonKey: string; progress: Record<string, number>; claimed: string[] };
  shop: { purchases: Record<string, number>; lastDailySeen: string };
  crates: Record<string, number>;
  trophyRoadClaimed: number[];
  stats: { matches: number; wins: number; losses: number; draws: number; kills: number; deaths: number; goals: number; bestStreak: number; streak: number; mvps: number; damage: number; heal: number; captures: number };
  dailyCoins: { day: number; amount: number };
  settings: GameSettings;
  tutorialDone: boolean;
  crew: { id: string; joinedAt: number; contribution: number; claimed: string[] } | null;
  friends: { invitesSent: string[]; added: string[] };
  recentPlayers: { name: string; heroId: string; at: number; trophies: number }[];
  inbox: Notification[];
  processedMatches: string[];
  processedPurchases: string[];
  matchHistory: { at: number; mode: string; result: 'win' | 'loss' | 'draw'; score: [number, number]; hero: string; trophies: number }[];
  /** seasons: current season id, peak trophies this season (rank), past seasons, pending end-of-season popup */
  season: { id: string; peak: number; history: { id: string; rank: string; peak: number }[]; pendingEnd: any | null };
}

function uuid() {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultSave(now = Date.now()): SaveData {
  const heroes: Record<string, HeroProgress> = {};
  for (const c of PLAYABLE) heroes[c.id] = { unlocked: STARTER_HEROES.includes(c.id), masteryXp: 0, masteryLevel: 1, skin: `${c.id}_default`, matches: 0, wins: 0, goals: 0, kills: 0, trophies: 0 };
  return {
    version: SAVE_VERSION,
    createdAt: now, updatedAt: now,
    playerId: uuid(),
    profile: { name: 'Joueur' + Math.floor(1000 + Math.random() * 9000), icon: 'icon_rift', banner: 'banner_default', title: 'title_rookie', favoriteHero: 'magnet', region: 'EU' },
    coins: 500, gems: 0, ledger: [],
    xp: 0, level: 1, trophies: 0, bestTrophies: 0,
    heroes,
    cosmetics: [...DEFAULT_COSMETICS],
    equipped: { emotes: ['emote_gg', 'emote_lol', 'emote_angry', 'emote_gg'], spray: 'spray_rift', effect: 'fx_default', companion: 'pet_orb' },
    entitlements: {},
    pass: { seasonId: '', xp: 0, claimedFree: [], claimedPremium: [], claimedPlus: [] },
    missions: { dailyKey: '', weeklyKey: '', seasonKey: '', progress: {}, claimed: [] },
    shop: { purchases: {}, lastDailySeen: '' },
    crates: {},
    trophyRoadClaimed: [],
    stats: { matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, goals: 0, bestStreak: 0, streak: 0, mvps: 0, damage: 0, heal: 0, captures: 0 },
    dailyCoins: { day: 0, amount: 0 },
    settings: { ...DEFAULT_SETTINGS },
    tutorialDone: false,
    crew: null,
    friends: { invitesSent: [], added: [] },
    recentPlayers: [],
    inbox: [],
    processedMatches: [],
    processedPurchases: [],
    matchHistory: [],
    season: { id: '', peak: 0, history: [], pendingEnd: null },
  };
}

/** Sequential migrations: each takes save vN and returns vN+1. Never delete a migration. */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  // v1 -> v2: introduced the premium ledger (old saves stored a plain `gems` number which is not trusted)
  1: (s) => {
    const legacy = Number(s.gems) || 0;
    s.ledger = legacy > 0 ? [{ id: 'legacy-migration', kind: 'grant', amount: legacy, source: 'migration_v1', at: Date.now(), verified: false }] : [];
    s.version = 2;
    return s;
  },
  // v2 -> v3: per-hero trophies + match history + crates
  2: (s) => {
    for (const k of Object.keys(s.heroes ?? {})) s.heroes[k].trophies ??= 0;
    s.matchHistory ??= [];
    s.crates ??= {};
    s.version = 3;
    return s;
  },
  // v3 -> v4: seasons (rank, history, end-of-season rewards)
  3: (s) => {
    s.season ??= { id: '', peak: Number(s.trophies) || 0, history: [], pendingEnd: null };
    s.version = 4;
    return s;
  },
};
