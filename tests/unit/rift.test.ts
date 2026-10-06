import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { runUntil, skipCountdown } from './helpers';
import { applyDamage } from '../../src/combat/Combat';

const duo = () => new Match({
  mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 5,
  players: [{ heroId: 'blink', name: 'A', team: 0, isBot: false, human: true }, { heroId: 'titan', name: 'B', team: 1, isBot: false }],
});

describe('Rift', () => {
  it('spawns idle at the center and starts roaming at kickoff', () => {
    const m = duo();
    const r = m.mainRift()!;
    expect(r.state).toBe('IDLE');
    expect(Math.abs(r.x - m.arena.center.x)).toBeLessThan(1);
    skipCountdown(m); m.step(1 / 60);
    expect(['ROAM', 'FLEE', 'CHASE']).toContain(r.state);
  });

  it('is captured on contact, slows the carrier, and drops on death', () => {
    const m = duo();
    skipCountdown(m);
    const a = m.human!, r = m.mainRift()!;
    a.x = r.x - 20; a.y = r.y;
    m.step(1 / 60);
    expect(r.state).toBe('CARRIED');
    expect(r.carrier).toBe(a.id);
    expect(a.carrying).toBe(true);
    // carrier slowed
    a.cmd.mx = 1; runUntil(m, () => false, 1);
    expect(Math.hypot(a.vx, a.vy)).toBeLessThan(a.def.speed * 0.9);
    applyDamage(m, a, 999999, m.heroes[1]);
    expect(a.alive).toBe(false);
    expect(r.carrier).toBe(-1);
    expect(r.state).toBe('DROPPED');
  });

  it('scores when carried into the enemy portal and resets to center', () => {
    const m = duo();
    skipCountdown(m);
    const a = m.human!, r = m.mainRift()!;
    a.x = r.x; a.y = r.y; m.step(1 / 60);
    expect(a.carrying).toBe(true);
    const p = m.arena.enemyPortal(0);
    a.x = p.x + p.w / 2; a.y = p.y + p.h / 2; a.facing = 0;
    m.step(1 / 60);
    expect(m.score).toEqual([1, 0]);
    expect(r.state).toBe('PORTAL');
    expect(m.phase).toBe('goal');
    runUntil(m, (x) => x.phase === 'play', 8);
    expect(Math.abs(r.x - m.arena.center.x)).toBeLessThan(80);
  });

  it('a free rift drifting into a portal without recent touch does not score', () => {
    const m = duo();
    skipCountdown(m);
    const r = m.mainRift()!;
    const p = m.arena.portals[1];
    r.x = p.x + p.w / 2; r.y = p.y + p.h / 2; r.lastTouchTeam = -1;
    m.step(1 / 60);
    expect(m.score).toEqual([0, 0]);
  });

  it('a thrown rift scores and can be intercepted', () => {
    const m = duo();
    skipCountdown(m);
    const a = m.human!, b = m.heroes[1], r = m.mainRift()!;
    a.x = r.x; a.y = r.y; m.step(1 / 60);
    b.x = a.x + 220; b.y = a.y; b.cmd.mx = 0;
    a.cmd.aimX = 1; a.cmd.aimY = 0; a.cmd.attack = true;
    runUntil(m, () => r.carrier === b.id, 1);
    expect(r.carrier).toBe(b.id);
    expect(b.stats.interceptions).toBe(1);
  });

  it('mutations trigger, change rules and end', () => {
    const m = duo();
    skipCountdown(m);
    m.mutations.trigger('CLONE');
    runUntil(m, (x) => x.mutation === 'CLONE', 4);
    expect(m.mutation).toBe('CLONE');
    expect(m.rifts.filter((r) => r.clone).length).toBe(3);
    runUntil(m, (x) => x.mutation === 'NORMAL', 30);
    expect(m.mutation).toBe('NORMAL');
    for (const id of ['FURY', 'ELECTRIC', 'GRAVITY', 'PORTAL', 'PHASE', 'CHAOS'] as const) {
      m.mutations.trigger(id);
      runUntil(m, (x) => x.mutation === id, 4);
      expect(m.mutation).toBe(id);
      runUntil(m, (x) => x.mutation === 'NORMAL', 30);
    }
    // temp geometry is cleaned up
    m.step(1 / 60);
    expect(m.arena.hazards.filter((h) => h.temporary)).toHaveLength(0);
    expect(m.arena.walls.filter((w) => w.dynamic)).toHaveLength(0);
  });

  it('sudden death on tie, next goal wins', () => {
    const m = duo();
    skipCountdown(m);
    m.clock = 0.05;
    runUntil(m, (x) => x.overtime, 1);
    expect(m.overtime).toBe(true);
    expect(m.phase).toBe('overtime');
    const a = m.human!, r = m.mainRift()!;
    a.x = r.x; a.y = r.y; m.step(1 / 60);
    const p = m.arena.enemyPortal(0);
    a.x = p.x + p.w / 2; a.y = p.y + p.h / 2;
    m.step(1 / 60);
    expect(m.phase).toBe('ended');
    expect(m.result?.winner).toBe(0);
  });
});
