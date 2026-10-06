import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory, GrantedItem } from './Inventory';
import type { BattlePassService } from '../battlepass/BattlePassService';
import type { MissionService } from '../missions/MissionService';
import type { EventService } from '../events/EventService';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import type { Authority, MatchReport } from '../networking/Authority';
import { ECONOMY, MASTERY, TROPHY_ROAD } from '../data/progression';
import type { MissionStat, RewardItem } from '../data/types';
import { utcDayIndex } from '../core/Time';

export interface MatchRewards {
  accepted: boolean;
  reason?: string;
  outcome: 'win' | 'loss' | 'draw';
  trophies: number;
  trophiesTotal: number;
  xp: number;
  levelBefore: number; levelAfter: number;
  xpProgressBefore: number; xpProgressAfter: number;
  coins: number;
  coinsCapped: boolean;
  passXp: number;
  passTierBefore: number; passTierAfter: number; passProgressAfter: number;
  mastery: { heroId: string; xp: number; levelBefore: number; levelAfter: number; progress: number };
  missionsCompleted: string[];
  unlocked: GrantedItem[];
  streak: number;
}

/** Applies validated match results to the profile: trophies, XP, coins, mastery, pass, missions, trophy road. */
export class ProgressionService {
  constructor(
    private save: SaveSystem, private inv: Inventory, private pass: BattlePassService, private missions: MissionService,
    private events: EventService, private bus: EventBus<AppEvents>, private notes: NotificationCenter, private authority: Authority,
  ) {
    inv.onXp = (n) => this.addXp(n);
    inv.onPassXp = (n) => this.pass.addXp(n);
  }
  private get d() { return this.save.data; }

  get xpToNext() { return ECONOMY.xpForLevel(this.d.level); }
  get xpProgress() { return this.d.xp / this.xpToNext; }

  addXp(amount: number): RewardItem[] {
    const rewards: RewardItem[] = [];
    this.d.xp += Math.round(amount);
    while (this.d.xp >= ECONOMY.xpForLevel(this.d.level)) {
      this.d.xp -= ECONOMY.xpForLevel(this.d.level);
      this.d.level++;
      const r = ECONOMY.levelUpReward(this.d.level);
      rewards.push(...r);
      this.inv.grant(r, { source: 'level', txn: `level:${this.d.level}`, verified: false });
      this.bus.emit('levelUp', { level: this.d.level, rewards: r });
      this.notes.push('level', `Niveau ${this.d.level} !`, 'Récompenses de niveau ajoutées.');
    }
    this.save.save();
    return rewards;
  }

  masteryOf(heroId: string) {
    const h = this.d.heroes[heroId];
    const need = MASTERY.xpForLevel(h.masteryLevel);
    return { level: h.masteryLevel, xp: h.masteryXp, need, progress: h.masteryLevel >= MASTERY.maxLevel ? 1 : h.masteryXp / need, badge: [...MASTERY.badges].reverse().find((b) => h.masteryLevel >= b.level) };
  }

  addMastery(heroId: string, amount: number) {
    const h = this.d.heroes[heroId];
    if (!h) return;
    h.masteryXp += amount;
    while (h.masteryLevel < MASTERY.maxLevel && h.masteryXp >= MASTERY.xpForLevel(h.masteryLevel)) {
      h.masteryXp -= MASTERY.xpForLevel(h.masteryLevel);
      h.masteryLevel++;
      const reward = MASTERY.rewards(heroId)[h.masteryLevel];
      if (reward) this.inv.grant([reward], { source: 'mastery', txn: `mastery:${heroId}:${h.masteryLevel}`, verified: false });
      this.notes.push('reward', 'Maîtrise !', `Maîtrise ${h.masteryLevel} atteinte.`);
    }
    if (h.masteryLevel >= MASTERY.maxLevel) h.masteryXp = 0;
  }

  /** Trophy road: grants everything reached and not yet claimed. */
  checkTrophyRoad(): GrantedItem[] {
    const out: GrantedItem[] = [];
    for (const step of TROPHY_ROAD) {
      if (this.d.bestTrophies >= step.trophies && !this.d.trophyRoadClaimed.includes(step.trophies)) {
        this.d.trophyRoadClaimed.push(step.trophies);
        out.push(...this.inv.grant([step.reward], { source: 'trophy_road', txn: `road:${step.trophies}`, verified: false }));
      }
    }
    return out;
  }

