import { h } from '../dom';
import type { Controller } from '../Controller';
import type { Screen } from '../UIManager';
import { shell } from './shell';
import { ARENAS } from '../../data/arenas';
import { MUTATIONS } from '../../data/mutations';

export const MECHANICS: { icon: string; title: string; text: string; isNew?: boolean }[] = [
  { icon: '🔒', title: 'Parties privées', text: 'Modes → Partie privée : crée un code et envoie-le à tes amis. Vous jouez ensemble en ligne, les places vides sont prises par des bots. Sans trophées.', isNew: true },
  { icon: '🎵', title: 'Nouvelle bande-son', text: 'Chaque saison a son thème de lobby, et le Boss, le Roi du Rift et FifiX ont leur propre musique.', isNew: true },
  { icon: '🎰', title: 'Mode FIFIX (temporaire)', text: 'Toutes les 20 s, la Roulette de Fifi transforme chaque joueur en un héros au hasard. Mutations en rafale et bonus. Jusqu\'au 31 octobre !' },
  { icon: '⚡', title: 'Élan', text: 'Une attaque juste après une roulade fait +20% de dégâts.' },
  { icon: '🗡️', title: 'Coup de grâce', text: 'Frapper un ennemi sous 20% de PV inflige +25%.' },
  { icon: '🤝', title: 'Attaque en duo', text: 'Viser la même cible qu\'un coéquipier donne +12% de dégâts.' },
  { icon: '🔥', title: 'Dernier souffle', text: 'Une fois par vie, tomber sous 15% de PV donne un bouclier de 25% et de la vitesse.' },
  { icon: '🌀', title: 'Nouvelles mutations', text: 'GÉANT (Rift énorme, but +1), BLACKOUT (on ne voit que de près), REBOND (projections x1,8), RUÉE VERS L\'OR (le Rift sème des bonus).' },
  { icon: '🐾', title: 'Compagnons & traînées', text: 'Équipe un compagnon qui te suit en match et dans le lobby, et une traînée derrière ton héros (Collection).' },
  { icon: '🥊', title: 'Combo x3', text: 'Touchez le même ennemi 3 fois de suite avec votre attaque : le 3e coup fait +30% de dégâts, le ralentit et charge votre ultime.' },
  { icon: '🗡️', title: 'Dans le dos', text: 'Frapper un ennemi par derrière inflige +20% de dégâts. Contournez-le !' },
  { icon: '✨', title: 'Esquive parfaite', text: 'Roulez au moment où une attaque vous touche : +10% d\'ultime, accélération, et votre prochaine attaque fait +35%.' },
  { icon: '💥', title: 'Contre le mur', text: 'Un ennemi projeté violemment contre un mur est étourdi et blessé. Titan, Koko et Magnet adorent ça.' },
  { icon: '🔋', title: 'Rage', text: 'Recevoir des dégâts recharge aussi un peu votre ultime : de quoi retourner un combat mal engagé.' },
  { icon: '🗓️', title: 'Saisons & rangs', text: 'Chaque saison (3 mois) a son thème, son Rift Pass et ses événements. Votre record de trophées donne un rang (Bronze → Légende) récompensé en fin de saison.' },
  { icon: '🎉', title: 'Événements', text: 'Essai Mythique, Tempête d\'Ultimes, Turbo Weekend, Festival des Bonus, Canons de Verre, Fête du Roi, Halloween… chacun change les règles et a ses défis.' },
  { icon: '👑', title: 'Mode ROI DU RIFT', text: 'Pas de buts : celui qui porte le Rift devient le Roi. Chaque seconde de règne = 1 point pour son équipe. Le Roi est visible partout. Premier à 60 !' },
  { icon: '👹', title: 'Boss : 3 phases', text: 'Le Colosse enchaîne Séisme, Météores, Rayon, Charge, Onde de cristaux, Puits gravitationnel et Bouclier du Rift. Sortez des zones rouges ! Le classement des dégâts s\'affiche en direct.' },
  { icon: '🌈', title: 'Héros Mythiques', text: 'CHRONOS (maître du temps), SERAPH (l\'archange qui ressuscite) et RIFTBORN (l\'enfant du Rift). Pouvoirs uniques et aura irisée. Gratuits : route des trophées ou coins.' },
  { icon: '💎', title: 'Défis', text: 'Des défis permanents et hebdomadaires rapportent des gemmes : battre le Colosse, régner en Roi, gagner sans mourir…' },
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
  { icon: '🌑', title: 'Silence & états', text: 'L\'Éclipse de LUNA empêche capacités, ultimes et pouvoirs. L\'Arrêt du Temps de CHRONOS fige. L\'Avatar de RIFTBORN est insensible aux contrôles.' },
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
  const key = 'news_v17';
  if ((c.data as any).seenNews === key || !c.data.tutorialDone) return;
  (c.data as any).seenNews = key;
  c.app.save.save();
  const m = c.ui.modal('NOUVEAUTÉS', h('div.col', { style: 'gap:.5em;max-width:34em' },
    h('div.small-text', 'Mise à jour 1.0.7 : LE LOBBY PREND VIE'),
    ...[
      ['🌋', 'Nouveau lobby en 3D : portail du Rift géant, îles flottantes, décor de saison'],
      ['🎵', '7 nouvelles musiques : thèmes de saison, Boss, Roi du Rift, FifiX'],
      ['🔒', 'PARTIES PRIVÉES : joue en ligne avec tes amis grâce à un code'],
    ].map(([i, t]) => h('div.row', { style: 'gap:.6em' }, h('span', { style: 'font-size:1.5em' }, i), h('span', t))),
    h('div.row', { style: 'justify-content:center;gap:.6em;margin-top:.4em' },
      h('button.btn.purple', { onclick: () => { m.close(); c.ui.push(guideScreen(c)); } }, '📖 GUIDE'),
      h('button.btn.green', { onclick: () => m.close() }, 'JOUER !'))));
}
