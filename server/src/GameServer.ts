import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { Match, type PlayerSlot } from '../../src/game/Match';
import { getMode } from '../../src/data/modes';
import { EventService } from '../../src/events/EventService';
import { ARENAS } from '../../src/data/arenas';
import { PLAYABLE, getCharacter } from '../../src/data/characters';
import { BOT_NAMES, BOT_PROFILES, botProfileForTrophies } from '../../src/data/bots';
import { BotBrain } from '../../src/bots/BotBrain';
import { encodeSnapshot, PROTOCOL_VERSION, type ClientMsg, type RosterSlot, type ServerMsg } from '../../src/networking/Protocol';
import type { BotProfile, ModeId, TeamId } from '../../src/data/types';
import type { MatchEvent } from '../../src/game/entities';
import { SIM_DT } from '../../src/core/config';

/**
 * Authoritative online game server.
 *  PLAYER -> QUEUE (per mode) -> MATCHMAKING (wait for humans up to QUEUE_WAIT, then fill with bots) -> ROOM
 * Each room runs the deterministic Match at 60 Hz and streams 20 Hz snapshots. Disconnected players are
 * replaced by a bot (and can reconnect to their match with the same playerId).
 */
export interface GameServerOptions { queueWaitMs?: number; tickMs?: number; log?: (...a: unknown[]) => void }

interface Client {
  ws: WebSocket;
  playerId: string;
  name: string;
  trophies: number;
  room: Room | null;
  heroEntityId: number;
  queued: { mode: ModeId; heroId: string; skinId: string; since: number; botLevel?: string } | null;
  lastSeq: number;
  alive: boolean;
}

interface Room {
  id: string;
  match: Match;
  clients: Map<string, Client>;   // playerId -> client (still connected or not)
  humanHeroes: Map<string, number>; // playerId -> hero entity id
  pending: MatchEvent[];
  stepCount: number;
  ended: boolean;
  createdAt: number;
}

const DUEL_OR_PVE = (m: ModeId) => m === 'RIFT_DUEL' ? 2 : m === 'RIFT_BOSS' || m === 'SURVIVAL' ? 3 : 6;

export class GameServer {
  private events = new EventService();
  readonly wss: WebSocketServer;
  private clients = new Set<Client>();
  private rooms = new Map<string, Room>();
  private byPlayer = new Map<string, Client>();
  private queueWait: number;
  private timer: NodeJS.Timeout;
  private qTimer: NodeJS.Timeout;
  private last = performance.now();
  private acc = 0;
  /** results of finished online matches, used to validate reward reports */
  readonly results = new Map<string, { winner: number; score: [number, number]; players: Record<string, TeamId> }>();
  private log: (...a: unknown[]) => void;

