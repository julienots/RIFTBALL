import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import type { SessionEnd } from '../../game/GameView';
import { audio } from '../../audio/AudioEngine';
import { getCharacter } from '../../data/characters';
import { MISSIONS } from '../../data/missions';
import { showRewards } from './Shop';
import { rewardText } from '../icons';

/** End-of-match: satisfying reward reveal for wins AND a non-frustrating progress screen for defeats. */
export async function resultsScreen(c: Controller, e: SessionEnd): Promise<Screen> {
  const r = await c.app.progression.applyMatch(e.report);
  const m = e.match, me = m.human!;
  c.app.friends.recordRecent(m.heroes.filter((x) => !x.pve && x.id !== me.id).map((x) => ({ name: x.name, heroId: x.def.id, trophies: Math.max(0, c.data.trophies + Math.round((Math.random() - 0.5) * 200)) })));
  c.app.crew.contribute(e.report.stats.goals, r.outcome === 'win');
  c.party = [];
  const out = r.outcome;
  const pve = m.mode.id === 'RIFT_BOSS' || m.mode.id === 'SURVIVAL';
  const headText = out === 'win' ? 'VICTOIRE !' : out === 'draw' ? 'ÉGALITÉ' : 'DÉFAITE';
  const sub = pve ? (m.mode.id === 'RIFT_BOSS' ? (out === 'win' ? 'Le Colosse est tombé !' : `Colosse : ${Math.round((m.result?.extra.bossHpPct ?? 0) * 100)}% PV restants`) : `Vagues survécues : ${m.result?.extra.waves ?? 0}/8`)
    : `${m.mode.id === 'RIFT_KING' ? '👑 ' : ''}${m.result!.score[0]} - ${m.result!.score[1]}${m.overtime ? ' (Sudden Death)' : ''}`;
  const rewards = h('div.reward-row');
  const add = (v: string, k: string, i: number, color = '#fff') => rewards.appendChild(h('div.reward.panel', { style: `animation-delay:${0.25 + i * 0.12}s` }, h('div.v.stroke-s', { style: `color:${color}` }, v), h('div.k', k)));
  let i = 0;
  if (e.report.ranked) add((r.trophies >= 0 ? '+' : '') + r.trophies + ' 🏆', `TROPHÉES · ${fmt(r.trophiesTotal)}`, i++, r.trophies > 0 ? '#ffe14d' : r.trophies < 0 ? '#ff8a96' : '#fff');
  add('+' + r.xp + ' ⭐', 'RIFT XP', i++, '#7cc4ff');
  add('+' + r.coins + ' 🪙', r.coinsCapped ? 'COINS (limite du jour)' : 'COINS', i++, '#ffd166');
  add('+' + r.passXp + ' 🎟️', 'PASS XP', i++, '#ff9ad5');

  const passBar = h('div.bar.pass', { style: 'width:22em;height:1.2em' }, h('i', { style: 'width:0%' }), h('span', `PASS — PALIER ${r.passTierAfter}`));
  const xpBar = h('div.bar.xp', { style: 'width:22em;height:1.2em' }, h('i', { style: `width:${r.xpProgressBefore * 100}%` }), h('span', `NIVEAU ${r.levelAfter}`));
  const masteryBar = h('div.bar.purple', { style: 'width:22em;height:1.2em' }, h('i', { style: 'width:0%' }), h('span', `${getCharacter(r.mastery.heroId).name} — MAÎTRISE ${r.mastery.levelAfter}`));
  setTimeout(() => {
    (passBar.firstElementChild as HTMLElement).style.width = r.passProgressAfter * 100 + '%';
    (xpBar.firstElementChild as HTMLElement).style.width = (r.levelAfter > r.levelBefore ? 100 : r.xpProgressAfter * 100) + '%';
    (masteryBar.firstElementChild as HTMLElement).style.width = r.mastery.progress * 100 + '%';
    audio.play('coin');
  }, 700);
  if (r.levelAfter > r.levelBefore) setTimeout(() => { audio.play('level_up'); c.ui.toast('⭐', `NIVEAU ${r.levelAfter} !`, 'Récompenses ajoutées'); }, 1300);
  if (r.passTierAfter > r.passTierBefore) setTimeout(() => c.ui.toast('🎟️', `RIFT PASS — Palier ${r.passTierAfter} !`), 1700);

  // stats table (boss: ranked by damage dealt to the Colossus · king: by reign time)
  const boss = m.mode.id === 'RIFT_BOSS', king = m.mode.id === 'RIFT_KING';
  const rows = m.heroes.filter((x) => !x.pve).sort((a, b) => boss ? b.stats.bossDamage - a.stats.bossDamage : king ? a.team - b.team || b.stats.kingPoints - a.stats.kingPoints : a.team - b.team || b.stats.goals - a.stats.goals);
  const medal = (i: number) => boss ? (['🥇 ', '🥈 ', '🥉 '][i] ?? '') : '';
  const table = h('div.statline', h('span.h', 'JOUEUR'), h('span.h', boss ? 'DÉG. BOSS' : king ? 'RÈGNE' : 'PTS'), h('span.h', 'ÉLIM'), h('span.h', 'MORTS'), h('span.h', 'DÉGÂTS'), h('span.h', 'CAPT.'),
    rows.map((p, i) => [
      h('span', { style: `color:${p.team === 0 ? '#7cc4ff' : '#ff8a96'}` }, medal(i) + (m.result?.mvp === p.id ? '👑 ' : '') + p.name + (p.id === me.id ? ' (vous)' : '') + ' · ' + p.def.name),
      h('span', { style: boss || king ? 'color:#ffe14d' : '' }, boss ? fmt(Math.round(p.stats.bossDamage)) : king ? p.stats.kingPoints + ' s' : String(p.stats.goals)), h('span', String(p.stats.kills)), h('span', String(p.stats.deaths)), h('span', fmt(Math.round(p.stats.damage))), h('span', String(p.stats.captures)),
    ]));
  // boss: podium of the biggest damage dealers
  let podium: HTMLElement | null = null;
  if (boss) {
    const total = Math.max(1, rows.reduce((a, p) => a + p.stats.bossDamage, 0));
    podium = h('div.row', { style: 'gap:.5em;align-items:flex-end;justify-content:center' }, [1, 0, 2].map((i) => {
      const p = rows[i];
      if (!p) return null;
      const hgt = [5.2, 3.9, 3][i];
      return h('div.col', { style: 'align-items:center;gap:.15em;width:7em' },
        h('img', { src: c.portrait(p.def.id, p.skinId), style: `width:${i === 0 ? 3.4 : 2.7}em;height:${i === 0 ? 3.4 : 2.7}em;object-fit:cover;object-position:50% 20%;border-radius:50%;border:.15em solid ${['#ffd60a', '#ced4da', '#e09f3e'][i]}` }),
        h('span.small-text', { style: `font-weight:800;${p.id === me.id ? 'color:#ffe14d' : ''}` }, p.name),
        h('div.panel.col', { style: `height:${hgt}em;width:100%;align-items:center;justify-content:flex-start;padding-top:.2em;background:linear-gradient(${['#ffd60a', '#ced4da', '#e09f3e'][i]},#3a2a7a)` },
          h('span.stroke-s', { style: 'font-family:Lilita One;font-size:1.3em' }, ['🥇', '🥈', '🥉'][i]),
          h('span.stroke-s', { style: 'font-family:Lilita One' }, fmt(Math.round(p.stats.bossDamage))),
          h('span.small-text', Math.round((100 * p.stats.bossDamage) / total) + '%')));
    }));
  }

  const completed = r.missionsCompleted.map((id) => MISSIONS.find((x) => x.id === id)?.text).filter(Boolean);
  const encourage = out === 'loss' ? ['Belle tentative ! Votre progression continue.', 'Chaque match rapporte de l\'XP et du Pass XP.', 'La prochaine sera la bonne !'][Math.floor(Math.random() * 3)] : '';

  const el = h('div.screen.bg.results',
    h('div.head.stroke.' + (out === 'win' ? 'win' : out === 'loss' ? 'lose' : 'draw'), headText),
    h('div.title.stroke-s', { style: 'font-size:1.3em' }, sub, e.report.mvp ? h('span', { style: 'color:#ffe14d' }, '  · 👑 MVP') : null, r.streak > 1 ? h('span', { style: 'color:#ff9d00' }, `  · 🔥 Série ${r.streak}`) : null),
    encourage ? h('div.small-text', encourage) : null,
    r.accepted ? rewards : h('div.small-text', { style: 'color:#ff8a96' }, 'Résultat non comptabilisé : ' + ({ too_short: 'match trop court', duplicate: 'déjà comptabilisé', implausible_stats: 'statistiques invalides', implausible_score: 'score invalide', outcome_mismatch: 'résultat incohérent', duration: 'durée invalide' } as Record<string, string | undefined>)[r.reason ?? ''] || 'refusé par le serveur'),
    h('div.row', { style: 'gap:1.2em;align-items:flex-start;flex-wrap:wrap;justify-content:center' },
      h('div.col', { style: 'gap:.4em' }, xpBar, passBar, masteryBar,
        completed.length ? h('div.small-text', { style: 'color:#80ed99' }, '✅ Missions terminées : ' + completed.join(' · ')) : null,
        r.unlocked.length ? h('div.small-text', { style: 'color:#ffe14d' }, '🏆 Route des trophées : ' + r.unlocked.map((u) => rewardText(u.item)).join(' · ')) : null),
      h('div.col', { style: 'gap:.4em' }, podium, h('div.panel', { style: `padding:.5em .8em;max-height:${podium ? 18 : 32}vh;overflow:auto` }, table))),
    h('div.row', { style: 'gap:1em;margin-top:.3em' },
      h('button.btn.purple', { onclick: () => { audio.play('click'); c.screens.home(); } }, '🏠 ACCUEIL'),
      h('button.btn.yellow.big', { onclick: () => { audio.play('click'); c.screens.home(); c.screens.matchmaking(); } }, 'REJOUER')));
  if (r.unlocked.length) setTimeout(() => showRewards(c, r.unlocked, 'ROUTE DES TROPHÉES'), 1500);
  return { el, onShow() { c.renderer.showcaseActive = false; } };
}
