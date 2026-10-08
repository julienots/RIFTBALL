import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { audio } from '../../audio/AudioEngine';
import { showRewards } from './Shop';
import { formatDuration, Clock } from '../../core/Time';
import type { MissionView } from '../../missions/MissionService';
import { gem } from '../icons';

/** DÉFIS: harder goals rewarded with gems (earned by playing — never pay-to-win). */
export function challengesScreen(c: Controller): Screen {
  const body = h('div.scroll.col', { style: 'flex:1;padding:0 1em 1em;gap:.6em;min-height:0' });
  const { el, off } = shell(c, 'DÉFIS 💎', body);
  const card = (v: MissionView, render: () => void) => {
    const gems = v.data.reward.reduce((a, r) => a + (r.kind === 'gems' ? r.amount : 0), 0);
    return h('div.panel.chal' + (v.claimed ? '.claimed' : v.done ? '.done' : ''),
      h('div.row', { style: 'gap:.5em;align-items:flex-start' },
        h('div.col', { style: 'gap:.1em;flex:1' }, h('span.tier', '★'.repeat(v.data.tier ?? 1) + '☆'.repeat(4 - (v.data.tier ?? 1))), h('span', { style: 'font-weight:800' }, v.data.text)),
        h('span.gems', '+' + gems, gem())),
      h('div.bar', { style: 'height:.9em' }, h('i', { style: `width:${(v.progress / v.data.target) * 100}%` }), h('span', `${fmt(v.progress)}/${fmt(v.data.target)}`)),
      v.claimed ? h('span.small-text', { style: 'color:#80ed99' }, '✔ Récompense récupérée')
        : h('button.btn.tiny' + (v.done ? '.green.pulse' : '.gray'), { disabled: !v.done, onclick: () => {
          const g = c.app.missions.claim(v.data.id);
          if (g) { audio.play('coin'); showRewards(c, g, 'DÉFI RÉUSSI !'); render(); }
        } }, v.done ? 'RÉCUPÉRER' : 'EN COURS'));
  };
  const render = () => {
    body.innerHTML = '';
    const all = c.app.missions.challenges();
    const weekly = all.filter((v) => v.data.scope === 'challenge_weekly');
    const perm = all.filter((v) => v.data.scope === 'challenge').sort((a, b) => Number(a.claimed) - Number(b.claimed) || Number(b.done) - Number(a.done) || (a.data.tier ?? 1) - (b.data.tier ?? 1));
    const earned = all.filter((v) => v.claimed).reduce((a, v) => a + v.data.reward.reduce((s, r) => s + (r.kind === 'gems' ? r.amount : 0), 0), 0);
    body.append(
      h('div.small-text.muted', 'Relevez des défis pour gagner des gemmes gratuitement. Les défis permanents ne se réinitialisent jamais.', h('b', { style: 'color:#7fe7ff' }, `  · ${earned} 💎 gagnées`)),
      h('div.row', h('span.title', '⏳ DÉFIS DE LA SEMAINE'), h('span.small-text.muted', '· nouveaux défis dans ' + formatDuration((weekly[0]?.endsAt ?? Clock.now()) - Clock.now()))),
      h('div.chal-grid', weekly.map((v) => card(v, render))),
      h('div.row', h('span.title', '🏅 DÉFIS PERMANENTS')),
      h('div.chal-grid', perm.map((v) => card(v, render))));
  };
  return { el, onShow: render, refresh: render, onHide: off };
}
