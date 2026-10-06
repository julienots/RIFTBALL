import type { MissionData } from './types';

/** Mission pools. Daily/weekly missions are drawn deterministically from these pools each period. */
export const MISSIONS: MissionData[] = [
  // DAILY
  { id: 'd_play3', scope: 'daily', text: 'Jouer 3 matchs', stat: 'matches', target: 3, reward: [{ kind: 'passXp', amount: 250 }, { kind: 'coins', amount: 60 }] },
  { id: 'd_goals5', scope: 'daily', text: 'Marquer 5 points', stat: 'goals', target: 5, reward: [{ kind: 'passXp', amount: 300 }, { kind: 'coins', amount: 80 }] },
  { id: 'd_abil10', scope: 'daily', text: 'Utiliser 10 capacités', stat: 'abilities', target: 10, reward: [{ kind: 'passXp', amount: 250 }, { kind: 'coins', amount: 60 }] },
  { id: 'd_win1', scope: 'daily', text: 'Gagner 1 partie', stat: 'wins', target: 1, reward: [{ kind: 'passXp', amount: 300 }, { kind: 'coins', amount: 80 }] },
  { id: 'd_kills8', scope: 'daily', text: 'Éliminer 8 adversaires', stat: 'kills', target: 8, reward: [{ kind: 'passXp', amount: 250 }, { kind: 'coins', amount: 60 }] },
  { id: 'd_caps6', scope: 'daily', text: 'Capturer le Rift 6 fois', stat: 'captures', target: 6, reward: [{ kind: 'passXp', amount: 250 }, { kind: 'coins', amount: 60 }] },
  { id: 'd_ult3', scope: 'daily', text: 'Lancer 3 ultimes', stat: 'ults', target: 3, reward: [{ kind: 'passXp', amount: 250 }, { kind: 'coins', amount: 60 }] },
  { id: 'd_mut2', scope: 'daily', text: 'Vivre 2 mutations du Rift', stat: 'mutations_seen', target: 2, reward: [{ kind: 'passXp', amount: 200 }, { kind: 'coins', amount: 50 }] },
  { id: 'd_throw5', scope: 'daily', text: 'Lancer le Rift 5 fois', stat: 'throws', target: 5, reward: [{ kind: 'passXp', amount: 200 }, { kind: 'coins', amount: 50 }] },
  // WEEKLY
  { id: 'w_play20', scope: 'weekly', text: 'Jouer 20 matchs', stat: 'matches', target: 20, reward: [{ kind: 'passXp', amount: 1200 }, { kind: 'coins', amount: 400 }] },
  { id: 'w_win10', scope: 'weekly', text: 'Gagner 10 parties', stat: 'wins', target: 10, reward: [{ kind: 'passXp', amount: 1500 }, { kind: 'coins', amount: 500 }] },
  { id: 'w_goals25', scope: 'weekly', text: 'Marquer 25 points', stat: 'goals', target: 25, reward: [{ kind: 'passXp', amount: 1200 }, { kind: 'coins', amount: 400 }] },
  { id: 'w_dmg', scope: 'weekly', text: 'Infliger 150 000 dégâts', stat: 'damage', target: 150000, reward: [{ kind: 'passXp', amount: 1000 }, { kind: 'coins', amount: 350 }] },
  { id: 'w_heal', scope: 'weekly', text: 'Soigner 40 000 PV', stat: 'heal', target: 40000, reward: [{ kind: 'passXp', amount: 1000 }, { kind: 'coins', amount: 350 }] },
  { id: 'w_boss', scope: 'weekly', text: 'Jouer 3 parties RIFT BOSS', stat: 'mode_RIFT_BOSS', target: 3, reward: [{ kind: 'passXp', amount: 900 }, { kind: 'gems', amount: 10 }] },
  { id: 'w_chaos', scope: 'weekly', text: 'Jouer 5 parties RIFT CHAOS', stat: 'mode_RIFT_CHAOS', target: 5, reward: [{ kind: 'passXp', amount: 900 }, { kind: 'coins', amount: 300 }] },
  { id: 'w_inter', scope: 'weekly', text: 'Intercepter 10 passes', stat: 'interceptions', target: 10, reward: [{ kind: 'passXp', amount: 1000 }, { kind: 'coins', amount: 350 }] },
  // SEASON
  { id: 's_goals200', scope: 'season', text: 'Marquer 200 points', stat: 'goals', target: 200, reward: [{ kind: 'passXp', amount: 4000 }, { kind: 'cosmetic', id: 'title_hunter' }] },
  { id: 's_wins100', scope: 'season', text: 'Gagner 100 parties', stat: 'wins', target: 100, reward: [{ kind: 'passXp', amount: 5000 }, { kind: 'gems', amount: 50 }] },
  { id: 's_survival', scope: 'season', text: 'Jouer 15 parties SURVIVAL', stat: 'mode_SURVIVAL', target: 15, reward: [{ kind: 'passXp', amount: 3000 }, { kind: 'cosmetic', id: 'title_survivor' }] },
  { id: 's_boss', scope: 'season', text: 'Jouer 15 parties RIFT BOSS', stat: 'mode_RIFT_BOSS', target: 15, reward: [{ kind: 'passXp', amount: 3000 }, { kind: 'cosmetic', id: 'title_boss' }] },
  // EVENT
  { id: 'e_volcanic', scope: 'event', eventId: 'volcanic_week', text: 'Jouer 5 matchs pendant Volcanic Week', stat: 'matches', target: 5, reward: [{ kind: 'cosmetic', id: 'emote_lava' }] },
  { id: 'e_chaos', scope: 'event', eventId: 'chaos_week', text: 'Vivre 10 mutations', stat: 'mutations_seen', target: 10, reward: [{ kind: 'cosmetic', id: 'spray_flame' }] },
  { id: 'e_winter', scope: 'event', eventId: 'winter_rift', text: 'Gagner 5 parties pendant Winter Rift', stat: 'wins', target: 5, reward: [{ kind: 'cosmetic', id: 'emote_snow' }] },
  { id: 'e_boss', scope: 'event', eventId: 'boss_invasion', text: 'Jouer 3 parties RIFT BOSS', stat: 'mode_RIFT_BOSS', target: 3, reward: [{ kind: 'cosmetic', id: 'icon_skull' }] },
];

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 3;
