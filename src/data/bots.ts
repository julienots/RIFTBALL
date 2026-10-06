import type { BotProfile } from './types';

export const BOT_PROFILES: Record<BotProfile['id'], BotProfile> = {
  EASY: { id: 'EASY', reaction: 0.55, aimError: 0.35, abilityUse: 0.25, ultUse: 0.35, dodge: 0.1, repath: 0.9, teamwork: 0.3 },
  NORMAL: { id: 'NORMAL', reaction: 0.32, aimError: 0.18, abilityUse: 0.5, ultUse: 0.65, dodge: 0.35, repath: 0.6, teamwork: 0.6 },
  HARD: { id: 'HARD', reaction: 0.2, aimError: 0.09, abilityUse: 0.75, ultUse: 0.85, dodge: 0.6, repath: 0.45, teamwork: 0.8 },
  EXPERT: { id: 'EXPERT', reaction: 0.12, aimError: 0.04, abilityUse: 0.9, ultUse: 0.95, dodge: 0.85, repath: 0.3, teamwork: 0.95 },
};

/** Bot difficulty follows trophies so new players are not crushed. */
export function botProfileForTrophies(trophies: number): BotProfile['id'] {
  if (trophies < 150) return 'EASY';
  if (trophies < 700) return 'NORMAL';
  if (trophies < 1600) return 'HARD';
  return 'EXPERT';
}

export const BOT_NAMES = [
  'Zyphor', 'Kaïra', 'Bolt_99', 'NovaKid', 'Pixou', 'Rafale', 'Mochi', 'Kraken', 'Lumo', 'Tika', 'Ozzy', 'Grenat',
  'Sora', 'Vex', 'Bambou', 'Kobalt', 'Nyx', 'Fennec', 'Juju', 'Rocket', 'Ivy', 'Taro', 'Crispy', 'Zéphyr',
  'Mango', 'Orbit', 'Pépite', 'Kiwi', 'Blaze', 'Echo', 'Frost', 'Gizmo', 'Hiro', 'Indi', 'Jinx', 'Loki',
];
