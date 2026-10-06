import type { ProductData } from './types';

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
  { id: 'season_pack', type: 'non_consumable', title: 'Pack Saison 1', description: 'RIFT PASS Premium + 10 paliers + skin Blink Cyber', fallbackPrice: '14,99 €', oneTimeKey: 'season_pack_s1',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_s1' }, { kind: 'passXp', amount: 10 * 1000 }, { kind: 'cosmetic', id: 'blink_cyber' }] },
  { id: 'special_bundle', type: 'consumable', title: 'Bundle Spécial', description: '600 Gems + skin Titan Viking + spray Dragon', fallbackPrice: '7,99 €',
    grants: [{ kind: 'gems', amount: 600 }, { kind: 'cosmetic', id: 'titan_viking' }, { kind: 'cosmetic', id: 'spray_dragon' }] },
  { id: 'battle_pass', type: 'non_consumable', title: 'RIFT PASS Premium', description: 'Débloque la piste Premium de la saison', fallbackPrice: '5,99 €', oneTimeKey: 'pass_premium_s1',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_s1' }] },
  { id: 'battle_pass_plus', type: 'non_consumable', title: 'RIFT PASS+', description: 'Premium + piste PASS+ + 20% Pass XP (cosmétique uniquement)', fallbackPrice: '9,99 €', oneTimeKey: 'pass_plus_s1',
    grants: [{ kind: 'cosmetic', id: 'pass_premium_s1' }, { kind: 'cosmetic', id: 'pass_plus_s1' }] },
];

export const getProduct = (id: string) => PRODUCTS.find((p) => p.id === id);
