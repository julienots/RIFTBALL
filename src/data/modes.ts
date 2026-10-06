import type { ModeData, ModeId } from './types';

export const MODES: ModeData[] = [
  { id: 'RIFTBALL', name: 'RIFTBALL', description: '3 contre 3. Capturez le Rift et amenez-le dans le portail adverse.', teamSize: 3, duration: 180, mutationInterval: 42, firstMutationAt: 35, riftSpeedMul: 1, ranked: true, suddenDeath: true, respawnTime: 3.5, icon: '⚡', color: '#7b61ff', unlockLevel: 1 },
  { id: 'RIFT_RUSH', name: 'RIFT RUSH', description: 'Match express de 2 minutes. Rift plus rapide, réapparition éclair.', teamSize: 3, duration: 120, mutationInterval: 35, firstMutationAt: 25, riftSpeedMul: 1.35, ranked: true, suddenDeath: true, respawnTime: 2, icon: '⏱️', color: '#ff9f1c', unlockLevel: 2 },
  { id: 'RIFT_CHAOS', name: 'RIFT CHAOS', description: 'Mutations en continu. Tout peut arriver.', teamSize: 3, duration: 180, mutationInterval: 17, firstMutationAt: 10, riftSpeedMul: 1.1, ranked: true, suddenDeath: true, respawnTime: 3, icon: '🌀', color: '#ff3d7f', unlockLevel: 3 },
  { id: 'RIFT_DUEL', name: 'RIFT DUEL', description: '1 contre 1. Aucun allié, aucune excuse.', teamSize: 1, duration: 120, mutationInterval: 40, firstMutationAt: 30, riftSpeedMul: 1, ranked: true, suddenDeath: true, respawnTime: 2.5, icon: '⚔️', color: '#00bbf9', unlockLevel: 4 },
  { id: 'RIFT_BOSS', name: 'RIFT BOSS', description: '3 joueurs contre le Colosse. Livrez-lui le Rift pour briser son armure.', teamSize: 3, duration: 180, mutationInterval: 45, firstMutationAt: 40, riftSpeedMul: 1, ranked: false, suddenDeath: false, respawnTime: 5, icon: '👹', color: '#9d4edd', unlockLevel: 5 },
  { id: 'SURVIVAL', name: 'SURVIVAL', description: 'Survivez à 8 vagues de créatures du Rift.', teamSize: 3, duration: 300, mutationInterval: 50, firstMutationAt: 45, riftSpeedMul: 1, ranked: false, suddenDeath: false, respawnTime: 8, icon: '🛡️', color: '#06d6a0', unlockLevel: 6 },
  { id: 'TUTORIAL', name: 'TUTORIEL', description: 'Apprenez les bases.', teamSize: 1, duration: 600, mutationInterval: 0, firstMutationAt: 0, riftSpeedMul: 0.8, ranked: false, suddenDeath: false, respawnTime: 2, icon: '🎓', color: '#80ed99', unlockLevel: 0 },
];

export const getMode = (id: ModeId) => MODES.find((m) => m.id === id)!;
