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
  { id: 'e_mythic', scope: 'event', eventId: 'mythic_trial', text: 'Jouer 3 matchs avec un héros Mythique', stat: 'mythic_matches', target: 3, reward: [{ kind: 'gems', amount: 10 }, { kind: 'coins', amount: 300 }] },
  { id: 'e_ult', scope: 'event', eventId: 'ult_storm', text: 'Lancer 10 ultimes', stat: 'ults', target: 10, reward: [{ kind: 'gems', amount: 5 }, { kind: 'coins', amount: 250 }] },
  { id: 'e_turbo', scope: 'event', eventId: 'turbo_weekend', text: 'Marquer 8 points', stat: 'goals', target: 8, reward: [{ kind: 'coins', amount: 400 }] },
  { id: 'e_bonus', scope: 'event', eventId: 'bonus_festival', text: 'Gagner 3 parties', stat: 'wins', target: 3, reward: [{ kind: 'gems', amount: 5 }, { kind: 'crate', id: 'crate_small', count: 1 }] },
  { id: 'e_glass', scope: 'event', eventId: 'glass_cannon', text: 'Éliminer 15 adversaires', stat: 'kills', target: 15, reward: [{ kind: 'gems', amount: 8 }] },
  { id: 'e_king', scope: 'event', eventId: 'king_festival', text: 'Régner 120 secondes en tant que Roi', stat: 'king_points', target: 120, reward: [{ kind: 'gems', amount: 10 }, { kind: 'cosmetic', id: 'emote_crown' }] },
  { id: 'e_fifix1', scope: 'event', eventId: 'fifix_event', text: 'Jouer 3 parties FIFIX', stat: 'mode_FIFIX', target: 3, reward: [{ kind: 'cosmetic', id: 'fx_fifi' }] },
  { id: 'e_fifix2', scope: 'event', eventId: 'fifix_event', text: 'Jouer 8 parties FIFIX', stat: 'mode_FIFIX', target: 8, reward: [{ kind: 'cosmetic', id: 'pet_fifi' }, { kind: 'gems', amount: 15 }] },
  { id: 'e_fifix3', scope: 'event', eventId: 'fifix_event', text: 'Gagner 10 parties pendant FIFIX', stat: 'wins', target: 10, reward: [{ kind: 'cosmetic', id: 'zip_fifi' }] },
  { id: 'e_halloween', scope: 'event', eventId: 'halloween_rift', text: 'Jouer 10 matchs pendant la Nuit du Rift', stat: 'matches', target: 10, reward: [{ kind: 'cosmetic', id: 'emote_pumpkin' }, { kind: 'cosmetic', id: 'pet_ghost' }, { kind: 'gems', amount: 15 }] },
  { id: 'e_halloween3', scope: 'event', eventId: 'halloween_rift', text: 'Éliminer 30 adversaires pendant la Nuit du Rift', stat: 'kills', target: 30, reward: [{ kind: 'cosmetic', id: 'luna_witch' }, { kind: 'cosmetic', id: 'pet_bat' }] },
  { id: 'e_halloween4', scope: 'event', eventId: 'halloween_rift', text: 'Gagner 5 parties pendant la Nuit du Rift', stat: 'wins', target: 5, reward: [{ kind: 'cosmetic', id: 'shade_pumpkin' }, { kind: 'cosmetic', id: 'fx_pumpkin' }] },
  { id: 'e_halloween2', scope: 'event', eventId: 'halloween_rift', text: 'Vaincre le Colosse pendant la Nuit du Rift', stat: 'boss_wins', target: 1, reward: [{ kind: 'cosmetic', id: 'spray_pumpkin' }] },
  { id: 'e_newyear', scope: 'event', eventId: 'new_year', text: 'Gagner 5 parties pendant le Nouvel An', stat: 'wins', target: 5, reward: [{ kind: 'cosmetic', id: 'emote_fireworks' }, { kind: 'gems', amount: 20 }] },

  // GEM CHALLENGES (DÉFIS) — permanent, harder goals rewarded with gems (earned, never bought)
  { id: 'c_boss1', scope: 'challenge', tier: 1, text: 'Vaincre le Colosse une première fois', stat: 'boss_wins', target: 1, reward: [{ kind: 'gems', amount: 10 }] },
  { id: 'c_boss5', scope: 'challenge', tier: 3, text: 'Vaincre le Colosse 5 fois', stat: 'boss_wins', target: 5, reward: [{ kind: 'gems', amount: 30 }] },
  { id: 'c_bosstop', scope: 'challenge', tier: 2, text: 'Finir n°1 des dégâts au Colosse 3 fois', stat: 'boss_top', target: 3, reward: [{ kind: 'gems', amount: 20 }] },
  { id: 'c_bossdmg', scope: 'challenge', tier: 3, text: 'Infliger 250 000 dégâts au Colosse', stat: 'boss_damage', target: 250000, reward: [{ kind: 'gems', amount: 40 }] },
  { id: 'c_king3', scope: 'challenge', tier: 2, text: 'Gagner 3 parties ROI DU RIFT', stat: 'king_wins', target: 3, reward: [{ kind: 'gems', amount: 15 }] },
  { id: 'c_kingpts', scope: 'challenge', tier: 2, text: 'Régner 300 secondes en tant que Roi', stat: 'king_points', target: 300, reward: [{ kind: 'gems', amount: 25 }] },
  { id: 'c_waves', scope: 'challenge', tier: 2, text: 'Survivre à 40 vagues en SURVIVAL', stat: 'survival_waves', target: 40, reward: [{ kind: 'gems', amount: 25 }] },
  { id: 'c_mythic10', scope: 'challenge', tier: 1, text: 'Jouer 10 matchs avec un héros Mythique', stat: 'mythic_matches', target: 10, reward: [{ kind: 'gems', amount: 20 }] },
  { id: 'c_mythicw', scope: 'challenge', tier: 3, text: 'Gagner 15 matchs avec un héros Mythique', stat: 'mythic_wins', target: 15, reward: [{ kind: 'gems', amount: 40 }] },
  { id: 'c_streak5', scope: 'challenge', tier: 3, text: 'Gagner 5 parties d\'affilée', stat: 'win_streak', target: 5, reward: [{ kind: 'gems', amount: 30 }] },
  { id: 'c_perfect', scope: 'challenge', tier: 2, text: 'Gagner 5 parties sans mourir une seule fois', stat: 'perfect_wins', target: 5, reward: [{ kind: 'gems', amount: 25 }] },
  { id: 'c_mvp10', scope: 'challenge', tier: 2, text: 'Être MVP 10 fois', stat: 'mvps', target: 10, reward: [{ kind: 'gems', amount: 20 }] },
  { id: 'c_gadget', scope: 'challenge', tier: 1, text: 'Utiliser 100 pouvoirs uniques', stat: 'gadgets', target: 100, reward: [{ kind: 'gems', amount: 15 }] },
  { id: 'c_goals', scope: 'challenge', tier: 1, text: 'Marquer 100 points', stat: 'goals', target: 100, reward: [{ kind: 'gems', amount: 20 }] },
  { id: 'c_kills', scope: 'challenge', tier: 2, text: 'Éliminer 250 adversaires', stat: 'kills', target: 250, reward: [{ kind: 'gems', amount: 30 }] },
  { id: 'c_inter', scope: 'challenge', tier: 2, text: 'Intercepter 50 passes', stat: 'interceptions', target: 50, reward: [{ kind: 'gems', amount: 25 }] },
  { id: 'c_heal', scope: 'challenge', tier: 2, text: 'Soigner 200 000 PV', stat: 'heal', target: 200000, reward: [{ kind: 'gems', amount: 30 }] },
  { id: 'c_wins50', scope: 'challenge', tier: 4, text: 'Gagner 50 parties', stat: 'wins', target: 50, reward: [{ kind: 'gems', amount: 50 }] },
  { id: 'c_dmg', scope: 'challenge', tier: 4, text: 'Infliger 1 000 000 de dégâts', stat: 'damage', target: 1000000, reward: [{ kind: 'gems', amount: 50 }] },
  { id: 'c_legend', scope: 'challenge', tier: 4, text: 'Jouer 300 matchs', stat: 'matches', target: 300, reward: [{ kind: 'gems', amount: 100 }] },
  // WEEKLY GEM CHALLENGES — all active, renewed every Monday
  { id: 'cw_boss', scope: 'challenge_weekly', tier: 2, text: 'Vaincre le Colosse 2 fois', stat: 'boss_wins', target: 2, reward: [{ kind: 'gems', amount: 15 }] },
  { id: 'cw_king', scope: 'challenge_weekly', tier: 2, text: 'Gagner 2 parties ROI DU RIFT', stat: 'king_wins', target: 2, reward: [{ kind: 'gems', amount: 10 }] },
  { id: 'cw_wins', scope: 'challenge_weekly', tier: 3, text: 'Gagner 15 parties', stat: 'wins', target: 15, reward: [{ kind: 'gems', amount: 15 }] },
  { id: 'cw_mvp', scope: 'challenge_weekly', tier: 2, text: 'Être MVP 3 fois', stat: 'mvps', target: 3, reward: [{ kind: 'gems', amount: 10 }] },
  { id: 'cw_gadget', scope: 'challenge_weekly', tier: 1, text: 'Utiliser 25 pouvoirs uniques', stat: 'gadgets', target: 25, reward: [{ kind: 'gems', amount: 5 }] },
];

/** Stats whose challenge progress is a best value (not a sum). */
export const MAX_STATS = new Set(['win_streak']);

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 3;
