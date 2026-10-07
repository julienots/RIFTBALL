import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { MODES } from '../../data/modes';
import { audio } from '../../audio/AudioEngine';
import { BOT_PROFILES } from '../../data/bots';

const FORMAT: Record<string, string> = { RIFTBALL: '3 VS 3', RIFT_RUSH: '3 VS 3 · 2 MIN', RIFT_CHAOS: '3 VS 3', RIFT_DUEL: '1 VS 1', RIFT_BOSS: '3 VS BOSS', SURVIVAL: '3 VS VAGUES' };
const LEVELS: [keyof typeof BOT_PROFILES | null, string][] = [[null, 'AUTO'], ['EASY', 'FACILE'], ['NORMAL', 'NORMAL'], ['HARD', 'DIFFICILE'], ['EXPERT', 'EXPERT']];

/** Game modes: every mode is available; bots fill empty slots at the chosen difficulty. */
export function modesScreen(c: Controller): Screen {
  const grid = h('div.modes-grid');
  const bots = h('div.row', { style: 'gap:.4em;flex-wrap:wrap;justify-content:center' });
  const body = h('div.col.scroll', { style: 'flex:1;min-height:0;padding:0 .9em .9em;gap:.7em' }, grid,
    h('div.panel.row', { style: 'padding:.5em .8em;gap:.8em;flex-wrap:wrap;justify-content:center' }, h('span.title', '🤖 NIVEAU DES BOTS :'), bots,
      h('span.small-text.muted', 'AUTO = adapté à vos trophées. Les niveaux choisis à la main sont des parties d\'entraînement (sans trophées).')),
    h('div.row', { style: 'justify-content:center;gap:.8em' }, h('button.btn.green', { onclick: () => { audio.play('click'); c.screens.tutorial(); } }, '🎓 TUTORIEL')));
  const { el, off } = shell(c, 'MODES DE JEU', body, { currencies: false });
  const render = () => {
    grid.innerHTML = '';
    const forced = c.app.events.modifiers().forcedMode;
    for (const m of MODES.filter((x) => x.id !== 'TUTORIAL')) {
      const sel = c.selectedMode === m.id;
      grid.appendChild(h('button.mode-card' + (sel ? '.sel' : ''), { style: `--mc:${m.color}`, onclick: () => { audio.play('click'); c.selectedMode = m.id; c.ui.pop(); } },
        h('div.mc-ico', m.icon),
        h('div.col', { style: 'gap:.15em;align-items:flex-start;text-align:left' },
          h('span.mc-name.stroke-s', m.name),
          h('div.row', { style: 'gap:.3em' }, h('span.tagx', FORMAT[m.id]), m.ranked ? h('span.tagx.gold', '🏆 CLASSÉ') : h('span.tagx', 'COOP'), forced === m.id ? h('span.tagx.red', 'ÉVÉNEMENT') : null),
          h('span.small-text', m.description)),
        sel ? h('div.mc-check', '✔') : null));
    }
    bots.innerHTML = '';
    for (const [lv, lbl] of LEVELS) bots.appendChild(h('button.btn.tiny' + (c.trainingLevel === lv ? '.yellow' : '.dark'), { onclick: () => { audio.play('tab'); c.trainingLevel = lv; render(); } }, lbl));
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
