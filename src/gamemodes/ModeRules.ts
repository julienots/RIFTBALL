import type { Match } from '../game/Match';
import { Hero, type RiftEntity } from '../game/entities';
import type { ModeId, TeamId } from '../data/types';
import { getCharacter, PLAYABLE } from '../data/characters';
import { BotBrain } from '../bots/BotBrain';
import { BOT_PROFILES } from '../data/bots';
import { healHero, applyDamage, spawnProjectile } from '../combat/Combat';
import { dist2 } from '../core/math';
import { setRiftState } from '../rift/Rift';

export type GoalOutcome = 'reset' | 'clone' | 'continue';

/** Per-mode rules (win conditions, special spawns). Adding a mode = adding a class here + a ModeData entry. */
export interface ModeRules {
  pveCanCarry: boolean;
  /** false = goals are disabled (RIFT KING) */
  portalsActive: boolean;
  setup(m: Match): void;
  update(m: Match, dt: number): void;
  onGoal(m: Match, r: RiftEntity, team: TeamId, scorer: number): GoalOutcome;
  onTimeUp(m: Match): TeamId | -1 | 'overtime';
  checkEnd(m: Match): boolean;
  summonMinions(m: Match, around: Hero, n: number): void;
  extraResult(m: Match): Record<string, number>;
}

class StandardRules implements ModeRules {
  pveCanCarry = false;
  portalsActive = true;
  setup(_m: Match) {}
  update(_m: Match, _dt: number) {}
  onGoal(_m: Match, r: RiftEntity, _team: TeamId, _scorer: number): GoalOutcome { return r.clone ? 'clone' : 'reset'; }
  onTimeUp(m: Match): TeamId | -1 | 'overtime' {
    if (m.score[0] > m.score[1]) return 0;
    if (m.score[1] > m.score[0]) return 1;
    if (m.mode.suddenDeath && !m.overtime) return 'overtime';
    return -1;
  }
  checkEnd(_m: Match) { return false; }
  summonMinions(m: Match, around: Hero, n: number) { spawnMinions(m, around.x, around.y, n, 1); }
  extraResult(_m: Match) { return {}; }
}

function spawnMinions(m: Match, x: number, y: number, n: number, team: TeamId, hpMul = 1) {
  for (let i = 0; i < n; i++) {
    const h = new Hero(m.nextHeroId(), team, getCharacter('minion'), 'Riftling', true, 'minion_default');
    h.pve = true;
    h.maxHp = h.hp = Math.round(h.def.hp * hpMul);
    const a = (i / n) * Math.PI * 2;
    h.x = x + Math.cos(a) * 130; h.y = y + Math.sin(a) * 130;
    m.collideWalls(h, false);
    m.addHero(h);
    m.brains.set(h.id, new BotBrain(m, h, BOT_PROFILES.NORMAL));
  }
}

/** Boss attack names shown to players. */
export const BOSS_ATTACKS: Record<string, string> = {
  slam: 'SÉISME', meteors: 'PLUIE DE MÉTÉORES', beam: 'RAYON DU RIFT', charge: 'CHARGE DU COLOSSE',
  ring: 'ONDE DE CRISTAUX', gravity: 'PUITS GRAVITATIONNEL', shield: 'BOUCLIER DU RIFT', summon: 'INVOCATION',
};

/**
 * RIFT BOSS: 3 players vs the Colossus. The BossDirector drives a 3-phase fight with telegraphed attacks
 * (red warning circles / beams) that players can read and dodge. Delivering the Rift into the boss portal
 * deals massive damage and breaks the Rift shield.
 */