  constructor(server: Server, o: GameServerOptions = {}) {
    this.queueWait = o.queueWaitMs ?? 8000;
    this.log = o.log ?? ((...a) => console.log('[game]', ...a));
    this.wss = new WebSocketServer({ server, path: '/v1/play', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.timer = setInterval(() => this.tick(), o.tickMs ?? 8);
    this.qTimer = setInterval(() => this.matchmake(), 250);
  }

  /** Players who quit a running match: the match counts as a loss for them. */
  readonly forfeits = new Set<string>();

  /** Authoritative outcome of an online match for a player (null = unknown / still running). */
  outcomeFor(matchId: string, playerId: string): 'win' | 'loss' | 'draw' | null {
    if (this.forfeits.has(matchId + ':' + playerId)) return 'loss';
    const res = this.results.get(matchId);
    if (!res || !(playerId in res.players)) return null;
    const team = res.players[playerId];
    return res.winner === -1 ? 'draw' : res.winner === team ? 'win' : 'loss';
  }

  get onlineCount() { return this.clients.size; }
  get roomCount() { return this.rooms.size; }

  close() { clearInterval(this.timer); clearInterval(this.qTimer); for (const c of this.clients) c.ws.terminate(); this.wss.close(); }

  private send(c: Client, msg: ServerMsg) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg)); }

  private onConnection(ws: WebSocket) {
    const c: Client = { ws, playerId: '', name: 'Joueur', trophies: 0, room: null, heroEntityId: -1, queued: null, lastSeq: 0, alive: true };
    this.clients.add(c);
    ws.on('pong', () => (c.alive = true));
    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      try { this.onMessage(c, msg); } catch (e) { this.log('message error', e); }
    });
    ws.on('close', () => this.onClose(c));
  }

  private onMessage(c: Client, msg: ClientMsg) {
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) { this.send(c, { t: 'error', msg: 'Version du jeu obsolète, mettez à jour.' }); return; }
        c.playerId = String(msg.playerId).slice(0, 64);
        c.name = String(msg.name).replace(/[<>]/g, '').slice(0, 14) || 'Joueur';
        c.trophies = Math.max(0, Math.min(100000, Number(msg.trophies) || 0));
        const prev = this.byPlayer.get(c.playerId);
        this.byPlayer.set(c.playerId, c);
        this.send(c, { t: 'welcome', v: PROTOCOL_VERSION, online: this.clients.size });
        // reconnect into a running match
        if (prev && prev !== c && prev.room && !prev.room.ended) this.rejoin(c, prev.room);
        return;
      }
      case 'queue': {
        if (!c.playerId || c.room) return;
        if (!getCharacter(msg.heroId) || getCharacter(msg.heroId).hidden) return;
        c.queued = { mode: msg.mode, heroId: msg.heroId, skinId: String(msg.skinId).slice(0, 40), since: Date.now(), botLevel: msg.botLevel };
        this.matchmake();
        return;
      }
      case 'cancel': c.queued = null; return;
      case 'in': {
        const h = c.room?.match.heroById(c.heroEntityId);
        if (!h) return;
        if (msg.s > c.lastSeq) c.lastSeq = msg.s;
        h.cmd.mx = clamp1(msg.mx); h.cmd.my = clamp1(msg.my);
        return;
      }
      case 'act': {
        const h = c.room?.match.heroById(c.heroEntityId);
        if (!h) return;
        const l = Math.hypot(msg.ax, msg.ay);
        h.cmd.aimX = l > 0 ? msg.ax / l : 0; h.cmd.aimY = l > 0 ? msg.ay / l : 0;
        h.cmd.aimDist = Math.max(0, Math.min(2000, Number(msg.ad) || 0));
        if (msg.slot === 'attack') h.cmd.attack = true; else if (msg.slot === 'ability') h.cmd.ability = true; else if (msg.slot === 'ult') h.cmd.ult = true; else if (msg.slot === 'gadget') h.cmd.gadget = true; else if (msg.slot === 'roll') h.cmd.roll = true;
        return;
      }
      case 'emote': if (c.room) c.room.pending.push({ t: 'emote', hero: c.heroEntityId, emote: String(msg.e).slice(0, 8) }); return;
      case 'leave': this.leaveRoom(c); return;
      case 'ping': this.send(c, { t: 'pong', c: msg.c }); return;
    }
  }

  private onClose(c: Client) {
    this.clients.delete(c);
    c.queued = null;
    if (this.byPlayer.get(c.playerId) === c) this.byPlayer.delete(c.playerId);
    if (c.room) this.botTakeover(c.room, c);
  }

  private botTakeover(room: Room, c: Client) {
    const h = room.match.heroById(c.heroEntityId);
    if (h && !room.ended && !room.match.brains.has(h.id)) {
      h.isBot = true;
      h.cmd.mx = h.cmd.my = 0;
      room.match.brains.set(h.id, new BotBrain(room.match, h, BOT_PROFILES.NORMAL));
    }
  }

  private leaveRoom(c: Client) {
    if (!c.room) return;
    if (!c.room.ended && c.room.match.mode.ranked) { this.forfeits.add(c.room.id + ':' + c.playerId); if (this.forfeits.size > 20000) this.forfeits.clear(); }
    this.botTakeover(c.room, c);
    c.room.clients.delete(c.playerId);
    c.room = null;
  }

  private rejoin(c: Client, room: Room) {
    const heroId = room.humanHeroes.get(c.playerId);
    if (heroId === undefined) return;
    const h = room.match.heroById(heroId);
    if (!h) return;
    room.match.brains.delete(h.id);
    h.isBot = false;
    c.room = room; c.heroEntityId = heroId;
    room.clients.set(c.playerId, c);
    this.send(c, { t: 'found', matchId: room.id, mode: room.match.mode.id, arenaId: room.match.arena.data.id, seed: room.match.opts.seed, roster: rosterOf(room.match, room), you: heroId });
  }

  // ------------------------------------------------------------------ matchmaking

  private matchmake() {
    const byMode = new Map<ModeId, Client[]>();
    for (const c of this.clients) if (c.queued && !c.room && c.ws.readyState === WebSocket.OPEN) {
      const l = byMode.get(c.queued.mode) ?? [];
      l.push(c); byMode.set(c.queued.mode, l);
    }
    const now = Date.now();
    for (const [mode, list] of byMode) {
      list.sort((a, b) => a.queued!.since - b.queued!.since);
      const needed = DUEL_OR_PVE(mode);
      const humansMax = mode === 'RIFT_BOSS' || mode === 'SURVIVAL' ? 3 : needed;
      while (list.length) {
        const oldest = list[0];
        const waited = now - oldest.queued!.since;
        // humans of similar skill first (trophy window grows with waiting time)
        const window = 200 + waited / 20;
        const group = list.filter((c) => Math.abs(c.trophies - oldest.trophies) <= window).slice(0, humansMax);
        if (group.length >= humansMax || waited >= this.queueWait) {
          for (const g of group) list.splice(list.indexOf(g), 1);
          this.createRoom(mode, group);
        } else {
          for (const c of list) this.send(c, { t: 'queue', found: list.length, humans: list.length, needed, waitLeft: Math.max(0, this.queueWait - (now - c.queued!.since)), online: this.clients.size });
          break;
        }
      }
    }
  }

  private createRoom(mode: ModeId, humans: Client[]) {
    const md = getMode(mode);
    const seed = (Math.random() * 2 ** 31) | 0;
    const arenaId = ARENAS[Math.floor(Math.random() * ARENAS.length)].id;
    const avgTrophies = humans.reduce((a, c) => a + c.trophies, 0) / Math.max(1, humans.length);
    const manual = humans.length === 1 ? humans[0].queued?.botLevel : undefined;
    const botLevel = (manual && manual in BOT_PROFILES ? manual : botProfileForTrophies(avgTrophies)) as BotProfile['id'];
    const pveRed = mode === 'RIFT_BOSS' || mode === 'SURVIVAL';
    const players: PlayerSlot[] = [];
    const used = new Set<string>();
    // spread humans over both teams (except PvE)
    humans.forEach((c, i) => {
      const team: TeamId = pveRed ? 0 : (i % 2) as TeamId;
      players.push({ heroId: c.queued!.heroId, name: c.name, team, isBot: false, skinId: c.queued!.skinId });
      used.add(c.queued!.heroId);
    });
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (const team of [0, 1] as TeamId[]) {
      if (team === 1 && pveRed) continue;
      const have = players.filter((p) => p.team === team).length;
      for (let i = have; i < md.teamSize; i++) {
        const free = PLAYABLE.filter((c) => !used.has(c.id));
        const pick = (free.length ? free : PLAYABLE)[Math.floor(Math.random() * (free.length || PLAYABLE.length))];
        used.add(pick.id);
        players.push({ heroId: pick.id, name: names.pop() ?? 'Bot', team, isBot: true, botLevel });
      }
    }
    // live events also change the rules online (speed, ult charge, bonuses, damage)
    const match = new Match({ mode, arenaId, seed, players, modifiers: this.events.modifiers() });
    match.phaseUntil = 4.5; // a bit longer kickoff countdown online (lobby -> loading)
    const id = `online-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const room: Room = { id, match, clients: new Map(), humanHeroes: new Map(), pending: [], stepCount: 0, ended: false, createdAt: Date.now() };
    // hero entity ids follow the players[] order (Match assigns ids 1..n)
    humans.forEach((c, i) => {
      const heroEntityId = i + 1;
      c.room = room; c.heroEntityId = heroEntityId; c.queued = null; c.lastSeq = 0;
      room.clients.set(c.playerId, c);
      room.humanHeroes.set(c.playerId, heroEntityId);
    });
    this.rooms.set(id, room);
    const roster = rosterOf(match, room, humans);
    for (const c of humans) this.send(c, { t: 'found', matchId: id, mode, arenaId, seed, roster, you: c.heroEntityId });
    this.log(`room ${id} ${mode} humans=${humans.length} bots=${players.length - humans.length} arena=${arenaId}`);
  }

  // ------------------------------------------------------------------ simulation

  private tick() {
    const now = performance.now();
    this.acc += Math.min(250, now - this.last);
    this.last = now;
    let steps = 0;
    while (this.acc >= SIM_DT * 1000 && steps < 8) {
      this.acc -= SIM_DT * 1000;
      steps++;
      for (const room of this.rooms.values()) this.stepRoom(room);
    }
  }

  private stepRoom(room: Room) {
    const m = room.match;
    if (room.ended) return;
    m.step(SIM_DT);
    room.pending.push(...m.events);
    m.events.length = 0;
    for (const h of m.heroes) if (!h.isBot) { h.cmd.attack = h.cmd.ability = h.cmd.ult = h.cmd.gadget = h.cmd.roll = false; }
    room.stepCount++;
    if (room.stepCount % 3 === 0 || m.phase === 'ended') {
      const ev = room.pending;
      room.pending = [];
      for (const c of room.clients.values()) this.send(c, { t: 'snap', s: encodeSnapshot(m, ev, c.lastSeq) });
    }
    if (m.phase === 'ended' && m.result) {
      room.ended = true;
      const stats: Record<number, any> = {};
      for (const h of m.heroes) stats[h.id] = h.stats;
      const players: Record<string, TeamId> = {};
      for (const [pid, hid] of room.humanHeroes) { const h = m.heroById(hid); if (h) players[pid] = h.team; }
      this.results.set(room.id, { winner: m.result.winner, score: m.result.score, players });
      if (this.results.size > 5000) this.results.delete(this.results.keys().next().value!);
      for (const c of room.clients.values()) { this.send(c, { t: 'end', result: m.result, stats }); c.room = null; }
      this.rooms.delete(room.id);
    }
    // safety: abandon empty rooms
    if (room.clients.size === 0 && !room.ended) { room.ended = true; this.rooms.delete(room.id); }
  }
}

function clamp1(v: number) { v = Number(v) || 0; return v > 1 ? 1 : v < -1 ? -1 : v; }

function rosterOf(match: Match, room: Room, humans?: Client[]): RosterSlot[] {
  const humanIds = new Map<number, number>();
  for (const [, hid] of room.humanHeroes) humanIds.set(hid, 1);
  return match.heroes.filter((h) => !h.pve).map((h, i) => ({
    slot: i, heroId: h.def.id, skinId: h.skinId, name: h.name, team: h.team, isBot: !humanIds.has(h.id), heroEntityId: h.id,
    trophies: humans?.find((c) => c.heroEntityId === h.id)?.trophies ?? 0,
  }));
}
