import type { MutationId, RiftMutationData } from './types';

export const MUTATIONS: RiftMutationData[] = [
  { id: 'NORMAL', name: 'NORMAL', tagline: 'Le Rift se calme.', color: '#b388ff', duration: 0, weight: 0, params: {} },
  { id: 'FURY', name: 'FURY', tagline: 'Le Rift devient incontrôlable !', color: '#ff3d3d', duration: 18, weight: 10, params: { speedMul: 2.2, throwMul: 1.35, carrierSpeed: 0.12 } },
  { id: 'CLONE', name: 'CLONE', tagline: 'Le Rift se divise !', color: '#00f5d4', duration: 16, weight: 8, params: { clones: 3, cloneLife: 16 } },
  { id: 'ELECTRIC', name: 'ELECTRIC', tagline: 'Le Rift est surchargé !', color: '#ffe600', duration: 16, weight: 9, params: { radius: 230, damage: 260, interval: 0.8, carrierDamage: 60 } },
  { id: 'GRAVITY', name: 'GRAVITY', tagline: 'La gravité se déforme !', color: '#7b61ff', duration: 15, weight: 8, params: { radius: 700, pull: 120, projectileBend: 900 } },
  { id: 'PORTAL', name: 'PORTAL', tagline: 'Des failles s\'ouvrent !', color: '#4cc9f0', duration: 18, weight: 7, params: { pairs: 2 } },
  { id: 'PHASE', name: 'PHASE', tagline: 'Le Rift traverse les murs !', color: '#e0aaff', duration: 15, weight: 7, params: { carrierPhase: 1 } },
  { id: 'CHAOS', name: 'CHAOS', tagline: 'L\'arène se transforme !', color: '#ff7b00', duration: 16, weight: 6, params: { blocks: 6, hazards: 3 } },
];

export const getMutation = (id: MutationId) => MUTATIONS.find((m) => m.id === id)!;
