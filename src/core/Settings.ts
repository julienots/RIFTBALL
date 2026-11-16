export type Quality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface QualityProfile {
  maxParticles: number;
  particleMul: number;
  shadows: boolean;
  glow: boolean;
  resolutionScale: number; // multiplier on devicePixelRatio (capped)
  maxDpr: number;
  postFx: boolean; // vignette, screen flashes, chromatic distortion on mutations
  trailLength: number;
  /** v1.5 cinematic pipeline: 0 = direct render, 1 = HDR + bloom + colour grade, 2 = + depth of field, light shafts, fringe */
  post: 0 | 1 | 2;
  /** MSAA samples of the HDR scene target */
  msaa: number;
  shadowSize: number;
  grass: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  LOW: { maxParticles: 260, particleMul: 0.35, shadows: false, glow: false, resolutionScale: 0.7, maxDpr: 1, postFx: false, trailLength: 6, post: 0, msaa: 0, shadowSize: 0, grass: 0 },
  MEDIUM: { maxParticles: 700, particleMul: 0.7, shadows: true, glow: true, resolutionScale: 0.85, maxDpr: 1.5, postFx: true, trailLength: 12, post: 1, msaa: 2, shadowSize: 1024, grass: 3600 },
  HIGH: { maxParticles: 1500, particleMul: 1, shadows: true, glow: true, resolutionScale: 1, maxDpr: 2, postFx: true, trailLength: 18, post: 2, msaa: 4, shadowSize: 2048, grass: 7000 },
  ULTRA: { maxParticles: 2200, particleMul: 1.25, shadows: true, glow: true, resolutionScale: 1, maxDpr: 3, postFx: true, trailLength: 22, post: 2, msaa: 4, shadowSize: 4096, grass: 11000 },
};

export interface GameSettings {
  quality: Quality;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  showFps: boolean;
  /** lower the quality automatically when the device can't keep up */
  autoQuality: boolean;
  language: 'fr' | 'en';
  leftHanded: boolean;
  botDifficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
  /** custom online server (empty = build default) */
  serverUrl: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'MEDIUM',
  musicVolume: 0.6,
  sfxVolume: 0.8,
  haptics: true,
  showFps: false,
  autoQuality: true,
  language: 'fr',
  leftHanded: false,
  botDifficulty: 'NORMAL',
  serverUrl: '',
};
