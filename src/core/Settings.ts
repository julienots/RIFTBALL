export type Quality = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QualityProfile {
  maxParticles: number;
  particleMul: number;
  shadows: boolean;
  glow: boolean;
  resolutionScale: number; // multiplier on devicePixelRatio (capped)
  maxDpr: number;
  postFx: boolean; // vignette, screen flashes, chromatic distortion on mutations
  trailLength: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  LOW: { maxParticles: 260, particleMul: 0.35, shadows: false, glow: false, resolutionScale: 0.7, maxDpr: 1, postFx: false, trailLength: 6 },
  MEDIUM: { maxParticles: 700, particleMul: 0.7, shadows: true, glow: true, resolutionScale: 0.85, maxDpr: 1.5, postFx: true, trailLength: 12 },
  HIGH: { maxParticles: 1500, particleMul: 1, shadows: true, glow: true, resolutionScale: 1, maxDpr: 2, postFx: true, trailLength: 18 },
};

export interface GameSettings {
  quality: Quality;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  showFps: boolean;
  language: 'fr' | 'en';
  leftHanded: boolean;
  botDifficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'MEDIUM',
  musicVolume: 0.6,
  sfxVolume: 0.8,
  haptics: true,
  showFps: false,
  language: 'fr',
  leftHanded: false,
  botDifficulty: 'NORMAL',
};
