import type { HeroCommand } from './entities';

export type AimSlot = 'attack' | 'ability' | 'ult';

export interface AimState { slot: AimSlot; dx: number; dy: number; mag: number; manual: boolean }

/**
 * Touch-first controls (virtual joystick + drag-to-aim buttons) with keyboard/mouse fallback.
 * Produces a HeroCommand every frame. Screen-space drags map to world X/Y directly (top-down camera).
 */
export class Input {
  moveX = 0; moveY = 0;
  aiming: AimState | null = null;
  private queued: { slot: AimSlot; dx: number; dy: number; mag: number }[] = [];
  private keys = new Set<string>();
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private btnPointers = new Map<number, { slot: AimSlot; ox: number; oy: number; el: HTMLElement }>();
  mouse = { x: 0, y: 0, inside: false };
  usingMouse = false;
  maxDrag = 90;
  enabled = true;
  onEmote: () => void = () => {};
  private cleanup: (() => void)[] = [];
  screenToWorldDir: ((sx: number, sy: number) => { x: number; y: number; dist: number } | null) | null = null;

  constructor(private root: HTMLElement, private joyBase: HTMLElement, private joyKnob: HTMLElement, private buttons: Record<AimSlot, HTMLElement>) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, ev: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => { t.addEventListener(ev, fn, opts); this.cleanup.push(() => t.removeEventListener(ev, fn, opts)); };
    // joystick: anywhere on the left 45% of the screen
    on(root, 'pointerdown', (e: PointerEvent) => {
      if (!this.enabled) return;
      if ((e.target as HTMLElement).closest('[data-slot],.hud-btn-ui')) return;
      if (e.pointerType === 'mouse') return;
      if (e.clientX < window.innerWidth * 0.45 && this.joyId === null) {
        this.joyId = e.pointerId;
        this.joyOrigin = { x: e.clientX, y: e.clientY };
        this.joyBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        this.joyBase.classList.add('active');
        this.updateJoy(e.clientX, e.clientY);
        e.preventDefault();
      }
    });
    on(window, 'pointermove', (e: PointerEvent) => {
      if (e.pointerId === this.joyId) { this.updateJoy(e.clientX, e.clientY); return; }
      const b = this.btnPointers.get(e.pointerId);
      if (b) {
        const dx = e.clientX - b.ox, dy = e.clientY - b.oy, d = Math.hypot(dx, dy);
        const manual = d > 18;
        this.aiming = { slot: b.slot, dx: manual ? dx / d : 0, dy: manual ? dy / d : 0, mag: Math.min(1, d / this.maxDrag), manual };
        const knob = b.el.querySelector('.aim-knob') as HTMLElement | null;
        if (knob) { const k = Math.min(d, this.maxDrag * 0.6); knob.style.transform = manual ? `translate(${(dx / d) * k}px, ${(dy / d) * k}px)` : ''; }
      }
      if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) {
        this.joyId = null; this.moveX = this.moveY = 0;
        this.joyBase.classList.remove('active');
        this.joyKnob.style.transform = '';
      }
      const b = this.btnPointers.get(e.pointerId);
      if (b) {
        this.btnPointers.delete(e.pointerId);
        b.el.classList.remove('pressed');
        const knob = b.el.querySelector('.aim-knob') as HTMLElement | null;
        if (knob) knob.style.transform = '';
        const a = this.aiming;
        if (e.type !== 'pointercancel') this.queued.push({ slot: b.slot, dx: a && a.slot === b.slot && a.manual ? a.dx : 0, dy: a && a.slot === b.slot && a.manual ? a.dy : 0, mag: a?.mag ?? 0 });
        this.aiming = null;
      }
    };
    on(window, 'pointerup', end);
    on(window, 'pointercancel', end);
    for (const slot of Object.keys(buttons) as AimSlot[]) {
      const el = buttons[slot];
      on(el, 'pointerdown', (e: PointerEvent) => {
        if (!this.enabled) return;
        e.preventDefault(); e.stopPropagation();
        if (e.pointerType === 'mouse') { this.queued.push({ slot, dx: 0, dy: 0, mag: 0 }); return; }
        el.classList.add('pressed');
        const r = el.getBoundingClientRect();
        this.btnPointers.set(e.pointerId, { slot, ox: r.left + r.width / 2, oy: r.top + r.height / 2, el });
        this.aiming = { slot, dx: 0, dy: 0, mag: 0, manual: false };
      });
    }
    // keyboard & mouse (desktop / emulator)
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyE') this.queueMouse('ability');
      if (e.code === 'KeyR' || e.code === 'Space') this.queueMouse('ult');
      if (e.code === 'KeyF') this.onEmote();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(root, 'mousedown', (e: MouseEvent) => {
      if (!this.enabled || (e.target as HTMLElement).closest('button,[data-slot],.hud-btn-ui')) return;
      this.usingMouse = true;
      this.queueMouse(e.button === 2 ? 'ability' : 'attack');
    });
    on(root, 'contextmenu', (e: Event) => e.preventDefault());
    on(window, 'blur', () => { this.keys.clear(); this.moveX = this.moveY = 0; });
  }

  private queueMouse(slot: AimSlot) {
    if (this.usingMouse && this.mouse.inside && this.screenToWorldDir) {
      const d = this.screenToWorldDir(this.mouse.x, this.mouse.y);
      if (d) { this.queued.push({ slot, dx: d.x, dy: d.y, mag: -d.dist }); return; }
    }
    this.queued.push({ slot, dx: 0, dy: 0, mag: 0 });
  }

  private updateJoy(x: number, y: number) {
    let dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
    const d = Math.hypot(dx, dy), max = 60;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, d / max);
    this.moveX = d > 6 ? (dx / Math.max(1, Math.hypot(dx, dy))) * Math.max(0.35, k) : 0;
    this.moveY = d > 6 ? (dy / Math.max(1, Math.hypot(dx, dy))) * Math.max(0.35, k) : 0;
    if (d > 6) this.joyKnob.classList.add('moving'); else this.joyKnob.classList.remove('moving');
  }

  /** Writes this frame's intent to the command. `ranges` converts drag magnitude to world distance. */
  apply(cmd: HeroCommand, ranges: Record<AimSlot, number>) {
    let mx = this.moveX, my = this.moveY;
    if (this.joyId === null) {
      mx = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('KeyQ') || this.keys.has('ArrowLeft') ? 1 : 0); // WASD + ZQSD (AZERTY)
      my = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('KeyZ') || this.keys.has('ArrowUp') ? 1 : 0);
    }
    cmd.mx = this.enabled ? mx : 0; cmd.my = this.enabled ? my : 0;
    const q = this.queued.shift();
    if (q && this.enabled) {
      cmd.aimX = q.dx; cmd.aimY = q.dy;
      cmd.aimDist = q.mag < 0 ? -q.mag : q.dx || q.dy ? q.mag * ranges[q.slot] : 0;
      if (q.slot === 'attack') cmd.attack = true;
      if (q.slot === 'ability') cmd.ability = true;
      if (q.slot === 'ult') cmd.ult = true;
    }
  }

  reset() { this.queued.length = 0; this.aiming = null; this.moveX = this.moveY = 0; this.joyId = null; this.btnPointers.clear(); }
  dispose() { for (const c of this.cleanup) c(); this.cleanup = []; }
}
