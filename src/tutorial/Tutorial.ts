import type { Controller } from '../ui/Controller';
import { Match } from '../game/Match';
import { h } from '../ui/dom';
import { audio } from '../audio/AudioEngine';
import type { GameSession } from '../game/GameView';

interface Step { title: string; text: string; setup?: (m: Match) => void; done: (m: Match, s: GameSession) => boolean; arrow?: 'left' | 'attack' | 'ability' | 'ult' }

/** Short interactive tutorial: move, attack, Rift, capture, portal, ability, ultimate, mutation. */
export function startTutorial(c: Controller) {
  const dummyName = 'Mannequin';
  let step = 0, t0 = 0, startX = 0;
  const steps: Step[] = [
    { title: '1/8 · DÉPLACEMENT', text: 'Glissez le pouce à GAUCHE de l\'écran pour vous déplacer (clavier : ZQSD / WASD).', arrow: 'left', setup: (m) => { startX = m.human!.x; }, done: (m) => Math.hypot(m.human!.x - startX, 0) > 220 || m.human!.y < 450 || m.human!.y > 850 },
    { title: '2/8 · ATTAQUE', text: 'Touchez ATTAQUE pour tirer automatiquement sur le mannequin. Glissez le bouton pour viser à la main.', arrow: 'attack', setup: (m) => { const d = m.heroes.find((x) => x.name === dummyName)!; d.x = m.human!.x + 380; d.y = m.human!.y; d.alive = true; d.hp = d.maxHp = 3000; }, done: (m) => { const d = m.heroes.find((x) => x.name === dummyName)!; return d.hp < d.maxHp * 0.5 || !d.alive; } },
    { title: '3/8 · LE RIFT', text: 'Voici le RIFT : une créature d\'énergie. Il fuit quand on s\'approche… rapprochez-vous !', setup: (m) => { const r = m.mainRift()!; r.x = m.human!.x + 450; r.y = m.human!.y; r.state = 'ROAM'; }, done: (m) => { const r = m.mainRift()!; return Math.hypot(r.x - m.human!.x, r.y - m.human!.y) < 260; } },
    { title: '4/8 · CAPTURE', text: 'Touchez le Rift pour le capturer. Vous serez plus lent en le portant.', done: (m) => m.human!.carrying },
    { title: '5/8 · PORTAIL', text: 'Amenez le Rift dans le PORTAIL ROUGE à droite (ou touchez LANCER pour le tirer dedans).', done: (m) => m.score[0] > 0 },
    { title: '6/8 · CAPACITÉ', text: 'Touchez CAPACITÉ (bouton bleu). Chaque héros a la sienne !', arrow: 'ability', setup: (m) => { m.human!.abCd = 0; }, done: (m) => m.human!.stats.abilities > 0 },
    { title: '7/8 · ULTIME', text: 'La jauge ULTIME se remplit en touchant vos ennemis. Elle est pleine : déclenchez-la !', arrow: 'ult', setup: (m) => { m.human!.ult = 100; const d = m.heroes.find((x) => x.name === dummyName)!; d.alive = true; d.hp = d.maxHp; d.x = m.human!.x + 300; d.y = m.human!.y; }, done: (m) => m.human!.stats.ults > 0 },
    { title: '8/8 · MUTATION', text: '⚠ Pendant les matchs, le Rift MUTE et change les règles. Observez !', setup: (m) => { m.mutations.trigger('CLONE'); }, done: (m) => m.mutation !== 'NORMAL' && m.time - t0 > 5 },
  ];
  const build = () => {
    const m = new Match({ mode: 'TUTORIAL', arenaId: 'rift_valley', seed: 77, players: [
      { heroId: c.heroId, name: c.data.profile.name, team: 0, isBot: false, human: true, skinId: c.skinId },
      { heroId: 'titan', name: dummyName, team: 1, isBot: false },
    ] });
    const d = m.heroes[1];
    d.x = m.arena.w - 500; d.y = 300;
    d.canCarry = false;
    return m;
  };
  const s = c.startMatch({ mode: 'TUTORIAL', arenaId: 'rift_valley', seed: 77, matchId: 'tutorial-' + Date.now(), vsBots: true, build } as any);
  const box = h('div.tut.panel', h('div.st'), h('div.tx'));
  const skip = h('button.btn.small.gray.hud-btn-ui', { style: 'position:absolute;top:3.4em;right:calc(4em + var(--safe-r));pointer-events:auto', onclick: () => {
    c.data.tutorialDone = true; c.app.save.save(); c.app.analytics.track('tutorial_done', { skipped: true });
    s.onFrame = null; s.dispose(); c.session = null; c.screens.home();
  } }, 'PASSER ⏭');
  const arrow = h('div.tut-arrow', '👇');
  s.hud.el.append(box, arrow, skip);
  const show = () => {
    const st = steps[step];
    (box.firstElementChild as HTMLElement).textContent = st.title;
    (box.lastElementChild as HTMLElement).textContent = st.text;
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    arrow.style.display = st.arrow ? '' : 'none';
    const pos: Record<string, string> = { left: 'left:16vw;bottom:24vh', attack: 'right:3.6em;bottom:8.6em', ability: 'right:9.4em;bottom:6.4em', ult: 'right:3.6em;bottom:14.4em' };
    if (st.arrow) arrow.setAttribute('style', pos[st.arrow]);
    st.setup?.(s.match);
    t0 = s.match.time;
    c.app.analytics.track('tutorial_step', { step });
  };
  show();
  s.onFrame = () => {
    const m = s.match;
    // keep the dummy harmless and the human alive
    const d = m.heroes.find((x) => x.name === dummyName);
    if (d) { d.cmd.mx = d.cmd.my = 0; d.cmd.attack = false; }
    if (m.human && m.human.hp < m.human.maxHp * 0.3) m.human.hp = m.human.maxHp;
    if (m.phase === 'goal') m.phaseUntil = Math.min(m.phaseUntil, m.time + 1.2);
    if (step < steps.length && m.phase !== 'countdown' && steps[step].done(m, s)) {
      audio.play('reward');
      step++;
      if (step >= steps.length) {
        box.innerHTML = '';
        box.append(h('div.st', 'TUTORIEL TERMINÉ !'), h('div.tx', 'Bravo ! Place à votre premier vrai match contre des bots.'));
        arrow.remove(); skip.remove();
        c.data.tutorialDone = true;
        c.app.save.save();
        c.app.analytics.track('tutorial_done', {});
        s.onFrame = null;
        setTimeout(() => {
          s.dispose();
          c.session = null;
          c.selectedMode = 'RIFTBALL';
          c.trainingLevel = 'EASY';
          c.startMatch({ mode: 'RIFTBALL', arenaId: 'rift_valley', seed: (Math.random() * 1e9) | 0, matchId: 'first-' + Date.now(), vsBots: true, botLevel: 'EASY' });
          c.trainingLevel = null;
        }, 2600);
      } else show();
    }
  };
  // tutorial end (forfeit) -> home without rewards
  s.onEnd = () => { c.session = null; s.dispose(); c.screens.home(); };
}
