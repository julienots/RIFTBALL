import type { SaveSystem } from '../save/SaveSystem';
import { Rng, hashString } from '../core/Rng';
import { BOT_NAMES } from '../data/bots';
import { PLAYABLE } from '../data/characters';
import type { FriendsService } from '../friends/FriendsService';
import { currentSeason } from '../data/seasons';
import { Clock } from '../core/Time';

export type BoardScope = 'GLOBAL' | 'REGIONAL' | 'FRIENDS' | 'SEASON';
export interface BoardRow { rank: number; name: string; trophies: number; heroId: string; me: boolean; region: string; crew?: string }

const SUFFIX = ['', 'X', '_YT', 'Pro', '77', 'TV', 'Rift', 'King', 'Queen', '_FR', 'Zz', '99'];

/**
 * Leaderboards. Offline: deterministic simulated ladders around the player (clearly a preview).
 * Online: replace `fetchRemote` with the server API — the UI only consumes BoardRow[].
 */
export class LeaderboardService {
  constructor(private save: SaveSystem, private friends: FriendsService, public online: () => boolean) {}

  get(scope: BoardScope): BoardRow[] {
    const d = this.save.data;
    const me = { name: d.profile.name, trophies: scope === 'SEASON' ? this.seasonTrophies() : d.trophies, heroId: d.profile.favoriteHero, me: true, region: d.profile.region };
    let rows: Omit<BoardRow, 'rank'>[] = [];
    if (scope === 'FRIENDS') {
      rows = this.friends.list().map((f) => ({ name: f.name, trophies: f.trophies, heroId: f.heroId, me: false, region: 'EU' }));
    } else {
      const seed = hashString(scope + (scope === 'SEASON' ? currentSeason(Clock.now()).id : '') + (scope === 'REGIONAL' ? d.profile.region : ''));
      const rng = new Rng(seed);
      const n = scope === 'REGIONAL' ? 60 : 100;
      const top = scope === 'GLOBAL' ? 6200 : scope === 'SEASON' ? 2400 : 4800;
      for (let i = 0; i < n; i++) {
        const t = Math.round(top * Math.pow(1 - i / (n + 5), 1.6) + rng.range(-20, 20));
        rows.push({ name: rng.pick(BOT_NAMES) + rng.pick(SUFFIX) + (rng.chance(0.3) ? rng.int(1, 99) : ''), trophies: Math.max(0, t), heroId: rng.pick(PLAYABLE).id, me: false, region: scope === 'REGIONAL' ? d.profile.region : rng.pick(['EU', 'NA', 'SA', 'AS', 'OC', 'AF']) });
      }
    }
    rows.push(me);
    rows.sort((a, b) => b.trophies - a.trophies);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /** Season ladder uses trophies gained this season (approximation offline). */
  seasonTrophies() {
    const s = currentSeason(Clock.now());
    return this.save.data.matchHistory.filter((m) => m.at >= Date.parse(s.start)).reduce((a, m) => a + Math.max(0, m.trophies), 0);
  }
}
