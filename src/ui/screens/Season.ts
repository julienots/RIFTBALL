import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { SEASON_RANKS, SEASON_RESET_FLOOR, SEASONS } from '../../data/seasons';
import { EVENTS } from '../../data/events';
import { getCharacter } from '../../data/characters';
import { getArena } from '../../data/arenas';
import { formatDuration, Clock } from '../../core/Time';
import { rewardIcon, rewardText } from '../icons';
import { passScreen } from './Pass';
import { showRewards } from './Shop';
import type { SeasonEndSummary } from '../../seasons/SeasonService';

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** SAISONS: current season, rank & end-of-season rewards, season events, roadmap of the next seasons. */
export function seasonScreen(c: Controller): Screen {
  const body = h('div.scroll.col', { style: 'flex:1;min-height:0;padding:0 1em 1em;gap:.7em' });
  const { el, off } = shell(c, 'SAISON', body);
  const render = () => {
    body.innerHTML = '';
    const S = c.app.seasons, cur = S.current, rank = S.rank, next = S.nextRank, peak = S.s.peak;
    const prog = next ? (peak - rank.min) / (next.min - rank.min) : 1;
    body.append(
      h('div.panel.row', { style: `padding:.8em 1em;gap:1em;background:linear-gradient(120deg,${cur.color},#2a1d68 75%)` },
        h('div', { style: 'font-size:3em' }, cur.icon ?? '🌀'),
        h('div.col', { style: 'gap:.2em;flex:1' },
          h('span.small-text', `SAISON ${cur.number} · se termine dans ${formatDuration(S.timeLeftMs)}`),
          h('span.title.stroke', { style: 'font-size:1.6em' }, cur.name),
          h('span.small-text', cur.theme),
          h('span.small-text', `🦸 Héros à l'honneur : ${getCharacter(cur.newHero).name} · 🗺️ Arène : ${getArena(cur.newArena).name}`)),
        h('button.btn.purple', { onclick: () => { audio.play('click'); c.ui.push(passScreen(c)); } }, '🎟️ RIFT PASS')),
      h('div.panel.col', { style: 'padding:.7em 1em;gap:.4em' },
        h('div.row', { style: 'gap:.6em' }, h('span', { style: 'font-size:2.2em' }, rank.icon),
          h('div.col', { style: 'gap:.1em;flex:1' }, h('span.title', { style: `color:${rank.color}` }, `RANG DE SAISON : ${rank.name}`),
            h('span.small-text.muted', `Record de la saison : ${fmt(peak)} 🏆 · ${next ? `${next.icon} ${next.name} à ${fmt(next.min)} 🏆` : 'Rang maximum atteint !'}`)),
          h('div.bar.xp', { style: 'width:12em;height:1em' }, h('i', { style: `width:${prog * 100}%` }), h('span', next ? `${fmt(peak)}/${fmt(next.min)}` : 'MAX'))),
        h('div.small-text.muted', `Fin de saison : vous recevez les récompenses de votre rang. Les trophées au-dessus de ${SEASON_RESET_FLOOR} sont réduits de moitié (vos héros et la route des trophées restent acquis).`),
        h('div.row', { style: 'gap:.4em;flex-wrap:wrap' }, SEASON_RANKS.map((r) => h('div.panel.col', { style: `flex:1 1 9em;padding:.4em .5em;gap:.15em;align-items:center;${r.id === rank.id ? `box-shadow:0 0 0 .15em ${r.color}` : 'opacity:.85'}` },
          h('span', { style: 'font-size:1.5em' }, r.icon), h('span.title', { style: `color:${r.color};font-size:.85em` }, r.name), h('span.small-text.muted', `${fmt(r.min)}+ 🏆`),
          h('span.small-text', { style: 'text-align:center' }, r.reward.map((x) => rewardIcon(x) + ' ' + rewardText(x)).join(' · ')))))),
      h('span.title', '🎉 ÉVÉNEMENTS DE LA SAISON'),
      h('div.row', { style: 'gap:.4em;flex-wrap:wrap' }, cur.events.map((id) => EVENTS.find((e) => e.id === id)).filter(Boolean).map((e) => {
        const on = c.app.events.isActive(e!.id);
        return h('div.panel.row', { style: `padding:.35em .6em;gap:.4em;background:linear-gradient(120deg,${e!.color}${on ? '' : '88'},#2a1d68)` }, h('span', { style: 'font-size:1.3em' }, e!.icon), h('div.col', { style: 'gap:0' }, h('span.title', { style: 'font-size:.85em' }, e!.name), h('span.small-text', on ? '🟢 EN COURS' : e!.recurring ? `Tous les ${e!.recurring.everyDays} jours` : dateFr(e!.start!))));
      })),
      h('span.title', '🗓️ PROCHAINES SAISONS'),
      h('div.row', { style: 'gap:.5em;flex-wrap:wrap' }, SEASONS.filter((x) => x.number > cur.number).map((x) => h('div.panel.col', { style: `flex:1 1 14em;padding:.6em .7em;gap:.2em;background:linear-gradient(150deg,${x.color},#2a1d68 80%)` },
        h('span.title.stroke-s', `${x.icon ?? ''} SAISON ${x.number} · ${x.name}`), h('span.small-text', `${dateFr(x.start)} → ${dateFr(x.end)}`), h('span.small-text', x.theme),
        h('span.small-text', '🎁 Pass : ' + [x.rewards.find((r) => r.tier === 1)?.plus, x.rewards.find((r) => r.tier === 30)?.premium].filter(Boolean).map((r) => rewardText(r!)).join(' · '))))),
      h('span.title', { style: S.s.history.length ? '' : 'display:none' }, '🏅 SAISONS PASSÉES'),
      h('div.row', { style: 'gap:.4em;flex-wrap:wrap' }, S.s.history.map((hh) => { const r = SEASON_RANKS.find((q) => q.id === hh.rank)!; return h('span.pill', `${SEASONS.find((q) => q.id === hh.id)?.name ?? hh.id} : ${r.icon} ${r.name} (${fmt(hh.peak)} 🏆)`); })));
  };
  return { el, onShow: () => { void Clock; render(); }, refresh: render, onHide: off };
}

/** End-of-season popup (shown once). */
export function showSeasonEnd(c: Controller, e: SeasonEndSummary) {
  const r = SEASON_RANKS.find((q) => q.id === e.rank)!;
  const m = c.ui.modal(`FIN DE SAISON : ${e.seasonName}`, h('div.col', { style: 'align-items:center;gap:.5em;max-width:30em;text-align:center' },
    h('div', { style: 'font-size:3.5em' }, r.icon),
    h('div.title.stroke', { style: `color:${r.color};font-size:1.5em` }, `RANG ${r.name}`),
    h('div.small-text', `Record de la saison : ${fmt(e.peak)} 🏆`),
    e.trophiesAfter < e.trophiesBefore ? h('div.small-text.muted', `Trophées : ${fmt(e.trophiesBefore)} → ${fmt(e.trophiesAfter)} (nouvelle saison)`) : null,
    h('div.small-text', `La saison ${c.app.seasons.current.name} commence !`),
    h('button.btn.green', { onclick: () => { m.close(); showRewards(c, e.rewards, 'RÉCOMPENSES DE SAISON'); } }, 'RÉCUPÉRER')));
}
