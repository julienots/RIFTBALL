import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { ARENAS } from '../../data/arenas';
import { MUTATIONS } from '../../data/mutations';

export const MECHANICS: { icon: string; title: string; text: string; isNew?: boolean }[] = [
  { icon: '🔮', title: 'Le Rift', text: 'Une créature d\'énergie : elle fuit, devient curieuse et mute. Touchez-la pour la capturer, amenez-la dans le portail adverse.' },
  { icon: '🎯', title: 'Lancer & passes', text: 'En portant le Rift, ATTAQUE devient LANCER : glissez pour viser un coéquipier ou le portail. Les ennemis peuvent intercepter.' },
  { icon: '⚡', title: 'Rift surchargé', text: 'Gardez le Rift 8 secondes : il devient doré et le but vaut 2 points. Mais le porteur est ralenti et visible partout.', isNew: true },
  { icon: '💨', title: 'Roulade', text: 'Tous les héros peuvent rouler : esquive courte avec invulnérabilité. Recharge 4 s (5,5 s en portant le Rift). Clavier : Maj.', isNew: true },
  { icon: '✦', title: 'Pouvoir unique (gadget)', text: 'Chaque héros possède un pouvoir unique utilisable 3 fois par match : grappin, cage à Rift, échange d\'ombre, rafale… Clavier : G.', isNew: true },
  { icon: '💎', title: 'Bonus', text: 'Des cristaux apparaissent sur les autels et dans les caisses : 💨 vitesse, 🛡️ bouclier, ⚔️ +25% dégâts, ★ +35% d\'ultime.', isNew: true },
  { icon: '📦', title: 'Caisses destructibles', text: 'Détruisez-les pour ouvrir des passages et récupérer des bonus.', isNew: true },
  { icon: '🚀', title: 'Tremplins', text: 'Montez dessus pour être propulsé au-dessus des murs jusqu\'au tremplin jumeau.', isNew: true },
  { icon: '👑', title: 'Primes', text: '3 éliminations sans mourir : votre tête est mise à prix. Celui qui vous élimine gagne +40% d\'ultime et un bouclier.', isNew: true },
  { icon: '🌀', title: 'Mutations', text: MUTATIONS.filter((m) => m.weight > 0).map((m) => m.name).join(' · ') + ' : le Rift change les règles du match.' },
  { icon: '🌿', title: 'Buissons', text: 'Cachent les joueurs. Attaquer ou être touché vous révèle. La Fusée de NOVA révèle tout.' },
  { icon: '★', title: 'Ultime', text: 'La jauge se remplit en touchant les ennemis, en capturant et en marquant. À 100% : bouton ULTIME.' },
];

export function guideScreen(c: Controller): Screen {
  const body = h('div.scroll', { style: 'flex:1;min-height:0;padding:0 .9em .9em' },
    h('div.guide-grid', MECHANICS.map((m) => h('div.panel.guide-card', m.isNew ? h('span.tagx.red', { style: 'position:absolute;top:-.5em;right:.5em' }, 'NOUVEAU') : null,
      h('div.gi', m.icon), h('div.col', { style: 'gap:.15em' }, h('span.title.stroke-s', m.title), h('span.small-text', m.text))))),
    h('div.title', { style: 'margin:.8em 0 .4em' }, `ARÈNES (${ARENAS.length})`),
    h('div.guide-grid', ARENAS.map((a) => h('div.panel.guide-card', { style: `background:linear-gradient(150deg,${a.theme.floorA},${a.theme.wallSide})` }, a.isNew ? h('span.tagx.red', { style: 'position:absolute;top:-.5em;right:.5em' }, 'NOUVEAU') : null,
      h('div.col', { style: 'gap:.15em' }, h('span.title.stroke-s', a.name), h('span.small-text.stroke-s', a.description))))));
  const { el, off } = shell(c, 'GUIDE DU JEU', body, { currencies: false });
  return { el, onHide: off };
}

/** One-time "what's new" popup for this content update. */
export function showNews(c: Controller) {
  const key = 'news_v13';
  if ((c.data as any).seenNews === key || !c.data.tutorialDone) return;
  (c.data as any).seenNews = key;
  c.app.save.save();
  const m = c.ui.modal('NOUVEAUTÉS', h('div.col', { style: 'gap:.5em;max-width:34em' },
    h('div.small-text', 'La grosse mise à jour de RIFTBALL est arrivée !'),
    ...[
      ['🗺️', 'Arènes plus grandes + 3 nouvelles : Crystal Canyon, Sky Temple, Neon Docks'],
      ['🦸', '2 nouveaux héros : NOVA la sniper et FROST le gardien du givre'],
      ['✦', 'Un pouvoir unique (gadget) pour chaque héros, 3 fois par match'],
      ['💨', 'Roulade d\'esquive pour tout le monde'],
      ['⚡', 'Rift surchargé : gardez-le 8 s, le but vaut 2 points'],
      ['💎', 'Bonus, caisses destructibles, tremplins et primes'],
    ].map(([i, t]) => h('div.row', { style: 'gap:.6em' }, h('span', { style: 'font-size:1.5em' }, i), h('span', t))),
    h('div.row', { style: 'justify-content:center;gap:.6em;margin-top:.4em' },
      h('button.btn.purple', { onclick: () => { m.close(); c.ui.push(guideScreen(c)); } }, '📖 GUIDE'),
      h('button.btn.green', { onclick: () => m.close() }, 'JOUER !'))));
}
