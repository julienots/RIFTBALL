import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory } from '../progression/Inventory';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import { Rng, hashString } from '../core/Rng';
import { BOT_NAMES } from '../data/bots';
import type { RewardItem } from '../data/types';
import { Clock, utcWeekIndex } from '../core/Time';

export interface Crew { id: string; name: string; tag: string; badge: string; members: number; trophies: number; minTrophies: number; description: string; color: string }
export interface CrewMessage { from: string; text: string; at: number; me?: boolean; system?: boolean }

const CREW_NAMES = ['Rift Raiders', 'Les Fulgurants', 'Nova Squad', 'Team Vortex', 'Les Aimants', 'Pixel Titans', 'Brume Noire', 'Les Volcans', 'Kiwi Gang', 'Orbitaux'];
const BADGES = ['⚡', '🔥', '🌀', '💎', '🛡️', '👑', '🐉', '🌙', '🍀', '🚀'];
const COLORS = ['#7b61ff', '#ff6b35', '#06d6a0', '#4cc9f0', '#ff3d7f', '#ffd166', '#9d4edd', '#ef476f', '#80ed99', '#118ab2'];
const CHAT_LINES = ['gg tout le monde !', 'qui pour un RIFT CHAOS ?', 'le mode Boss est trop bien', 'j\'ai eu Vortex hier 😎', 'on vise l\'objectif de la semaine', 'MAGNET est cheat avec son ulti', 'bien joué pour hier', 'je monte à 1000 trophées ce soir'];

export const CREW_GOALS: { id: string; text: string; target: number; reward: RewardItem[] }[] = [
  { id: 'goals', text: 'Marquer 150 points en crew', target: 150, reward: [{ kind: 'coins', amount: 500 }, { kind: 'passXp', amount: 500 }] },
  { id: 'wins', text: 'Gagner 60 parties en crew', target: 60, reward: [{ kind: 'coins', amount: 700 }, { kind: 'gems', amount: 10 }] },
];

/**
 * RIFT CREWS. Prototype simulates crews and members locally; the API surface (list/join/leave/chat/goals)
 * maps 1:1 to future server endpoints. Collective goals = sum of member contributions for the week.
 */
export class CrewService {
  chat: CrewMessage[] = [];
  constructor(private save: SaveSystem, private inv: Inventory, private notes: NotificationCenter) {}

  browse(): Crew[] {
    const rng = new Rng(hashString('crews-v1'));
    return CREW_NAMES.map((name, i) => ({
      id: 'crew' + i, name, tag: '#' + name.replace(/[^A-Z]/g, '').slice(0, 3) + (100 + i), badge: BADGES[i], members: rng.int(8, 29), trophies: rng.int(4000, 60000),
      minTrophies: [0, 0, 100, 200, 0, 400, 0, 600, 0, 150][i], description: rng.pick(['Crew chill et actif !', 'On joue tous les soirs.', 'Objectifs hebdo = obligatoires 💪', 'Débutants bienvenus.', 'Top 100 FR.']), color: COLORS[i],
    }));
  }

  get current(): Crew | null { const c = this.save.data.crew; return c ? this.browse().find((x) => x.id === c.id) ?? null : null; }

  join(id: string): { ok: boolean; error?: string } {
    const crew = this.browse().find((c) => c.id === id);
    if (!crew) return { ok: false, error: 'Crew introuvable' };
    if (this.save.data.trophies < crew.minTrophies) return { ok: false, error: `${crew.minTrophies} trophées requis` };
    if (crew.members >= 30) return { ok: false, error: 'Crew complet' };
    this.save.data.crew = { id, joinedAt: Date.now(), contribution: 0, claimed: [] };
    this.chat = [{ from: 'RIFT', text: `${this.save.data.profile.name} a rejoint le crew !`, at: Date.now(), system: true }];
    this.save.save();
    this.notes.push('crew', 'Crew rejoint', `Bienvenue chez ${crew.name} !`);
    return { ok: true };
  }

  leave() { this.save.data.crew = null; this.chat = []; this.save.save(); }

  members() {
    const c = this.current;
    if (!c) return [];
    const rng = new Rng(hashString(c.id));
    const list = [] as { name: string; trophies: number; role: string; online: boolean }[];
    for (let i = 0; i < Math.min(c.members, 12); i++) list.push({ name: rng.pick(BOT_NAMES) + (i + 1), trophies: rng.int(100, 3000), role: i === 0 ? 'Chef' : i < 3 ? 'Officier' : 'Membre', online: (hashString(c.id + i) + Math.floor(Clock.now() / 900_000)) % 3 === 0 });
    list.push({ name: this.save.data.profile.name, trophies: this.save.data.trophies, role: 'Membre', online: true });
    return list.sort((a, b) => b.trophies - a.trophies);
  }

  send(text: string) {
    const t = text.trim().slice(0, 140);
    if (!t || !this.current) return;
    this.chat.push({ from: this.save.data.profile.name, text: t, at: Date.now(), me: true });
    const m = this.members().filter((x) => x.name !== this.save.data.profile.name);
    setTimeout(() => { if (this.current && m.length) this.chat.push({ from: m[Math.floor(Math.random() * m.length)].name, text: CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)], at: Date.now() }); }, 1800);
  }

  /** Called after each match with the player's contribution. */
  contribute(goals: number, win: boolean) {
    const c = this.save.data.crew;
    if (!c) return;
    c.contribution += goals + (win ? 100 : 0); // encoded: wins*100 + goals
    this.save.save();
  }

  goals() {
    const c = this.save.data.crew;
    if (!c) return [];
    const week = utcWeekIndex();
    const rng = new Rng(hashString(c.id + ':' + week));
    const elapsed = ((Clock.now() / 86_400_000 + 3) % 7) / 7;
    const myGoals = c.contribution % 100, myWins = Math.floor(c.contribution / 100);
    const sim = { goals: Math.floor(rng.range(60, 140) * elapsed) + myGoals, wins: Math.floor(rng.range(25, 55) * elapsed) + myWins };
    return CREW_GOALS.map((g) => {
      const progress = Math.min(g.target, sim[g.id as 'goals' | 'wins']);
      return { ...g, progress, done: progress >= g.target, claimed: c.claimed.includes(`${g.id}@${week}`) };
    });
  }

  claim(goalId: string) {
    const c = this.save.data.crew;
    const g = this.goals().find((x) => x.id === goalId);
    if (!c || !g || !g.done || g.claimed) return null;
    c.claimed.push(`${g.id}@${utcWeekIndex()}`);
    return this.inv.grant(g.reward, { source: 'crew', txn: `crew:${c.id}:${g.id}:${utcWeekIndex()}`, verified: false });
  }
}
