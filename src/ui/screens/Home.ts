import { PLAYABLE } from '../../data/characters';
import { COSMETICS } from '../../data/cosmetics';
import { menuMusic } from '../../audio/music';
import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { audio } from '../../audio/AudioEngine';
import { getCharacter } from '../../data/characters';
import { getMode, isModeAvailable } from '../../data/modes';
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
import { challengesScreen } from './Challenges';
import { seasonScreen, showSeasonEnd } from './Season';
import { BOT_PROFILES } from '../../data/bots';
import { modesScreen } from './Modes';
import { guideScreen, showNews } from './Guide';

export function currencyBar(c: Controller, opts: { gemsPlus?: boolean } = {}) {
  const d = c.data;
  const coins = h('span', fmt(d.coins)), gems = h('span', fmt(d.gems));
  const el = h('div.row', { style: 'gap:.5em' },
    h('div.pill', h('span.cur.coin', h('span', '')), coins),
    h('div.pill', { onclick: () => { if (opts.gemsPlus !== false) { audio.play('click'); c.ui.push(shopScreen(c, 'gems')); } } }, h('span.cur.gem', h('span', '')), gems, opts.gemsPlus !== false ? h('span.plus', '+') : null));
  // values roll up/down instead of jumping
  const roll = (el: HTMLElement, to: number) => {
    const from = Number(el.dataset.v ?? to);
    el.dataset.v = String(to);
    if (from === to) { el.textContent = fmt(to); return; }
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
    const t0 = performance.now(), dur = 650;
    const stepFn = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1 && el.isConnected) requestAnimationFrame(stepFn); };
    requestAnimationFrame(stepFn);
  };
  coins.dataset.v = String(d.coins); gems.dataset.v = String(d.gems);
  const off = c.app.bus.on('wallet', (w) => { roll(coins, w.coins); roll(gems, w.gems); });
  (el as any)._off = off;
  return el;
}

