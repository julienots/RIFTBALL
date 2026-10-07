import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { PLAYABLE } from '../../src/data/characters';
import { applyDamage } from '../../src/combat/Combat';
import { runUntil, skipCountdown } from './helpers';

const duo = (a = 'magnet', b = 'titan', arenaId = 'rift_valley') => {
  const m = new Match({ mode: 'RIFTBALL', arenaId, seed: 3, players: [{ heroId: a, name: 'A', team: 0, isBot: false, human: true }, { heroId: b, name: 'B', team: 1, isBot: false }] });
  skipCountdown(m);
  return m;
};

describe('New mechanics', () => {
  it('bigger maps', () => {
    const m = duo();
    expect(m.arena.w).toBeGreaterThan(3000);
    expect(new Match({ mode: 'RIFTBALL', arenaId: 'sky_temple', seed: 1, players: [] }).arena.w).toBeGreaterThan(3400);
  });

  it('dodge roll moves fast and grants invulnerability frames, with a cooldown', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    const x0 = a.x;
    a.cmd.mx = 1; a.cmd.roll = true;
    m.step(1 / 60);
    expect(a.dash?.kind).toBe('roll');
    expect(applyDamage(m, a, 500, b)).toBe(0);
    runUntil(m, () => !a.dash, 1);
    expect(a.x - x0).toBeGreaterThan(250);
    a.cmd.roll = true; m.step(1 / 60);
    expect(a.dash).toBeNull(); // still on cooldown
  });

  it('every hero has a unique gadget with 3 charges', () => {
    for (const c of PLAYABLE) {
      expect(c.gadget, c.id).toBeDefined();
      const m = duo(c.id, 'magnet');
      const a = m.human!, b = m.heroes[1];
      b.x = a.x + 260; b.y = a.y;
      const r = m.mainRift()!; r.x = a.x + 300; r.y = a.y + 150; r.state = 'ROAM';
      expect(a.gadgetCharges).toBe(3);
      a.cmd.gadget = true; m.step(1 / 60);
      expect(a.gadgetCharges, c.id + ' gadget').toBe(2);
      runUntil(m, () => false, 2.2);
      for (const h of m.heroes) expect(Number.isFinite(h.x) && Number.isFinite(h.y)).toBe(true);
    }
  });

  it('power-ups spawn on altars and apply when picked', () => {
    const m = duo();
    runUntil(m, (x) => x.pickups.some((p) => p.alive), 20);
    const p = m.pickups.find((q) => q.alive)!;
    expect(p).toBeDefined();
    const a = m.human!;
    a.x = p.x; a.y = p.y;
    runUntil(m, () => !p.alive, 1);
    expect(p.alive).toBe(false);
  });

  it('crates can be destroyed and may drop power-ups', () => {
    const m = duo();
    const crates = m.arena.walls.filter((w) => w.crate);
    expect(crates.length).toBeGreaterThan(0);
    for (const c of crates) c.hp = 0;
    m.step(1 / 60);
    expect(m.arena.walls.filter((w) => w.crate)).toHaveLength(0);
    expect(m.pickups.length).toBeGreaterThan(0);
  });

  it('jump pads launch heroes to the paired pad', () => {
    const m = duo('magnet', 'titan', 'crystal_canyon');
    const pad = m.arena.hazards.find((h) => h.kind === 'jump')!;
    const a = m.human!;
    a.x = pad.x + pad.w / 2; a.y = pad.y + pad.h / 2;
    m.step(1 / 60);
    expect(a.leap).not.toBeNull();
    runUntil(m, () => !a.leap, 2);
    const other = m.arena.hazards.find((h) => h.kind === 'jump' && h !== pad && h.pair === pad.pair)!;
    expect(Math.hypot(a.x - (other.x + other.w / 2), a.y - (other.y + other.h / 2))).toBeLessThan(60);
  });

  it('holding the Rift 8 s overcharges it: the goal is worth 2', () => {
    const m = duo();
    const a = m.human!, r = m.mainRift()!;
    a.x = r.x; a.y = r.y; m.step(1 / 60);
    expect(a.carrying).toBe(true);
    m.heroes[1].x = 100; m.heroes[1].y = 100;
    runUntil(m, () => r.charged, 9);
    expect(r.charged).toBe(true);
    const p = m.arena.enemyPortal(0);
    a.x = p.x + p.w / 2; a.y = p.y + p.h / 2;
    m.step(1 / 60);
    expect(m.score[0]).toBe(2);
  });

  it('a 3-kill streak puts a bounty that rewards the killer', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    a.streak = 3;
    const ult0 = b.ult;
    applyDamage(m, a, 1e9, b);
    expect(b.ult).toBeGreaterThanOrEqual(ult0 + 40);
    expect(a.streak).toBe(0);
  });
});
