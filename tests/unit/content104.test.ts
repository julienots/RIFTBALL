import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { PLAYABLE, getCharacter } from '../../src/data/characters';
import { applyDamage } from '../../src/combat/Combat';
import { castAbility } from '../../src/abilities/AbilitySystem';
import { createMatch } from '../../src/gamemodes/MatchFactory';
import { runUntil, skipCountdown } from './helpers';

const duo = (a: string, b = 'magnet', mode: any = 'RIFTBALL') => {
  const m = new Match({ mode, arenaId: 'rift_valley', seed: 7, players: [{ heroId: a, name: 'A', team: 0, isBot: false, human: true }, { heroId: b, name: 'B', team: 1, isBot: false }] });
  skipCountdown(m);
  return m;
};

describe('v1.0.4 heroes', () => {
  it('has 21 playable heroes including 3 mythics, every one with a rarity', () => {
    expect(PLAYABLE.length).toBe(21);
    expect(PLAYABLE.filter((c) => c.rarity === 'MYTHIC').map((c) => c.id).sort()).toEqual(['chronos', 'riftborn', 'seraph']);
    for (const c of PLAYABLE) expect(c.rarity, c.id).toBeDefined();
  });

  it('every new ability / ult / gadget casts without errors', () => {
    for (const id of ['zip', 'grill', 'koko', 'luna', 'gear', 'chronos', 'seraph', 'riftborn']) {
      const m = duo(id, 'titan');
      const a = m.human!, b = m.heroes[1];
      b.x = a.x + 250; b.y = a.y;
      const ally = m.heroes.find((x) => x.team === 0 && x !== a);
      void ally;
      for (let i = 0; i < 30; i++) m.step(1 / 60); // build rewind history
      for (const ab of [a.def.ability, a.def.ultimate, a.def.gadget!]) {
        const ok = castAbility(m, a, ab, ab === a.def.ultimate, 1, 0, 250, ab === a.def.gadget);
        if (ab.effect !== 'ally_warp' && ab.effect !== 'rift_call') expect(ok, `${id}:${ab.effect}`).toBe(true);
        for (let i = 0; i < 90; i++) m.step(1 / 60);
      }
    }
  });

  it('ZIP snatch dash steals the Rift from its carrier', () => {
    const m = duo('zip', 'titan');
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 200; b.y = a.y;
    const r = m.mainRift()!;
    r.carrier = b.id; b.carrying = true; r.state = 'CARRIED';
    castAbility(m, a, a.def.ability, false, 1, 0, 0);
    runUntil(m, () => !a.dash, 2);
    expect(a.carrying).toBe(true);
    expect(r.carrier).toBe(a.id);
  });

  it('SERAPH revives once', () => {
    const m = duo('seraph', 'titan');
    const a = m.human!, b = m.heroes[1];
    applyDamage(m, a, 99999, b);
    expect(a.alive).toBe(true);
    expect(a.hp).toBeGreaterThan(a.maxHp * 0.4);
    m.time += 3;
    applyDamage(m, a, 99999, b);
    expect(a.alive).toBe(false);
  });

  it('CHRONOS rewinds position and time stop freezes enemies', () => {
    const m = duo('chronos', 'titan');
    const a = m.human!, b = m.heroes[1];
    const x0 = a.x;
    a.cmd.mx = 1;
    runUntil(m, () => false, 3.2);
    a.cmd.mx = 0;
    expect(a.x - x0).toBeGreaterThan(400);
    castAbility(m, a, a.def.ability, false, 1, 0, 0);
    expect(Math.abs(a.x - x0)).toBeLessThan(150);
    b.x = a.x + 300; b.y = a.y;
    castAbility(m, a, a.def.ultimate, true, 1, 0, 0);
    expect(b.stunUntil).toBeGreaterThan(m.time + 2);
  });

  it('LUNA eclipse silences enemies', () => {
    const m = duo('luna', 'titan');
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 300; b.y = a.y;
    castAbility(m, a, a.def.ultimate, true, 1, 0, 300);
    m.step(1 / 60);
    expect(b.silenceUntil).toBeGreaterThan(m.time);
    b.abCd = 0; b.cmd.ability = true; m.step(1 / 60);
    expect(b.stats.abilities).toBe(0);
  });

  it('GEAR turret shoots enemies, credits its owner and expires', () => {
    const m = duo('gear', 'titan');
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 420; b.y = a.y; b.def = { ...b.def, speed: 0 };
    castAbility(m, a, a.def.ability, false, 1, 0, 150);
    const t = m.heroes.find((x) => x.def.id === 'turret')!;
    expect(t).toBeDefined();
    runUntil(m, () => false, 3);
    expect(a.stats.damage).toBeGreaterThan(0);
    runUntil(m, () => false, 9);
    expect(t.alive).toBe(false);
  });

  it('RIFTBORN decoy explodes on enemy pickup and never scores', () => {
    const m = duo('riftborn', 'titan');
    const a = m.human!, b = m.heroes[1];
    castAbility(m, a, a.def.gadget!, false, 1, 0, 0, true);
    const d = m.rifts.find((r) => r.decoy)!;
    expect(d).toBeDefined();
    d.vx = d.vy = 0; b.x = d.x + 10; b.y = d.y;
    const hp = b.hp;
    m.step(1 / 60);
    expect(d.alive).toBe(false);
    expect(b.hp).toBeLessThan(hp);
    expect(b.carrying).toBe(false);
  });
});

