import { currentSeason } from '../data/seasons';
import { Clock } from '../core/Time';
import type { MusicTrack } from './AudioEngine';

/** Lobby theme of the current season. */
export const menuMusic = (): MusicTrack => (['menu_s1', 'menu_s2', 'menu_s3', 'menu_s4'] as MusicTrack[])[(currentSeason(Clock.now()).number - 1) % 4];

/** Match music: mode themes first, else the arena's. */
export const matchMusic = (mode: string, arenaMusic: MusicTrack): MusicTrack => mode === 'RIFT_BOSS' ? 'boss' : mode === 'RIFT_KING' ? 'king' : mode === 'FIFIX' ? 'fifix' : arenaMusic;
