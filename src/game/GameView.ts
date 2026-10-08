import type { App } from '../core/App';
import type { WorldRenderer } from './render/WorldRenderer';
import type { UIManager } from '../ui/UIManager';
import { Match } from './Match';
import { createMatch } from '../gamemodes/MatchFactory';
import { Input } from './Input';
import { HUD } from '../ui/HUD';
import { audio, type MusicTrack } from '../audio/AudioEngine';
import { SIM_DT } from '../core/config';
import type { MatchEvent } from './entities';
import type { BotProfile, ModeId } from '../data/types';
import type { MatchReport } from '../networking/Authority';
import { getArena } from '../data/arenas';
import { haptic } from '../core/Haptics';
import { h } from '../ui/dom';
import type { OnlineClient } from '../networking/OnlineClient';
import { applySnapshot, MirrorState, type RosterSlot, type ServerMsg, type Snapshot } from '../networking/Protocol';
import type { PlayerSlot } from './Match';

export interface SessionConfig {
  mode: ModeId;
  arenaId: string;
  seed: number;
  matchId: string;
  heroId: string;
  skinId: string;
  botLevel: BotProfile['id'];
  allyLevel?: BotProfile['id'];
  friends?: { heroId: string; name: string }[];
  vsBots: boolean;
  /** manual bot difficulty = training match (no trophies) */
  training?: boolean;
  /** custom match factory (tutorial) */
  build?: () => Match;
  /** online match: the server simulates, this client mirrors snapshots */
  online?: { client: OnlineClient; roster: RosterSlot[]; you: number };
}

export interface SessionEnd { match: Match; report: MatchReport; forfeit: boolean }

/** One playable match: simulation + 3D view + HUD + controls + audio. */
export class GameSession {
  readonly match: Match;
  readonly hud: HUD;
  readonly input: Input;
  private acc = 0;
  paused = false;
  private endTimer = -1;
  private ended = false;
  private mutationsSeen = 0;
  onEnd: (e: SessionEnd) => void = () => {};
  onFrame: ((dt: number) => void) | null = null;
  private stepsThisSecond = 0;
  simRate = 60;
  private rateT = 0;

  constructor(private app: App, private r: WorldRenderer, private ui: UIManager, readonly cfg: SessionConfig, portrait: string) {
    const d = app.data;
    this.match = cfg.online ? GameSession.mirrorMatch(cfg) : cfg.build ? cfg.build() : createMatch({
      mode: cfg.mode, arenaId: cfg.arenaId, seed: cfg.seed,
      player: { heroId: cfg.heroId, name: d.profile.name, skinId: cfg.skinId },
      botLevel: cfg.botLevel, allyLevel: cfg.allyLevel, modifiers: app.events.modifiers(), friends: cfg.friends ? [...cfg.friends] : undefined,
    });
    const me = this.match.human;
    r.setMatch(this.match, me?.team ?? 0, this.match.humanId);
    this.hud = new HUD(this.match, r, portrait, d.equipped.emotes);
    ui.root.appendChild(this.hud.el);
    this.input = new Input(this.hud.ctrl, this.hud.joyBase, this.hud.joyKnob, this.hud.btn);
    this.input.screenToWorldDir = (sx, sy) => {
      const me = this.match.human;
      if (!me) return null;
      const p = this.r.screenToGround(sx, sy);
      if (!p) return null;
      const dx = p.x - me.x, dy = p.y - me.y, dd = Math.hypot(dx, dy) || 1;
      return { x: dx / dd, y: dy / dd, dist: dd };
    };
    this.hud.onPause = () => this.openPause();
    this.hud.onEmote = (glyph) => { if (cfg.online) cfg.online.client.send({ t: 'emote', e: glyph }); else this.match.emit({ t: 'emote', hero: this.match.humanId, emote: glyph }); };
    if (cfg.online) this.offNet = cfg.online.client.on((msg) => this.onNet(msg));
    this.input.onEmote = () => this.match.emit({ t: 'emote', hero: this.match.humanId, emote: '🤝' });
    const music = getArena(cfg.arenaId).music as MusicTrack;
    audio.playMusic(music);
    app.analytics.track('match_start', { mode: cfg.mode, arena: cfg.arenaId, hero: cfg.heroId });
  }

