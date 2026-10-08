import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { applyDamage, COMBAT } from '../../src/combat/Combat';
import { SEASONS, SEASON_RANKS, rankFor } from '../../src/data/seasons';
import { EVENTS } from '../../src/data/events';
import { MISSIONS } from '../../src/data/missions';
import { getCosmetic } from '../../src/data/cosmetics';
import { Clock } from '../../src/core/Time';
import { makeApp, runUntil, skipCountdown } from './helpers';

const duo = (a = 'magnet', b = 'titan', modifiers = {}) => {
  const m = new Match({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: 3, modifiers, players: [{ heroId: a, name: 'A', team: 0, isBot: false, human: true }, { heroId: b, name: 'B', team: 1, isBot: false }] });
  skipCountdown(m);
  return m;
};

describe('Combat mechanics', () => {
  it('3 consecutive basic hits trigger a COMBO bonus', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    b.facing = Math.PI; b.x = a.x + 200; b.y = a.y; a.facing = 0; // face to face: no backstab
    const d1 = applyDamage(m, b, 300, a, { attack: true });
    applyDamage(m, b, 300, a, { attack: true });
    const d3 = applyDamage(m, b, 300, a, { attack: true });
    expect(d3).toBeGreaterThan(d1 * 1.2);
    expect(b.slowUntil).toBeGreaterThan(m.time);
  });

  it('hitting from behind deals bonus damage', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 200; b.y = a.y;
    b.facing = Math.PI; const front = applyDamage(m, b, 300, a, { attack: true });
    a.comboCount = 0;
    b.facing = 0; const back = applyDamage(m, b, 300, a, { attack: true });
    expect(back).toBeGreaterThan(front);
  });

  it('rolling through a hit is a PERFECT DODGE (ult + empowered next hit)', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    a.ult = 0;
    a.cmd.mx = 1; a.cmd.roll = true; m.step(1 / 60);
    expect(applyDamage(m, a, 500, b)).toBe(0);
    expect(a.ult).toBeGreaterThanOrEqual(COMBAT.perfectUlt);
    expect(a.dmgMulNext).toBeGreaterThan(1);
  });

  it('a hard knockback into a wall stuns (WALL SLAM)', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    const w = m.arena.walls.find((q) => !q.border && !q.dynamic)!;
    b.x = w.x - b.radius - 5; b.y = w.y + w.h / 2; b.kx = 1200; b.ky = 0; b.lastHitBy = a.id;
    let slam = false;
    for (let i = 0; i < 20; i++) { m.step(1 / 60); if (m.events.some((e) => e.t === 'wall_slam')) slam = true; m.events.length = 0; }
    expect(slam).toBe(true);
    expect(b.stunUntil).toBeGreaterThan(m.time - 0.4);
  });

  it('taking damage charges the ultimate a little', () => {
    const m = duo();
    const a = m.human!, b = m.heroes[1];
    b.ult = 0; applyDamage(m, b, 2000, a);
    expect(b.ult).toBeGreaterThan(3);
  });

  it('event modifiers change gameplay (speed, damage)', () => {
    const fast = duo('magnet', 'titan', { heroSpeedMul: 1.5, damageMul: 1.4 });
    const slow = duo();
    for (const m of [fast, slow]) { m.human!.cmd.mx = 1; runUntil(m, () => false, 1); }
    expect(fast.human!.x).toBeGreaterThan(slow.human!.x + 50);
    expect(applyDamage(fast, fast.heroes[1], 1000, fast.human!)).toBeGreaterThan(applyDamage(slow, slow.heroes[1], 1000, slow.human!));
  });
});

describe('Seasons & events', () => {
  it('every season pass and event reward references an existing cosmetic', () => {
    for (const s of SEASONS) {
      expect(s.rewards.length, s.id).toBe(30);
      for (const r of s.rewards) for (const it of [r.free, r.premium, r.plus]) if (it?.kind === 'cosmetic') expect(getCosmetic(it.id), `${s.id}:${it.id}`).toBeDefined();
      for (const e of s.events) expect(EVENTS.find((x) => x.id === e), e).toBeDefined();
    }
    for (const ms of MISSIONS) for (const it of ms.reward) if (it.kind === 'cosmetic') expect(getCosmetic(it.id), it.id).toBeDefined();
    for (const r of SEASON_RANKS) for (const it of r.reward) if (it.kind === 'cosmetic') expect(getCosmetic(it.id)).toBeDefined();
    // seasons are contiguous
    for (let i = 1; i < SEASONS.length; i++) expect(SEASONS[i].start).toBe(SEASONS[i - 1].end);
  });

  it('season end grants rank rewards once and soft-resets trophies', () => {
    const real = Clock.now;
    try {
      (Clock as any).now = () => Date.parse('2026-11-20T00:00:00Z');
      const { app } = makeApp();
      app.seasons.check();
      app.data.trophies = 2000; app.seasons.check();
      expect(app.seasons.rank.id).toBe('diamond');
      const gems = app.data.gems;
      (Clock as any).now = () => Date.parse('2026-12-02T00:00:00Z');
      const end = app.seasons.check()!;
      expect(end.rank).toBe('diamond');
      expect(app.data.trophies).toBe(1500);
      expect(app.data.gems).toBeGreaterThan(gems);
      expect(app.seasons.current.id).toBe('s2');
      expect(app.seasons.check()).toBeNull(); // only once
      expect(app.seasons.takePendingEnd()?.seasonId).toBe('s1');
      expect(rankFor(0).id).toBe('bronze');
    } finally { (Clock as any).now = real; }
  });

  it('the mythic trial event lets players use every hero', () => {
    const real = Clock.now;
    try {
      const { app } = makeApp();
      const trial = EVENTS.find((e) => e.id === 'mythic_trial')!;
      // find a day inside the trial window
      let t = Date.parse('2026-10-08T00:00:00Z');
      while (!app.events.isActive('mythic_trial', t)) t += 6 * 3600e3;
      (Clock as any).now = () => t;
      expect(app.events.modifiers().allHeroes).toBe(true);
      void trial;
    } finally { (Clock as any).now = real; }
  });
});
