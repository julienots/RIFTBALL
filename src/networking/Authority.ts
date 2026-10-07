import type { HeroStats } from '../game/entities';
import type { ModeId } from '../data/types';
import { BuildConfig } from '../core/config';

/**
 * The authority decides match outcomes, rewards, trophies, purchases and premium inventory.
 *  - LocalAuthority: offline / prototype — validates reports for plausibility and de-duplicates them.
 *  - RemoteAuthority: the future dedicated server (see /server). The client never trusts itself online.
 */
export interface MatchReport {
  matchId: string;
  mode: ModeId;
  arena: string;
  heroId: string;
  outcome: 'win' | 'loss' | 'draw';
  score: [number, number];
  myTeam: 0 | 1;
  duration: number;
  stats: HeroStats;
  mvp: boolean;
  ranked: boolean;
  mutationsSeen: number;
  vsBots: boolean;
}

export interface ReportVerdict { accepted: boolean; reason?: string }

export interface Authority {
  readonly kind: 'local' | 'remote';
  validateMatch(report: MatchReport, alreadyProcessed: (id: string) => boolean): Promise<ReportVerdict>;
  fetchRevocations(): Promise<{ orderId: string; productId: string }[]>;
}

export class LocalAuthority implements Authority {
  readonly kind = 'local' as const;
  async validateMatch(r: MatchReport, alreadyProcessed: (id: string) => boolean): Promise<ReportVerdict> {
    return validateMatchReport(r, alreadyProcessed);
  }
  async fetchRevocations() { return []; }
}

/** Plausibility checks shared by client and server (server re-runs them with its own data). */
export function validateMatchReport(r: MatchReport, alreadyProcessed: (id: string) => boolean): ReportVerdict {
  if (!r.matchId || alreadyProcessed(r.matchId)) return { accepted: false, reason: 'duplicate' };
  if (!(r.duration > 0) || r.duration > 60 * 12) return { accepted: false, reason: 'duration' };
  const s = r.stats;
  const perMin = Math.max(1, r.duration / 60);
  if (s.goals > 12 * perMin || s.kills > 25 * perMin || s.damage > 120000 * perMin || s.captures > 60 * perMin) return { accepted: false, reason: 'implausible_stats' };
  if (r.score[0] < 0 || r.score[1] < 0 || r.score[0] + r.score[1] > 40 * perMin) return { accepted: false, reason: 'implausible_score' };
  const my = r.score[r.myTeam], their = r.score[r.myTeam === 0 ? 1 : 0];
  const pve = r.mode === 'RIFT_BOSS' || r.mode === 'SURVIVAL';
  if (!pve) {
    if (r.outcome === 'win' && my <= their) return { accepted: false, reason: 'outcome_mismatch' };
    if (r.outcome === 'loss' && my >= their) return { accepted: false, reason: 'outcome_mismatch' };
  }
  if (!pve && r.duration < 20 && r.outcome !== 'loss') return { accepted: false, reason: 'too_short' };
  return { accepted: true };
}

/** Uses the remote server when one is configured (can change at runtime from the settings), else local rules. */
export class AutoAuthority implements Authority {
  private local = new LocalAuthority();
  constructor(private token: () => string) {}
  get kind() { return BuildConfig.serverUrl ? 'remote' as const : 'local' as const; }
  private get impl(): Authority { return BuildConfig.serverUrl ? new RemoteAuthority(BuildConfig.serverUrl, this.token) : this.local; }
  validateMatch(r: MatchReport, p: (id: string) => boolean) {
    // offline matches are validated locally even when a server exists; online ones only by the server
    if (BuildConfig.serverUrl && r.matchId.startsWith('online-')) return this.impl.validateMatch(r, p).catch(() => ({ accepted: false, reason: 'server_unreachable' }));
    return this.local.validateMatch(r, p);
  }
  fetchRevocations() { return BuildConfig.serverUrl ? this.impl.fetchRevocations().catch(() => []) : Promise.resolve([]); }
}

export class RemoteAuthority implements Authority {
  readonly kind = 'remote' as const;
  constructor(private base = BuildConfig.serverUrl, private token: () => string = () => '') {}
  private async post(path: string, body: unknown) {
    const r = await fetch(this.base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.token() }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('server ' + r.status);
    return r.json();
  }
  async validateMatch(r: MatchReport): Promise<ReportVerdict> { return this.post('/v1/match/report', r); }
  async fetchRevocations() {
    const r = await fetch(this.base + '/v1/iap/revocations', { headers: { authorization: 'Bearer ' + this.token() } });
    return r.ok ? r.json() : [];
  }
}
