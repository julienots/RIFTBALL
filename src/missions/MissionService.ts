import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory } from '../progression/Inventory';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import type { EventService } from '../events/EventService';
import { DAILY_COUNT, MISSIONS, WEEKLY_COUNT } from '../data/missions';
import type { MissionData, MissionStat } from '../data/types';
import { Clock, DAY_MS, utcDayIndex, utcWeekIndex } from '../core/Time';
import { hashString, Rng } from '../core/Rng';
import { currentSeason } from '../data/seasons';

export interface MissionView { data: MissionData; progress: number; done: boolean; claimed: boolean; endsAt: number }

export class MissionService {
  constructor(private save: SaveSystem, private inv: Inventory, private bus: EventBus<AppEvents>, private notes: NotificationCenter, private events: EventService) {}
  private get m() { return this.save.data.missions; }

  /** Rolls new daily/weekly sets when the period changes. Deterministic per player & period. */
  refresh() {
    const d = this.m, now = Clock.now();
    const dk = 'd' + utcDayIndex(now), wk = 'w' + utcWeekIndex(now), sk = currentSeason(now).id;
    const resetScope = (scope: string) => {
      for (const ms of MISSIONS) if (ms.scope === scope) { delete d.progress[ms.id]; d.claimed = d.claimed.filter((c) => !c.startsWith(ms.id + '@')); }
    };
    if (d.dailyKey !== dk) { resetScope('daily'); d.dailyKey = dk; }
    if (d.weeklyKey !== wk) { resetScope('weekly'); d.weeklyKey = wk; }
    if (d.seasonKey !== sk) { resetScope('season'); d.seasonKey = sk; }
    this.save.save();
  }

  private pick(scope: 'daily' | 'weekly', key: string, n: number) {
    const rng = new Rng(hashString(key + this.save.data.playerId));
    return rng.shuffle(MISSIONS.filter((x) => x.scope === scope)).slice(0, n);
  }

  active(): MissionView[] {
    this.refresh();
    const now = Clock.now();
    const nextDay = (utcDayIndex(now) + 1) * DAY_MS;
    const nextWeek = (utcWeekIndex(now) + 1) * 7 * DAY_MS - 3 * DAY_MS;
    const list: { data: MissionData; endsAt: number }[] = [
      ...this.pick('daily', this.m.dailyKey, DAILY_COUNT).map((data) => ({ data, endsAt: nextDay })),
      ...this.pick('weekly', this.m.weeklyKey, WEEKLY_COUNT).map((data) => ({ data, endsAt: nextWeek })),
      ...MISSIONS.filter((x) => x.scope === 'season').map((data) => ({ data, endsAt: Date.parse(currentSeason(now).end) })),
    ];
    for (const ev of this.events.active(now)) for (const data of MISSIONS.filter((x) => x.scope === 'event' && x.eventId === ev.data.id)) list.push({ data, endsAt: ev.end });
    return list.map(({ data, endsAt }) => {
      const progress = Math.min(data.target, this.m.progress[data.id] ?? 0);
      return { data, progress, done: progress >= data.target, claimed: this.m.claimed.includes(this.claimKey(data)), endsAt };
    });
  }

  private claimKey(m: MissionData) {
    const k = m.scope === 'daily' ? this.m.dailyKey : m.scope === 'weekly' ? this.m.weeklyKey : m.scope === 'season' ? this.m.seasonKey : m.eventId;
    return `${m.id}@${k}`;
  }

  /** Feed match statistics; returns completed mission ids. */
  record(delta: Partial<Record<MissionStat, number>>): string[] {
    const done: string[] = [];
    for (const v of this.active()) {
      if (v.done || v.claimed) continue;
      const inc = delta[v.data.stat] ?? 0;
      if (inc <= 0) continue;
      const next = Math.min(v.data.target, (this.m.progress[v.data.id] ?? 0) + inc);
      this.m.progress[v.data.id] = next;
      if (next >= v.data.target) {
        done.push(v.data.id);
        this.bus.emit('missionComplete', { id: v.data.id, text: v.data.text });
        this.notes.push('mission', 'Mission terminée !', v.data.text);
      }
    }
    this.save.save();
    return done;
  }

  claim(id: string) {
    const v = this.active().find((x) => x.data.id === id);
    if (!v || !v.done || v.claimed) return null;
    this.m.claimed.push(this.claimKey(v.data));
    return this.inv.grant(v.data.reward, { source: 'mission', txn: `mission:${this.claimKey(v.data)}`, verified: false });
  }

  get claimableCount() { return this.active().filter((v) => v.done && !v.claimed).length; }
}
