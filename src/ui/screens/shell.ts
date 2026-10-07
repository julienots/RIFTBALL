import { h } from '../dom';
import type { Controller } from '../Controller';
import { currencyBar } from './Home';
import { audio } from '../../audio/AudioEngine';

/** Standard sub-screen frame: back button, title, currencies. */
export function shell(c: Controller, title: string, body: HTMLElement | HTMLElement[], opts: { currencies?: boolean; extra?: HTMLElement; transparent?: boolean } = {}) {
  const cur = opts.currencies !== false ? currencyBar(c) : null;
  const el = h('div.screen' + (opts.transparent ? '' : '.bg'),
    h('div.topbar',
      h('button.btn.small.red.back', { onclick: () => { audio.play('click'); c.ui.pop(); } }, '◀'),
      h('h2.stroke', title),
      opts.extra ?? null,
      cur),
    body);
  return { el, off: () => (cur as any)?._off?.() };
}
