import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { createMatch } from '../../src/gamemodes/MatchFactory';
import { PLAYABLE } from '../../src/data/characters';
import { runUntil, skipCountdown } from './helpers';

const duo = (heroA = 'magnet', heroB = 'titan') => new Match({
  mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 1,
  players: [{ heroId: heroA, name: 'A', team: 0, isBot: false, human: true }, { heroId: heroB, name: 'B', team: 1, isBot: false }],
});

describe('Gameplay', () => {
  it('launches a 3v3 match with countdown then play', () => {
    const m = createMatch({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 3, player: { heroId: 'magnet', name: 'Me' }, botLevel: 'NORMAL' });
    expect(m.heroes.filter((h) => h.team === 0)).toHaveLength(3);
    expect(m.heroes.filter((h) => h.team === 1)).toHaveLength(3);
    expect(m.phase).toBe('countdown');
    expect(m.human?.name).toBe('Me');
    skipCountdown(m);
    expect(m.phase).toBe('play');
    expect(m.clock).toBeLessThanOrEqual(180);
  });

  it('moves a hero with commands and blocks walls', () => {
    const m = duo();
    skipCountdown(m);
    const h = m.human!;
    const x0 = h.x;
    h.cmd.mx = 1;
    runUntil(m, () => false, 1);
    expect(h.x).toBeGreaterThan(x0 + 150);
    // push into the top border: must stay inside the arena
    h.cmd.mx = 0; h.cmd.my = -1;
    runUntil(m, () => false, 6);
    expect(h.y).toBeGreaterThanOrEqual(h.radius - 0.01);
  });

  it('attacks spawn projectiles and deal damage', () => {
    const m = duo('magnet', 'titan');
    skipCountdown(m);
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 300; b.y = a.y; b.cmd.mx = 0;
    const hp0 = b.hp;
    a.cmd.attack = true;
    m.step(1 / 60);
    expect(m.projectiles.some((p) => p.active)).toBe(true);
    runUntil(m, () => b.hp < hp0, 2);
    expect(b.hp).toBeLessThan(hp0);
    expect(a.stats.damage).toBeGreaterThan(0);
    expect(a.ult).toBeGreaterThan(0);
  });

  it('every playable hero can attack, cast its ability and its ultimate', () => {
    for (const c of PLAYABLE) {
      const m = duo(c.id, 'titan');
      skipCountdown(m);
      const a = m.human!, b = m.heroes[1];
      b.x = a.x + 250; b.y = a.y;
      a.cmd.attack = true; m.step(1 / 60);
      expect(a.atkCd, c.id + ' attack').toBeGreaterThan(0);
      // the rift must be in range for MAGNET's pull
      const r = m.mainRift()!; r.x = a.x + 400; r.y = a.y;
      a.cmd.ability = true; m.step(1 / 60);
      expect(a.stats.abilities, c.id + ' ability').toBe(1);
      a.ult = 100; a.cmd.ult = true;
      runUntil(m, () => a.stats.ults === 1, 1); // queued while dashing
      expect(a.stats.ults, c.id + ' ult').toBe(1);
      expect(a.ult).toBe(0);
      runUntil(m, () => false, 3);
      for (const h of m.heroes) { expect(Number.isFinite(h.x) && Number.isFinite(h.y)).toBe(true); }
    }
  });

  it('ult cannot be used before 100%', () => {
    const m = duo();
    skipCountdown(m);
    const a = m.human!;
    a.ult = 60; a.cmd.ult = true; m.step(1 / 60);
    expect(a.stats.ults).toBe(0);
  });

  it('stun is limited in duration', () => {
    const m = duo('titan', 'magnet');
    skipCountdown(m);
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 120; b.y = a.y;
    a.ult = 100; a.cmd.ult = true; m.step(1 / 60);
    expect(b.stunUntil - m.time).toBeLessThanOrEqual(1.2 + 1e-6);
  });
});
