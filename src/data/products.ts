import type { ProductData, RewardItem } from './types';
import { currentSeason } from './seasons';
import { Clock } from '../core/Time';

/**
 * Real-money products. `id` MUST match the Google Play Console product ids — edit them here only.
 * Grants are applied ONLY after the purchase has been validated by the ReceiptValidator (see /src/iap).
 */
export const PRODUCTS: ProductData[] = [
  { id: 'gems_small', type: 'consumable', title: 'Poignée de Gemmes', description: '80 Rift Gems', fallbackPrice: '0,99 €', grants: [{ kind: 'gems', amount: 80 }] },
  { id: 'gems_medium', type: 'consumable', title: 'Sac de Gemmes', description: '450 Rift Gems (+12% vs petit)', fallbackPrice: '4,99 €', grants: [{ kind: 'gems', amount: 450 }] },
  { id: 'gems_large', type: 'consumable', title: 'Coffre de Gemmes', description: '950 Rift Gems (+19%)', fallbackPrice: '9,99 €', grants: [{ kind: 'gems', amount: 950 }] },
  { id: 'gems_xlarge', type: 'consumable', title: 'Montagne de Gemmes', description: '2000 Rift Gems (+25%)', fallbackPrice: '19,99 €', grants: [{ kind: 'gems', amount: 2000 }] },
  { id: 'starter_pack', type: 'non_consumable', title: 'Pack de Démarrage', description: '300 Gems, skin Magnet Polaire, emote Trop Cool, 2000 Coins', fallbackPrice: '2,99 €', oneTimeKey: 'starter_pack',
    grants: [{ kind: 'gems', amount: 300 }, { kind: 'cosmetic', id: 'magnet_polar' }, { kind: 'cosmetic', id: 'emote_cool' }, { kind: 'coins', amount: 2000 }] },
  // Seasonal products: one Play product per season ({season} = season id). Season 1 uses the plain id
  // (battle_pass), later seasons append the season (battle_pass_s2, battle_pass_plus_s2, season_pack_s2...).
  { id: 'season_pack', type: 'non_consumable', seasonal: true, title: 'Pack Saison', description: 'RIFT PASS Premium + 10 paliers + skin Blink Cyber', fallbackPrice: '14,99 €', oneTimeKey: 'season_pack_{season}',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_{season}' }, { kind: 'passXp', amount: 10 * 1000 }, { kind: 'cosmetic', id: 'blink_cyber' }] },
  { id: 'special_bundle', type: 'consumable', title: 'Bundle Spécial', description: '600 Gems + skin Titan Viking + spray Dragon', fallbackPrice: '7,99 €',
    grants: [{ kind: 'gems', amount: 600 }, { kind: 'cosmetic', id: 'titan_viking' }, { kind: 'cosmetic', id: 'spray_dragon' }] },
  { id: 'battle_pass', type: 'non_consumable', seasonal: true, title: 'RIFT PASS Premium', description: 'Débloque la piste Premium de la saison en cours', fallbackPrice: '5,99 €', oneTimeKey: 'pass_premium_{season}',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_{season}' }] },
  { id: 'battle_pass_plus', type: 'non_consumable', seasonal: true, title: 'RIFT PASS+', description: 'Premium + piste PASS+ + 20% Pass XP (cosmétique uniquement)', fallbackPrice: '9,99 €', oneTimeKey: 'pass_plus_{season}',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_{season}' }, { kind: 'cosmetic', id: 'pass_plus_{season}' }] },
];

const fill = (id: string, season: string) => id.replace('{season}', season);

/** Google Play product id of a seasonal product for a season (s1 keeps the plain id). */
export const storeIdFor = (baseId: string, seasonId = currentSeason(Clock.now()).id) => {
  const p = PRODUCTS.find((x) => x.id === baseId);
  return p?.seasonal && seasonId !== 's1' ? `${baseId}_${seasonId}` : baseId;
};

/** Every store id the game can sell right now (current season's seasonal products). */
export const storeIds = () => PRODUCTS.map((p) => storeIdFor(p.id));

/**
 * Product by store id. Seasonal store ids (battle_pass_s2) resolve to their season's grants;
 * a plain seasonal id (battle_pass) is Season 1.
 */
export function getProduct(storeId: string): ProductData | undefined {
  let p = PRODUCTS.find((x) => x.id === storeId);
  let season = 's1';
  if (!p) {
    const m = /^(.*)_(s\d+)$/.exec(storeId);
    if (m) { p = PRODUCTS.find((x) => x.id === m[1] && x.seasonal); season = m[2]; }
  }
  if (!p || !p.seasonal) return p;
  return { ...p, id: storeId, oneTimeKey: p.oneTimeKey && fill(p.oneTimeKey, season), grants: p.grants.map((g): RewardItem => g.kind === 'cosmetic' ? { ...g, id: fill(g.id, season) } : g) };
}
