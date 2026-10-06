import type { ArenaData } from './types';

/** World size shared by all arenas (world units). */
export const ARENA_W = 2400;
export const ARENA_H = 1300;
export const PORTAL = { depth: 110, height: 300 };

const guards: [number, number, number, number][] = [
  [130, 380, 90, 80],
  [130, 840, 90, 80],
];

export const ARENAS: ArenaData[] = [
  {
    id: 'rift_valley', name: 'RIFT VALLEY', description: 'La vallée originelle. Équilibrée, lisible, parfaite pour apprendre.',
    theme: { floorA: '#7ccf5a', floorB: '#6bbd4c', wallTop: '#e8c27a', wallSide: '#b38446', border: '#5a8f3a', fog: '#9fe0ff', light: '#fff4dc', ambient: 0.75, accent: '#ffd166', bush: '#2f8f3a' },
    walls: [...guards, [420, 170, 100, 230], [420, 900, 100, 230], [760, 560, 90, 180], [860, 110, 230, 90], [860, 1100, 230, 90]],
    centerWalls: [[1140, 250, 120, 120], [1140, 930, 120, 120]],
    bushes: [[560, 20, 220, 150], [560, 1130, 220, 150], [960, 520, 150, 260]],
    hazards: [],
    special: 'none', music: 'battle',
  },
  {
    id: 'volcanic_core', name: 'VOLCANIC CORE', description: 'Des rivières de lave s\'activent par cycles. Regardez où vous marchez.',
    theme: { floorA: '#4a3b3b', floorB: '#3e3030', wallTop: '#6b4f4f', wallSide: '#3a2626', border: '#2b1d1d', fog: '#ff7b39', light: '#ffb380', ambient: 0.6, accent: '#ff5400' },
    walls: [...guards, [460, 200, 110, 200], [460, 900, 110, 200], [900, 300, 160, 90], [900, 910, 160, 90]],
    centerWalls: [[1150, 580, 100, 140]],
    bushes: [],
    hazards: [
      { kind: 'lava', rect: [700, 560, 180, 180], mirror: true },
      { kind: 'lava', rect: [1080, 60, 240, 130] },
      { kind: 'lava', rect: [1080, 1110, 240, 130] },
    ],
    special: 'lava_cycle', music: 'battle_hot',
  },
  {
    id: 'frozen_lab', name: 'FROZEN LAB', description: 'Un laboratoire gelé. La glace fait glisser tout le monde... et le Rift.',
    theme: { floorA: '#dff3ff', floorB: '#cbe9fb', wallTop: '#a9c6e8', wallSide: '#6d8fbf', border: '#4f6fa0', fog: '#e6f7ff', light: '#e0f4ff', ambient: 0.85, accent: '#66d9ff' },
    walls: [...guards, [400, 260, 90, 160], [400, 880, 90, 160], [780, 140, 90, 260], [780, 900, 90, 260]],
    centerWalls: [[1100, 600, 200, 100]],
    bushes: [],
    hazards: [
      { kind: 'ice', rect: [560, 420, 480, 460], mirror: true },
      { kind: 'ice', rect: [1050, 120, 300, 300] },
      { kind: 'ice', rect: [1050, 880, 300, 300] },
    ],
    special: 'ice', music: 'battle_cold',
  },
  {
    id: 'void_station', name: 'VOID STATION', description: 'Une station spatiale instable. Les téléporteurs relient les côtés de l\'arène.',
    theme: { floorA: '#2b2d5c', floorB: '#24264f', wallTop: '#5c5fb3', wallSide: '#2e2f73', border: '#151633', fog: '#120e2e', light: '#b8b5ff', ambient: 0.55, accent: '#9d4edd' },
    walls: [...guards, [440, 180, 90, 250], [440, 870, 90, 250], [800, 580, 120, 140], [920, 130, 120, 120], [920, 1050, 120, 120]],
    centerWalls: [[1170, 300, 60, 200], [1170, 800, 60, 200]],
    bushes: [],
    hazards: [
      { kind: 'teleport', rect: [600, 120, 110, 110], pair: 1, mirror: true },
      { kind: 'teleport', rect: [600, 1070, 110, 110], pair: 2, mirror: true },
      { kind: 'boost', rect: [1000, 590, 400, 120] },
    ],
    special: 'void_portals', music: 'battle_void',
  },
  {
    id: 'jungle_ruins', name: 'JUNGLE RUINS', description: 'Ruines envahies par la végétation. Les buissons cachent tout... même le porteur.',
    theme: { floorA: '#8a9a5b', floorB: '#7a8a4e', wallTop: '#a39171', wallSide: '#6e5f45', border: '#3d4a26', fog: '#c3f0a0', light: '#fff2c4', ambient: 0.72, accent: '#80ed99', bush: '#1f6f2b' },
    walls: [...guards, [430, 230, 100, 100], [430, 970, 100, 100], [700, 420, 100, 100], [700, 780, 100, 100], [980, 220, 140, 80], [980, 1000, 140, 80]],
    centerWalls: [[1150, 600, 100, 100]],
    bushes: [[300, 20, 260, 180], [300, 1100, 260, 180], [560, 540, 200, 220], [820, 20, 280, 170], [820, 1110, 280, 170], [1020, 380, 160, 160], [1020, 760, 160, 160]],
    hazards: [],
    special: 'jungle', music: 'battle_jungle',
  },
];

export const getArena = (id: string) => ARENAS.find((a) => a.id === id) ?? ARENAS[0];
