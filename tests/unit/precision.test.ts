import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { aimAssist, autoAimTarget, performAttack, updateProjectiles } from '../../src/combat/Combat';
import { skipCountdown } from './helpers';

const duo = (a: string, b = 'titan') => {
  const m = new Match({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 3, players: [{ heroId: a, name: 'A', team: 0, isBot: false, human: true }, { heroId: b, name: 'B', team: 1, isBot: false }] });
  skipCountdown(m);
  const h = m.human!, e = m.heroes[1];
  h.x = 1500; h.y = 650; e.x = 1900; e.y = 650; // open centre lane
  for (const w of m.arena.walls) if (!w.border && w.x < 2100 && w.x + w.w > 1300 && w.y < 720 && w.y + w.h > 580) { w.x = -9999; }
  return { m, h, e };
};

describe('v1.0.9 attack precision', () => {
  it('auto-aim leads a moving target', () => {
    const { m, h, e } = duo('magnet');
    e.vy = 300;
    const a = autoAimTarget(m, h)!;
    expect(a.target).toBe(e);
    expect(a.ay).toBeGreaterThan(0.1); // aims ahead of the target, not at it
  });

  it('fast bolts cannot tunnel through targets (swept collision)', () => {
    const { m, h, e } = duo('nova');
    e.x = h.x + 300;
    const hp = e.hp;
    performAttack(m, h, 1, 0, 0);
    // one huge step that jumps over the target
    for (const p of m.projectiles) if (p.active) { p.vx *= 20; }
    updateProjectiles(m, 1 / 60);
    expect(e.hp).toBeLessThan(hp);
  });

  it('projectiles stop exactly at their max range', () => {
    const { m, h, e } = duo('magnet');
    e.x = 100; e.y = 100;
    performAttack(m, h, 1, 0, 0);
    const p = m.projectiles.find((x) => x.active)!;
    const sx = p.sx;
    for (let i = 0; i < 120 && p.active; i++) { const lastX = p.x; updateProjectiles(m, 1 / 60); if (!p.active) expect(lastX - sx).toBeLessThanOrEqual(h.def.attack.range + 0.5); }
    expect(p.x - sx).toBeGreaterThan(h.def.attack.range - 1);
    expect(p.x - sx).toBeLessThanOrEqual(h.def.attack.range + 0.5);
  });

  it('manual aim a few degrees off snaps onto the enemy', () => {
    const { m, h, e } = duo('magnet');
    const off = 0.08;
    const r = aimAssist(m, h, Math.cos(off), Math.sin(off));
    expect(r.target).toBe(e);
    expect(Math.abs(r.ay)).toBeLessThan(0.01);
    const far = aimAssist(m, h, Math.cos(0.6), Math.sin(0.6));
    expect(far.target).toBeNull();
  });

  it('melee always hits point-blank enemies, even slightly behind', () => {
    const { m, h, e } = duo('titan', 'magnet');
    e.x = h.x - 20; e.y = h.y + 30;
    const hp = e.hp;
    performAttack(m, h, 1, 0, 0);
    expect(e.hp).toBeLessThan(hp);
  });

  it('bolt attacks apply their slow', () => {
    const { m, h, e } = duo('luna');
    if (!h.def.attack.slow) return;
    performAttack(m, h, 1, 0, 0);
    for (let i = 0; i < 60; i++) updateProjectiles(m, 1 / 60);
    expect(e.slowUntil).toBeGreaterThan(m.time);
  });
});
