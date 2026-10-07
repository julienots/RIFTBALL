import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import type { BoardScope } from '../../leaderboard/LeaderboardService';

const TABS: [BoardScope, string][] = [['GLOBAL', '🌍 MONDIAL'], ['REGIONAL', '🗺️ RÉGIONAL'], ['FRIENDS', '🤝 AMIS'], ['SEASON', '📅 SAISON']];

export function leaderboardScreen(c: Controller): Screen {
  let scope: BoardScope = 'GLOBAL';
  const tabs = h('div.tabs');
  const list = h('div.scroll', { style: 'flex:1;min-height:0;padding:.7em' });
  const note = h('div.small-text.muted', { style: 'padding:0 1.6em .5em' });
  const body = h('div.col', { style: 'flex:1;min-height:0;gap:0' }, tabs, h('div.panel', { style: 'flex:1;min-height:0;margin:0 .9em .4em;display:flex;flex-direction:column;border-radius:0 1em 1em 1em' }, list), note);
  const { el, off } = shell(c, 'CLASSEMENT', body, { currencies: false });
  const render = () => {
    tabs.innerHTML = '';
    for (const [s, l] of TABS) tabs.appendChild(h('button.tab' + (s === scope ? '.on' : ''), { onclick: () => { audio.play('tab'); scope = s; render(); } }, l));
    list.innerHTML = '';
    const rows = c.app.leaderboard.get(scope);
    const meIdx = rows.findIndex((r) => r.me);
    const shown = rows.slice(0, 50);
    if (meIdx >= 50) shown.push(rows[meIdx]);
    for (const r of shown) {
      list.appendChild(h('div.lb-row' + (r.me ? '.me' : ''),
        h('span.rk.stroke-s', r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : '#' + r.rank),
        h('div.av', h('img', { src: c.portrait(r.heroId) })),
        h('div.col', { style: 'gap:0' }, h('span.title.stroke-s', r.name), h('span.small-text', r.region)),
        h('span.pill', '🏆 ' + fmt(r.trophies))));
    }
    note.textContent = c.app.net.online ? 'Classement en ligne.' : 'Hors ligne : aperçu local du classement — le classement officiel sera synchronisé avec le serveur.';
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
