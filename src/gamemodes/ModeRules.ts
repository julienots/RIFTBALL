import type { Match } from '../game/Match';
import { Hero, type RiftEntity } from '../game/entities';
import type { ModeId, TeamId } from '../data/types';
import { getCharacter } from '../data/characters';
import { BotBrain } from '../bots/BotBrain';
import { BOT_PROFILES } from '../data/bots';
import { healHero, applyDamage } from '../combat/Combat';
import { setRiftState } from '../rift/Rift';

export type GoalOutcome = 'reset' | 'clone' | 'continue';

/** Per-mode rules (win conditions, special spawns). Adding a mode = adding a class here + a ModeData entry. */
export interface ModeRules {
  pveCanCarry: boolean;
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

/** RIFT BOSS: deliver the Rift into the boss portal to deal massive damage; kill the Colossus before time runs out. */
class BossRules extends StandardRules {
  boss: Hero | null = null;
  private nextSummon = 20;
  override setup(m: Match) {
    const b = new Hero(m.nextHeroId(), 1, getCharacter('boss_golem'), 'RIFT COLOSSUS', true, 'boss_default');
    b.pve = true;
    b.x = m.arena.w - 450; b.y = m.arena.h / 2;
    b.facing = Math.PI;
    m.addHero(b);
    m.brains.set(b.id, new BotBrain(m, b, BOT_PROFILES.HARD));
    this.boss = b;
  }
  override update(m: Match) {
    const b = this.boss;
    if (!b || !b.alive) return;
    // enraged phase below 40%
    m.bossArmor = b.hp < b.maxHp * 0.4 ? 0.85 : 1;
    if (m.time >= this.nextSummon && (m.phase === 'play')) {
      this.nextSummon = m.time + (b.hp < b.maxHp * 0.4 ? 11 : 16);
      spawnMinions(m, b.x, b.y, b.hp < b.maxHp * 0.4 ? 3 : 2, 1);
    }
  }
  override onGoal(m: Match, r: RiftEntity, team: TeamId): GoalOutcome {
    if (team === 0 && this.boss && this.boss.alive) {
      applyDamage(m, this.boss, this.boss.maxHp * (r.clone ? 0.05 : 0.14), null, { noUlt: true });
      this.boss.stunUntil = m.time + 2;
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
  override extraResult() { return { bossHpPct: this.boss ? Math.max(0, this.boss.hp / this.boss.maxHp) : 0 }; }
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
    const alive = m.heroes.filter((h) => h.pve && h.alive).length;
    if (alive === 0 && this.wave > 0 && this.nextWaveAt === Infinity) {
      this.cleared = this.wave;
      this.nextWaveAt = m.time + 4;
      // clean dead minions to keep the entity list small
      for (const h of m.heroes.filter((q) => q.pve && !q.alive)) m.removeHero(h);
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
        if (h.pve && h.alive) applyDamage(m, h, 900, null, { noUlt: true });
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

/** TUTORIAL: free-play sandbox driven by the Tutorial controller (no timer pressure, no end). */
class TutorialRules extends StandardRules {
  override onTimeUp(): TeamId | -1 | 'overtime' { return 0; }
}

export function createModeRules(id: ModeId): ModeRules {
  switch (id) {
    case 'RIFT_BOSS': return new BossRules();
    case 'SURVIVAL': return new SurvivalRules();
    case 'TUTORIAL': return new TutorialRules();
    default: return new StandardRules();
  }
}
