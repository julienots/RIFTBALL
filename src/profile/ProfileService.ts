import type { SaveSystem } from '../save/SaveSystem';

const BANNED = /(admin|moderat|support|staff|fuck|merde|pute|nazi)/i;

export class ProfileService {
  constructor(private save: SaveSystem) {}
  get p() { return this.save.data.profile; }

  /** Name rules: 3-14 chars, letters/digits/_ and no reserved words. Server re-validates online. */
  setName(name: string): { ok: boolean; error?: string } {
    const n = name.trim();
    if (n.length < 3 || n.length > 14) return { ok: false, error: 'Entre 3 et 14 caractères.' };
    if (!/^[\p{L}\p{N}_ .-]+$/u.test(n)) return { ok: false, error: 'Caractères non autorisés.' };
    if (BANNED.test(n)) return { ok: false, error: 'Ce nom n\'est pas autorisé.' };
    this.p.name = n;
    this.save.save();
    return { ok: true };
  }
  setFavorite(heroId: string) { this.p.favoriteHero = heroId; this.save.save(); }

  summary() {
    const d = this.save.data;
    const fav = Object.entries(d.heroes).sort((a, b) => b[1].matches - a[1].matches)[0];
    return {
      name: d.profile.name, level: d.level, trophies: d.trophies, best: d.bestTrophies, stats: d.stats,
      mostPlayed: fav && fav[1].matches > 0 ? fav[0] : d.profile.favoriteHero,
      skins: d.cosmetics.filter((c) => c.includes('_') && !c.endsWith('_default') && !c.startsWith('emote') && !c.startsWith('spray') && !c.startsWith('fx') && !c.startsWith('banner') && !c.startsWith('title') && !c.startsWith('icon')).length,
      winRate: d.stats.matches ? Math.round((d.stats.wins / d.stats.matches) * 100) : 0,
    };
  }
}
