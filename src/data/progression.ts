import type { RewardItem, TrophyRoadReward } from './types';

/** Account XP curve and match reward tables. */
export const ECONOMY = {
  xpForLevel: (level: number) => 300 + level * 150,       // xp needed to go from level -> level+1
  matchXp: { win: 120, loss: 70, draw: 90, perGoal: 10, mvp: 30 },
  matchCoins: { win: 60, loss: 25, draw: 40, mvp: 15 },
  matchPassXp: { win: 150, loss: 80, draw: 110 },
  levelUpReward: (level: number): RewardItem[] => [{ kind: 'coins', amount: 100 + level * 20 }, ...(level % 5 === 0 ? [{ kind: 'gems', amount: 10 } as RewardItem] : [])],
  /** Trophy delta: bigger gains while low, losses only above 100 trophies. Not purchasable. */
  trophyDelta(trophies: number, outcome: 'win' | 'loss' | 'draw'): number {
    if (outcome === 'draw') return 0;
    if (outcome === 'win') return trophies < 300 ? 10 : trophies < 1000 ? 8 : trophies < 2000 ? 6 : 5;
    if (trophies < 100) return 0;
    return trophies < 500 ? -3 : trophies < 1000 ? -5 : -6;
  },
  /** Anti-farm: daily coin cap from matches (missions & pass not affected). */
  dailyMatchCoinCap: 1200,
  masteryXp: { win: 60, loss: 30, draw: 45, perGoal: 6 },
};

/** Trophy road: free progression unlocking heroes and rewards. */
export const TROPHY_ROAD: TrophyRoadReward[] = [
  { trophies: 20, reward: { kind: 'coins', amount: 300 } },
  { trophies: 60, reward: { kind: 'hero', id: 'block' } },
  { trophies: 100, reward: { kind: 'crate', id: 'crate_small', count: 1 } },
  { trophies: 160, reward: { kind: 'hero', id: 'shade' } },
  { trophies: 220, reward: { kind: 'coins', amount: 600 } },
  { trophies: 300, reward: { kind: 'hero', id: 'volt' } },
  { trophies: 400, reward: { kind: 'gems', amount: 20 } },
  { trophies: 500, reward: { kind: 'hero', id: 'flux' } },
  { trophies: 620, reward: { kind: 'crate', id: 'crate_big', count: 1 } },
  { trophies: 750, reward: { kind: 'hero', id: 'arc' } },
  { trophies: 870, reward: { kind: 'coins', amount: 1200 } },
  { trophies: 1000, reward: { kind: 'hero', id: 'pulse' } },
  { trophies: 1200, reward: { kind: 'gems', amount: 30 } },
  { trophies: 1400, reward: { kind: 'hero', id: 'vortex' } },
  { trophies: 1700, reward: { kind: 'hero', id: 'nova' } },
  { trophies: 1850, reward: { kind: 'cosmetic', id: 'emote_trophy' } },
  { trophies: 2000, reward: { kind: 'hero', id: 'frost' } },
  { trophies: 2100, reward: { kind: 'cosmetic', id: 'banner_champion' } },
  { trophies: 2200, reward: { kind: 'hero', id: 'zip' } },
  { trophies: 2300, reward: { kind: 'gems', amount: 30 } },
  { trophies: 2400, reward: { kind: 'hero', id: 'grill' } },
  { trophies: 2500, reward: { kind: 'cosmetic', id: 'title_legend' } },
  { trophies: 2600, reward: { kind: 'hero', id: 'koko' } },
  { trophies: 2700, reward: { kind: 'coins', amount: 2000 } },
  { trophies: 2800, reward: { kind: 'hero', id: 'luna' } },
  { trophies: 2900, reward: { kind: 'crate', id: 'crate_big', count: 1 } },
  { trophies: 3000, reward: { kind: 'hero', id: 'gear' } },
  { trophies: 3250, reward: { kind: 'gems', amount: 50 } },
  { trophies: 3500, reward: { kind: 'hero', id: 'chronos' } },
  { trophies: 3800, reward: { kind: 'coins', amount: 3000 } },
  { trophies: 4200, reward: { kind: 'hero', id: 'seraph' } },
  { trophies: 4600, reward: { kind: 'gems', amount: 80 } },
  { trophies: 5000, reward: { kind: 'hero', id: 'riftborn' } },
];

/** Hero mastery levels: xp per level and rewards. */
export const MASTERY = {
  maxLevel: 30,
  xpForLevel: (level: number) => 200 + level * 60,
  rewards: (heroId: string): Record<number, RewardItem> => ({
    3: { kind: 'coins', amount: 300 },
    5: { kind: 'cosmetic', id: 'spray_gg' },
    8: { kind: 'coins', amount: 500 },
    10: { kind: 'cosmetic', id: `title_master_${heroId}` },
    15: { kind: 'coins', amount: 800 },
    20: { kind: 'cosmetic', id: masterySkin(heroId) ?? 'fx_leaf' },
    25: { kind: 'coins', amount: 1200 },
    30: { kind: 'gems', amount: 30 },
  }),
  badges: [{ level: 5, name: 'Bronze', color: '#cd7f32' }, { level: 12, name: 'Argent', color: '#c0c0c0' }, { level: 20, name: 'Or', color: '#ffd700' }, { level: 30, name: 'Rift', color: '#b388ff' }],
};

function masterySkin(heroId: string) {
  return ({ block: 'block_gold', flux: 'flux_mastery', arc: 'arc_mastery', vortex: 'vortex_mastery' } as Record<string, string>)[heroId];
}

/** Unlock prices of heroes with free coins (alternative to trophy road). Never premium currency. */
export const HERO_COIN_PRICE = 3000;
/** Coin price (free currency) to unlock a hero early — mythics cost more, never premium currency. */
export const heroCoinPrice = (rarity?: string) => rarity === "MYTHIC" ? 12000 : rarity === "LEGENDARY" || rarity === "EPIC" ? 4500 : HERO_COIN_PRICE;