export function homeScreen(c: Controller): Screen {
  const el = h('div.screen.home');
  let offs: (() => void)[] = [];
  // swipe on the stage to change hero
  let swipeX = -1, swipeY = 0;
  el.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button, .pill, .dock, .side')) return; swipeX = e.clientX; swipeY = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (swipeX < 0) return;
    const dx = e.clientX - swipeX, dy = e.clientY - swipeY; swipeX = -1;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (el.querySelectorAll<HTMLElement>('.car-arrow')[dx < 0 ? 1 : 0])?.click();
  });

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
      h('button.pill', { onclick: () => { audio.play('click'); trophyRoad(c); } }, h('span.cur.trophy', '🏆'), fmt(d.trophies), h('span', { title: 'Rang de saison', style: 'margin-left:.3em' }, c.app.seasons.rank.icon)),
      c.app.net.online ? h('span.offline-pill', { style: 'background:rgba(61,220,132,.8)' }, `🌐 En ligne${c.app.net.playersOnline ? ' · ' + c.app.net.playersOnline + ' joueurs' : ''}`) : h('span.offline-pill', c.app.net.hasServer ? '● Serveur injoignable (bots)' : '● Hors ligne (bots)'),
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
      iconBtn('🛒', 'BOUTIQUE', () => c.ui.push(shopScreen(c)), c.app.shop.offers().filter((o) => o.available && o.offer.price && 'currency' in o.offer.price && o.offer.price.amount === 0).length + (c.app.shop.dailyGift().claimed ? 0 : 1), 'linear-gradient(#ffd166,#f39a00)'),
      iconBtn('🎟️', 'RIFT PASS', () => c.ui.push(passScreen(c)), passClaim, 'linear-gradient(#ff70a6,#c9184a)'),
      iconBtn('🏆', 'CLASSEMENT', () => c.ui.push(leaderboardScreen(c)), 0, 'linear-gradient(#b5179e,#7209b7)'),
      iconBtn('⚙️', 'OPTIONS', () => c.ui.push(settingsScreen(c)), 0, 'linear-gradient(#8d99ae,#4a5168)'));

    const events = c.app.events.active();
    const evBanner = h('div.event-banner', events.slice(0, 3).map((e) =>
      h('button.event-chip', { style: `background:${e.data.color}`, onclick: () => { audio.play('click'); if (e.data.id === 'fifix_event') { c.selectedMode = 'FIFIX'; render(); c.ui.toast('🎰', 'Mode FIFIX sélectionné !'); } else eventsModal(c); } }, e.data.icon + ' ' + e.data.name, h('span.small-text', '· ' + formatDuration(e.end - Clock.now())))));

    if (!isModeAvailable(getMode(c.selectedMode))) c.selectedMode = 'RIFTBALL'; // limited-time mode ended
    const mode = getMode(c.selectedMode);
    const training = c.trainingLevel;
    const modeBtn = h('button.mode-btn', { onclick: () => { audio.play('click'); c.ui.push(modesScreen(c)); } },
      h('div.mi', { style: `background:${mode.color}` }, mode.icon),
      h('div.col', { style: 'gap:0' }, h('span.mt', mode.name), c.privateCode ? h('span.small-text', { style: 'color:#ffe14d' }, `🔒 Partie privée · ${c.privateCode}`) : h('span.small-text.muted', training ? `Entraînement · bots ${BOT_PROFILES[training].id}` : mode.ranked ? `${mode.teamSize}v${mode.teamSize} · Classé` : 'Coop vs IA')));
    const play = h('button.btn.yellow.big.play-btn.shine', { onclick: () => { audio.play('click'); c.screens.matchmaking(); } }, 'JOUER');

    // quick hero carousel right on the lobby stage (owned heroes)
    const owned = PLAYABLE.filter((x) => c.canPlay(x.id));
    const cycle = (dir: number) => {
      if (owned.length < 2) return;
      const i = owned.findIndex((x) => x.id === c.heroId);
      const next = owned[(i + dir + owned.length) % owned.length];
      audio.play('whoosh');
      c.heroId = next.id;
      render();
    };
    const heroInfo = h('div.hero-info',
      h('div.row.hero-carousel', { style: 'justify-content:center;gap:.5em' },
        h('button.car-arrow', { onclick: () => cycle(-1), 'aria-label': 'Héros précédent' }, '‹'),
        h('div.hero-name.stroke', hero.name),
        h('button.car-arrow', { onclick: () => cycle(1), 'aria-label': 'Héros suivant' }, '›')),
      h('div.row', { style: 'justify-content:center;gap:.4em' },
        h('span.pill', { style: 'height:1.8em;font-size:.85em' }, `⭐ MAÎTRISE ${mastery.level}`),
        h('span.pill', { style: 'height:1.8em;font-size:.85em' }, `🏆 ${d.heroes[hero.id].trophies}`),
        h('button.btn.tiny.purple', { onclick: () => { audio.play('click'); c.ui.push(heroesScreen(c)); } }, 'CHANGER')));

    const bottomLeft = h('div.dock', { style: 'position:absolute;left:calc(.9em + var(--safe-l));bottom:.9em;display:flex;gap:.6em;align-items:flex-end' },
      iconBtn('📋', 'MISSIONS', () => missionsModal(c, render), missionsClaim, 'linear-gradient(#80ed99,#2d9b5a)'),
      iconBtn('💎', 'DÉFIS', () => c.ui.push(challengesScreen(c)), c.app.missions.claimableChallenges, 'linear-gradient(#4cc9f0,#3a0ca3)'),
      iconBtn('🎉', 'ÉVÉNEMENTS', () => eventsModal(c), events.length, 'linear-gradient(#ff7b00,#d00000)'),
      iconBtn(c.app.seasons.current.icon ?? '🗓️', 'SAISON', () => c.ui.push(seasonScreen(c)), 0, `linear-gradient(${c.app.seasons.current.color},#3a0ca3)`),
      iconBtn('📖', 'GUIDE', () => c.ui.push(guideScreen(c)), 0, 'linear-gradient(#a78bfa,#6d28d9)'));

    // dance emotes: make the lobby hero dance (cycles through the dances you own)
    const dances = COSMETICS.filter((x) => x.visual.dance && c.app.inventory.owns(x.id));
    let di = 0;
    const danceBtn = h('button.dance-btn', { onclick: () => { audio.play('click'); const d0 = dances[di++ % Math.max(1, dances.length)]; c.renderer.showcaseDance(d0?.visual.dance ?? 'groove'); danceBtn.textContent = `${d0?.visual.glyph ?? '🕺'} ${d0?.name.toUpperCase() ?? 'DANSER'}`; } }, '🕺 DANSER');
    el.append(top, evBanner, left, right, heroInfo, bottomLeft, danceBtn, h('div.play-zone', modeBtn, play));

    c.renderer.setShowcase(c.heroId, c.skinId, 0);
    c.renderer.setLobbyTheme(c.app.seasons.current.lobby);
    c.renderer.setShowcasePet(c.data.equipped.companion ?? '');
  };

  return {
    el, showcase: true,
    onShow() { render(); c.renderer.showcaseActive = true; audio.playMusic(menuMusic()); c.app.shop.checkRefresh(); setTimeout(() => { c.app.seasons.check(); const end = c.app.seasons.takePendingEnd(); if (end) showSeasonEnd(c, end); else showNews(c); }, 600); },
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
