import { describe, it, expect } from 'vitest';
import { createMatch } from '../../src/gamemodes/MatchFactory';
import { ARENAS } from '../../src/data/arenas';
import { MODES } from '../../src/data/modes';
import { makeApp } from './helpers';
import { emptyStats } from '../../src/game/entities';

const LONG = !!process.env.RIFT_LONG;

describe('Long runs (leaks, invariants, duplication)', () => {
  it('repeated matches across every mode/arena keep invariants', () => {
    const modes = MODES.filter((m) => m.id !== 'TUTORIAL');
    const rounds = LONG ? 6 : 1;
    let matches = 0;
    for (let round = 0; round < rounds; round++) for (const mode of modes) for (const arena of ARENAS) {
      const m = createMatch({ mode: mode.id, arenaId: arena.id, seed: 1000 + round * 97 + matches, player: null, botLevel: (['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const)[matches % 4] });
      const goalsByTeam = [0, 0];
      let maxProj = 0, maxZones = 0, maxHeroes = 0, maxRifts = 0;
      for (let i = 0; i < 60 * 420 && m.phase !== 'ended'; i++) {
        m.step(1 / 60);
        for (const e of m.events) if (e.t === 'goal' && m.mode.id !== 'RIFT_BOSS' && m.mode.id !== 'SURVIVAL') goalsByTeam[e.team] += 1;
        m.events.length = 0;
        if (i % 30 === 0) {
          maxProj = Math.max(maxProj, m.projectiles.length); maxZones = Math.max(maxZones, m.zones.length);
          maxHeroes = Math.max(maxHeroes, m.heroes.length); maxRifts = Math.max(maxRifts, m.rifts.length);
          for (const h of m.heroes) {
            expect(Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.hp)).toBe(true);
            if (h.alive) { expect(h.x).toBeGreaterThanOrEqual(0); expect(h.x).toBeLessThanOrEqual(m.arena.w); expect(h.hp).toBeLessThanOrEqual(h.maxHp + 1e-6); }
            expect(h.ult).toBeLessThanOrEqual(100);
          }
          const carriers = m.heroes.filter((h) => h.carrying).length;
          const carried = m.rifts.filter((r) => r.alive && r.carrier >= 0).length;
          expect(carriers).toBe(carried);
          for (const r of m.rifts) expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
        }
      }
      expect(m.phase, `${mode.id}/${arena.id} ended`).toBe('ended');
      if (m.mode.id !== 'RIFT_BOSS' && m.mode.id !== 'SURVIVAL') expect(goalsByTeam).toEqual(m.score);
      // pools stay bounded (no accumulation)
      expect(maxProj).toBeLessThan(120);
      expect(maxZones).toBeLessThan(40);
      expect(maxHeroes).toBeLessThan(40);
      expect(maxRifts).toBeLessThanOrEqual(5);
      matches++;
    }
    expect(matches).toBe(modes.length * ARENAS.length * rounds);
  }, 600000);

  it('repeated rewards never duplicate items or desync the economy', async () => {
    const { app } = makeApp();
    app.data.coins = 500000;
    for (let i = 0; i < (LONG ? 300 : 60); i++) {
      await app.progression.applyMatch({ matchId: 'lr' + i, mode: 'RIFTBALL', arena: 'rift_valley', heroId: 'magnet', outcome: i % 3 ? 'win' : 'loss', score: i % 3 ? [2, 1] : [0, 1], myTeam: 0, duration: 180, stats: { ...emptyStats(), goals: 1 }, mvp: false, ranked: true, mutationsSeen: 1, vsBots: true });
      if (i % 10 === 0) { app.shop.buyCrate('crate_small'); app.shop.openCrate('crate_small'); }
      app.pass.claimAll();
      for (const m of app.missions.active()) if (m.done && !m.claimed) app.missions.claim(m.data.id);
    }
    expect(new Set(app.data.cosmetics).size).toBe(app.data.cosmetics.length);
    expect(app.data.coins).toBeGreaterThanOrEqual(0);
    expect(app.data.gems).toBeGreaterThanOrEqual(0);
    expect(app.data.trophies).toBeGreaterThanOrEqual(0);
    app.save.writeNow();
  }, 120000);
});
