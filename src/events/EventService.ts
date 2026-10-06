import { EVENTS } from '../data/events';
import type { EventData, EventModifiers } from '../data/types';
import { Clock, DAY_MS } from '../core/Time';

export interface ActiveEvent { data: EventData; start: number; end: number }

/** Temporary events (data-driven). A server can replace `source` with a downloaded list. */
export class EventService {
  source: EventData[] = EVENTS;

  windowFor(e: EventData, now = Clock.now()): { start: number; end: number } | null {
    if (e.start && e.end) return { start: Date.parse(e.start), end: Date.parse(e.end) };
    if (e.recurring) {
      const day = Math.floor(now / DAY_MS);
      const cyc = e.recurring.everyDays;
      const startDay = day - ((((day - e.recurring.offsetDays) % cyc) + cyc) % cyc);
      return { start: startDay * DAY_MS, end: (startDay + e.recurring.lengthDays) * DAY_MS };
    }
    return null;
  }

  active(now = Clock.now()): ActiveEvent[] {
    const out: ActiveEvent[] = [];
    for (const e of this.source) {
      const w = this.windowFor(e, now);
      if (w && now >= w.start && now < w.end) out.push({ data: e, ...w });
    }
    return out;
  }

  upcoming(now = Clock.now(), days = 14): ActiveEvent[] {
    const out: ActiveEvent[] = [];
    for (const e of this.source) {
      for (let d = 1; d <= days; d++) {
        const w = this.windowFor(e, now + d * DAY_MS);
        if (w && w.start > now && !out.some((o) => o.data.id === e.id)) { out.push({ data: e, ...w }); break; }
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  modifiers(now = Clock.now()): EventModifiers {
    const m: EventModifiers = {};
    for (const { data } of this.active(now)) {
      const x = data.modifiers;
      if (x.riftSpeedMul) m.riftSpeedMul = (m.riftSpeedMul ?? 1) * x.riftSpeedMul;
      if (x.xpMul) m.xpMul = (m.xpMul ?? 1) * x.xpMul;
      if (x.passXpMul) m.passXpMul = (m.passXpMul ?? 1) * x.passXpMul;
      if (x.coinMul) m.coinMul = (m.coinMul ?? 1) * x.coinMul;
      if (x.mutationIntervalMul) m.mutationIntervalMul = (m.mutationIntervalMul ?? 1) * x.mutationIntervalMul;
      if (x.arenaBias) m.arenaBias = x.arenaBias;
      if (x.forcedMode) m.forcedMode = x.forcedMode;
    }
    return m;
  }

  isActive(id: string, now = Clock.now()) { return this.active(now).some((a) => a.data.id === id); }
}
