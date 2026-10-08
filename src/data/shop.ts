import type { CrateData, DailyShopConfig, ShopOfferData } from './types';

/**
 * Offers are honest: the UI shows the real content, the real price and the computed reference value
 * (sum of standalone prices). No fake "was" price is ever displayed.
 */
export const OFFERS: ShopOfferData[] = [
  { id: 'offer_starter', name: 'STARTER PACK', tag: 'STARTER', price: { productId: 'starter_pack' }, items: [{ kind: 'gems', amount: 300 }, { kind: 'cosmetic', id: 'magnet_polar' }, { kind: 'cosmetic', id: 'emote_cool' }, { kind: 'coins', amount: 2000 }], limit: 1, window: 'once', color: '#ffb703' },
  { id: 'offer_weekly', name: 'WEEKLY PACK', tag: 'WEEKLY', price: { currency: 'gems', amount: 99 }, items: [{ kind: 'coins', amount: 3000 }, { kind: 'crate', id: 'crate_big', count: 1 }], limit: 1, window: 'weekly', durationHours: 168, color: '#06d6a0' },
  { id: 'offer_coins_daily', name: 'COINS DU JOUR', tag: 'DAILY', price: { currency: 'gems', amount: 30 }, items: [{ kind: 'coins', amount: 1000 }], limit: 1, window: 'daily', durationHours: 24, color: '#ffd166' },
  { id: 'offer_free_daily', name: 'CADEAU QUOTIDIEN', tag: 'DAILY', price: { currency: 'coins', amount: 0 }, items: [{ kind: 'coins', amount: 100 }, { kind: 'passXp', amount: 100 }], limit: 1, window: 'daily', durationHours: 24, color: '#80ed99' },
  { id: 'offer_season', name: 'SEASON PACK', tag: 'SEASON', price: { productId: 'season_pack' }, items: [{ kind: 'cosmetic', id: 'pass_premium_{season}' }, { kind: 'passXp', amount: 10000 }, { kind: 'cosmetic', id: 'blink_cyber' }], limit: 1, window: 'season', color: '#7b61ff' },
  { id: 'offer_special', name: 'BUNDLE SPÉCIAL', tag: 'LEGENDARY', price: { productId: 'special_bundle' }, items: [{ kind: 'gems', amount: 600 }, { kind: 'cosmetic', id: 'titan_viking' }, { kind: 'cosmetic', id: 'spray_dragon' }], limit: 1, window: 'season', color: '#ff3d7f' },
  { id: 'offer_legendary', name: 'LEGENDARY OFFER', tag: 'LEGENDARY', price: { currency: 'gems', amount: 449 }, items: [{ kind: 'cosmetic', id: 'vortex_cosmic' }, { kind: 'cosmetic', id: 'fx_gold' }, { kind: 'cosmetic', id: 'spray_dragon' }], limit: 1, window: 'season', color: '#ffcc33', minLevel: 3 },
  { id: 'offer_event_volcanic', name: 'EVENT PACK — VOLCANIC', tag: 'EVENT', eventId: 'volcanic_week', price: { currency: 'gems', amount: 199 }, items: [{ kind: 'cosmetic', id: 'block_lava' }, { kind: 'cosmetic', id: 'emote_lava' }, { kind: 'cosmetic', id: 'spray_flame' }, { kind: 'cosmetic', id: 'banner_volcano' }], limit: 1, window: 'event', color: '#ff5400' },
  { id: 'offer_event_winter', name: 'EVENT PACK — WINTER', tag: 'EVENT', eventId: 'winter_rift', price: { currency: 'gems', amount: 199 }, items: [{ kind: 'cosmetic', id: 'volt_frost' }, { kind: 'cosmetic', id: 'emote_snow' }, { kind: 'cosmetic', id: 'spray_snow' }, { kind: 'cosmetic', id: 'banner_frost' }], limit: 1, window: 'event', color: '#4cc9f0' },
  { id: 'offer_event_chaos', name: 'EVENT PACK — CHAOS', tag: 'EVENT', eventId: 'chaos_week', price: { currency: 'coins', amount: 4000 }, items: [{ kind: 'cosmetic', id: 'title_chaos' }, { kind: 'cosmetic', id: 'pulse_winter' }], limit: 1, window: 'event', color: '#ff7b00' },
];

/** Daily shop rotation — deterministic from (seed, UTC day). A live-ops server can change `seed` or slots. */
export const DAILY_SHOP: DailyShopConfig = {
  slots: [{ type: 'skin', count: 2 }, { type: 'emote', count: 1 }, { type: 'spray', count: 1 }, { type: 'effect', count: 1 }, { type: 'banner', count: 1 }],
  refreshHourUtc: 0,
  seed: 'riftball-daily-v1',
  priceByRarity: {
    COMMON: { coins: 300 },
    RARE: { coins: 1200 },
    EPIC: { gems: 149 },
    LEGENDARY: { gems: 299 },
    MYTHIC: { gems: 499 },
  },
};

/**
 * Cosmetic crates: bought with free COINS only (never real money), contents and odds always displayed.
 * Duplicates convert to coins, so a crate can never be "empty".
 */
export const CRATES: CrateData[] = [
  { id: 'crate_small', name: 'CAISSE RIFT', priceCoins: 600, color: '#4cc9f0', items: 1,
    table: [{ rarity: 'COMMON', chance: 55 }, { rarity: 'RARE', chance: 35 }, { rarity: 'EPIC', chance: 9 }, { rarity: 'LEGENDARY', chance: 1 }],
    duplicateCoins: { COMMON: 60, RARE: 150, EPIC: 400, LEGENDARY: 1000, MYTHIC: 2000 } },
  { id: 'crate_big', name: 'GRANDE CAISSE', priceCoins: 1800, color: '#b45cff', items: 3,
    table: [{ rarity: 'COMMON', chance: 40 }, { rarity: 'RARE', chance: 42 }, { rarity: 'EPIC', chance: 15 }, { rarity: 'LEGENDARY', chance: 3 }],
    duplicateCoins: { COMMON: 60, RARE: 150, EPIC: 400, LEGENDARY: 1000, MYTHIC: 2000 } },
];
