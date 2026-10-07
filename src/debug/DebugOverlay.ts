import type { Controller } from '../ui/Controller';
import { BuildConfig } from '../core/config';
import type { MutationId } from '../data/types';

/** Development-only overlay: FPS, ping, memory, entities, Rift state, timers. Toggle with F3 or 3-finger tap. */
export class DebugOverlay {
  el: HTMLElement;
  fpsEl: HTMLElement;
  visible = false;
  private frames = 0; private acc = 0; fps = 60;

  constructor(private c: Controller) {
    this.el = document.createElement('div'); this.el.id = 'debug'; this.el.style.display = 'none';
    this.fpsEl = document.createElement('div'); this.fpsEl.id = 'fps'; this.fpsEl.style.display = 'none';
    document.getElementById('ui')!.append(this.el, this.fpsEl);
    if (BuildConfig.isDev) {
      window.addEventListener('keydown', (e) => {
        if (e.code === 'F3') this.toggle();
        if (e.code === 'F4' && c.session) c.session.match.mutations.trigger(['FURY', 'CLONE', 'ELECTRIC', 'GRAVITY', 'PORTAL', 'PHASE', 'CHAOS'][Math.floor(Math.random() * 7)] as MutationId);
      });
      window.addEventListener('touchstart', (e) => { if (e.touches.length === 3) this.toggle(); });
      (window as any).riftDebug = { controller: c, trigger: (id: MutationId) => c.session?.match.mutations.trigger(id), app: c.app };
    }
  }

  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; }

  update(dt: number) {
    this.frames++; this.acc += dt;
    if (this.acc >= 0.5) { this.fps = this.frames / this.acc; this.frames = 0; this.acc = 0; }
    const showFps = this.c.data.settings.showFps;
    this.fpsEl.style.display = showFps && !this.visible ? '' : 'none';
    if (showFps) this.fpsEl.textContent = `${Math.round(this.fps)} FPS`;
    if (!this.visible) return;
    const s = this.c.session, m = s?.match;
    const mem = (performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB` : 'n/a';
    const r = this.c.renderer;
    const lines = [
      `FPS          ${this.fps.toFixed(0)}  (sim ${s ? s.simRate.toFixed(0) : '-'} Hz)`,
      `PING         ${this.c.app.net.lastPingMs >= 0 ? this.c.app.net.lastPingMs + ' ms' : 'offline (local)'}`,
      `MEMORY       ${mem}`,
      `DRAW CALLS   ${r.drawCalls}  TRIS ${r.triangles}`,
      `PARTICLES    ${r.particles.count}`,
    ];
    if (m) {
      const rift = m.mainRift();
      lines.push(
        `ENTITY COUNT heroes ${m.heroes.length} proj ${m.projectiles.filter((p) => p.active).length}/${m.projectiles.length} zones ${m.zones.filter((z) => z.active).length} rifts ${m.rifts.length} walls ${m.arena.walls.length}`,
        `RIFT STATE   ${rift?.state} mut=${m.mutation} next=${m.mutations.nextAt === Infinity ? '-' : (m.mutations.nextAt - m.time).toFixed(1)}s`,
        `MATCH TIME   ${m.time.toFixed(1)}s clock=${m.clock.toFixed(1)} phase=${m.phase}`,
        `TEAM SCORE   ${m.score[0]} - ${m.score[1]}`,
        `BOT COUNT    ${m.brains.size}`,
        `F4 = mutation aléatoire`,
      );
    }
    this.el.textContent = lines.join('\n');
  }
}
