import { menuMusic } from '../../audio/music';
import { h, fmt } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { audio } from '../../audio/AudioEngine';
import { getMode } from '../../data/modes';
import { getArena } from '../../data/arenas';
import { getCharacter } from '../../data/characters';
import type { Match } from '../../game/Match';
import { BuildConfig } from '../../core/config';

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
    h('div.row', { style: 'justify-content:center;padding-bottom:.8em' }, h('button.btn.red', { onclick: () => { signal.cancelled = true; c.app.online.cancel(); audio.play('click'); c.screens.home(); } }, 'ANNULER')));

  const teamSize = modeId === 'RIFT_DUEL' ? 1 : mode.teamSize;
  const mkSlot = () => h('div.mm-card.empty', h('div.spinner', { style: 'width:1.8em;height:1.8em;border-width:.3em' }));
  const bSlots = Array.from({ length: teamSize }, mkSlot);
  const rSlots = pve ? [h('div.mm-card.boss', h('div', { style: 'font-size:2.4em' }, modeId === 'RIFT_BOSS' ? '👹' : '👾'), h('div.title.stroke-s', modeId === 'RIFT_BOSS' ? 'RIFT COLOSSUS' : '8 VAGUES'), h('div.small-text', modeId === 'RIFT_BOSS' ? 'Boss · 3 phases' : 'Créatures du Rift'))] : Array.from({ length: teamSize }, mkSlot);
  slotsB.append(...bSlots); slotsR.append(...rSlots);

  const t0 = performance.now();
  const tick = setInterval(() => { const s = Math.floor((performance.now() - t0) / 1000); timer.textContent = `00:${String(s).padStart(2, '0')}`; }, 250);

  const fillCard = (slot: HTMLElement, p: { heroId: string; skinId: string; name: string; team: number; me: boolean; tag: 'VOUS' | 'AMI' | 'BOT' | 'JOUEUR'; trophies: number }) => {
    slot.className = 'mm-card ' + (p.team === 0 ? 'b' : 'r') + (p.me ? ' me' : '');
    slot.innerHTML = '';
    slot.append(
      h('img', { src: c.portrait(p.heroId, p.skinId) }),
      h('div.col', { style: 'gap:0;min-width:0' },
        h('span.title.stroke-s', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, p.name),
        h('span.small-text', getCharacter(p.heroId).name),
        h('div.row', { style: 'gap:.3em' }, h('span.small-text', '🏆 ' + fmt(p.trophies)),
          p.tag === 'VOUS' ? h('span.tagx', 'VOUS') : p.tag === 'AMI' ? h('span.tagx.friend', 'AMI') : p.tag === 'JOUEUR' ? h('span.tagx.friend', '🌐 JOUEUR') : h('span.tagx.bot', '🤖 BOT'))));
    audio.play('tab');
  };
  const fill = (slot: HTMLElement, m: Match, heroIdx: number) => {
    const hero = m.heroes[heroIdx];
    if (!hero) return;
    const me = hero.id === m.humanId;
    const isFriend = c.party.some((p) => p.name === hero.name);
    fillCard(slot, { heroId: hero.def.id, skinId: hero.skinId, name: hero.name, team: hero.team, me, tag: me ? 'VOUS' : isFriend ? 'AMI' : 'BOT', trophies: me ? c.data.trophies : Math.max(0, c.data.trophies + ((hero.id * 37) % 160) - 60) });
  };

  // ---------------------------------------------------------------- ONLINE: real players first, bots fill the rest
  const tryOnline = async (): Promise<boolean> => {
    if (!BuildConfig.serverUrl) return false;
    status.textContent = 'CONNEXION AU SERVEUR…';
    const ok = await c.app.online.connect({ playerId: c.data.playerId, name: c.data.profile.name, trophies: c.data.trophies });
    if (!ok || signal.cancelled) return false;
    status.textContent = 'RECHERCHE DE JOUEURS EN LIGNE…';
    const client = c.app.online;
    return new Promise<boolean>((resolve) => {
      const off = client.on(async (msg) => {
        if (signal.cancelled) { off(); client.cancel(); resolve(true); return; }
        if (msg.t === 'queue') sub.textContent = msg.code
          ? `🔒 PARTIE PRIVÉE ${msg.code} · ${msg.humans}/${msg.needed} joueurs (${(msg.names ?? []).join(', ')}) · bots dans ${Math.ceil(msg.waitLeft / 1000)} s`
          : `🌐 ${msg.online} joueur(s) en ligne · ${msg.humans} dans la file · bots dans ${Math.ceil(msg.waitLeft / 1000)} s si personne`;
        if (msg.t === 'error' && msg.msg === 'disconnected') { off(); resolve(false); }
        if (msg.t === 'error' && msg.msg !== 'disconnected') { off(); c.ui.alert('SERVEUR', msg.msg); resolve(true); c.screens.home(); }
        if (msg.t === 'found') {
          off();
          clearInterval(tick);
          const blue = msg.roster.filter((r) => r.team === 0), red = msg.roster.filter((r) => r.team === 1);
          const humans = msg.roster.filter((r) => !r.isBot).length;
          blue.forEach((r, k) => bSlots[k] && fillCard(bSlots[k], { ...r, me: r.heroEntityId === msg.you, tag: r.heroEntityId === msg.you ? 'VOUS' : r.isBot ? 'BOT' : 'JOUEUR', trophies: r.isBot ? Math.max(0, c.data.trophies + ((r.slot * 37) % 160) - 60) : r.trophies }));
          if (!pve) red.forEach((r, k) => rSlots[k] && fillCard(rSlots[k], { ...r, me: false, tag: r.isBot ? 'BOT' : 'JOUEUR', trophies: r.isBot ? Math.max(0, c.data.trophies + ((r.slot * 53) % 160) - 60) : r.trophies }));
          status.textContent = 'MATCH TROUVÉ !';
          sub.textContent = humans > 1 ? `🌐 ${humans} joueurs réels + ${msg.roster.length - humans} bots` : '🤖 Aucun autre joueur disponible : match contre des bots';
          const arena = getArena(msg.arenaId);
          center.innerHTML = '';
          center.append(h('div.mm-vs.stroke', 'VS'), h('div.mm-arena', { style: `background:linear-gradient(160deg,${arena.theme.floorA},${arena.theme.wallSide})` }, h('span.title.stroke-s', arena.name)));
          audio.play('go');
          await new Promise((r) => setTimeout(r, 1100));
          if (signal.cancelled) { client.leave(); resolve(true); return; }
          c.startMatch({ mode: msg.mode, arenaId: msg.arenaId, seed: msg.seed, matchId: msg.matchId, vsBots: humans <= 1, online: { client, roster: msg.roster, you: msg.you }, ...(msg.private ? { training: true } : {}) });
          resolve(true);
        }
      });
      if (c.privateCode) status.textContent = `PARTIE PRIVÉE · CODE ${c.privateCode}`;
      client.queue(modeId, c.heroId, c.skinId, c.trainingLevel ?? undefined, c.privateCode || undefined);
    });
  };

  (async () => {
    if (await tryOnline()) return;
    if (signal.cancelled) return;
    if (c.privateCode) { clearInterval(tick); c.ui.alert('PARTIE PRIVÉE', 'Le serveur en ligne est injoignable : les parties privées ont besoin d\'Internet. Réessaie dans un instant.'); c.screens.home(); return; }
    if (BuildConfig.serverUrl) sub.textContent = 'Serveur injoignable : partie hors ligne contre des bots';
    status.textContent = 'RECHERCHE DE JOUEURS…';
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

  return { el, onShow() { c.renderer.showcaseActive = false; audio.playMusic(menuMusic()); }, onHide() { signal.cancelled = true; clearInterval(tick); } } as Screen;
}
