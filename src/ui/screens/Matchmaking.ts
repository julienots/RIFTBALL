import { h } from '../dom';
import type { Controller } from '../Controller';
import { audio } from '../../audio/AudioEngine';
import { getMode } from '../../data/modes';
import { getArena } from '../../data/arenas';

/** PLAYER -> QUEUE -> MATCHMAKING -> 3V3 */
export async function runMatchmaking(c: Controller) {
  const forced = c.app.events.modifiers().forcedMode;
  const modeId = c.selectedMode;
  const mode = getMode(modeId);
  const needed = modeId === 'RIFT_DUEL' ? 2 : mode.teamSize === 3 && (modeId === 'RIFT_BOSS' || modeId === 'SURVIVAL') ? 3 : mode.teamSize * 2;
  const slots = Array.from({ length: needed }, () => h('div.mm-slot', '·'));
  const status = h('div.title.stroke-s', { style: 'font-size:1.2em' }, 'Recherche de joueurs…');
  const signal = { cancelled: false };
  const m = c.ui.modal(mode.name, h('div.col', { style: 'align-items:center;gap:1em;min-width:22em' },
    h('div.spinner'), status, h('div.mm-slots', slots),
    h('div.small-text.muted', c.app.net.online ? 'Matchmaking en ligne' : 'Hors ligne : adversaires et alliés contrôlés par l\'IA'),
    h('button.btn.red.small', { onclick: () => { signal.cancelled = true; m.close(); } }, 'ANNULER')), { closable: false });
  void forced;
  const found = await c.app.matchmaker.join({ mode: modeId, heroId: c.heroId, trophies: c.data.trophies, partyIds: c.party.map((p) => p.name) }, (n) => {
    slots.forEach((s, i) => { if (i < n && !s.classList.contains('on')) { s.classList.add('on'); s.textContent = i === 0 ? '⭐' : '✔'; audio.play('tab'); } });
    status.textContent = `Joueurs trouvés : ${n}/${needed}`;
  }, signal);
  if (!found || signal.cancelled) return;
  status.textContent = `Arène : ${getArena(found.arenaId).name}`;
  audio.play('go');
  await new Promise((r) => setTimeout(r, 650));
  m.close();
  c.startMatch({ mode: modeId, arenaId: found.arenaId, seed: found.seed, matchId: found.matchId, vsBots: found.vsBots });
}