class BossRules extends StandardRules {
  boss: Hero | null = null;
  phase = 1;
  private nextSummon = 22;
  private nextAttack = 6;
  private nextShield = 0;
  private last = '';
  private queue: { at: number; fn: () => void }[] = [];
  override setup(m: Match) {
    const b = new Hero(m.nextHeroId(), 1, getCharacter('boss_golem'), 'RIFT COLOSSUS', true, 'boss_default');
    b.pve = true;
    b.x = m.arena.w - 450; b.y = m.arena.h / 2;
    b.facing = Math.PI;
    m.addHero(b);
    m.brains.set(b.id, new BotBrain(m, b, BOT_PROFILES.HARD));
    this.boss = b;
  }
  private players(m: Match) { return m.heroes.filter((h) => h.alive && h.team === 0 && !h.pve); }
  private warn(m: Match, x: number, y: number, r: number, delay: number, dmg: number, stun = 0) {
    const z = m.addZone('boss_warn', this.boss, x, y, r, delay, {});
    z.burst = dmg; z.stun = stun;
  }
  override update(m: Match, dt: number) {
    const b = this.boss;
    if (!b || !b.alive) return;
    void dt;
    // phases
    const pct = b.hp / b.maxHp;
    const phase = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3;
    if (phase > this.phase) {
      this.phase = phase;
      m.emit({ t: 'boss_phase', phase });
      b.channelUntil = m.time + 1.6;
      b.dash = null;
      for (const h of m.heroes) if (h.alive && h.team === 0) { const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy) || 1; if (d < 520) { h.kx += (dx / d) * 900; h.ky += (dy / d) * 900; } }
      m.emit({ t: 'explosion', x: b.x, y: b.y, radius: 520, color: '#ff00a0' });
      spawnMinions(m, b.x, b.y, phase === 3 ? 4 : 3, 1);
      this.nextAttack = m.time + 2.4;
    }
    m.bossArmor = this.phase === 3 ? 0.85 : 1;
    if (m.phase !== 'play' && m.phase !== 'overtime') return;
    for (let i = this.queue.length - 1; i >= 0; i--) if (m.time >= this.queue[i].at) { const q = this.queue[i]; this.queue.splice(i, 1); if (b.alive) q.fn(); }
    if (m.time >= this.nextSummon) {
      this.nextSummon = m.time + (this.phase === 3 ? 12 : this.phase === 2 ? 15 : 18);
      spawnMinions(m, b.x, b.y, this.phase + 1, 1);
      m.emit({ t: 'boss_attack', name: 'summon', x: b.x, y: b.y });
    }
    if (m.time >= this.nextAttack && b.channelUntil <= m.time && !b.dash && b.stunUntil <= m.time) {
      const pool = ['slam', 'meteors', 'beam', 'ring'];
      if (this.phase >= 2) pool.push('charge', 'gravity', 'meteors');
      if (this.phase >= 3 && m.time >= this.nextShield && b.shield <= 0) pool.push('shield', 'shield');
      const choices = pool.filter((a) => a !== this.last);
      const atk = choices[Math.floor(m.rng.range(0, choices.length)) % choices.length];
      this.last = atk;
      this.cast(m, atk);
      this.nextAttack = m.time + (this.phase === 1 ? 5.2 : this.phase === 2 ? 4.3 : 3.5);
    }
  }
  private target(m: Match) {
    const ps = this.players(m);
    if (!ps.length) return null;
    // prefer the Rift carrier, else a random player
    return ps.find((p) => p.carrying) ?? ps[Math.floor(m.rng.range(0, ps.length)) % ps.length];
  }
  private cast(m: Match, atk: string) {
    const b = this.boss!;
    const t = this.target(m);
    m.emit({ t: 'boss_attack', name: atk, x: b.x, y: b.y });
    switch (atk) {
      case 'slam':
        b.channelUntil = m.time + 1.3;
        this.warn(m, b.x, b.y, 440, 1.3, 1300, 0.6);
        break;
      case 'meteors': {
        b.channelUntil = m.time + 0.7;
        const n = this.phase === 3 ? 3 : 2;
        for (const p of this.players(m)) for (let i = 0; i < n; i++) {
          const ox = i === 0 ? p.vx * 0.6 : m.rng.range(-220, 220), oy = i === 0 ? p.vy * 0.6 : m.rng.range(-220, 220);
          this.warn(m, Math.max(80, Math.min(m.arena.w - 80, p.x + ox)), Math.max(80, Math.min(m.arena.h - 80, p.y + oy)), 150, 1.15 + i * 0.25, 950);
        }
        break;
      }
      case 'beam': {
        if (!t) break;
        const dx = t.x - b.x, dy = t.y - b.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, len = 2400;
        const dur = this.phase === 3 ? 0.9 : 1.15;
        b.channelUntil = m.time + dur + 0.35; b.facing = Math.atan2(uy, ux);
        m.emit({ t: 'beam_warn', x: b.x, y: b.y, tx: b.x + ux * len, ty: b.y + uy * len, dur, width: 95 });
        const sx = b.x, sy = b.y;
        this.queue.push({ at: m.time + dur, fn: () => {
          for (const e of m.heroes) {
            if (!e.alive || e.team === b.team) continue;
            const k = Math.max(0, Math.min(1, ((e.x - sx) * ux + (e.y - sy) * uy) / len));
            if (dist2(sx + ux * len * k, sy + uy * len * k, e.x, e.y) <= (95 + e.radius) ** 2) applyDamage(m, e, 1500, b, { kb: 500, kbX: ux, kbY: uy, noUlt: true });
          }
          m.emit({ t: 'laser', x: sx, y: sy, tx: sx + ux * len, ty: sy + uy * len, team: 1 });
        } });
        break;
      }
      case 'charge': {
        if (!t) break;
        const dx = t.x - b.x, dy = t.y - b.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        b.channelUntil = m.time + 0.85; b.facing = Math.atan2(uy, ux);
        m.emit({ t: 'beam_warn', x: b.x, y: b.y, tx: b.x + ux * 1000, ty: b.y + uy * 1000, dur: 0.85, width: b.radius * 1.6 });
        this.queue.push({ at: m.time + 0.85, fn: () => { b.dash = { dx: ux, dy: uy, remaining: 1000, speed: 1500, dmg: 1100, kb: 900, stun: 0.5, kind: 'charge', hit: new Set() }; } });
        break;
      }
      case 'ring': {
        b.channelUntil = m.time + 1.4;
        const waves = this.phase + 1, n = 14 + this.phase * 4;
        for (let w = 0; w < waves; w++) this.queue.push({ at: m.time + 0.35 + w * 0.42, fn: () => {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + w * 0.17;
            const p = spawnProjectile(m, b, 'boss', b.x, b.y, Math.cos(a), Math.sin(a), 540, 1500, 20, 420);
            p.color = '#ff00a0'; p.phase = false;
          }
        } });
        break;
      }
      case 'gravity':
        b.channelUntil = m.time + 2.9;
        m.addZone('gravity_well', b, b.x, b.y, 720, 2.9, { pull: 270, damage: 110, tickEvery: 0.5 });
        this.warn(m, b.x, b.y, 300, 2.9, 1400, 0.8);
        break;
      case 'shield':
        b.shield = 12000; b.shieldUntil = m.time + 10;
        this.nextShield = m.time + 26;
        m.emit({ t: 'explosion', x: b.x, y: b.y, radius: 300, color: '#00f5d4' });
        break;
    }
  }
  override onGoal(m: Match, r: RiftEntity, team: TeamId, scorer: number): GoalOutcome {
    const b = this.boss;
    if (team === 0 && b && b.alive) {
      const src = m.heroById(scorer) ?? null;
      const broke = b.shield > 0 && b.shieldUntil > m.time;
      if (broke) { b.shield = 0; b.shieldUntil = 0; m.emit({ t: 'boss_attack', name: 'shield_break', x: b.x, y: b.y }); }
      applyDamage(m, b, b.maxHp * (r.clone ? 0.04 : broke ? 0.16 : 0.12), src && src.team === 0 ? src : null, { noUlt: true });
      b.stunUntil = m.time + (broke ? 3.5 : 2);
      b.channelUntil = 0; b.dash = null;
      this.nextAttack = Math.max(this.nextAttack, m.time + 2.5);
    }
    if (r.clone) return 'clone';
    m.score[0] += 1;
    // instant re-center instead of a full kickoff
    r.carrier = -1; r.x = m.arena.center.x; r.y = m.arena.center.y; r.vx = r.vy = 0; r.lastTouchTeam = -1;
    setRiftState(m, r, 'ROAM');
    return 'continue';
  }
  override onTimeUp(): TeamId | -1 | 'overtime' { return 1; }
  override checkEnd(m: Match) {
    if (this.boss && !this.boss.alive) { m.finish(0); return true; }
    return false;
  }
  override extraResult() { return { bossHpPct: this.boss ? Math.max(0, this.boss.hp / this.boss.maxHp) : 0, bossPhase: this.phase }; }
}

