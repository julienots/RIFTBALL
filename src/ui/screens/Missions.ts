import { h } from '../dom';
import type { Controller } from '../Controller';
import { audio } from '../../audio/AudioEngine';
import { rewardIcon, rewardText } from '../icons';
import { formatDuration, Clock } from '../../core/Time';
import { showRewards } from './Shop';
import { fmt } from '../dom';

const SCOPE_FR = { daily: 'QUOTIDIENNES', weekly: 'HEBDOMADAIRES', season: 'SAISON', event: 'ÉVÉNEMENT' } as const;

export function missionsModal(c: Controller, after?: () => void) {
  const body = h('div.scroll.col', { style: 'max-height:70vh;min-width:min(40em,85vw);gap:.4em' });
  const render = () => {
    body.innerHTML = '';
    const list = c.app.missions.active();
    for (const scope of ['daily', 'weekly', 'season', 'event'] as const) {
      const items = list.filter((m) => m.data.scope === scope);
      if (!items.length) continue;
      body.appendChild(h('div.row', h('span.title', SCOPE_FR[scope]), h('span.small-text.muted', '· se termine dans ' + formatDuration(items[0].endsAt - Clock.now()))));
      for (const m of items) {
        body.appendChild(h('div.panel.row', { style: `padding:.45em .7em;gap:.7em;background:${m.claimed ? 'rgba(10,5,30,.35)' : ''}` },
          h('div.col', { style: 'gap:.2em;flex:1' }, h('span', m.data.text),
            h('div.bar', { style: 'height:.9em' }, h('i', { style: `width:${(m.progress / m.data.target) * 100}%` }), h('span', `${fmt(m.progress)}/${fmt(m.data.target)}`))),
          h('div.small-text', { style: 'text-align:right;width:11em' }, m.data.reward.map((r) => rewardIcon(r) + ' ' + rewardText(r)).join(' · ')),
          m.claimed ? h('span.owned-tag', { style: 'position:static' }, '✔') : h('button.btn.tiny' + (m.done ? '.green.pulse' : '.gray'), { disabled: !m.done, onclick: () => { const g = c.app.missions.claim(m.data.id); if (g) { showRewards(c, g); render(); after?.(); } } }, m.done ? 'RÉCUPÉRER' : '…')));
      }
    }
  };
  render();
  c.ui.modal('MISSIONS', body, { onClose: after });
}

export function eventsModal(c: Controller) {
  const now = Clock.now();
  const act = c.app.events.active(now), up = c.app.events.upcoming(now);
  c.ui.modal('ÉVÉNEMENTS', h('div.col.scroll', { style: 'max-height:70vh;min-width:min(38em,85vw);gap:.5em' },
    h('span.title', 'EN COURS'),
    act.length ? act.map((e) => h('div.panel.row', { style: `padding:.6em;gap:.7em;background:linear-gradient(160deg,${e.data.color},#2a1d68)` }, h('span', { style: 'font-size:2em' }, e.data.icon),
      h('div.col', { style: 'gap:.1em;flex:1' }, h('span.title.stroke-s', e.data.name), h('span.small-text', e.data.description)), h('span.pill', '⏳ ' + formatDuration(e.end - now)))) : h('div.small-text.muted', 'Aucun événement en cours.'),
    h('span.title', 'À VENIR'),
    up.map((e) => h('div.panel.row', { style: 'padding:.45em .6em;gap:.7em;opacity:.85' }, h('span', { style: 'font-size:1.5em' }, e.data.icon), h('div.col', { style: 'gap:0;flex:1' }, h('span.title', e.data.name), h('span.small-text', e.data.description)), h('span.small-text', 'dans ' + formatDuration(e.start - now))))));
}

export function inboxModal(c: Controller, after?: () => void) {
  const list = c.app.notes.list();
  c.ui.modal('NOTIFICATIONS', h('div.col.scroll', { style: 'max-height:65vh;min-width:min(32em,85vw);gap:.35em' },
    list.length ? list.map((n) => h('div.panel.row', { style: `padding:.4em .6em;gap:.6em;${n.read ? 'opacity:.7' : ''}` }, h('span', { style: 'font-size:1.4em' }, { skin: '🎨', mission: '✅', pass: '🎟️', event: '🎉', reward: '🎁', shop: '🛒', level: '⭐', crew: '👥', friend: '🤝' }[n.kind]),
      h('div.col', { style: 'gap:0;flex:1' }, h('span.title', n.title), h('span.small-text', n.body)), h('span.small-text.muted', new Date(n.at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })))) : h('div.muted', 'Aucune notification.')),
    { onClose: () => { c.app.notes.markAllRead(); audio.play('tab'); after?.(); } });
}
