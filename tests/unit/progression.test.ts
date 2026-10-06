import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers';
import type { MatchReport } from '../../src/networking/Authority';
import { emptyStats } from '../../src/game/entities';
import { ECONOMY } from '../../src/data/progression';

let seq = 0;
const report = (o: Partial<MatchReport> = {}): MatchReport => ({
  matchId: 'm' + seq++, mode: 'RIFTBALL', arena: 'rift_valley', heroId: 'magnet', outcome: 'win', score: [3, 1], myTeam: 0,
  duration: 180, stats: { ...emptyStats(), goals: 2, kills: 3, abilities: 5 }, mvp: true, ranked: true, mutationsSeen: 2, vsBots: true, ...o,
});

describe('Progression', () => {
  it('grants XP, levels up and pays level rewards', async () => {
    const { app } = makeApp();
    const coins0 = app.data.coins;
    for (let i = 0; i < 6; i++) await app.progression.applyMatch(report());
    expect(app.data.level).toBeGreaterThan(1);
    expect(app.data.coins).toBeGreaterThan(coins0);
  });

  it('trophies go up on wins, never below zero, and are not affected by unranked modes', async () => {
    const { app } = makeApp();
    const r1 = await app.progression.applyMatch(report());
    expect(r1.trophies).toBe(ECONOMY.trophyDelta(0, 'win'));
    const r2 = await app.progression.applyMatch(report({ outcome: 'loss', score: [0, 2] }));
    expect(r2.trophies).toBe(0); // protected below 100
    expect(app.data.trophies).toBeGreaterThanOrEqual(0);
    const t = app.data.trophies;
    await app.progression.applyMatch(report({ mode: 'RIFT_BOSS', ranked: false }));
    expect(app.data.trophies).toBe(t);
  });

  it('rejects duplicate and implausible reports (no reward duplication)', async () => {
    const { app } = makeApp();
    const r = report();
    const a = await app.progression.applyMatch(r);
    const b = await app.progression.applyMatch(r);
    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(false);
    const c = await app.progression.applyMatch(report({ stats: { ...emptyStats(), goals: 999 } }));
    expect(c.accepted).toBe(false);
    const d = await app.progression.applyMatch(report({ outcome: 'win', score: [0, 3] }));
    expect(d.accepted).toBe(false);
    expect(app.data.stats.matches).toBe(1);
  });

  it('mastery levels up per hero', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 10; i++) await app.progression.applyMatch(report({ heroId: 'titan' }));
    expect(app.data.heroes.titan.masteryLevel).toBeGreaterThan(1);
    expect(app.data.heroes.magnet.masteryLevel).toBe(1);
  });

  it('trophy road unlocks heroes for free', async () => {
    const { app } = makeApp();
    expect(app.inventory.hasHero('block')).toBe(false);
    app.data.trophies = app.data.bestTrophies = 65;
    app.progression.checkTrophyRoad();
    expect(app.inventory.hasHero('block')).toBe(true);
    // idempotent
    const coins = app.data.coins;
    app.progression.checkTrophyRoad();
    expect(app.data.coins).toBe(coins);
  });

  it('daily match coins are capped', async () => {
    const { app } = makeApp();
    let total = 0;
    for (let i = 0; i < 40; i++) total += (await app.progression.applyMatch(report())).coins;
    expect(total).toBeLessThanOrEqual(ECONOMY.dailyMatchCoinCap);
  });

  it('missions progress from matches and can be claimed once', async () => {
    const { app } = makeApp();
    const daily = app.missions.active().filter((m) => m.data.scope === 'daily');
    expect(daily).toHaveLength(3);
    for (let i = 0; i < 12; i++) await app.progression.applyMatch(report({ stats: { ...emptyStats(), goals: 2, kills: 3, abilities: 5, ults: 1, captures: 2, throws: 2 } }));
    const done = app.missions.active().filter((m) => m.done && m.data.scope === 'daily');
    expect(done.length).toBeGreaterThan(0);
    const id = done[0].data.id;
    expect(app.missions.claim(id)).not.toBeNull();
    expect(app.missions.claim(id)).toBeNull();
  });
});