/**
 * RIFT KING (ROI DU RIFT): no goals. Whoever carries the Rift is crowned King: every second of reign scores
 * 1 point for their team. The King is revealed and slowed; picking up the crown blasts nearby enemies away.
 * First team to 60 wins (sudden death if tied when time is up).
 */
export const KING_TARGET = 60;
class KingRules extends StandardRules {
  override portalsActive = false;
  private kingId = -1;
  private acc = 0;
  override update(m: Match, dt: number) {
    const r = m.mainRift();
    const carrier = r && r.carrier >= 0 ? m.heroById(r.carrier) ?? null : null;
    const id = carrier ? carrier.id : -1;
    if (id !== this.kingId) {
      const old = m.heroById(this.kingId);
      if (old) old.king = false;
      this.kingId = id;
      this.acc = 0;
      if (carrier) {
        carrier.king = true;
        m.emit({ t: 'king', hero: carrier.id, team: carrier.team });
        // coronation shockwave
        for (const e of m.heroes) {
          if (!e.alive || e.team === carrier.team) continue;
          const dx = e.x - carrier.x, dy = e.y - carrier.y, d = Math.hypot(dx, dy) || 1;
          if (d < 260) { e.kx += (dx / d) * 700; e.ky += (dy / d) * 700; }
        }
        m.emit({ t: 'explosion', x: carrier.x, y: carrier.y, radius: 260, color: '#ffd60a' });
      }
    }
    if (!carrier || (m.phase !== 'play' && m.phase !== 'overtime')) return;
    carrier.revealedUntil = m.time + 0.2;
    this.acc += dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      m.score[carrier.team] += 1;
      carrier.stats.kingPoints += 1;
      carrier.ult = Math.min(100, carrier.ult + 1.5);
    }
  }
  override onTimeUp(m: Match): TeamId | -1 | 'overtime' {
    if (m.score[0] !== m.score[1]) return m.score[0] > m.score[1] ? 0 : 1;
    return m.overtime ? -1 : 'overtime';
  }
  private tieScore = -1;
  override checkEnd(m: Match) {
    if (m.score[0] >= KING_TARGET || m.score[1] >= KING_TARGET) { m.finish(m.score[0] >= KING_TARGET ? 0 : 1); return true; }
    // sudden death: first point wins
    if (m.overtime) {
      if (this.tieScore < 0) this.tieScore = m.score[0];
      if (m.score[0] !== m.score[1]) { m.finish(m.score[0] > m.score[1] ? 0 : 1); return true; }
    }
    return false;
  }
  override extraResult(m: Match) { return { kingTarget: KING_TARGET, kingPoints: Math.max(m.score[0], m.score[1]) }; }
}

