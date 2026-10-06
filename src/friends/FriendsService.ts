import type { SaveSystem } from '../save/SaveSystem';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import { Rng, hashString } from '../core/Rng';
import { BOT_NAMES } from '../data/bots';
import { PLAYABLE } from '../data/characters';
import { Clock } from '../core/Time';

export interface Friend { id: string; name: string; trophies: number; heroId: string; status: 'online' | 'in_match' | 'offline'; lastSeen: number }

/**
 * Friends. Prototype mode simulates a friend list (deterministic per player) with live-ish statuses;
 * the interface matches what a real social backend will provide (list / invite / accept / party invite).
 */
export class FriendsService {
  constructor(private save: SaveSystem, private notes: NotificationCenter) {}

  list(): Friend[] {
    const d = this.save.data;
    const rng = new Rng(hashString('friends:' + d.playerId));
    const base: Friend[] = [];
    const names = rng.shuffle(BOT_NAMES.slice());
    for (let i = 0; i < 6; i++) base.push(this.mk('f' + i, names[i], rng, d.trophies));
    for (const id of d.friends.added) base.push(this.mk(id, id.replace(/^req:/, ''), new Rng(hashString(id)), d.trophies));
    return base;
  }

  private mk(id: string, name: string, rng: Rng, around: number): Friend {
    const slot = Math.floor(Clock.now() / 600_000) + hashString(id);
    const st = slot % 5;
    return { id, name, trophies: Math.max(0, Math.round(around + rng.range(-250, 400))), heroId: rng.pick(PLAYABLE).id, status: st === 0 || st === 3 ? 'online' : st === 1 ? 'in_match' : 'offline', lastSeen: Clock.now() - (st === 2 || st === 4 ? rng.int(5, 600) * 60_000 : 0) };
  }

  suggestions() {
    const d = this.save.data;
    return d.recentPlayers.filter((r) => !d.friends.added.includes('req:' + r.name)).slice(-8).reverse();
  }

  /** Sends an invite; in the prototype the other side "accepts" after a short delay. */
  invite(name: string) {
    const d = this.save.data;
    const id = 'req:' + name;
    if (d.friends.added.includes(id) || d.friends.invitesSent.includes(id)) return false;
    d.friends.invitesSent.push(id);
    this.save.save();
    setTimeout(() => {
      d.friends.invitesSent = d.friends.invitesSent.filter((x) => x !== id);
      if (!d.friends.added.includes(id)) d.friends.added.push(id);
      this.save.save();
      this.notes.push('friend', 'Invitation acceptée', `${name} est maintenant votre ami(e).`);
    }, 2500);
    return true;
  }

  remove(id: string) { this.save.data.friends.added = this.save.data.friends.added.filter((x) => x !== id); this.save.save(); }

  recordRecent(players: { name: string; heroId: string; trophies: number }[]) {
    const d = this.save.data;
    for (const p of players) d.recentPlayers.push({ ...p, at: Date.now() });
    d.recentPlayers = d.recentPlayers.slice(-20);
    this.save.save();
  }
}
