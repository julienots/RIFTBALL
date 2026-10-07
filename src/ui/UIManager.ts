import { h } from './dom';
import { audio } from '../audio/AudioEngine';

export interface Screen { el: HTMLElement; onShow?(): void; onHide?(): void; update?(dt: number): void; refresh?(): void; showcase?: boolean }

/** Screen stack, modals and toasts. */
export class UIManager {
  readonly root: HTMLElement;
  private stack: Screen[] = [];
  private toasts: HTMLElement;
  private modals: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.toasts = h('div');
    this.toasts.id = 'toasts';
    root.appendChild(this.toasts);
  }

  get current() { return this.stack[this.stack.length - 1]; }

  /** Replace the whole stack (e.g. go home). */
  set(screen: Screen) {
    for (const s of this.stack) { s.onHide?.(); s.el.remove(); }
    this.stack = [screen];
    this.root.insertBefore(screen.el, this.toasts);
    screen.onShow?.();
  }

  push(screen: Screen) {
    const cur = this.current;
    if (cur) { cur.onHide?.(); cur.el.style.display = 'none'; }
    this.stack.push(screen);
    this.root.insertBefore(screen.el, this.toasts);
    screen.onShow?.();
    audio.play('whoosh');
  }

  pop() {
    if (this.stack.length <= 1) return;
    const s = this.stack.pop()!;
    s.onHide?.(); s.el.remove();
    const cur = this.current;
    cur.el.style.display = '';
    cur.refresh?.();
    cur.onShow?.();
    audio.play('tab');
  }

  modal(title: string | null, body: HTMLElement | HTMLElement[], opts: { closable?: boolean; className?: string; onClose?: () => void } = {}) {
    const close = () => { wrap.remove(); this.modals = this.modals.filter((m) => m !== wrap); opts.onClose?.(); };
    const box = h('div.modal.panel' + (opts.className ? '.' + opts.className : ''),
      opts.closable !== false ? h('button.close', { onclick: () => { audio.play('click'); close(); } }, '✕') : null,
      title ? h('h2.stroke', title) : null,
      body);
    const wrap = h('div.modal-wrap', { onclick: (e: Event) => { if (e.target === wrap && opts.closable !== false) close(); } }, box);
    this.root.appendChild(wrap);
    this.modals.push(wrap);
    return { close, box };
  }

  confirm(title: string, text: string | HTMLElement, okLabel = 'OK', okClass = 'green'): Promise<boolean> {
    return new Promise((res) => {
      let done = false;
      const m = this.modal(title, h('div.col', { style: 'align-items:center;text-align:center;gap:1em' },
        typeof text === 'string' ? h('div', text) : text,
        h('div.row', { style: 'gap:1em' },
          h('button.btn.gray', { onclick: () => { done = true; m.close(); res(false); } }, 'Annuler'),
          h(`button.btn.${okClass}`, { onclick: () => { done = true; audio.play('click'); m.close(); res(true); } }, okLabel))),
        { onClose: () => { if (!done) res(false); } });
    });
  }

  alert(title: string, text: string) {
    const m = this.modal(title, h('div.col', { style: 'align-items:center;text-align:center;gap:1em' }, h('div', text), h('button.btn.green', { onclick: () => m.close() }, 'OK')));
  }

  closeModals() { for (const m of this.modals) m.remove(); this.modals = []; }
  get hasModal() { return this.modals.length > 0; }

  toast(icon: string, title: string, body = '') {
    const t = h('div.toast', h('span.t-ico', icon), h('div', h('b', title), body ? h('div.small-text', body) : null));
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3300);
  }

  update(dt: number) { this.current?.update?.(dt); }
}