/** SURVIVAL: 8 waves of Riftlings. Delivering the Rift into the red portal heals the team and blasts every creature. */
class SurvivalRules extends StandardRules {
  wave = 0;
  readonly maxWaves = 8;
  private nextWaveAt = 4;
  private cleared = 0;
  override setup() {}
  override update(m: Match) {
    if (m.phase !== 'play') return;
    const alive = m.heroes.filter((h) => h.pve && h.team === 1 && h.alive).length;
    if (alive === 0 && this.wave > 0 && this.nextWaveAt === Infinity) {
      this.cleared = this.wave;
      this.nextWaveAt = m.time + 4;
      // clean dead minions to keep the entity list small
      for (const h of m.heroes.filter((q) => q.pve && q.team === 1 && !q.alive)) m.removeHero(h);
    }
    if (m.time >= this.nextWaveAt && this.wave < this.maxWaves) {
      this.wave++;
      this.nextWaveAt = Infinity;
      const n = 3 + this.wave * 2;
      const hpMul = 1 + this.wave * 0.12;
      spawnMinions(m, m.arena.w - 260, m.arena.h / 2 - 300, Math.ceil(n / 2), 1, hpMul);
      spawnMinions(m, m.arena.w - 260, m.arena.h / 2 + 300, Math.floor(n / 2), 1, hpMul);
      m.emit({ t: 'wave', n: this.wave });
    }
  }
  override onGoal(m: Match, r: RiftEntity, team: TeamId): GoalOutcome {
    if (team === 0) {
      for (const h of m.heroes) {
        if (h.team === 0 && h.alive) healHero(m, h, h.maxHp * 0.5, null);
        if (h.pve && h.team === 1 && h.alive) applyDamage(m, h, 900, null, { noUlt: true });
      }
      m.score[0] += 1;
    }
    if (r.clone) return 'clone';
    r.carrier = -1; r.x = m.arena.center.x; r.y = m.arena.center.y; r.vx = r.vy = 0; r.lastTouchTeam = -1;
    setRiftState(m, r, 'ROAM');
    return 'continue';
  }
  override onTimeUp(): TeamId | -1 | 'overtime' { return this.cleared >= this.maxWaves ? 0 : 1; }
  override checkEnd(m: Match) {
    if (this.cleared >= this.maxWaves) { m.finish(0); return true; }
    const players = m.heroes.filter((h) => h.team === 0 && !h.pve);
    if (players.length > 0 && players.every((h) => !h.alive)) { m.finish(1); return true; }
    return false;
  }
  override extraResult() { return { waves: this.cleared }; }
}

