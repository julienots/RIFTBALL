import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory, GrantedItem } from '../progression/Inventory';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import { SEASONS, SEASON_RANKS, SEASON_RESET_FLOOR, currentSeason, rankFor } from '../data/seasons';
import type { SeasonData } from '../data/types';
import { Clock } from '../core/Time';

export interface SeasonEndSummary { seasonId: string; seasonName: string; rank: string; peak: number; trophiesBefore: number; trophiesAfter: number; rewards: GrantedItem[] }

/**
 * Seasons: tracks the season's peak trophies (= season rank), and when a season ends grants the rank
 * rewards and applies a soft trophy reset (heroes / trophy road unlocks are never lost).
 */
export class SeasonService {
  constructor(private save: SaveSystem, private inv: Inventory, private notes: NotificationCenter) {}

  get current(): SeasonData { return currentSeason(Clock.now()); }
  get s() { return this.save.data.season; }
  get rank() { return rankFor(this.s.peak); }
  get nextRank() { return SEASON_RANKS.find((r) => r.min > this.s.peak) ?? null; }
  get timeLeftMs() { return Date.parse(this.current.end) - Clock.now(); }
  upcoming(): SeasonData[] { const now = Clock.now(); return SEASONS.filter((x) => Date.parse(x.start) > now); }

  /** Called on boot and after each match. Returns the end-of-season summary when a season just ended. */
  check(): SeasonEndSummary | null {
    const d = this.save.data, cur = this.current;
    if (!this.s.id) { this.s.id = cur.id; this.s.peak = d.trophies; this.save.save(); return null; }
    this.s.peak = Math.max(this.s.peak, d.trophies);
    if (this.s.id === cur.id) { this.save.save(); return null; }
    // the season changed: close the old one
    const old = SEASONS.find((x) => x.id === this.s.id);
    const rank = rankFor(this.s.peak);
    const rewards = this.inv.grant(rank.reward, { source: 'season_end', txn: `season_end:${this.s.id}`, verified: false });
    const before = d.trophies;
    if (d.trophies > SEASON_RESET_FLOOR) d.trophies = SEASON_RESET_FLOOR + Math.floor((d.trophies - SEASON_RESET_FLOOR) / 2);
    const summary: SeasonEndSummary = { seasonId: this.s.id, seasonName: old?.name ?? this.s.id, rank: rank.id, peak: this.s.peak, trophiesBefore: before, trophiesAfter: d.trophies, rewards };
    this.s.history.push({ id: this.s.id, rank: rank.id, peak: this.s.peak });
    if (this.s.history.length > 20) this.s.history.shift();
    this.s.pendingEnd = summary;
    this.s.id = cur.id; this.s.peak = d.trophies;
    this.notes.push('reward', `Fin de la saison ${old?.number ?? ''} !`, `Rang ${rank.name} : récompenses ajoutées.`);
    this.save.save();
    return summary;
  }

  /** UI: take the pending end-of-season summary (shown once). */
  takePendingEnd(): SeasonEndSummary | null {
    const p = this.s.pendingEnd ?? null;
    if (p) { this.s.pendingEnd = null; this.save.save(); }
    return p;
  }
}
