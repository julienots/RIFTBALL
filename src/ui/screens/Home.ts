import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { audio } from '../../audio/AudioEngine';
import { getCharacter } from '../../data/characters';
import { getMode } from '../../data/modes';
import { TROPHY_ROAD } from '../../data/progression';
import { rewardIcon, rewardText } from '../icons';
import { formatDuration, Clock } from '../../core/Time';
import { ECONOMY } from '../../data/progression';
import { heroesScreen } from './Heroes';
import { shopScreen } from './Shop';
import { passScreen } from './Pass';
import { leaderboardScreen } from './Leaderboard';
import { socialScreen } from './Social';
import { profileScreen } from './Profile';
import { settingsScreen } from './Settings';
import { collectionScreen } from './Collection';
import { missionsModal, eventsModal, inboxModal } from './Missions';
import { BOT_PROFILES } from '../../data/bots';
import { modesScreen } from './Modes';

export function currencyBar(c: Controller, opts: { gemsPlus?: boolean } = {}) {
  const d = c.data;
  const coins = h('span', fmt(d.coins)), gems = h('span', fmt(d.gems));
  const el = h('div.row', { style: 'gap:.5em' },
    h('div.pill', h('span.cur.coin', h('span', '')), coins),
    h('div.pill', { onclick: () => { if (opts.gemsPlus !== false) { audio.play('click'); c.ui.push(shopScreen(c, 'gems')); } } }, h('span.cur.gem', h('span', '')), gems, opts.gemsPlus !== false ? h('span.plus', '+') : null));
  const off = c.app.bus.on('wallet', (w) => { coins.textContent = fmt(w.coins); gems.textContent = fmt(w.gems); });
  (el as any)._off = off;
  return el;
}