/**
 * FIFIX (limited-time mode): every 20 s the "Fifi Roulette" turns every player into a random hero
 * (HP % kept, fresh gadget charges), Fifi scatters bonuses, and mutations come in bursts.
 */
export const FIFIX_EVERY = 20;
class FifiXRules extends StandardRules {
  private next = FIFIX_EVERY;
  private warned = false;
  override update(m: Match) {
    if (m.phase !== 'play' && m.phase !== 'overtime') return;
    if (!this.warned && m.time >= this.next - 3) { this.warned = true; m.emit({ t: 'fifix_warn', in: 3 }); }
    if (m.time < this.next) return;
    this.next = m.time + FIFIX_EVERY; this.warned = false;
    const pool = PLAYABLE.map((c) => c.id);
    for (const h of m.heroes) {
      if (h.pve) continue;
      const choices = pool.filter((id) => id !== h.def.id);
      const to = choices[Math.floor(m.rng.range(0, choices.length)) % choices.length];
      const from = h.def.id;
      const ratio = h.alive ? h.hp / h.maxHp : 1;
      if (h.carrying) m.dropCarried(h);
      h.def = getCharacter(to);
      h.skinId = `${to}_default`;
      h.maxHp = h.def.hp; h.hp = Math.max(1, Math.round(h.maxHp * ratio));
      h.gadgetCharges = h.def.gadget?.charges ?? 0; h.gadgetCd = 0; h.abCd = Math.min(h.abCd, 1); h.atkCd = 0;
      h.history = []; h.dash = null; h.reviveUsed = false;
      m.emit({ t: 'hero_swap', hero: h.id, from, to });
    }
    // Fifi's gifts
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + m.rng.range(0, 1);
      m.spawnPickup(m.rng.pick(['speed', 'shield', 'power', 'ult'] as const), m.arena.center.x + Math.cos(a) * 260, m.arena.center.y + Math.sin(a) * 200, -1);
    }
    m.emit({ t: 'explosion', x: m.arena.center.x, y: m.arena.center.y, radius: 300, color: '#ff4ecd' });
  }
}

/** TUTORIAL: free-play sandbox driven by the Tutorial controller (no timer pressure, no end). */
class TutorialRules extends StandardRules {
  override onTimeUp(): TeamId | -1 | 'overtime' { return 0; }
}

export function createModeRules(id: ModeId): ModeRules {
  switch (id) {
    case 'RIFT_BOSS': return new BossRules();
    case 'SURVIVAL': return new SurvivalRules();
    case 'RIFT_KING': return new KingRules();
    case 'FIFIX': return new FifiXRules();
    case 'TUTORIAL': return new TutorialRules();
    default: return new StandardRules();
  }
}
