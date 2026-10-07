import { describe, it, expect } from 'vitest';
import { ARENAS } from '../../src/data/arenas';
import { Arena } from '../../src/arenas/Arena';

describe('Arenas', () => {
  for (const data of ARENAS) it(`${data.id}: Rift spawn, hero spawns and portal mouths are free`, () => {
    const a = new Arena(data);
    expect(a.pointBlocked(a.center.x, a.center.y, 40), 'center (Rift spawn)').toBe(false);
    for (const team of a.spawns) for (const s of team) expect(a.pointBlocked(s.x, s.y, 34), `spawn ${s.x},${s.y}`).toBe(false);
    for (const p of a.portals) expect(a.pointBlocked(p.team === 0 ? p.x + p.w + 40 : p.x - 40, p.y + p.h / 2, 30), 'portal mouth').toBe(false);
  });
});
