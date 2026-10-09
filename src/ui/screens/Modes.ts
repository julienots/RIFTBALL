import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { MODES, isModeAvailable } from '../../data/modes';
import { formatDuration } from '../../core/Time';
import { audio } from '../../audio/AudioEngine';
import { BOT_PROFILES } from '../../data/bots';
import { ARENAS } from '../../data/arenas';
import { guideScreen } from './Guide';

const FORMAT: Record<string, string> = { RIFTBALL: '3 VS 3', RIFT_RUSH: '3 VS 3 · 2 MIN', RIFT_CHAOS: '3 VS 3', RIFT_DUEL: '1 VS 1', RIFT_BOSS: '3 VS BOSS', SURVIVAL: '3 VS VAGUES', RIFT_KING: '3 VS 3 · ROI', FIFIX: '3 VS 3 · ROULETTE' };
const LEVELS: [keyof typeof BOT_PROFILES | null, string][] = [[null, 'AUTO'], ['EASY', 'FACILE'], ['NORMAL', 'NORMAL'], ['HARD', 'DIFFICILE'], ['EXPERT', 'EXPERT']];

/** Game modes: every mode is available; bots fill empty slots at the chosen difficulty. */
export function modesScreen(c: Controller): Screen {
  const grid = h('div.modes-grid');
  // PRIVATE MATCHES: share a code with friends (needs the online server)
  const privatePanel = h('div.panel.col', { style: 'padding:.6em .8em;gap:.4em;background:linear-gradient(120deg,#3a0ca3,#7209b7)' });
  const renderPrivate = () => {
    privatePanel.innerHTML = '';
    const input = h('input.text-input', { placeholder: 'CODE', maxLength: 6, style: 'width:7em;text-transform:uppercase;text-align:center;font-family:Lilita One;letter-spacing:.15em', value: '' }) as HTMLInputElement;
    privatePanel.append(
      h('div.row', { style: 'gap:.6em;flex-wrap:wrap' }, h('span.title.stroke-s', '🔒 PARTIE PRIVÉE ENTRE AMIS'),
        h('span.small-text', 'Crée un code, envoie-le à tes amis : vous jouez ensemble en ligne (les places vides sont prises par des bots). Sans trophées.')),
      c.privateCode
        ? h('div.row', { style: 'gap:.6em;flex-wrap:wrap;align-items:center' },
          h('span.pill', { style: 'font-size:1.2em;letter-spacing:.2em;background:#ffe14d;color:#10002b' }, c.privateCode),
          h('button.btn.tiny.green', { onclick: async () => { try { await navigator.clipboard.writeText(`Rejoins ma partie RIFTBALL ! Mode ${c.selectedMode} · code ${c.privateCode}`); c.ui.toast('📋', 'Code copié !'); } catch { c.ui.toast('📋', c.privateCode); } } }, '📋 COPIER'),
          h('button.btn.tiny.yellow', { onclick: () => { audio.play('click'); c.ui.pop(); c.screens.matchmaking(); } }, '▶ LANCER'),
          h('button.btn.tiny.red', { onclick: () => { c.privateCode = ''; renderPrivate(); } }, 'QUITTER'))
        : h('div.row', { style: 'gap:.5em;flex-wrap:wrap;align-items:center' },
          h('button.btn.tiny.yellow', { onclick: () => { audio.play('click'); const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c.privateCode = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); renderPrivate(); } }, '✨ CRÉER UN CODE'),
          h('span.small-text', 'ou'), input,
          h('button.btn.tiny.green', { onclick: () => { const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (v.length < 4) { c.ui.toast('🔒', 'Code invalide'); return; } audio.play('click'); c.privateCode = v; renderPrivate(); } }, 'REJOINDRE')));
  };
  renderPrivate();
  const bots = h('div.row', { style: 'gap:.4em;flex-wrap:wrap;justify-content:center' });
  const body = h('div.col.scroll', { style: 'flex:1;min-height:0;padding:0 .9em .9em;gap:.7em' }, grid,
    h('div.panel.row', { style: 'padding:.5em .8em;gap:.8em;flex-wrap:wrap;justify-content:center' }, h('span.title', '🤖 NIVEAU DES BOTS :'), bots,
      h('span.small-text.muted', 'AUTO = adapté à vos trophées. Les niveaux choisis à la main sont des parties d\'entraînement (sans trophées).')),
    privatePanel,
    h('div.title', { style: 'text-align:center' }, `🗺️ ARÈNES EN ROTATION (${ARENAS.length})`),
    h('div.row', { style: 'gap:.4em;flex-wrap:wrap;justify-content:center' }, ARENAS.map((a) => h('span.tagx', { style: `font-size:.8em;padding:.25em .6em;background:linear-gradient(120deg,${a.theme.floorA},${a.theme.wallSide})` }, a.name + (a.isNew ? ' ✨' : '')))),
    h('div.row', { style: 'justify-content:center;gap:.8em' }, h('button.btn.green', { onclick: () => { audio.play('click'); c.screens.tutorial(); } }, '🎓 TUTORIEL'), h('button.btn.purple', { onclick: () => { audio.play('click'); c.ui.push(guideScreen(c)); } }, '📖 GUIDE DU JEU')));
  const { el, off } = shell(c, 'MODES DE JEU', body, { currencies: false });
  const render = () => {
    grid.innerHTML = '';
    const forced = c.app.events.modifiers().forcedMode;
    for (const m of MODES.filter((x) => x.id !== 'TUTORIAL' && isModeAvailable(x))) {
      const sel = c.selectedMode === m.id;
      grid.appendChild(h('button.mode-card' + (sel ? '.sel' : ''), { style: `--mc:${m.color}`, onclick: () => { audio.play('click'); c.selectedMode = m.id; c.ui.pop(); } },
        h('div.mc-ico', m.icon),
        h('div.col', { style: 'gap:.15em;align-items:flex-start;text-align:left' },
          h('span.mc-name.stroke-s', m.name),
          h('div.row', { style: 'gap:.3em' }, h('span.tagx', FORMAT[m.id]), m.temporary ? h('span.tagx.red', '⏳ TEMPORAIRE · ' + formatDuration(Date.parse(m.temporary.end) - Date.now())) : null, m.ranked ? h('span.tagx.gold', '🏆 CLASSÉ') : h('span.tagx', 'COOP'), forced === m.id ? h('span.tagx.red', 'ÉVÉNEMENT') : null),
          h('span.small-text', m.description)),
        sel ? h('div.mc-check', '✔') : null));
    }
    bots.innerHTML = '';
    for (const [lv, lbl] of LEVELS) bots.appendChild(h('button.btn.tiny' + (c.trainingLevel === lv ? '.yellow' : '.dark'), { onclick: () => { audio.play('tab'); c.trainingLevel = lv; render(); } }, lbl));
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
