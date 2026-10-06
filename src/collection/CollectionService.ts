import type { SaveSystem } from '../save/SaveSystem';
import { COSMETICS } from '../data/cosmetics';
import { PLAYABLE } from '../data/characters';
import type { CosmeticType } from '../data/types';

export type CollectionCategory = 'hero' | CosmeticType;

export class CollectionService {
  constructor(private save: SaveSystem) {}

  totals() {
    const d = this.save.data;
    const heroes = PLAYABLE.length, heroesOwned = PLAYABLE.filter((c) => d.heroes[c.id]?.unlocked).length;
    const cos = COSMETICS.length, cosOwned = COSMETICS.filter((c) => d.cosmetics.includes(c.id)).length;
    return { owned: heroesOwned + cosOwned, total: heroes + cos };
  }

  byCategory(cat: CollectionCategory) {
    const d = this.save.data;
    if (cat === 'hero') return PLAYABLE.map((c) => ({ id: c.id, name: c.name, owned: !!d.heroes[c.id]?.unlocked }));
    return COSMETICS.filter((c) => c.type === cat).map((c) => ({ id: c.id, name: c.name, owned: d.cosmetics.includes(c.id), data: c }));
  }

  categoryCounts() {
    const cats: CollectionCategory[] = ['hero', 'skin', 'emote', 'spray', 'effect', 'banner', 'title', 'icon'];
    return cats.map((c) => { const l = this.byCategory(c); return { cat: c, owned: l.filter((x) => x.owned).length, total: l.length }; });
  }
}
