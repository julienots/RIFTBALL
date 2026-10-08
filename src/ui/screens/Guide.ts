import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { ARENAS } from '../../data/arenas';
import { MUTATIONS } from '../../data/mutations';

export const MECHANICS: { icon: string; title: string; text: string; isNew?: boolean }[] = [
  { icon: '👑', title: 'Mode ROI DU RIFT', text: 'Pas de buts : celui qui porte le Rift devient le Roi. Chaque seconde de règne = 1 point pour son équipe. Le Roi est visible partout. Premier à 60 !', isNew: true },
  { icon: '👹', title: 'Boss : 3 phases', text: 'Le Colosse enchaîne Séisme, Météores, Rayon, Charge, Onde de cristaux, Puits gravitationnel et Bouclier du Rift. Sortez des zones rouges ! Le classement des dégâts s\'affiche en direct.', isNew: true },
  { icon: '🌈', title: 'Héros Mythiques', text: 'CHRONOS (maître du temps), SERAPH (l\'archange qui ressuscite) et RIFTBORN (l\'enfant du Rift). Pouvoirs uniques et aura irisée. Gratuits : route des trophées ou coins.', isNew: true },
  { icon: '💎', title: 'Défis', text: 'Des défis permanents et hebdomadaires rapportent des gemmes : battre le Colosse, régner en Roi, gagner sans mourir…', isNew: true },
  { icon: '🔮', title: 'Le Rift', text: 'Une créature d\'énergie : elle fuit, devient curieuse et mute. Touchez-la pour la capturer, amenez-la dans le portail adverse.' },
  { icon: '🎯', title: 'Lancer & passes', text: 'En portant le Rift, ATTAQUE devient LANCER : glissez pour viser un coéquipier ou le portail. Les ennemis peuvent intercepter.' },
  { icon: '⚡', title: 'Rift surchargé', text: 'Gardez le Rift 8 secondes : il devient doré et le but vaut 2 points. Mais le porteur est ralenti et visible partout.' },
  { icon: '💨', title: 'Roulade', text: 'Tous les héros peuvent rouler : esquive courte avec invulnérabilité. Recharge 4 s (5,5 s en portant le Rift). Clavier : Maj.' },
  { icon: '✦', title: 'Pouvoir unique (gadget)', text: 'Chaque héros possède un pouvoir unique utilisable 3 fois par match : grappin, cage à Rift, échange d\'ombre, rafale… Clavier : G.' },
  { icon: '💎', title: 'Bonus', text: 'Des cristaux apparaissent sur les autels et dans les caisses : 💨 vitesse, 🛡️ bouclier, ⚔️ +25% dégâts, ★ +35% d\'ultime.' },
  { icon: '📦', title: 'Caisses destructibles', text: 'Détruisez-les pour ouvrir des passages et récupérer des bonus.' },
  { icon: '🚀', title: 'Tremplins', text: 'Montez dessus pour être propulsé au-dessus des murs jusqu\'au tremplin jumeau.' },
  { icon: '💀', title: 'Primes', text: '3 éliminations sans mourir : votre tête est mise à prix. Celui qui vous élimine gagne +40% d\'ultime et un bouclier.' },
  { icon: '🌀', title: 'Mutations', text: MUTATIONS.filter((m) => m.weight > 0).map((m) => m.name).join(' · ') + ' : le Rift change les règles du match.' },
  { icon: '🌑', title: 'Silence & états', text: 'L\'Éclipse de LUNA empêche capacités, ultimes et pouvoirs. L\'Arrêt du Temps de CHRONOS fige. L\'Avatar de RIFTBORN est insensible aux contrôles.', isNew: true },
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
  const key = 'news_v14';
  if ((c.data as any).seenNews === key || !c.data.tutorialDone) return;
  (c.data as any).seenNews = key;
  c.app.save.save();
  const m = c.ui.modal('NOUVEAUTÉS', h('div.col', { style: 'gap:.5em;max-width:34em' },
    h('div.small-text', 'Mise à jour 1.0.4 : LES MYTHIQUES !'),
    ...[
      ['🌈', '3 héros MYTHIQUES : CHRONOS, SERAPH et RIFTBORN'],
      ['🦸', '5 nouveaux héros : ZIP, GRILL, KOKO, LUNA et GEAR (avec sa tourelle)'],
      ['👑', 'Nouveau mode ROI DU RIFT : gardez le Rift pour régner !'],
      ['👹', 'Boss en 3 phases, 7 attaques à esquiver, classement des dégâts'],
      ['💎', 'DÉFIS : gagnez des gemmes en relevant des défis'],
      ['✨', 'Personnages plus beaux : yeux qui clignent, reflets, auras'],
    ].map(([i, t]) => h('div.row', { style: 'gap:.6em' }, h('span', { style: 'font-size:1.5em' }, i), h('span', t))),
    h('div.row', { style: 'justify-content:center;gap:.6em;margin-top:.4em' },
      h('button.btn.purple', { onclick: () => { m.close(); c.ui.push(guideScreen(c)); } }, '📖 GUIDE'),
      h('button.btn.green', { onclick: () => m.close() }, 'JOUER !'))));
}
