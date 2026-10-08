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

/** Builds a 30-tier pass for later seasons from its signature cosmetics (cosmetic & currency only). */
function seasonPass(c: { mythicSkin: string; freeSkin: string; premiumSkin: string; emoteFree: string; emotePremium: string; sprayFree: string; banner: string; title: string; icon: string; effect: string }): BattlePassRewardData[] {
  const t: BattlePassRewardData[] = [];
  for (let tier = 1; tier <= 30; tier++) {
    const r: BattlePassRewardData = { tier, free: tier % 3 === 0 ? gems(5 + tier) : coins(200 + tier * 12), premium: tier % 2 ? coins(450 + tier * 25) : gems(20 + tier) };
    if (tier % 5 === 0) r.free = crate(tier >= 20 ? 'crate_big' : 'crate_small');
    t.push(r);
  }
  const set = (tier: number, track: 'free' | 'premium' | 'plus', item: RewardItem) => { (t[tier - 1] as any)[track] = item; };
  set(1, 'premium', cos(c.emotePremium)); set(1, 'plus', cos(c.mythicSkin));
  set(4, 'free', cos(c.sprayFree)); set(7, 'free', cos(c.emoteFree)); set(10, 'free', cos(c.freeSkin));
  set(12, 'premium', cos(c.effect)); set(15, 'plus', gems(60)); set(18, 'premium', cos(c.banner)); set(20, 'free', cos(c.icon));
  set(25, 'plus', cos('fx_rainbow')); set(28, 'premium', cos(c.title)); set(30, 'premium', cos(c.premiumSkin)); set(30, 'plus', gems(100));
  return t;
}

export const SEASONS: SeasonData[] = [
  {
    id: 's1', number: 1, name: 'ÉVEIL DU RIFT', theme: 'Le Rift s\'éveille et le Noyau Volcanique gronde.',
    start: '2026-09-01T00:00:00Z', end: '2026-12-01T00:00:00Z', color: '#ff6b35', icon: '🌋',
    newHero: 'ember', newArena: 'volcanic_core', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: S1_REWARDS, events: ['rift_frenzy', 'double_xp', 'chaos_week', 'boss_invasion', 'volcanic_week', 'mythic_trial', 'ult_storm', 'halloween_rift'],
  },
  {
    // Next seasons are pure data: drop a new entry to schedule one.
    id: 's2', number: 2, name: 'HIVER ÉTERNEL', theme: 'Le Laboratoire Gelé s\'est réveillé : FROST et LUNA mènent la résistance contre le froid du Rift.',
    start: '2026-12-01T00:00:00Z', end: '2027-03-01T00:00:00Z', color: '#4cc9f0', icon: '❄️',
    newHero: 'frost', newArena: 'frozen_lab', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: seasonPass({ mythicSkin: 'frost_king', freeSkin: 'titan_yeti', premiumSkin: 'luna_frost', emoteFree: 'emote_snowman', emotePremium: 'emote_cocoa', sprayFree: 'spray_igloo', banner: 'banner_aurora', title: 'title_s2', icon: 'icon_penguin', effect: 'fx_aurora' }),
    events: ['winter_rift', 'new_year', 'double_xp', 'ult_storm', 'mythic_trial', 'bonus_festival'],
  },
  {
    id: 's3', number: 3, name: 'JUNGLE SAUVAGE', theme: 'Les Ruines de la Jungle s\'étendent. KOKO défend son territoire.',
    start: '2027-03-01T00:00:00Z', end: '2027-06-01T00:00:00Z', color: '#52b788', icon: '🌿',
    newHero: 'koko', newArena: 'jungle_ruins', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: seasonPass({ mythicSkin: 'riftborn_jungle', freeSkin: 'zip_explorer', premiumSkin: 'koko_king', emoteFree: 'emote_parrot', emotePremium: 'emote_monkey', sprayFree: 'spray_vine', banner: 'banner_temple', title: 'title_s3', icon: 'icon_parrot', effect: 'fx_pollen' }),
    events: ['king_festival', 'bonus_festival', 'turbo_weekend', 'boss_invasion', 'double_xp'],
  },
  {
    id: 's4', number: 4, name: 'NÉON CÉLESTE', theme: 'Les Docks Néon s\'illuminent et le Temple du Ciel s\'ouvre. SERAPH descend.',
    start: '2027-06-01T00:00:00Z', end: '2027-09-01T00:00:00Z', color: '#f72585', icon: '🌃',
    newHero: 'seraph', newArena: 'neon_docks', passTiers: 30, passXpPerTier: 1000, passPriceGems: 169, passPlusPriceGems: 299,
    rewards: seasonPass({ mythicSkin: 'seraph_neon', freeSkin: 'gear_cyber', premiumSkin: 'nova_neon', emoteFree: 'emote_robot', emotePremium: 'emote_dance', sprayFree: 'spray_neon', banner: 'banner_synth', title: 'title_s4', icon: 'icon_robot', effect: 'fx_laser' }),
    events: ['glass_cannon', 'turbo_weekend', 'mythic_trial', 'chaos_week', 'rift_frenzy'],
  },
];

/** Season ranks from the season's peak trophies; rewarded when the season ends. */
export const SEASON_RANKS: { id: string; name: string; icon: string; min: number; color: string; reward: RewardItem[] }[] = [
  { id: 'bronze', name: 'BRONZE', icon: '🥉', min: 0, color: '#cd7f32', reward: [coins(300)] },
  { id: 'silver', name: 'ARGENT', icon: '🥈', min: 500, color: '#ced4da', reward: [coins(600), gems(10)] },
  { id: 'gold', name: 'OR', icon: '🥇', min: 1000, color: '#ffd60a', reward: [coins(1000), gems(25)] },
  { id: 'diamond', name: 'DIAMANT', icon: '💎', min: 1800, color: '#4cc9f0', reward: [coins(1500), gems(50), crate('crate_big')] },
  { id: 'mythic', name: 'MYTHIQUE', icon: '🌈', min: 2800, color: '#ff3d7f', reward: [coins(2500), gems(80), crate('crate_big')] },
  { id: 'legend', name: 'LÉGENDE', icon: '👑', min: 4000, color: '#ffb703', reward: [coins(4000), gems(120), cos('title_season_legend')] },
];
export const rankFor = (trophies: number) => [...SEASON_RANKS].reverse().find((r) => trophies >= r.min)!;
/** End-of-season soft reset: trophies above this keep only half of the excess. */
export const SEASON_RESET_FLOOR = 1000;

/** The current season; falls back to the latest started one. */
export function currentSeason(now: number): SeasonData {
  const active = SEASONS.find((s) => now >= Date.parse(s.start) && now < Date.parse(s.end));
  if (active) return active;
  const past = SEASONS.filter((s) => now >= Date.parse(s.start));
  return past[past.length - 1] ?? SEASONS[0];
}