describe('Boss & King', () => {
  it('boss director casts telegraphed attacks, changes phase and tracks boss damage per player', () => {
    const m = createMatch({ mode: 'RIFT_BOSS', arenaId: 'rift_valley', seed: 4, player: null, botLevel: 'HARD' });
    skipCountdown(m);
    const boss = m.heroes.find((h) => h.def.id === 'boss_golem')!;
    const seen = new Set<string>();
    let phases = 0, warns = 0;
    for (let i = 0; i < 60 * 90 && m.phase !== 'ended'; i++) {
      m.step(1 / 60);
      for (const e of m.events) { if (e.t === 'boss_attack') seen.add(e.name); if (e.t === 'boss_phase') phases++; }
      m.events.length = 0;
      warns = Math.max(warns, m.zones.filter((z) => z.active && z.kind === 'boss_warn').length);
      if (i === 60 * 30) applyDamage(m, boss, boss.maxHp * 0.5, m.heroes[0]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(phases).toBeGreaterThanOrEqual(1);
    expect(warns).toBeGreaterThan(0);
    const dmg = m.heroes.filter((h) => !h.pve).map((h) => h.stats.bossDamage);
    expect(Math.max(...dmg)).toBeGreaterThan(0);
  });

  it('RIFT KING scores while holding the Rift and ends at 60', () => {
    const m = duo('titan', 'magnet', 'RIFT_KING');
    const a = m.human!;
    const r = m.mainRift()!;
    r.x = a.x; r.y = a.y; r.state = 'ROAM';
    m.step(1 / 60); m.step(1 / 60);
    expect(a.carrying).toBe(true);
    expect(a.king).toBe(true);
    runUntil(m, () => false, 5.1);
    expect(m.score[0]).toBe(5);
    expect(a.stats.kingPoints).toBe(5);
    runUntil(m, () => m.phase === 'ended', 70);
    expect(m.result?.winner).toBe(0);
    expect(m.score[0]).toBe(60);
  });

  it('king mode bots play full matches without errors', () => {
    const m = createMatch({ mode: 'RIFT_KING', arenaId: 'crystal_canyon', seed: 9, player: null, botLevel: 'NORMAL' });
    runUntil(m, () => m.phase === 'ended', 400);
    expect(m.phase).toBe('ended');
    expect(Math.max(m.score[0], m.score[1])).toBeGreaterThan(5);
  });

  it('every hero (incl. new ones) works in a bot match', () => {
    for (const c of PLAYABLE.slice(13)) {
      const m = createMatch({ mode: 'RIFTBALL', arenaId: 'neon_docks', seed: 2, player: { heroId: c.id, name: 'P' }, botLevel: 'HARD' });
      const BB = (m.brains.values().next().value as any).constructor;
      m.brains.set(m.humanId, new BB(m, m.human, (m.brains.values().next().value as any).profile));
      runUntil(m, () => false, 60);
      expect(m.human!.stats.abilities + m.human!.stats.ults + m.human!.stats.gadgets, c.id).toBeGreaterThan(0);
    }
    expect(getCharacter('turret').hidden).toBe(true);
  });
});
