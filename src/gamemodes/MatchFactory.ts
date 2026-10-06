import { Match, type PlayerSlot } from '../game/Match';
import { getMode } from '../data/modes';
import { PLAYABLE } from '../data/characters';
import { BOT_NAMES } from '../data/bots';
import type { BotProfile, EventModifiers, ModeId, TeamId } from '../data/types';
import { Rng } from '../core/Rng';

export interface QuickMatchConfig {
  mode: ModeId;
  arenaId: string;
  seed: number;
  /** null = all-bot match (tests, attract mode) */
  player: { heroId: string; name: string; skinId?: string } | null;
  botLevel: BotProfile['id'];
  allyLevel?: BotProfile['id'];
  allowedBotHeroes?: string[];
  modifiers?: EventModifiers;
  friends?: { heroId: string; name: string }[];
}

/** Builds rosters (fills empty slots with bots) — this is the "matchmaking result" for offline play. */
export function createMatch(cfg: QuickMatchConfig): Match {
  const mode = getMode(cfg.mode);
  const rng = new Rng(cfg.seed ^ 0x9e3779b9);
  const pool = (cfg.allowedBotHeroes ?? PLAYABLE.map((c) => c.id)).slice();
  const names = rng.shuffle(BOT_NAMES.slice());
  const players: PlayerSlot[] = [];
  const used = new Set<string>();
  const pickHero = () => {
    const free = pool.filter((p) => !used.has(p));
    const id = rng.pick(free.length ? free : pool);
    used.add(id);
    return id;
  };
  if (cfg.player) {
    players.push({ heroId: cfg.player.heroId, name: cfg.player.name, team: 0, isBot: false, human: true, skinId: cfg.player.skinId });
    used.add(cfg.player.heroId);
  }
  const pveRed = mode.id === 'RIFT_BOSS' || mode.id === 'SURVIVAL' || mode.id === 'TUTORIAL';
  for (const team of [0, 1] as TeamId[]) {
    if (team === 1 && pveRed) continue;
    const have = players.filter((p) => p.team === team).length;
    for (let i = have; i < mode.teamSize; i++) {
      const friend = team === 0 ? cfg.friends?.shift() : undefined;
      const heroId = friend?.heroId ?? pickHero();
      used.add(heroId);
      players.push({ heroId, name: friend?.name ?? names.pop() ?? 'Bot', team, isBot: true, botLevel: team === 0 ? cfg.allyLevel ?? cfg.botLevel : cfg.botLevel });
    }
  }
  return new Match({ mode: cfg.mode, arenaId: cfg.arenaId, seed: cfg.seed, players, modifiers: cfg.modifiers });
}
