import type { AbilityData } from './types';
import { CHARACTERS } from './characters';

/** Flat registry of every ability/ultimate (AbilityData). Tuning lives on each character entry. */
export const ABILITIES: AbilityData[] = CHARACTERS.flatMap((c) => [c.ability, c.ultimate]);
export const getAbility = (id: string) => ABILITIES.find((a) => a.id === id);
