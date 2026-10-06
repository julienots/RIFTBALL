import type { KVBackend } from '../save/Storage';
import { BuildConfig } from '../core/config';

/** Allowed events — anything else is dropped. No personal data: only an anonymous install id + gameplay values. */
export const ANALYTICS_EVENTS = [
  'app_open', 'match_start', 'match_end', 'character_selected', 'skin_unlocked', 'shop_open', 'offer_view',
  'purchase_started', 'purchase_completed', 'purchase_failed', 'battlepass_level', 'mission_completed', 'tutorial_step', 'tutorial_done',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export class Analytics {
  private queue: { e: string; t: number; p: Record<string, string | number | boolean> }[] = [];
  enabled = true;
  constructor(private kv: KVBackend, private installId: () => string) {
    try { this.queue = JSON.parse(kv.get('riftball.analytics') ?? '[]'); } catch { this.queue = []; }
  }

  track(event: AnalyticsEvent, params: Record<string, string | number | boolean> = {}) {
    if (!this.enabled || !(ANALYTICS_EVENTS as readonly string[]).includes(event)) return;
    this.queue.push({ e: event, t: Date.now(), p: params });
    if (this.queue.length > 500) this.queue.splice(0, this.queue.length - 500);
    if (BuildConfig.isDev && typeof console !== 'undefined') console.debug('[analytics]', event, params);
    this.persist();
  }

  get pending() { return this.queue.length; }

  private persist() { this.kv.set('riftball.analytics', JSON.stringify(this.queue)); }

  /** Upload when a server exists; otherwise events wait locally (bounded queue). */
  async flush() {
    if (!BuildConfig.serverUrl || this.queue.length === 0) return;
    const batch = this.queue.slice(0, 100);
    try {
      const r = await fetch(BuildConfig.serverUrl + '/v1/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ install: this.installId(), events: batch }) });
      if (r.ok) { this.queue.splice(0, batch.length); this.persist(); }
    } catch { /* keep */ }
  }
}
