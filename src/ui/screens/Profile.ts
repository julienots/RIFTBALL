import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { getCosmetic } from '../../data/cosmetics';
import { getCharacter, PLAYABLE } from '../../data/characters';
import { MASTERY } from '../../data/progression';
import { getMode } from '../../data/modes';

export function profileScreen(c: Controller): Screen {
  const body = h('div.row', { style: 'flex:1;min-height:0;padding:0 .9em .9em;gap:.8em;align-items:stretch' });
  const { el, off } = shell(c, 'PROFIL', body, { currencies: false });
  const render = () => {
    body.innerHTML = '';
    const d = c.data, s = c.app.profile.summary();
    const banner = getCosmetic(d.profile.banner);
    const title = getCosmetic(d.profile.title);
    const badges = PLAYABLE.map((p) => ({ p, m: c.app.progression.masteryOf(p.id) })).filter((x) => x.m.badge);
    const stat = (k: string, v: string | number) => h('div.panel', { style: 'padding:.4em .6em;background:rgba(10,5,30,.35);text-align:center' }, h('div.title', { style: 'font-size:1.3em' }, String(v)), h('div.small-text.muted', k));
    body.append(
      h('div.col', { style: 'width:36%;gap:.5em' },
        h('div.panel', { style: `padding:.8em;background:linear-gradient(135deg,${banner?.visual.a ?? '#3a0ca3'},${banner?.visual.b ?? '#7b61ff'});display:flex;gap:.7em;align-items:center` },
          h('div', { style: 'width:5em;height:5em;border-radius:1em;border:.15em solid #1a1030;overflow:hidden;background:#4a37a8' }, h('img', { src: c.portrait(c.heroId, c.skinId), style: 'width:130%;margin:-8% -15%' })),
          h('div.col', { style: 'gap:.15em' },
            h('span.title.stroke', { style: 'font-size:1.5em' }, d.profile.name),
            h('span.small-text', '« ' + (title?.name ?? '') + ' »'),
            h('div.row', h('div.lvl', h('span', String(d.level))), h('span.pill', '🏆 ' + fmt(d.trophies)), h('span.small-text', `Record ${fmt(d.bestTrophies)}`)))),
        h('div.row', { style: 'gap:.4em' },
          h('button.btn.small.purple', { onclick: () => rename(c, render) }, '✏️ PSEUDO'),
          h('span.small-text.muted', `ID : ${d.playerId.slice(0, 8).toUpperCase()}`)),
        h('div.title', 'BADGES DE MAÎTRISE'),
        h('div.row', { style: 'flex-wrap:wrap;gap:.35em' }, badges.length ? badges.map((b) => h('span.pill', { style: `background:${b.m.badge!.color};height:1.9em;font-size:.8em` }, `${b.p.name} · ${b.m.badge!.name}`)) : h('span.small-text.muted', `Atteignez la maîtrise ${MASTERY.badges[0].level} avec un héros.`))),
      h('div.col', { style: 'flex:1;gap:.5em;min-height:0' },
        h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:.4em' },
          stat('Victoires', s.stats.wins), stat('Matchs', s.stats.matches), stat('Taux de victoire', s.winRate + '%'), stat('Points marqués', s.stats.goals),
          stat('Éliminations', s.stats.kills), stat('Meilleure série', s.stats.bestStreak), stat('MVP', s.stats.mvps), stat('Skins', s.skins)),
        h('div.row', h('span.title', 'PERSONNAGE FAVORI :'), h('span', getCharacter(s.mostPlayed).name)),
        h('div.title', 'HISTORIQUE RÉCENT'),
        h('div.scroll.col', { style: 'gap:.25em;flex:1;min-height:0' }, d.matchHistory.length ? d.matchHistory.slice().reverse().map((m) => h('div.row.small-text.panel', { style: `padding:.3em .6em;gap:.6em;background:${m.result === 'win' ? 'rgba(61,220,132,.25)' : m.result === 'loss' ? 'rgba(255,59,78,.2)' : 'rgba(10,5,30,.3)'}` },
          h('span.title', { style: 'width:5.5em' }, m.result === 'win' ? 'VICTOIRE' : m.result === 'loss' ? 'DÉFAITE' : 'ÉGALITÉ'), h('span', getMode(m.mode as any).name), h('span', `${m.score[0]} - ${m.score[1]}`), h('span', getCharacter(m.hero).name), h('div.grow'),
          h('span', (m.trophies > 0 ? '+' : '') + m.trophies + ' 🏆'))) : h('span.small-text.muted', 'Aucun match joué.'))));
  };
  return { el, onShow: render, refresh: render, onHide: off };
}

function rename(c: Controller, after: () => void) {
  const input = h('input.text-input', { value: c.data.profile.name, maxLength: 14, style: 'width:100%' }) as HTMLInputElement;
  const err = h('div.small-text', { style: 'color:#ff8a96;min-height:1.2em' });
  const m = c.ui.modal('PSEUDO', h('div.col', { style: 'gap:.6em;min-width:18em' }, input, err, h('button.btn.green', { onclick: () => {
    const r = c.app.profile.setName(input.value);
    if (!r.ok) { audio.play('error'); err.textContent = r.error ?? ''; return; }
    audio.play('click'); m.close(); after();
  } }, 'VALIDER')));
  setTimeout(() => input.focus(), 50);
}
