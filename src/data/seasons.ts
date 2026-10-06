import type { BattlePassRewardData, RewardItem, SeasonData } from './types';

const coins = (amount: number): RewardItem => ({ kind: 'coins', amount });
const gems = (amount: number): RewardItem => ({ kind: 'gems', amount });
const cos = (id: string): RewardItem => ({ kind: 'cosmetic', id });
const crate = (id: string): RewardItem => ({ kind: 'crate', id, count: 1 });

/** Season 1 reward table (30 tiers). Premium/Plus are cosmetic or currency only — never power. */
const S1_REWARDS: BattlePassRewardData[] = [
  { tier: 1, free: { kind: 'hero', id: 'ember' } as RewardItem, premium: cos('ember_ash'), plus: cos('ember_phoenix') },
  { tier: 2, free: coins(200), premium: gems(20), plus: cos('fx_rainbow') },
  { tier: 3, free: cos('spray_star'), premium: coins(500) },
  { tier: 4, free: coins(250), premium: cos('emote_rift') },
  { tier: 5, free: cos('emote_cry'), premium: crate('crate_big'), plus: gems(30) },
  { tier: 6, free: coins(250), premium: coins(600) },
  { tier: 7, free: gems(10), premium: cos('spray_crown') },
  { tier: 8, free: coins(300), premium: cos('banner_gold') },
  { tier: 9, free: cos('banner_sunset'), premium: gems(30) },
  { tier: 10, free: cos('blink_ghost'), premium: cos('pulse_disco'), plus: gems(50) },
  { tier: 11, free: coins(300), premium: coins(700) },
  { tier: 12, free: cos('emote_bolt'), premium: cos('fx_void') },
  { tier: 13, free: coins(350), premium: crate('crate_big') },
  { tier: 14, free: cos('spray_heart'), premium: cos('emote_party') },
  { tier: 15, free: crate('crate_small'), premium: gems(40), plus: cos('shade_inferno') },
  { tier: 16, free: coins(350), premium: cos('spray_100') },
  { tier: 17, free: cos('fx_spark'), premium: coins(800) },
  { tier: 18, free: coins(400), premium: cos('icon_crown') },
  { tier: 19, free: cos('title_sniper'), premium: gems(40) },
  { tier: 20, free: cos('titan_jungle'), premium: cos('title_s1'), plus: cos('banner_galaxy') },
  { tier: 21, free: coins(400), premium: crate('crate_big') },
  { tier: 22, free: cos('emote_heart'), premium: coins(900) },
  { tier: 23, free: coins(450), premium: gems(50) },
  { tier: 24, free: cos('icon_star'), premium: crate('crate_big') },
  { tier: 25, free: gems(20), premium: coins(1000), plus: cos('spray_diamond') },
  { tier: 26, free: coins(500), premium: gems(50) },
  { tier: 27, free: crate('crate_small'), premium: crate('crate_big') },
  { tier: 28, free: coins(500), premium: coins(1200) },
  { tier: 29, free: gems(30), premium: gems(60) },
  { tier: 30, free: crate('crate_big'), premium: cos('magnet_queen'), plus: cos('emote_alien') },
];

export const SEASONS: SeasonData[] = [
  {
    id: 's1', number: 1, name: 'ÉVEIL DU RIFT', theme: 'Le Rift s\'éveille et le Noyau Volcanique gronde.',
    start: '2026-09-01T00:00:00Z', end: '2026-12-01T00:00:00Z', color: '#ff6b35',
    newHero: 'ember', newArena: 'volcanic_core', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: S1_REWARDS, events: ['rift_frenzy', 'double_xp', 'chaos_week', 'boss_invasion', 'volcanic_week', 'winter_rift'],
  },
  {
    // Next season is pure data: drop a new entry to schedule it.
    id: 's2', number: 2, name: 'HIVER ÉTERNEL', theme: 'Le Laboratoire Gelé s\'est réveillé.',
    start: '2026-12-01T00:00:00Z', end: '2027-03-01T00:00:00Z', color: '#4cc9f0',
    newHero: 'ember', newArena: 'frozen_lab', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: S1_REWARDS, events: ['winter_rift', 'double_xp'],
  },
];

/** The current season; falls back to the latest started one. */
export function currentSeason(now: number): SeasonData {
  const active = SEASONS.find((s) => now >= Date.parse(s.start) && now < Date.parse(s.end));
  if (active) return active;
  const past = SEASONS.filter((s) => now >= Date.parse(s.start));
  return past[past.length - 1] ?? SEASONS[0];
}
