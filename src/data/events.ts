import type { EventData } from './types';

/**
 * Live events. Recurring events repeat on a cycle (days since epoch), dated ones run between ISO dates.
 * Everything here can be replaced by a server-delivered list without touching code.
 */
export const EVENTS: EventData[] = [
  { id: 'rift_frenzy', name: 'RIFT FRENZY', description: 'Le Rift est surexcité : +40% de vitesse dans tous les modes.', color: '#ff3d3d', icon: '💨', recurring: { everyDays: 14, offsetDays: 0, lengthDays: 2 }, modifiers: { riftSpeedMul: 1.4 } },
  { id: 'double_xp', name: 'DOUBLE XP', description: 'Expérience de compte et Pass XP doublées !', color: '#ffd60a', icon: '✨', recurring: { everyDays: 7, offsetDays: 5, lengthDays: 2 }, modifiers: { xpMul: 2, passXpMul: 2 } },
  { id: 'chaos_week', name: 'CHAOS WEEK', description: 'Mutations 2x plus fréquentes. Boutique Chaos ouverte.', color: '#ff7b00', icon: '🌀', recurring: { everyDays: 28, offsetDays: 7, lengthDays: 7 }, modifiers: { mutationIntervalMul: 0.5 }, shopOffers: ['offer_event_chaos'] },
  { id: 'boss_invasion', name: 'BOSS INVASION', description: 'Le Colosse attaque ! Récompenses RIFT BOSS x2.', color: '#9d4edd', icon: '👹', recurring: { everyDays: 21, offsetDays: 10, lengthDays: 3 }, modifiers: { coinMul: 2, forcedMode: 'RIFT_BOSS' } },
  { id: 'volcanic_week', name: 'VOLCANIC WEEK', description: 'Le Noyau Volcanique est en éruption : plus de matchs en Volcanic Core.', color: '#ff5400', icon: '🌋', recurring: { everyDays: 28, offsetDays: 0, lengthDays: 7 }, modifiers: { arenaBias: 'volcanic_core', coinMul: 1.25 }, shopOffers: ['offer_event_volcanic'] },
  { id: 'winter_rift', name: 'WINTER RIFT', description: 'L\'hiver gèle les arènes. Skins et emotes d\'hiver disponibles.', color: '#4cc9f0', icon: '❄️', start: '2026-12-15T00:00:00Z', end: '2027-01-05T00:00:00Z', modifiers: { arenaBias: 'frozen_lab', xpMul: 1.25 }, shopOffers: ['offer_event_winter'] },
  // gameplay events (v1.0.5)
  { id: 'mythic_trial', name: 'ESSAI MYTHIQUE', description: 'Tous les héros, Mythiques compris, sont jouables gratuitement pendant 2 jours !', color: '#ff3d7f', icon: '🌈', recurring: { everyDays: 14, offsetDays: 3, lengthDays: 2 }, modifiers: { allHeroes: true } },
  { id: 'ult_storm', name: 'TEMPÊTE D\'ULTIMES', description: 'Les ultimes se chargent 2x plus vite. Chaos garanti !', color: '#ffd60a', icon: '★', recurring: { everyDays: 10, offsetDays: 2, lengthDays: 2 }, modifiers: { ultChargeMul: 2 } },
  { id: 'turbo_weekend', name: 'TURBO WEEKEND', description: 'Héros +20% de vitesse, Rift +20%. Les matchs vont très vite.', color: '#00bbf9', icon: '🏎️', recurring: { everyDays: 21, offsetDays: 15, lengthDays: 2 }, modifiers: { heroSpeedMul: 1.2, riftSpeedMul: 1.2 } },
  { id: 'bonus_festival', name: 'FESTIVAL DES BONUS', description: 'Les autels et les caisses donnent 2,5x plus de bonus.', color: '#80ed99', icon: '💎', recurring: { everyDays: 12, offsetDays: 6, lengthDays: 2 }, modifiers: { pickupRateMul: 2.5, coinMul: 1.2 } },
  { id: 'glass_cannon', name: 'CANONS DE VERRE', description: 'Tous les dégâts +40%. Esquivez ou tombez !', color: '#ff4d6d', icon: '💥', recurring: { everyDays: 30, offsetDays: 20, lengthDays: 2 }, modifiers: { damageMul: 1.4 } },
  { id: 'king_festival', name: 'FÊTE DU ROI', description: 'Le mode ROI DU RIFT à l\'honneur : +50% de coins.', color: '#ffb703', icon: '👑', recurring: { everyDays: 18, offsetDays: 9, lengthDays: 2 }, modifiers: { forcedMode: 'RIFT_KING', coinMul: 1.5 } },
  { id: 'fifix_event', name: 'FIFIX', description: 'Mode temporaire FIFIX : héros tirés au sort toutes les 20 s ! Récompenses exclusives : compagnon Fifi, traînée Paillettes, skin Zip FifiX.', color: '#ff4ecd', icon: '🎰', start: '2026-10-09T00:00:00Z', end: '2026-10-31T00:00:00Z', modifiers: { coinMul: 1.2 } },
  { id: 'halloween_rift', name: 'NUIT DU RIFT', description: 'Halloween : mutations plus fréquentes, +30% de coins et récompenses effrayantes.', color: '#ff7b00', icon: '🎃', start: '2026-10-24T00:00:00Z', end: '2026-11-03T00:00:00Z', modifiers: { mutationIntervalMul: 0.7, coinMul: 1.3 } },
  { id: 'new_year', name: 'NOUVEL AN DU RIFT', description: 'Feux d\'artifice : XP x2, Pass XP x1,5 et défi spécial.', color: '#c77dff', icon: '🎆', start: '2026-12-30T00:00:00Z', end: '2027-01-04T00:00:00Z', modifiers: { xpMul: 2, passXpMul: 1.5 } },
];
