import type { ModeId } from '../data/types';

/**
 * PLAYER -> QUEUE -> MATCHMAKING -> 3V3
 * LocalMatchmaker fills the lobby with bots (offline / no backend). RemoteMatchmaker will talk to the
 * server queue (websocket) and fall back to bots after a timeout.
 */
export interface QueueTicket { mode: ModeId; heroId: string; trophies: number; partyIds: string[] }
export interface MatchFound { matchId: string; seed: number; arenaId: string; vsBots: boolean; botLevelOffset: number }

export interface Matchmaker {
  join(ticket: QueueTicket, onProgress: (found: number, needed: number) => void, signal: { cancelled: boolean }): Promise<MatchFound | null>;
}

export class LocalMatchmaker implements Matchmaker {
  constructor(private pickArena: (mode: ModeId) => string) {}
  async join(t: QueueTicket, onProgress: (found: number, needed: number) => void, signal: { cancelled: boolean }): Promise<MatchFound | null> {
    const needed = t.mode === 'RIFT_DUEL' ? 2 : t.mode === 'RIFT_BOSS' || t.mode === 'SURVIVAL' ? 3 : 6;
    let found = 1 + t.partyIds.length;
    onProgress(found, needed);
    while (found < needed) {
      await new Promise((r) => setTimeout(r, 180 + Math.random() * 380));
      if (signal.cancelled) return null;
      found++;
      onProgress(found, needed);
    }
    await new Promise((r) => setTimeout(r, 250));
    if (signal.cancelled) return null;
    const seed = (Math.random() * 2 ** 31) | 0;
    return { matchId: `local-${Date.now()}-${seed}`, seed, arenaId: this.pickArena(t.mode), vsBots: true, botLevelOffset: 0 };
  }
}
