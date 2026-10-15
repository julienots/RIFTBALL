import { describe, it, expect } from 'vitest';
import { Match } from '../../src/game/Match';
import { castAbility } from '../../src/abilities/AbilitySystem';
import { applyDamage } from '../../src/combat/Combat';
import { SEASONS, currentSeason } from '../../src/data/seasons';
import { COSMETICS, getCosmetic } from '../../src/data/cosmetics';
import { getArena } from '../../src/data/arenas';
import { skipCountdown } from './helpers';

const duo = (a: string, b = 'titan') => {
  const m = new Match({ mode: 'RIFTBALL', arenaId: 'fiesta_plaza', seed: 7, players: [{ heroId: a, name: 'A', team: 0, isBot: false, human: true }, { heroId: b, name: 'B', team: 1, isBot: false }] });
  skipCountdown(m);
  return m;
};

describe('v1.0.8 RIFT FIESTA', () => {
  it('season 2 is RIFT FIESTA with VIBE, a dance pass and the fiesta lobby', () => {
    const s2 = currentSeason(Date.parse('2026-11-01T00:00:00Z'));
    expect(s2.id).toBe('s2');
    expect(s2.name).toBe('RIFT FIESTA');
    expect(s2.lobby?.particle).toBe('fiesta');
    expect(s2.rewards[0].free).toEqual({ kind: 'hero', id: 'vibe' });
    // every cosmetic referenced by every season pass exists
    for (const s of SEASONS) for (const r of s.rewards) for (const it of [r.free, r.premium, r.plus]) if (it?.kind === 'cosmetic' && !it.id.startsWith('pass_')) expect(getCosmetic(it.id), `${s.id}:${it.id}`).toBeDefined();
    // seasons are contiguous
    for (let i = 1; i < SEASONS.length; i++) expect(SEASONS[i].start).toBe(SEASONS[i - 1].end);
  });

  it('dance emotes exist, groove is free', () => {
    const dances = COSMETICS.filter((c) => c.visual.dance);
    expect(dances.map((d) => d.visual.dance).sort()).toEqual(['disco', 'floss', 'groove', 'robot']);
    expect(getCosmetic('dance_groove')!.source).toBe('default');
  });

  it('VIBE bass drop damages, knocks back and makes the carrier drop the Rift', () => {
    const m = duo('vibe');
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 150; b.y = a.y;
    const r = m.mainRift()!; r.carrier = b.id; b.carrying = true;
    const hp = b.hp;
    expect(castAbility(m, a, a.def.ability, false, 1, 0, 0)).toBe(true);
    m.step(1 / 60);
    expect(b.hp).toBeLessThan(hp);
    expect(b.carrying).toBeFalsy();
  });

  it('VIBE dance floor heals allies and slows enemies; groove stacks speed', () => {
    const m = duo('vibe');
    const a = m.human!, b = m.heroes[1];
    b.x = a.x + 100; b.y = a.y;
    a.hp = a.maxHp * 0.5;
    castAbility(m, a, a.def.ultimate, true, 1, 0, 0);
    for (let i = 0; i < 90; i++) m.step(1 / 60);
    expect(a.hp).toBeGreaterThan(a.maxHp * 0.5);
    expect(b.slowUntil).toBeGreaterThan(m.time);
    applyDamage(m, b, 10, a, {});
    expect(a.speedBuff).toBeGreaterThan(0);
  });

  it('fiesta plaza exists and keeps the centre lane clear of jump pads', () => {
    const ar = getArena('fiesta_plaza');
    expect(ar.id).toBe('fiesta_plaza');
    for (const h of ar.hazards) if (h.kind === 'jump') expect(Math.abs(h.rect[1] + h.rect[3] / 2 - 650)).toBeGreaterThan(300);
  });
});