  // ------------------------------------------------------------------ online
  private offNet: (() => void) | null = null;
  private mirror = new MirrorState();
  private seq = 0;
  private sendT = 0;
  private lastSent = { mx: 9, my: 9 };
  private history: { seq: number; x: number; y: number }[] = [];
  private snaps: Snapshot[] = [];
  disconnected = false;

  static mirrorMatch(cfg: SessionConfig): Match {
    const o = cfg.online!;
    const players: PlayerSlot[] = o.roster.slice().sort((a, b) => a.heroEntityId - b.heroEntityId)
      .map((r) => ({ heroId: r.heroId, name: r.name, team: r.team, isBot: false, skinId: r.skinId, human: r.heroEntityId === o.you }));
    const m = new Match({ mode: cfg.mode, arenaId: cfg.arenaId, seed: cfg.seed, players });
    m.brains.clear();
    m.humanId = o.you;
    return m;
  }

  private onNet(msg: ServerMsg) {
    if (msg.t === 'snap') this.snaps.push(msg.s);
    else if (msg.t === 'end') {
      const m = this.match;
      const me = m.human;
      if (me && msg.stats[me.id]) me.stats = msg.stats[me.id];
      for (const hh of m.heroes) if (msg.stats[hh.id]) hh.stats = msg.stats[hh.id];
      m.result = msg.result; m.score = [msg.result.score[0], msg.result.score[1]]; m.phase = 'ended';
    } else if (msg.t === 'error' && msg.msg === 'disconnected' && !this.ended && this.match.phase !== 'ended') {
      this.disconnected = true;
      this.hud.showAnnounce('CONNEXION PERDUE', 'Un bot a pris le relais de votre héros', '#ff6b7a', 2500);
      setTimeout(() => this.forfeit(), 2500);
    }
  }

  private updateOnline(dt: number) {
    const m = this.match, o = this.cfg.online!, me = m.human;
    // 1) inputs -> server (movement 30 Hz, actions immediately)
    if (me) {
      this.input.apply(me.cmd, { attack: me.def.attack.range, ability: Math.max(me.def.ability.range, 300), ult: Math.max(me.def.ultimate.range, 300) });
      const c = me.cmd;
      for (const slot of ['attack', 'ability', 'ult', 'gadget', 'roll'] as const) if (c[slot]) { o.client.send({ t: 'act', s: this.seq, slot, ax: c.aimX, ay: c.aimY, ad: c.aimDist }); c[slot] = false; if (slot === 'attack') me.anim.attackT = 0.22; }
      c.aimX = c.aimY = c.aimDist = 0;
      this.sendT -= dt;
      if (this.sendT <= 0 || Math.abs(c.mx - this.lastSent.mx) > 0.2 || Math.abs(c.my - this.lastSent.my) > 0.2) {
        this.sendT = 1 / 30;
        this.seq++;
        o.client.send({ t: 'in', s: this.seq, mx: Math.round(c.mx * 100) / 100, my: Math.round(c.my * 100) / 100 });
        this.lastSent = { mx: c.mx, my: c.my };
        this.history.push({ seq: this.seq, x: me.x, y: me.y });
        if (this.history.length > 120) this.history.shift();
      }
      // 2) client-side prediction of our own movement
      const canMove = me.alive && !me.leap && !me.dash && me.stunUntil <= m.time && (m.phase === 'play' || m.phase === 'overtime');
      if (canMove) {
        let speed = me.def.speed * (me.carrying && me.def.passive.id !== 'porter' ? 0.85 : 1);
        if (me.speedBuffUntil > m.time) speed *= 1 + me.speedBuff;
        const l = Math.hypot(c.mx, c.my) || 1, k = Math.min(1, l);
        me.x += (c.mx / l) * k * speed * dt; me.y += (c.my / l) * k * speed * dt;
        if (l > 0.1 && k > 0.1) { me.facing = Math.atan2(c.my, c.mx); me.anim.walk += dt * speed * 0.03; }
        m.collideWalls(me, me.phaseUntil > m.time);
      }
    }
    // 3) apply server snapshots (+ reconciliation)
    for (const s of this.snaps) {
      const predicting = !!me && me.alive && !me.leap && !me.dash;
      applySnapshot(m, s, this.mirror, predicting ? m.humanId : -1);
      for (const e of s.ev) this.handleEvent(e);
      if (me && predicting) {
        const row = s.h.find((r) => r[0] === me.id);
        if (row) {
          const sx = row[5] as number, sy = row[6] as number;
          const hist = this.history.find((hh) => hh.seq === s.ack);
          this.history = this.history.filter((hh) => hh.seq > s.ack);
          const bx = hist ? hist.x : me.x, by = hist ? hist.y : me.y;
          const ex = sx - bx, ey = sy - by, err = Math.hypot(ex, ey);
          if (err > 160) { me.x = sx; me.y = sy; this.history = []; }
          else if (err > 2) { me.x += ex * 0.35; me.y += ey * 0.35; for (const hh of this.history) { hh.x += ex * 0.35; hh.y += ey * 0.35; } }
        }
      }
    }
    this.snaps.length = 0;
    // 4) dead-reckoning between snapshots for smooth remote motion
    for (const hh of m.heroes) if (hh !== me && hh.alive && !hh.leap) { hh.x += hh.vx * dt; hh.y += hh.vy * dt; }
    for (const r of m.rifts) if (r.carrier < 0 && r.state !== 'PORTAL' && r.state !== 'IDLE') { r.x += r.vx * dt; r.y += r.vy * dt; }
    for (const p of m.projectiles) if (p.active) { if (p.kind === 'lob' || p.kind === 'shell') { p.t = Math.min(p.dur, p.t + dt); const k = p.t / p.dur; p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; } else { p.x += p.vx * dt; p.y += p.vy * dt; } }
    for (const hh of m.heroes) { hh.anim.attackT = Math.max(0, hh.anim.attackT - dt); hh.anim.castT = Math.max(0, hh.anim.castT - dt); hh.anim.hitT = Math.max(0, hh.anim.hitT - dt); }
  }

