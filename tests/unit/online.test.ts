import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { GameServer } from '../../server/src/GameServer';
import { PROTOCOL_VERSION, applySnapshot, MirrorState, type ServerMsg } from '../../src/networking/Protocol';
import { Match } from '../../src/game/Match';

const srv = http.createServer();
let game: GameServer;
const ready = new Promise<number>((res) => srv.listen(0, () => { game = new GameServer(srv, { queueWaitMs: 400, log: () => {} }); res((srv.address() as any).port); }));
afterAll(() => { game.close(); srv.close(); });

function client(port: number, playerId: string) {
  const ws = new WebSocket(`ws://localhost:${port}/v1/play`);
  const msgs: ServerMsg[] = [];
  const waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as ServerMsg;
    msgs.push(m);
    for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.res(m); }
  };
  const wait = <T extends ServerMsg['t']>(t: T, timeout = 8000) => new Promise<Extract<ServerMsg, { t: T }>>((res, rej) => {
    const found = msgs.find((m) => m.t === t);
    if (found) { msgs.splice(msgs.indexOf(found), 1); return res(found as any); }
    waiters.push({ pred: (m) => m.t === t, res: res as any });
    setTimeout(() => rej(new Error('timeout ' + t)), timeout);
  });
  const opened = new Promise<void>((r) => (ws.onopen = () => r()));
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, msgs, wait, opened, send, hello: async (name: string) => { await opened; send({ t: 'hello', v: PROTOCOL_VERSION, playerId, name, trophies: 100 }); return wait('welcome'); } };
}

describe('Online multiplayer', () => {
  it('private matches: players sharing a code play together, others are not mixed in', async () => {
    const port = await ready;
    const a = client(port, 'pv1'), b = client(port, 'pv2'), o = client(port, 'pv3');
    await a.hello('Ami1'); await b.hello('Ami2'); await o.hello('Inconnu');
    o.send({ t: 'queue', mode: 'RIFT_DUEL', heroId: 'blink', skinId: 'blink_default', code: 'ZZZZZ' });
    a.send({ t: 'queue', mode: 'RIFT_DUEL', heroId: 'magnet', skinId: 'magnet_default', code: 'abc12' });
    b.send({ t: 'queue', mode: 'RIFT_DUEL', heroId: 'titan', skinId: 'titan_default', code: 'ABC12' });
    const fa = await a.wait('found'), fb = await b.wait('found');
    expect(fa.matchId).toBe(fb.matchId);
    expect(fa.private).toBe(true);
    expect(fa.roster.filter((r) => !r.isBot).map((r) => r.name).sort()).toEqual(['Ami1', 'Ami2']);
    const q = await o.wait('queue');
    expect(q.code).toBe('ZZZZZ');
    a.ws.close(); b.ws.close(); o.ws.close();
  }, 15000);

  it('matches two real players together in RIFT DUEL and streams the authoritative match', async () => {
    const port = await ready;
    const a = client(port, 'pa'), b = client(port, 'pb');
    await a.hello('Alice'); await b.hello('Bob');
    a.send({ t: 'queue', mode: 'RIFT_DUEL', heroId: 'magnet', skinId: 'magnet_default' });
    b.send({ t: 'queue', mode: 'RIFT_DUEL', heroId: 'titan', skinId: 'titan_default' });
    const fa = await a.wait('found'), fb = await b.wait('found');
    expect(fa.matchId).toBe(fb.matchId);
    expect(fa.roster.filter((r) => !r.isBot)).toHaveLength(2);
    expect(fa.roster.filter((r) => r.isBot)).toHaveLength(0);
    expect(fa.you).not.toBe(fb.you);
    // mirror the match on client A and move after kickoff
    const mirror = new Match({ mode: fa.mode, arenaId: fa.arenaId, seed: fa.seed, players: fa.roster.map((r) => ({ heroId: r.heroId, name: r.name, team: r.team, isBot: false, human: r.heroEntityId === fa.you })) });
    const st = new MirrorState();
    let snap = await a.wait('snap');
    applySnapshot(mirror, snap.s, st, -1);
    const me0 = mirror.heroById(fa.you)!;
    const x0 = me0.x;
    await new Promise((r) => setTimeout(r, 4800)); // online kickoff countdown (4.5 s)
    for (let i = 1; i <= 30; i++) { a.send({ t: 'in', s: i, mx: me0.team === 0 ? 1 : -1, my: 0 }); await new Promise((r) => setTimeout(r, 33)); }
    a.msgs.length = 0;
    snap = await a.wait('snap');
    applySnapshot(mirror, snap.s, st, -1);
    expect(Math.abs(mirror.heroById(fa.you)!.x - x0)).toBeGreaterThan(150);
    expect(snap.s.ack).toBeGreaterThan(20);
    expect(mirror.phase).toBe('play');
    a.ws.close(); b.ws.close();
  }, 20000);

  it('fills the match with bots when no other player is available', async () => {
    const port = await ready;
    const c = client(port, 'solo');
    await c.hello('Solo');
    c.send({ t: 'queue', mode: 'RIFTBALL', heroId: 'volt', skinId: 'volt_default' });
    const f = await c.wait('found');
    expect(f.roster).toHaveLength(6);
    expect(f.roster.filter((r) => r.isBot)).toHaveLength(5);
    expect(f.roster.find((r) => r.heroEntityId === f.you)?.isBot).toBe(false);
    c.ws.close();
  }, 10000);

  it('a disconnected player is replaced by a bot; quitting counts as a loss', async () => {
    const port = await ready;
    const c = client(port, 'quitter');
    await c.hello('Quit');
    c.send({ t: 'queue', mode: 'RIFTBALL', heroId: 'blink', skinId: 'blink_default' });
    const f = await c.wait('found');
    c.send({ t: 'leave' });
    await new Promise((r) => setTimeout(r, 100));
    expect(game.outcomeFor(f.matchId, 'quitter')).toBe('loss');
    c.ws.close();
  }, 10000);
});