export function homeScreen(c: Controller): Screen {
  const el = h('div.screen.home');
  let offs: (() => void)[] = [];

  const render = () => {
    for (const o of offs) o();
    offs = [];
    el.innerHTML = '';
    const d = c.data;
    const hero = getCharacter(c.heroId);
    const mastery = c.app.progression.masteryOf(hero.id);
    const xpPct = Math.round(c.app.progression.xpProgress * 100);
    const iconBtn = (ico: string, lbl: string, onclick: () => void, badge = 0, color?: string) =>
      h('button.icon-btn', { onclick: () => { audio.play('click'); onclick(); } }, h('div.ico', { style: color ? `background:${color}` : '' }, ico), h('span.lbl', lbl), badge > 0 ? h('div.badge', { style: 'position:absolute;top:-.3em;right:-.3em' }, String(badge)) : null);

    const cur = currencyBar(c);
    offs.push((cur as any)._off);
    const unread = c.app.notes.unread;
    const top = h('div.top',
      h('button.player-chip', { onclick: () => { audio.play('click'); c.ui.push(profileScreen(c)); } },
        h('div.av', h('img', { src: c.portrait(c.heroId, c.skinId) })),
        h('div.col', { style: 'gap:.15em;align-items:flex-start' },
          h('div.row', { style: 'gap:.4em' }, h('div.lvl', h('span', String(d.level))), h('span.title.stroke-s', d.profile.name)),
          h('div.bar.xp', { style: 'width:8em;height:.7em' }, h('i', { style: `width:${xpPct}%` })))),
      h('button.pill', { onclick: () => { audio.play('click'); trophyRoad(c); } }, h('span.cur.trophy', '🏆'), fmt(d.trophies)),
      !c.app.net.online ? h('span.offline-pill', c.app.net.hasServer ? '● Hors ligne' : '● Mode local (IA)') : null,
      h('div.grow'),
      cur,
      h('button.btn.small.dark', { style: 'position:relative', onclick: () => { audio.play('click'); inboxModal(c, render); } }, '🔔', unread ? h('div.badge', { style: 'position:absolute;top:-.6em;right:-.6em' }, String(unread)) : null));

    const passClaim = c.app.pass.claimableCount, missionsClaim = c.app.missions.claimableCount;
    const left = h('div.side.left',
      iconBtn('👤', 'PROFIL', () => c.ui.push(profileScreen(c))),
      iconBtn('⚡', 'PERSONNAGES', () => c.ui.push(heroesScreen(c)), 0, 'linear-gradient(#ff9f1c,#e85d04)'),
      iconBtn('🎨', 'COLLECTION', () => c.ui.push(collectionScreen(c)), 0, 'linear-gradient(#06d6a0,#118a6a)'),
      iconBtn('👥', 'CREW', () => c.ui.push(socialScreen(c)), 0, 'linear-gradient(#4cc9f0,#2a7fc2)'));
    const right = h('div.side.right',
      iconBtn('🛒', 'BOUTIQUE', () => c.ui.push(shopScreen(c)), c.app.shop.offers().filter((o) => o.available && o.offer.price && 'currency' in o.offer.price && o.offer.price.amount === 0).length, 'linear-gradient(#ffd166,#f39a00)'),
      iconBtn('🎟️', 'RIFT PASS', () => c.ui.push(passScreen(c)), passClaim, 'linear-gradient(#ff70a6,#c9184a)'),
      iconBtn('🏆', 'CLASSEMENT', () => c.ui.push(leaderboardScreen(c)), 0, 'linear-gradient(#b5179e,#7209b7)'),
      iconBtn('⚙️', 'OPTIONS', () => c.ui.push(settingsScreen(c)), 0, 'linear-gradient(#8d99ae,#4a5168)'));

    const events = c.app.events.active();
    const evBanner = h('div.event-banner', events.slice(0, 3).map((e) =>
      h('button.event-chip', { style: `background:${e.data.color}`, onclick: () => { audio.play('click'); eventsModal(c); } }, e.data.icon + ' ' + e.data.name, h('span.small-text', '· ' + formatDuration(e.end - Clock.now())))));

    const mode = getMode(c.selectedMode);
    const training = c.trainingLevel;
    const modeBtn = h('button.mode-btn', { onclick: () => { audio.play('click'); c.ui.push(modesScreen(c)); } },
      h('div.mi', { style: `background:${mode.color}` }, mode.icon),
      h('div.col', { style: 'gap:0' }, h('span.mt', mode.name), h('span.small-text.muted', training ? `Entraînement · bots ${BOT_PROFILES[training].id}` : mode.ranked ? `${mode.teamSize}v${mode.teamSize} · Classé` : 'Coop vs IA')));
    const play = h('button.btn.yellow.big.play-btn.shine', { onclick: () => { audio.play('click'); c.screens.matchmaking(); } }, 'JOUER');

    const heroInfo = h('div.hero-info',
      h('div.hero-name.stroke', hero.name),
      h('div.row', { style: 'justify-content:center;gap:.4em' },
        h('span.pill', { style: 'height:1.8em;font-size:.85em' }, `⭐ MAÎTRISE ${mastery.level}`),
        h('span.pill', { style: 'height:1.8em;font-size:.85em' }, `🏆 ${d.heroes[hero.id].trophies}`),
        h('button.btn.tiny.purple', { onclick: () => { audio.play('click'); c.ui.push(heroesScreen(c)); } }, 'CHANGER')));

    const bottomLeft = h('div', { style: 'position:absolute;left:calc(.9em + var(--safe-l));bottom:.9em;display:flex;gap:.6em;align-items:flex-end' },
      iconBtn('📋', 'MISSIONS', () => missionsModal(c, render), missionsClaim, 'linear-gradient(#80ed99,#2d9b5a)'),
      iconBtn('🎉', 'ÉVÉNEMENTS', () => eventsModal(c), events.length, 'linear-gradient(#ff7b00,#d00000)'));

    el.append(top, evBanner, left, right, heroInfo, bottomLeft, h('div.play-zone', modeBtn, play));

    c.renderer.setShowcase(c.heroId, c.skinId, 0);
  };

  return {
    el, showcase: true,
    onShow() { render(); c.renderer.showcaseActive = true; audio.playMusic('menu'); c.app.shop.checkRefresh(); },
    onHide() { for (const o of offs) o(); offs = []; },
    refresh: render,
  };
}

function trophyRoad(c: Controller) {
  const d = c.data;
  const items = TROPHY_ROAD.map((s) => {
    const reached = d.bestTrophies >= s.trophies;
    return h('div.card', { style: `flex:0 0 7.5em;padding:.5em;display:flex;flex-direction:column;align-items:center;gap:.25em;${reached ? '' : 'filter:brightness(.6)'}` },
      h('div.title', `🏆 ${s.trophies}`), h('div', { style: 'font-size:2em' }, rewardIcon(s.reward)), h('div.small-text', { style: 'text-align:center' }, rewardText(s.reward)),
      reached ? h('span.owned-tag', { style: 'position:static' }, '✔') : null);
  });
  const next = TROPHY_ROAD.find((s) => s.trophies > d.bestTrophies);
  c.ui.modal('ROUTE DES TROPHÉES', h('div.col', { style: 'max-width:80vw' },
    h('div', { style: 'text-align:center' }, `Trophées : ${d.trophies} · Record : ${d.bestTrophies}`, next ? ` · Prochain palier : ${next.trophies}` : ''),
    h('div.hscroll', h('div.row', { style: 'padding:.4em;gap:.5em' }, items)),
    h('div.small-text.muted', { style: 'text-align:center' }, `Victoire : +${ECONOMY.trophyDelta(d.trophies, 'win')} · Les trophées ne s'achètent jamais.`)));
}
