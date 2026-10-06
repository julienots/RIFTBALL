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
];
