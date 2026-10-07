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
    this.match = cfg.build ? cfg.build() : createMatch({
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
    this.hud.onEmote = (glyph) => this.match.emit({ t: 'emote', hero: this.match.humanId, emote: glyph });
    this.input.onEmote = () => this.match.emit({ t: 'emote', hero: this.match.humanId, emote: '🤝' });
    const music = getArena(cfg.arenaId).music as MusicTrack;
    audio.playMusic(music);
    app.analytics.track('match_start', { mode: cfg.mode, arena: cfg.arenaId, hero: cfg.heroId });
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
    const me = this.match.human;
    this.match.finish(me ? (me.team === 0 ? 1 : 0) : -1);
    this.finish(true);
  }

  update(dt: number) {
    const m = this.match;
    if (!this.paused && m.phase !== 'ended') {
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
    const ab = a.slot === 'ability' ? me.def.ability : me.def.ultimate;
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
      const color = a.slot === 'ult' ? '#ffcd1f' : '#2fe0ff';
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
    };
    this.app.analytics.track('match_end', { mode: m.mode.id, outcome, duration: Math.round(m.time), forfeit });
    this.onEnd({ match: m, report, forfeit });
  }

  dispose() {
    this.input.dispose();
    this.hud.dispose();
    this.r.setAim(false);
    this.r.clearMatch();
  }
}