  private openPause() {
    if (this.paused) return;
    this.paused = true;
    audio.play('click');
    const ranked = this.match.mode.ranked && this.cfg.vsBots !== undefined;
    const m = this.ui.modal('PAUSE', h('div.col', { style: 'align-items:center;gap:.8em;min-width:16em' },
      h('button.btn.green.big', { onclick: () => { m.close(); } }, 'REPRENDRE'),
      h('button.btn.red', { onclick: async () => {
        m.close();
        this.paused = true;
        const ok = await this.ui.confirm('Abandonner ?', ranked ? 'Abandonner compte comme une défaite (trophées).' : 'Quitter la partie ?', 'ABANDONNER', 'red');
        if (ok) this.forfeit(); else this.paused = false;
      } }, 'ABANDONNER')), { onClose: () => { this.paused = false; } });
  }

  forfeit() {
    if (this.ended) return;
    if (this.cfg.online) this.cfg.online.client.leave();
    const me = this.match.human;
    this.match.finish(me ? (me.team === 0 ? 1 : 0) : -1);
    this.finish(true);
  }

  update(dt: number) {
    const m = this.match;
    if (this.cfg.online) { if (m.phase !== 'ended') this.updateOnline(dt); }
    else if (!this.paused && m.phase !== 'ended') {
      const me = m.human;
      if (me) this.input.apply(me.cmd, { attack: me.def.attack.range, ability: Math.max(me.def.ability.range, 300), ult: Math.max(me.def.ultimate.range, 300) });
      this.acc += Math.min(dt, 0.1);
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 6) {
        m.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
        this.stepsThisSecond++;
        for (const e of m.events) this.handleEvent(e);
        m.events.length = 0;
        if (me) { me.cmd.aimX = 0; me.cmd.aimY = 0; me.cmd.aimDist = 0; }
      }
      if (steps >= 6) this.acc = 0; // device too slow: drop time instead of spiraling
    }
    this.rateT += dt;
    if (this.rateT >= 1) { this.simRate = this.stepsThisSecond / this.rateT; this.stepsThisSecond = 0; this.rateT = 0; }
    this.updateAim();
    this.r.update(this.paused ? 0 : dt);
    this.hud.update(dt);
    this.r.render();
    this.onFrame?.(dt);
    if (m.phase === 'ended' && !this.ended) {
      if (this.endTimer < 0) {
        this.endTimer = 2.4;
        const me = m.human;
        const win = m.result && me ? m.result.winner === me.team : false;
        const draw = m.result?.winner === -1;
        this.hud.showAnnounce(draw ? 'ÉGALITÉ' : win ? 'VICTOIRE !' : 'DÉFAITE', '', draw ? '#c9d6ff' : win ? '#ffe14d' : '#ff6b7a', 2400);
        audio.play(win ? 'victory' : 'defeat');
        this.input.enabled = false;
      }
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(false);
    }
  }

  private updateAim() {
    const me = this.match.human, a = this.input.aiming;
    if (!me || !me.alive || !a) { this.r.setAim(false); return; }
    const isAttack = a.slot === 'attack';
    if (a.slot === 'roll') { this.r.setAim(false); return; }
    const ab = a.slot === 'ability' ? me.def.ability : a.slot === 'gadget' ? (me.def.gadget ?? me.def.ability) : me.def.ultimate;
    let dx = a.dx, dy = a.dy;
    if (!a.manual) {
      // preview auto-aim direction
      let best = null as null | { x: number; y: number }, bd = Infinity;
      for (const e of this.match.heroes) if (e.alive && e.team !== me.team && this.match.isVisibleTo(e, me.team)) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; } }
      if (best) { dx = (best.x - me.x) / bd; dy = (best.y - me.y) / bd; } else { dx = Math.cos(me.facing); dy = Math.sin(me.facing); }
    }
    if (isAttack) {
      const lob = me.def.attack.kind === 'lob';
      if (me.carrying) this.r.setAim(true, me, dx, dy, 600, 'line', 0, '#e0aaff');
      else if (lob) this.r.setAim(true, me, dx, dy, a.manual ? a.mag * me.def.attack.range : me.def.attack.range * 0.8, 'point', me.def.attack.radius ?? 70, '#ffffff');
      else this.r.setAim(true, me, dx, dy, me.def.attack.range, 'line', 0, '#ffffff');
    } else {
      const color = a.slot === 'ult' ? '#ffcd1f' : a.slot === 'gadget' ? '#3ddc84' : '#2fe0ff';
      if (ab.aim === 'self') this.r.setAim(true, me, 0, 0, 0, 'self', ab.params.radius ?? me.radius * 2.5, color);
      else if (ab.aim === 'point') this.r.setAim(true, me, dx, dy, a.manual ? a.mag * ab.range : ab.range * 0.7, 'point', ab.params.radius ?? 120, color);
      else this.r.setAim(true, me, dx, dy, ab.params.distance ?? ab.range, 'line', 0, color);
    }
  }

  private vol(x: number, y: number) {
    const me = this.match.human;
    if (!me) return 0.6;
    const d = Math.hypot(x - me.x, y - me.y);
    return Math.max(0.12, 1 - d / 1400);
  }

  private handleEvent(e: MatchEvent) {
    this.r.onEvent(e);
    this.hud.onEvent(e);
    const m = this.match, me = m.human;
    const myTeam = me?.team ?? 0;
    switch (e.t) {
      case 'shot': { const s = m.heroById(e.hero); if (s) audio.play(e.kind === 'lob' ? 'shoot_heavy' : 'shoot', { vol: this.vol(e.x, e.y) * (e.hero === m.humanId ? 1 : 0.6), pitch: e.hero === m.humanId ? 1 : 0.85 }); break; }
      case 'melee': audio.play('shoot_heavy', { vol: this.vol(e.x, e.y) }); break;
      case 'chain': audio.play('zap', { vol: 0.8 }); break;
      case 'hit': if (e.target === m.humanId || e.source === m.humanId) { audio.play('hit', { vol: e.target === m.humanId ? 1 : 0.7, pitch: e.target === m.humanId ? 0.7 : 1.2 }); if (e.target === m.humanId) haptic('light', this.app.data.settings.haptics); } break;
      case 'heal': if (e.target === m.humanId) audio.play('heal', { vol: 0.5 }); break;
      case 'kill': if (e.killer === m.humanId) { audio.play('kill'); haptic('medium', this.app.data.settings.haptics); } if (e.victim === m.humanId) { audio.play('death'); haptic('heavy', this.app.data.settings.haptics); } break;
      case 'capture': audio.play('capture', { vol: e.hero === m.humanId ? 1 : 0.6 }); break;
      case 'throw': audio.play('throw', { vol: 0.8 }); break;
      case 'drop': audio.play('drop', { vol: 0.7 }); break;
      case 'goal': {
        const mine = e.team === myTeam;
        audio.play(mine ? 'goal' : 'goal_enemy');
        haptic('heavy', this.app.data.settings.haptics);
        // bots celebrate
        for (const b of m.heroes) if (b.isBot && !b.pve && b.team === e.team && m.rng.chance(0.35)) m.emit({ t: 'emote', hero: b.id, emote: m.rng.pick(['😎', '🔥', '🥳', '💪', '😂']) });
        break;
      }
      case 'ability': if (e.hero === m.humanId || this.vol(e.x, e.y) > 0.4) audio.play(e.ult ? 'ult' : 'ability', { vol: e.hero === m.humanId ? 1 : 0.55 }); if (e.hero === m.humanId && e.ult) haptic('medium', this.app.data.settings.haptics); break;
      case 'explosion': audio.play('explosion', { vol: this.vol(e.x, e.y) * Math.min(1, e.radius / 150) }); break;
      case 'teleport': audio.play('teleport', { vol: this.vol(e.x, e.y) }); break;
      case 'wall': audio.play('wall', { vol: 0.7 }); break;
      case 'zap': audio.play('zap', { vol: 0.5 }); break;
      case 'countdown': audio.play('countdown'); break;
      case 'kickoff': audio.play('go'); break;
      case 'mutation_warn': audio.play('mutation_warn'); this.mutationsSeen++; break;
      case 'mutation_start': audio.play('mutation'); haptic('medium', this.app.data.settings.haptics); break;
      case 'sudden_death': audio.play('mutation_warn'); break;
      case 'wave': audio.play('mutation_warn'); break;
      case 'roll': if (e.hero === m.humanId) audio.play('whoosh', { vol: 0.9 }); break;
      case 'gadget': audio.play('ability', { vol: e.hero === m.humanId ? 1 : 0.5, pitch: 1.4 }); break;
      case 'pickup': audio.play(e.hero === m.humanId ? 'reward' : 'coin', { vol: e.hero === m.humanId ? 1 : 0.4 }); break;
      case 'pickup_spawn': audio.play('notify', { vol: 0.35 }); break;
      case 'rift_charged': audio.play('mutation_warn'); haptic('medium', this.app.data.settings.haptics); break;
      case 'bounty': case 'bounty_claim': audio.play('kill', { vol: 0.8 }); break;
      case 'jump': audio.play('throw', { vol: this.vol(e.x, e.y) }); break;
      case 'crate_break': audio.play('wall', { vol: this.vol(e.x, e.y) }); break;
      case 'laser': audio.play('ult', { vol: 0.9 }); this.r.addShake(0.25); break;
      case 'boss_attack': audio.play('mutation_warn', { vol: 0.8 }); break;
      case 'boss_phase': audio.play('mutation'); haptic('heavy', this.app.data.settings.haptics); break;
      case 'beam_warn': audio.play('ability', { vol: 0.6 }); break;
      case 'time_stop': audio.play('mutation', { vol: 0.8 }); this.r.addShake(0.2); break;
      case 'revive': case 'avatar': audio.play('ult'); break;
      case 'king': audio.play('goal', { vol: 0.7 }); break;
      case 'perfect': audio.play('teleport', { vol: 0.8 }); if (e.hero === this.match.humanId) haptic('light', this.app.data.settings.haptics); break;
      case 'wall_slam': audio.play('explosion', { vol: this.vol(e.x, e.y) }); break;
    }
  }

  private finish(forfeit: boolean) {
    if (this.ended) return;
    this.ended = true;
    const m = this.match, me = m.human!;
    const res = m.result!;
    const outcome = res.winner === -1 ? 'draw' : res.winner === me.team ? 'win' : 'loss';
    const report: MatchReport = {
      matchId: this.cfg.matchId, mode: m.mode.id, arena: m.arena.data.id, heroId: me.def.id, outcome,
      score: res.score, myTeam: me.team, duration: Math.max(1, m.time), stats: { ...me.stats }, mvp: res.mvp === me.id,
      ranked: m.mode.ranked && !this.cfg.training, mutationsSeen: this.mutationsSeen, vsBots: this.cfg.vsBots,
      extra: {
        // boss damage rank among the players (1 = top damage dealer)
        bossRank: m.mode.id === 'RIFT_BOSS' ? 1 + m.heroes.filter((x) => !x.pve && x.team === me.team && x.stats.bossDamage > me.stats.bossDamage).length : 0,
        waves: res.extra?.waves ?? 0,
      },
    };
    this.app.analytics.track('match_end', { mode: m.mode.id, outcome, duration: Math.round(m.time), forfeit });
    this.onEnd({ match: m, report, forfeit });
  }

  dispose() {
    this.offNet?.();
    this.input.dispose();
    this.hud.dispose();
    this.r.setAim(false);
    this.r.clearMatch();
  }
}