  async applyMatch(r: MatchReport): Promise<MatchRewards> {
    const d = this.d;
    const verdict = await this.authority.validateMatch(r, (id) => d.processedMatches.includes(id));
    const base: MatchRewards = {
      accepted: verdict.accepted, reason: verdict.reason, outcome: r.outcome, trophies: 0, trophiesTotal: d.trophies, xp: 0, levelBefore: d.level, levelAfter: d.level,
      xpProgressBefore: this.xpProgress, xpProgressAfter: this.xpProgress, coins: 0, coinsCapped: false, passXp: 0, passTierBefore: this.pass.tier, passTierAfter: this.pass.tier, passProgressAfter: this.pass.tierProgress,
      mastery: { heroId: r.heroId, xp: 0, levelBefore: this.masteryOf(r.heroId).level, levelAfter: this.masteryOf(r.heroId).level, progress: this.masteryOf(r.heroId).progress }, missionsCompleted: [], unlocked: [], streak: d.stats.streak,
    };
    if (!verdict.accepted) return base;
    d.processedMatches.push(r.matchId);

    const mods = this.events.modifiers();
    const win = r.outcome === 'win', draw = r.outcome === 'draw';
    // trophies (ranked only, never purchasable)
    let trophies = 0;
    if (r.ranked) {
      trophies = ECONOMY.trophyDelta(d.trophies, r.outcome);
      if (trophies < 0) trophies = -Math.min(-trophies, d.trophies);
      d.trophies += trophies;
      d.bestTrophies = Math.max(d.bestTrophies, d.trophies);
      const hp = d.heroes[r.heroId];
      if (hp) hp.trophies = Math.max(0, hp.trophies + trophies);
    }
    // stats
    const s = d.stats;
    s.matches++; if (win) s.wins++; else if (draw) s.draws++; else s.losses++;
    s.streak = win ? s.streak + 1 : 0; s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.kills += r.stats.kills; s.deaths += r.stats.deaths; s.goals += r.stats.goals; s.damage += r.stats.damage; s.heal += r.stats.heal; s.captures += r.stats.captures;
    if (r.mvp) s.mvps++;
    const hp = d.heroes[r.heroId];
    if (hp) { hp.matches++; if (win) hp.wins++; hp.goals += r.stats.goals; hp.kills += r.stats.kills; }

    // xp / coins / pass
    const E = ECONOMY;
    const xp = Math.round(((win ? E.matchXp.win : draw ? E.matchXp.draw : E.matchXp.loss) + r.stats.goals * E.matchXp.perGoal + (r.mvp ? E.matchXp.mvp : 0)) * (mods.xpMul ?? 1));
    this.addXp(xp);
    const rawCoins = Math.round(((win ? E.matchCoins.win : draw ? E.matchCoins.draw : E.matchCoins.loss) + (r.mvp ? E.matchCoins.mvp : 0)) * (mods.coinMul ?? 1));
    const coins = this.inv.grantMatchCoins(rawCoins, utcDayIndex());
    const passXp = Math.round((win ? E.matchPassXp.win : draw ? E.matchPassXp.draw : E.matchPassXp.loss) * (mods.passXpMul ?? 1));
    this.pass.addXp(passXp);
    const mxp = (win ? E.masteryXp.win : draw ? E.masteryXp.draw : E.masteryXp.loss) + r.stats.goals * E.masteryXp.perGoal;
    this.addMastery(r.heroId, mxp);

    // missions
    const delta: Partial<Record<MissionStat, number>> = {
      matches: 1, wins: win ? 1 : 0, goals: r.stats.goals, abilities: r.stats.abilities, ults: r.stats.ults, kills: r.stats.kills, captures: r.stats.captures,
      damage: r.stats.damage, heal: r.stats.heal, mutations_seen: r.mutationsSeen, throws: r.stats.throws, interceptions: r.stats.interceptions,
      [`mode_${r.mode}`]: 1,
    };
    const missionsCompleted = this.missions.record(delta);
    const unlocked = this.checkTrophyRoad();

    d.matchHistory.push({ at: Date.now(), mode: r.mode, result: r.outcome, score: r.score, hero: r.heroId, trophies });
    if (d.matchHistory.length > 30) d.matchHistory.shift();
    if (d.processedMatches.length > 100) d.processedMatches.shift();
    this.save.save();

    const m = this.masteryOf(r.heroId);
    return {
      ...base, trophies, trophiesTotal: d.trophies, xp, levelAfter: d.level, xpProgressAfter: this.xpProgress, coins, coinsCapped: coins < rawCoins,
      passXp, passTierAfter: this.pass.tier, passProgressAfter: this.pass.tierProgress,
      mastery: { heroId: r.heroId, xp: mxp, levelBefore: base.mastery.levelBefore, levelAfter: m.level, progress: m.progress },
      missionsCompleted, unlocked, streak: s.streak,
    };
  }

  /** Coins unlock (alternative to trophy road) — free currency only. */
  buyHeroWithCoins(heroId: string, price: number) {
    if (this.inv.hasHero(heroId)) return false;
    if (!this.inv.spendCoins(price)) return false;
    this.inv.grant([{ kind: 'hero', id: heroId }], { source: 'coins', txn: `hero:${heroId}`, verified: false });
    return true;
  }
}
