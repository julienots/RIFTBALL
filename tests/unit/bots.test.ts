import { describe, it, expect } from 'vitest';
import { createMatch } from '../../src/gamemodes/MatchFactory';
import { runUntil } from './helpers';

describe('Bots', () => {
  it('move, fight, use abilities, capture and score', () => {
    const m = createMatch({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 11, player: null, botLevel: 'HARD' });
    const start = m.heroes.map((h) => [h.x, h.y]);
    let goals = 0, kills = 0, abilities = 0, captures = 0;
    for (let i = 0; i < 60 * 180 && m.phase !== 'ended'; i++) {
      m.step(1 / 60);
      for (const e of m.events) { if (e.t === 'goal') goals++; if (e.t === 'kill') kills++; if (e.t === 'ability') abilities++; if (e.t === 'capture') captures++; }
      m.events.length = 0;
    }
    expect(m.heroes.some((h, i) => Math.hypot(h.x - start[i][0], h.y - start[i][1]) > 100)).toBe(true);
    expect(kills).toBeGreaterThan(0);
    expect(abilities).toBeGreaterThan(5);
    expect(captures).toBeGreaterThan(3);
    expect(goals).toBeGreaterThan(0);
  });

  it('difficulty matters: experts beat easy bots most of the time', () => {
    let expertWins = 0;
    for (let s = 1; s <= 8; s++) {
      const m = createMatch({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: s * 7, player: null, botLevel: 'EASY', allyLevel: 'EXPERT' });
      runUntil(m, (x) => x.phase === 'ended', 300);
      if (m.result?.winner === 0) expertWins++;
    }
    expect(expertWins).toBeGreaterThanOrEqual(5);
  });

  it('boss and survival modes complete', () => {
    for (const mode of ['RIFT_BOSS', 'SURVIVAL'] as const) {
      const m = createMatch({ mode, arenaId: 'rift_valley', seed: 9, player: null, botLevel: 'HARD' });
      runUntil(m, (x) => x.phase === 'ended', 400);
      expect(m.phase).toBe('ended');
      expect(m.result).not.toBeNull();
    }
  });

  it('duel is 1v1', () => {
    const m = createMatch({ mode: 'RIFT_DUEL', arenaId: 'frozen_lab', seed: 2, player: { heroId: 'volt', name: 'me' }, botLevel: 'NORMAL' });
    expect(m.heroes).toHaveLength(2);
  });
});
