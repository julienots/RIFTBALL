import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg, type Snapshot } from './Protocol';
import type { ModeId } from '../data/types';
import { BuildConfig } from '../core/config';

export type OnlineStatus = 'disconnected' | 'connecting' | 'connected';

/** WebSocket client for the online game server (auto-reconnect, ping, typed messages). */
export class OnlineClient {
  private ws: WebSocket | null = null;
  status: OnlineStatus = 'disconnected';
  pingMs = -1;
  playersOnline = 0;
  private handlers = new Set<(m: ServerMsg) => void>();
  private pingTimer: any;
  private hello: { playerId: string; name: string; trophies: number } | null = null;

  static wsUrl(base = BuildConfig.serverUrl) {
    if (!base) return '';
    return base.replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/play';
  }

  on(fn: (m: ServerMsg) => void) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  /** Connects (or reuses the connection). Resolves false if the server is unreachable within the timeout. */
  connect(hello: { playerId: string; name: string; trophies: number }, timeoutMs = 4000): Promise<boolean> {
    this.hello = hello;
    if (this.status === 'connected' && this.ws) { this.send({ t: 'hello', v: PROTOCOL_VERSION, ...hello }); return Promise.resolve(true); }
    const url = OnlineClient.wsUrl();
    if (!url || typeof WebSocket === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
      this.status = 'connecting';
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { this.status = 'disconnected'; finish(false); return; }
      this.ws = ws;
      const to = setTimeout(() => { if (this.status !== 'connected') { ws.close(); finish(false); } }, timeoutMs);
      ws.onopen = () => { this.send({ t: 'hello', v: PROTOCOL_VERSION, ...hello }); };
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try { msg = JSON.parse(String(e.data)); } catch { return; }
        if (msg.t === 'welcome') { this.status = 'connected'; this.playersOnline = msg.online; clearTimeout(to); finish(true); this.startPing(); }
        if (msg.t === 'pong') this.pingMs = Math.round(performance.now() - msg.c);
        if (msg.t === 'queue') this.playersOnline = msg.online;
        for (const h of this.handlers) h(msg);
      };
      ws.onclose = () => { this.status = 'disconnected'; clearInterval(this.pingTimer); clearTimeout(to); finish(false); for (const h of this.handlers) h({ t: 'error', msg: 'disconnected' }); };
      ws.onerror = () => { /* onclose follows */ };
    });
  }

  private startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    this.send({ t: 'ping', c: performance.now() });
  }

  send(m: ClientMsg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  queue(mode: ModeId, heroId: string, skinId: string, botLevel?: string) { this.send({ t: 'queue', mode, heroId, skinId, botLevel }); }
  cancel() { this.send({ t: 'cancel' }); }
  leave() { this.send({ t: 'leave' }); }
  close() { clearInterval(this.pingTimer); this.ws?.close(); this.ws = null; this.status = 'disconnected'; }
}

export type { Snapshot };
