import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import { BuildConfig } from '../core/config';

/** Detects network + server availability. Online features check `online` and degrade gracefully. */
export class Connectivity {
  networkUp = true;
  serverUp = false;
  lastPingMs = -1;
  private timer: any;

  constructor(private bus: EventBus<AppEvents>) {}

  get online() { return this.networkUp && (BuildConfig.serverUrl ? this.serverUp : false); }
  get hasServer() { return !!BuildConfig.serverUrl; }

  start() {
    if (typeof window === 'undefined') return;
    this.networkUp = navigator.onLine !== false;
    window.addEventListener('online', () => { this.networkUp = true; this.ping(); });
    window.addEventListener('offline', () => { this.networkUp = false; this.serverUp = false; this.bus.emit('connectivity', { online: false }); });
    this.ping();
    this.timer = setInterval(() => this.ping(), 30000);
  }

  async ping() {
    if (!BuildConfig.serverUrl || !this.networkUp) { this.serverUp = false; return; }
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(BuildConfig.serverUrl + '/v1/health', { signal: ctrl.signal });
      clearTimeout(to);
      const was = this.serverUp;
      this.serverUp = r.ok;
      this.lastPingMs = Math.round(performance.now() - t0);
      if (was !== this.serverUp) this.bus.emit('connectivity', { online: this.online });
    } catch {
      const was = this.serverUp;
      this.serverUp = false;
      if (was) this.bus.emit('connectivity', { online: false });
    }
  }

  stop() { clearInterval(this.timer); }
}
