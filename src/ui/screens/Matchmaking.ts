import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { audio } from '../../audio/AudioEngine';
import { getMode } from '../../data/modes';
import { getArena } from '../../data/arenas';
import { getCharacter } from '../../data/characters';
import type { Match } from '../../game/Match';

const LEVEL_FR = { EASY: 'FACILE', NORMAL: 'NORMAL', HARD: 'DIFFICILE', EXPERT: 'EXPERT' } as const;

/**
 * PLAYER -> QUEUE -> MATCHMAKING -> LOBBY (BLUE vs RED) -> MATCH
 * Offline the queue is filled with bots; the lobby shows the real roster that will play.
 */
export function runMatchmaking(c: Controller) {
  const modeId = c.selectedMode;
  const mode = getMode(modeId);
  const pve = modeId === 'RIFT_BOSS' || modeId === 'SURVIVAL';
  const signal = { cancelled: false };
  const slotsB = h('div.mm-team.blue'), slotsR = h('div.mm-team.red');
  const status = h('div.title.stroke-s', { style: 'font-size:1.35em' }, 'RECHERCHE DE JOUEURS…');
  const sub = h('div.small-text', '');
  const timer = h('div.title', '00:00');
  const center = h('div.mm-center', h('div.mm-vs.stroke', 'VS'), timer, h('div.spinner'));
  const el = h('div.screen.bg.mm-screen',
    h('div.mm-head', h('div.mm-mode', { style: `background:${mode.color}` }, h('span', { style: 'font-size:1.6em' }, mode.icon), h('div.col', { style: 'gap:0' }, h('span.title.stroke-s', { style: 'font-size:1.3em' }, mode.name), h('span.small-text', pve ? `Coop ${mode.teamSize} joueurs vs IA` : `${mode.teamSize} contre ${mode.teamSize}${mode.ranked ? ' · Classé' : ''}`))),
      h('div.col', { style: 'gap:.1em;align-items:center;flex:1' }, status, sub),
      h('div.pill', `🤖 IA : ${LEVEL_FR[c.botLevel]}`)),
    h('div.mm-body', slotsB, center, slotsR),
    h('div.row', { style: 'justify-content:center;padding-bottom:.8em' }, h('button.btn.red', { onclick: () => { signal.cancelled = true; audio.play('click'); c.screens.home(); } }, 'ANNULER')));

  const teamSize = modeId === 'RIFT_DUEL' ? 1 : mode.teamSize;
  const mkSlot = () => h('div.mm-card.empty', h('div.spinner', { style: 'width:1.8em;height:1.8em;border-width:.3em' }));
  const bSlots = Array.from({ length: teamSize }, mkSlot);
  const rSlots = pve ? [h('div.mm-card.boss', h('div', { style: 'font-size:2.4em' }, modeId === 'RIFT_BOSS' ? '👹' : '👾'), h('div.title.stroke-s', modeId === 'RIFT_BOSS' ? 'RIFT COLOSSUS' : '8 VAGUES'), h('div.small-text', modeId === 'RIFT_BOSS' ? 'Boss · 60 000 PV' : 'Créatures du Rift'))] : Array.from({ length: teamSize }, mkSlot);
  slotsB.append(...bSlots); slotsR.append(...rSlots);

  const t0 = performance.now();
  const tick = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); timer.textContent = `00:${String(s).padStart(2, '0')}`; }, 250);

  const fill = (slot: HTMLElement, m: Match, heroIdx: number) => {
    const hero = m.heroes[heroIdx];
    if (!hero) return;
    const me = hero.id === m.humanId;
    const isFriend = c.party.some((p) => p.name === hero.name);
    slot.className = 'mm-card ' + (hero.team === 0 ? 'b' : 'r') + (me ? ' me' : '');
    slot.innerHTML = '';
    const trophies = me ? c.data.trophies : Math.max(0, c.data.trophies + ((hero.id * 37) % 160) - 60);
    slot.append(
      h('img', { src: c.portrait(hero.def.id, hero.skinId) }),
      h('div.col', { style: 'gap:0;min-width:0' },
        h('span.title.stroke-s', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, hero.name),
        h('span.small-text', getCharacter(hero.def.id).name),
        h('div.row', { style: 'gap:.3em' }, h('span.small-text', '🏆 ' + fmt(trophies)), me ? h('span.tagx', 'VOUS') : isFriend ? h('span.tagx.friend', 'AMI') : h('span.tagx.bot', '🤖 BOT'))));
    audio.play('tab');
  };

  (async () => {
    const found = await c.app.matchmaker.join({ mode: modeId, heroId: c.heroId, trophies: c.data.trophies, partyIds: c.party.map((p) => p.name) }, (n, needed) => {
      sub.textContent = `Joueurs trouvés : ${n}/${needed} · ${c.app.net.online ? 'serveur en ligne' : 'hors ligne : complété par des bots'}`;
    }, signal);
    if (!found || signal.cancelled) { clearInterval(tick); return; }
    const match = c.prepareMatch({ mode: modeId, seed: found.seed, arenaId: found.arenaId });
    // reveal the real roster
    const blue = match.heroes.map((x, i) => ({ x, i })).filter((o) => o.x.team === 0);
    const red = match.heroes.map((x, i) => ({ x, i })).filter((o) => o.x.team === 1 && !o.x.pve);
    const order: [HTMLElement, number][] = [];
    blue.forEach((o, k) => order.push([bSlots[k], o.i]));
    if (!pve) red.forEach((o, k) => order.push([rSlots[k], o.i]));
    for (const [slot, idx] of order) { if (signal.cancelled) return; fill(slot, match, idx); await new Promise((r) => setTimeout(r, 220)); }
    clearInterval(tick);
    const arena = getArena(found.arenaId);
    status.textContent = 'MATCH TROUVÉ !';
    center.innerHTML = '';
    center.append(h('div.mm-vs.stroke', 'VS'), h('div.mm-arena', { style: `background:linear-gradient(160deg,${arena.theme.floorA},${arena.theme.wallSide})` }, h('span.title.stroke-s', arena.name)), h('div.small-text', { style: 'max-width:12em;text-align:center' }, arena.description));
    audio.play('go');
    for (let n = 3; n > 0; n--) { if (signal.cancelled) return; sub.textContent = `Début dans ${n}…`; await new Promise((r) => setTimeout(r, 650)); }
    if (signal.cancelled) return;
    c.startMatch({ mode: modeId, arenaId: found.arenaId, seed: found.seed, matchId: found.matchId, vsBots: found.vsBots, build: () => match });
  })();

  return { el, onShow() { c.renderer.showcaseActive = false; audio.playMusic('menu'); }, onHide() { signal.cancelled = true; clearInterval(tick); } } as Screen;
}
