import { currentSeason } from '../data/seasons';
import { Clock } from '../core/Time';
import type { MusicTrack } from './AudioEngine';

/** Lobby theme of the current season. */
const SEASON_MUSIC: Record<string, MusicTrack> = { s1: 'menu_s1', s2: 'fiesta', s3: 'menu_s2', s4: 'menu_s3', s5: 'menu_s4' };
export const menuMusic = (): MusicTrack => SEASON_MUSIC[currentSeason(Clock.now()).id] ?? 'menu_s1';

/** Match music: mode themes first, else the arena's. */
export const matchMusic = (mode: string, arenaMusic: MusicTrack): MusicTrack => mode === 'RIFT_BOSS' ? 'boss' : mode === 'RIFT_KING' ? 'king' : mode === 'FIFIX' ? 'fifix' : arenaMusic;
