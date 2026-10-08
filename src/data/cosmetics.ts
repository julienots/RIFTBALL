import type { CosmeticData, Rarity } from './types';
import { PLAYABLE } from './characters';

/**
 * Every cosmetic in the game. Purely visual: no cosmetic ever changes stats.
 * Skins override the hero palette (primary/secondary/accent/skin/eyes) and may add an `hat` accessory.
 */
const skinDefs: Record<string, { id: string; name: string; rarity: Rarity; source: CosmeticData['source']; visual: Record<string, string>; priceGems?: number; priceCoins?: number; season?: string }[]> = {
  magnet: [
    { id: 'magnet_polar', name: 'Magnet Polaire', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#4cc9f0', secondary: '#f8f9fa', accent: '#ff4d6d', hat: 'beanie' } },
    { id: 'magnet_neon', name: 'Magnet Néon', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#39ff14', secondary: '#0b0c10', accent: '#ff00e6', hat: 'visor' } },
    { id: 'magnet_queen', name: 'Reine des Aimants', rarity: 'LEGENDARY', source: 'pass_premium', season: 's1', visual: { primary: '#ffd700', secondary: '#7b2cbf', accent: '#ffffff', hat: 'crown' } },
  ],
  blink: [
    { id: 'blink_ronin', name: 'Blink Ronin', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#d00000', secondary: '#1b1b1b', accent: '#ffba08', hat: 'kasa' } },
    { id: 'blink_ghost', name: 'Blink Fantôme', rarity: 'RARE', source: 'pass_free', season: 's1', visual: { primary: '#e0e1dd', secondary: '#778da9', accent: '#00f5d4' } },
    { id: 'blink_cyber', name: 'Blink Cyber', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#00ffcc', secondary: '#240046', accent: '#ff006e', hat: 'visor' } },
  ],
  block: [
    { id: 'block_candy', name: 'Block Bonbon', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#ff8fab', secondary: '#ffc8dd', accent: '#bde0fe' } },
    { id: 'block_gold', name: 'Block Lingot', rarity: 'EPIC', source: 'mastery', visual: { primary: '#ffd60a', secondary: '#b08900', accent: '#fff' , hat: 'helmet'} },
    { id: 'block_lava', name: 'Block Magma', rarity: 'EPIC', source: 'event', visual: { primary: '#ff4800', secondary: '#370617', accent: '#ffba08' } },
  ],
  shade: [
    { id: 'shade_moon', name: 'Shade Lunaire', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#adb5bd', secondary: '#03045e', accent: '#caf0f8' } },
    { id: 'shade_inferno', name: 'Shade Infernal', rarity: 'LEGENDARY', source: 'pass_plus', season: 's1', visual: { primary: '#ff0054', secondary: '#1a0000', accent: '#ffbd00', hat: 'horns' } },
    { id: 'shade_mint', name: 'Shade Menthe', rarity: 'RARE', source: 'crate', visual: { primary: '#2ec4b6', secondary: '#011627', accent: '#cbf3f0' } },
  ],
  volt: [
    { id: 'volt_storm', name: 'Volt Tempête', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#4361ee', secondary: '#03071e', accent: '#ffe600' } },
    { id: 'volt_pop', name: 'Volt Pop Star', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#ff4ecd', secondary: '#3a0ca3', accent: '#00f5ff', hat: 'headphones' } },
    { id: 'volt_frost', name: 'Volt Givre', rarity: 'EPIC', source: 'event', visual: { primary: '#a2d2ff', secondary: '#023e8a', accent: '#ffffff', hat: 'beanie' } },
  ],
  flux: [
    { id: 'flux_toxic', name: 'Flux Toxique', rarity: 'RARE', source: 'crate', visual: { primary: '#aacc00', secondary: '#1b4332', accent: '#d9ed92' } },
    { id: 'flux_royal', name: 'Flux Royal', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#7209b7', secondary: '#ffd60a', accent: '#f72585', hat: 'crown' } },
    { id: 'flux_mastery', name: 'Flux Maître', rarity: 'EPIC', source: 'mastery', visual: { primary: '#ffffff', secondary: '#06d6a0', accent: '#118ab2' } },
  ],
  titan: [
    { id: 'titan_viking', name: 'Titan Viking', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#bc6c25', secondary: '#283618', accent: '#fefae0', hat: 'horns' } },
    { id: 'titan_mecha', name: 'Méca-Titan', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#e5e5e5', secondary: '#14213d', accent: '#fca311', hat: 'helmet' } },
    { id: 'titan_jungle', name: 'Titan Sylvestre', rarity: 'RARE', source: 'pass_free', season: 's1', visual: { primary: '#606c38', secondary: '#283618', accent: '#dda15e' } },
  ],
  arc: [
    { id: 'arc_pirate', name: 'Arc Corsaire', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#9d0208', secondary: '#03071e', accent: '#ffba08', hat: 'tricorn' } },
    { id: 'arc_sunny', name: 'Arc Soleil', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#ffbe0b', secondary: '#fb5607', accent: '#ffffff' } },
    { id: 'arc_mastery', name: 'Arc Maîtresse', rarity: 'EPIC', source: 'mastery', visual: { primary: '#14213d', secondary: '#fca311', accent: '#e5e5e5' } },
  ],
  pulse: [
    { id: 'pulse_nurse', name: 'Pulse Infirmier', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#ffffff', secondary: '#e63946', accent: '#a8dadc' } },
    { id: 'pulse_disco', name: 'Pulse Disco', rarity: 'EPIC', source: 'pass_premium', season: 's1', visual: { primary: '#c77dff', secondary: '#10002b', accent: '#ffd60a', hat: 'headphones' } },
    { id: 'pulse_winter', name: 'Pulse Hivernal', rarity: 'EPIC', source: 'event', visual: { primary: '#caf0f8', secondary: '#0077b6', accent: '#ff006e', hat: 'beanie' } },
  ],
  vortex: [
    { id: 'vortex_cosmic', name: 'Vortex Cosmique', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#3a0ca3', secondary: '#000000', accent: '#4cc9f0', hat: 'halo' } },
    { id: 'vortex_sand', name: 'Vortex des Sables', rarity: 'RARE', source: 'crate', visual: { primary: '#e9c46a', secondary: '#264653', accent: '#f4a261' } },
    { id: 'vortex_mastery', name: 'Vortex Maître', rarity: 'EPIC', source: 'mastery', visual: { primary: '#ef476f', secondary: '#073b4c', accent: '#ffd166' } },
  ],
  nova: [
    { id: 'nova_eclipse', name: 'Nova Éclipse', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#1b1b1b', secondary: '#ffbe0b', accent: '#ff006e', hat: 'visor' } },
    { id: 'nova_galaxy', name: 'Nova Galactique', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#7209b7', secondary: '#10002b', accent: '#4cc9f0', hat: 'halo' } },
  ],
  frost: [
    { id: 'frost_aurora', name: 'Frost Aurore', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#80ffdb', secondary: '#5390d9', accent: '#ffffff', hat: 'crown' } },
    { id: 'frost_ember', name: 'Frost Dégel', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#ffadad', secondary: '#9d0208', accent: '#ffd6a5' } },
  ],
  ember: [
    { id: 'ember_ash', name: 'Ember Cendrée', rarity: 'EPIC', source: 'pass_premium', season: 's1', visual: { primary: '#6c757d', secondary: '#212529', accent: '#ff6b35' } },
    { id: 'ember_phoenix', name: 'Ember Phénix', rarity: 'MYTHIC', source: 'pass_plus', season: 's1', visual: { primary: '#ffba08', secondary: '#d00000', accent: '#ffffff', hat: 'halo' } },
  ],
  zip: [
    { id: 'zip_racer', name: 'Zip Pilote', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#e63946', secondary: '#1d3557', accent: '#f1faee', hat: 'helmet' } },
    { id: 'zip_mint', name: 'Zip Menthe', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#80ffdb', secondary: '#006466', accent: '#ffffff' } },
  ],
  grill: [
    { id: 'grill_bbq', name: 'Grill Barbecue', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#6f1d1b', secondary: '#432818', accent: '#ffe6a7' } },
    { id: 'grill_royal', name: 'Chef Royal', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#ffd60a', secondary: '#7b2cbf', accent: '#ffffff', hat: 'crown' } },
  ],
  koko: [
    { id: 'koko_snow', name: 'Koko des Neiges', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#f8f9fa', secondary: '#4895ef', accent: '#caf0f8', skin: '#adb5bd', hat: 'beanie' } },
    { id: 'koko_lava', name: 'Koko Volcan', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#370617', secondary: '#9d0208', accent: '#ffba08', skin: '#6a040f', hat: 'horns' } },
  ],
  luna: [
    { id: 'luna_sun', name: 'Luna Solaire', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#ffbe0b', secondary: '#9d0208', accent: '#ffffff', hat: 'halo' } },
    { id: 'luna_dark', name: 'Luna Nouvelle Lune', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#3c096c', secondary: '#10002b', accent: '#e0aaff' } },
  ],
  gear: [
    { id: 'gear_steam', name: 'Gear Steampunk', rarity: 'EPIC', source: 'shop', priceGems: 149, visual: { primary: '#99582a', secondary: '#432818', accent: '#ffe6a7', hat: 'tricorn' } },
    { id: 'gear_neon', name: 'Gear Néon', rarity: 'RARE', source: 'shop', priceCoins: 1500, visual: { primary: '#39ff14', secondary: '#0b0c10', accent: '#ff00e6' } },
  ],
  chronos: [
    { id: 'chronos_void', name: 'Chronos du Néant', rarity: 'MYTHIC', source: 'shop', priceGems: 499, visual: { primary: '#7209b7', secondary: '#000000', accent: '#f72585', hat: 'halo' } },
    { id: 'chronos_silver', name: 'Chronos Argenté', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#ced4da', secondary: '#212529', accent: '#00f5d4' } },
  ],
  seraph: [
    { id: 'seraph_fallen', name: 'Seraph Déchue', rarity: 'MYTHIC', source: 'shop', priceGems: 499, visual: { primary: '#14141f', secondary: '#9d0208', accent: '#ff4d6d', hat: 'horns' } },
    { id: 'seraph_aurora', name: 'Seraph Aurore', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#ffc8dd', secondary: '#bde0fe', accent: '#a2d2ff', hat: 'halo' } },
  ],
  riftborn: [
    { id: 'riftborn_gold', name: 'Riftborn Doré', rarity: 'MYTHIC', source: 'shop', priceGems: 499, visual: { primary: '#ffd60a', secondary: '#3c1642', accent: '#ffffff', hat: 'crown' } },
    { id: 'riftborn_toxic', name: 'Riftborn Toxique', rarity: 'LEGENDARY', source: 'shop', priceGems: 299, visual: { primary: '#70e000', secondary: '#004b23', accent: '#ccff33' } },
  ],
};

const skins: CosmeticData[] = [];
for (const c of PLAYABLE) {
  skins.push({ id: `${c.id}_default`, type: 'skin', name: `${c.name} Classique`, rarity: 'COMMON', heroId: c.id, visual: {}, source: 'default' });
  for (const s of skinDefs[c.id] ?? []) skins.push({ ...s, type: 'skin', heroId: c.id });
}

const emotes: CosmeticData[] = [
  ['emote_gg', 'GG !', '🤝', 'COMMON', 'default'], ['emote_lol', 'MDR', '😂', 'COMMON', 'default'], ['emote_angry', 'Grrr', '😤', 'COMMON', 'default'],
  ['emote_cool', 'Trop Cool', '😎', 'RARE', 'shop'], ['emote_cry', 'Snif', '😭', 'RARE', 'pass_free'], ['emote_fire', 'En Feu', '🔥', 'RARE', 'shop'],
  ['emote_rift', 'Rift Love', '💜', 'EPIC', 'pass_premium'], ['emote_crown', 'Le Roi', '👑', 'EPIC', 'shop'], ['emote_ghost', 'Boo', '👻', 'RARE', 'crate'],
  ['emote_bolt', 'Zap', '⚡', 'RARE', 'pass_free'], ['emote_skull', 'RIP', '💀', 'EPIC', 'crate'], ['emote_party', 'Fiesta', '🥳', 'EPIC', 'pass_premium'],
  ['emote_think', 'Hmm...', '🤔', 'COMMON', 'crate'], ['emote_wow', 'Wow', '🤩', 'RARE', 'shop'], ['emote_sleep', 'Zzz', '😴', 'RARE', 'crate'],
  ['emote_snow', 'Brrr', '🥶', 'EPIC', 'event'], ['emote_lava', 'Trop Chaud', '🥵', 'EPIC', 'event'], ['emote_alien', 'Visiteur', '👽', 'LEGENDARY', 'pass_plus'],
  ['emote_trophy', 'Champion', '🏆', 'LEGENDARY', 'trophy_road'], ['emote_heart', 'Merci', '❤️', 'COMMON', 'pass_free'],
].map(([id, name, glyph, rarity, source]) => ({ id, type: 'emote' as const, name, rarity: rarity as Rarity, visual: { glyph }, source: source as CosmeticData['source'] }));

const sprays: CosmeticData[] = [
  ['spray_rift', 'Œil du Rift', '👁️', '#7b61ff', 'COMMON', 'default'], ['spray_star', 'Étoile', '⭐', '#ffd166', 'COMMON', 'pass_free'], ['spray_bolt', 'Éclair', '⚡', '#ffe600', 'RARE', 'shop'],
  ['spray_skull', 'Crâne', '💀', '#e0e0e0', 'RARE', 'crate'], ['spray_heart', 'Cœur', '💖', '#ff70a6', 'RARE', 'pass_free'], ['spray_flame', 'Flamme', '🔥', '#ff6b35', 'EPIC', 'event'],
  ['spray_snow', 'Flocon', '❄️', '#a2d2ff', 'EPIC', 'event'], ['spray_crown', 'Couronne', '👑', '#ffd60a', 'EPIC', 'pass_premium'], ['spray_gg', 'GG', '🆗', '#06d6a0', 'COMMON', 'crate'],
  ['spray_planet', 'Planète', '🪐', '#9d4edd', 'RARE', 'shop'], ['spray_leaf', 'Feuille', '🍃', '#80ed99', 'RARE', 'crate'], ['spray_diamond', 'Diamant', '💎', '#4cc9f0', 'LEGENDARY', 'pass_plus'],
  ['spray_dragon', 'Dragon', '🐉', '#e63946', 'LEGENDARY', 'shop'], ['spray_rocket', 'Fusée', '🚀', '#f15bb5', 'EPIC', 'crate'], ['spray_ball', 'Riftball', '🔮', '#b388ff', 'COMMON', 'default'],
  ['spray_100', 'Cent', '💯', '#ff006e', 'RARE', 'pass_premium'],
].map(([id, name, glyph, color, rarity, source]) => ({ id, type: 'spray' as const, name, rarity: rarity as Rarity, visual: { glyph, color }, source: source as CosmeticData['source'] }));

const effects: CosmeticData[] = [
  ['fx_default', 'Traînée Standard', '#ffffff', 'COMMON', 'default'], ['fx_rainbow', 'Arc-en-ciel', 'rainbow', 'LEGENDARY', 'pass_plus'], ['fx_fire', 'Traînée de Feu', '#ff6b35', 'EPIC', 'shop'],
  ['fx_ice', 'Traînée de Givre', '#a2d2ff', 'EPIC', 'event'], ['fx_void', 'Traînée du Vide', '#9d4edd', 'EPIC', 'pass_premium'], ['fx_gold', 'Traînée Dorée', '#ffd60a', 'LEGENDARY', 'shop'],
  ['fx_leaf', 'Traînée Sylvestre', '#80ed99', 'RARE', 'crate'], ['fx_spark', 'Étincelles', '#ffe600', 'RARE', 'pass_free'], ['fx_heart', 'Petits Cœurs', '#ff70a6', 'RARE', 'crate'],
  ['fx_neon', 'Néon', '#00ffcc', 'EPIC', 'crate'],
].map(([id, name, color, rarity, source]) => ({ id, type: 'effect' as const, name, rarity: rarity as Rarity, visual: { color }, source: source as CosmeticData['source'] }));

const banners: CosmeticData[] = [
  ['banner_default', 'Bannière Rift', '#3a0ca3', '#7b61ff', 'COMMON', 'default'], ['banner_sunset', 'Crépuscule', '#ff6b35', '#f72585', 'RARE', 'pass_free'], ['banner_ocean', 'Océan', '#0077b6', '#00b4d8', 'RARE', 'crate'],
  ['banner_jungle', 'Jungle', '#1b4332', '#52b788', 'RARE', 'crate'], ['banner_gold', 'Or Royal', '#b08900', '#ffd60a', 'EPIC', 'pass_premium'], ['banner_volcano', 'Volcan', '#370617', '#e85d04', 'EPIC', 'event'],
  ['banner_frost', 'Givre', '#caf0f8', '#48cae4', 'EPIC', 'event'], ['banner_galaxy', 'Galaxie', '#10002b', '#c77dff', 'LEGENDARY', 'pass_plus'], ['banner_candy', 'Bonbon', '#ff8fab', '#ffc8dd', 'RARE', 'shop'],
  ['banner_champion', 'Champion', '#1a1a1a', '#ffd60a', 'LEGENDARY', 'trophy_road'],
].map(([id, name, a, b, rarity, source]) => ({ id, type: 'banner' as const, name, rarity: rarity as Rarity, visual: { a, b }, source: source as CosmeticData['source'] }));

const titles: CosmeticData[] = [
  ['title_rookie', 'Recrue du Rift', 'COMMON', 'default'], ['title_hunter', 'Chasseur de Rift', 'RARE', 'achievement'], ['title_wall', 'Le Mur', 'RARE', 'achievement'],
  ['title_sniper', 'Œil de Lynx', 'RARE', 'pass_free'], ['title_legend', 'Légende Vivante', 'LEGENDARY', 'trophy_road'], ['title_chaos', 'Agent du Chaos', 'EPIC', 'event'],
  ['title_boss', 'Tueur de Colosse', 'EPIC', 'achievement'], ['title_survivor', 'Survivant', 'EPIC', 'achievement'], ['title_s1', 'Pionnier S1', 'EPIC', 'pass_premium'],
  ['title_mvp', 'MVP', 'RARE', 'achievement'], ['title_crew', 'Cœur de Crew', 'RARE', 'achievement'], ['title_collector', 'Collectionneur', 'LEGENDARY', 'achievement'],
  ...PLAYABLE.map((c) => [`title_master_${c.id}`, `Maître ${c.name}`, 'EPIC', 'mastery']),
].map(([id, name, rarity, source]) => ({ id, type: 'title' as const, name, rarity: rarity as Rarity, visual: {}, source: source as CosmeticData['source'] }));

const icons: CosmeticData[] = [
  ...PLAYABLE.map((c) => [`icon_${c.id}`, c.name, c.palette.primary, c.unlock.type === 'starter' ? 'default' : 'trophy_road', 'COMMON']),
  ['icon_rift', 'Rift', '#7b61ff', 'default', 'COMMON'], ['icon_crown', 'Couronne', '#ffd60a', 'pass_premium', 'EPIC'], ['icon_skull', 'Crâne', '#e5e5e5', 'crate', 'RARE'],
  ['icon_flame', 'Flamme', '#ff6b35', 'event', 'EPIC'], ['icon_snow', 'Flocon', '#a2d2ff', 'event', 'EPIC'], ['icon_star', 'Étoile', '#ffd166', 'pass_free', 'RARE'],
].map(([id, name, color, source, rarity]) => ({ id, type: 'icon' as const, name, rarity: rarity as Rarity, visual: { color }, source: source as CosmeticData['source'] }));

export const COSMETICS: CosmeticData[] = [...skins, ...emotes, ...sprays, ...effects, ...banners, ...titles, ...icons];
const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));
export const getCosmetic = (id: string) => BY_ID.get(id);
export const skinsFor = (heroId: string) => COSMETICS.filter((c) => c.type === 'skin' && c.heroId === heroId);
export const DEFAULT_COSMETICS = COSMETICS.filter((c) => c.source === 'default').map((c) => c.id);

/** Reference gem value per rarity — used to show honest "value" on bundles (no fake discounts). */
export const RARITY_GEM_VALUE: Record<Rarity, number> = { COMMON: 19, RARE: 49, EPIC: 149, LEGENDARY: 299, MYTHIC: 499 };
export const RARITY_COLORS: Record<Rarity, string> = { COMMON: '#9fb3c8', RARE: '#3ec7ff', EPIC: '#b45cff', LEGENDARY: '#ffcc33', MYTHIC: '#ff3d7f' };
export const RARITY_LABEL: Record<Rarity, string> = { COMMON: 'COMMUN', RARE: 'RARE', EPIC: 'ÉPIQUE', LEGENDARY: 'LÉGENDAIRE', MYTHIC: 'MYTHIQUE' };
