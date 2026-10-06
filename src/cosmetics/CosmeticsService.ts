import type { SaveSystem } from '../save/SaveSystem';
import { getCosmetic, skinsFor } from '../data/cosmetics';
import { getCharacter } from '../data/characters';

/** Equipping cosmetics. Purely visual — resolves skin palettes for rendering. */
export class CosmeticsService {
  constructor(private save: SaveSystem) {}
  private get d() { return this.save.data; }

  equipSkin(heroId: string, skinId: string) {
    const s = getCosmetic(skinId);
    if (!s || s.heroId !== heroId || !this.d.cosmetics.includes(skinId)) return false;
    this.d.heroes[heroId].skin = skinId;
    this.save.save();
    return true;
  }
  equip(slot: 'spray' | 'effect' | 'icon' | 'banner' | 'title', id: string) {
    if (!this.d.cosmetics.includes(id)) return false;
    if (slot === 'spray') this.d.equipped.spray = id;
    else if (slot === 'effect') this.d.equipped.effect = id;
    else this.d.profile[slot] = id;
    this.save.save();
    return true;
  }
  equipEmote(index: number, id: string) {
    if (!this.d.cosmetics.includes(id) || index < 0 || index > 3) return false;
    this.d.equipped.emotes[index] = id;
    this.save.save();
    return true;
  }
  skinOf(heroId: string) { return this.d.heroes[heroId]?.skin ?? `${heroId}_default`; }
  skins(heroId: string) { return skinsFor(heroId).map((s) => ({ data: s, owned: this.d.cosmetics.includes(s.id), equipped: this.skinOf(heroId) === s.id })); }
}

/** Palette for a hero + skin (render helper). */
export function resolvePalette(heroId: string, skinId?: string) {
  const base = getCharacter(heroId).palette;
  const s = skinId ? getCosmetic(skinId) : undefined;
  return { ...base, ...(s?.visual ?? {}) } as typeof base & { hat?: string };
}
