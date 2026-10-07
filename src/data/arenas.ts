import type { ArenaData } from './types';

/** Authored layout size (world units). Each arena is scaled by `scale` (default ARENA_SCALE) at runtime. */
export const ARENA_W = 2400;
export const ARENA_H = 1300;
export const ARENA_SCALE = 1.3;
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
    bushes: [[560, 20, 220, 150], [560, 1130, 220, 150], [930, 300, 150, 140], [930, 860, 150, 140]],
    crates: [[640, 420, 70, 70], [640, 810, 70, 70], [1000, 620, 60, 60]],
    shrines: [[600, 650]],
    hazards: [],
    special: 'none', music: 'battle',
  },
  {
    id: 'volcanic_core', name: 'VOLCANIC CORE', description: 'Des rivières de lave s\'activent par cycles. Regardez où vous marchez.',
    theme: { floorA: '#4a3b3b', floorB: '#3e3030', wallTop: '#6b4f4f', wallSide: '#3a2626', border: '#2b1d1d', fog: '#ff7b39', light: '#ffb380', ambient: 0.6, accent: '#ff5400' },
    walls: [...guards, [460, 200, 110, 200], [460, 900, 110, 200], [900, 300, 160, 90], [900, 910, 160, 90]],
    centerWalls: [[1150, 250, 100, 110], [1150, 940, 100, 110]],
    bushes: [],
    crates: [[620, 300, 70, 70], [620, 930, 70, 70]],
    shrines: [[980, 650]],
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
    centerWalls: [[1100, 300, 200, 70], [1100, 930, 200, 70]],
    bushes: [],
    crates: [[560, 120, 70, 70], [560, 1110, 70, 70], [960, 640, 60, 60]],
    shrines: [[620, 650]],
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
    crates: [[700, 380, 70, 70], [700, 850, 70, 70]],
    shrines: [[300, 140], [300, 1160]],
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
    centerWalls: [],
    bushes: [[300, 20, 260, 180], [300, 1100, 260, 180], [560, 540, 200, 220], [820, 20, 280, 170], [820, 1110, 280, 170], [1020, 380, 160, 160], [1020, 760, 160, 160]],
    crates: [[620, 300, 70, 70], [620, 930, 70, 70], [900, 640, 60, 60]],
    shrines: [[1050, 650]],
    hazards: [],
    special: 'jungle', music: 'battle_jungle',
  },
  {
    id: 'crystal_canyon', name: 'CRYSTAL CANYON', isNew: true, description: 'Un canyon de cristaux destructibles. Cassez les caisses pour trouver des bonus, utilisez les tremplins pour surprendre.',
    theme: { floorA: '#e9a96b', floorB: '#dd9a5c', wallTop: '#c77dff', wallSide: '#7b2cbf', border: '#8c4f2a', fog: '#ffd6a5', light: '#fff1d6', ambient: 0.78, accent: '#e0aaff' },
    walls: [...guards, [460, 260, 100, 120], [460, 920, 100, 120], [880, 420, 110, 90], [880, 790, 110, 90]],
    centerWalls: [[1160, 120, 80, 140], [1160, 1040, 80, 140]],
    bushes: [[300, 560, 160, 180]],
    crates: [[640, 140, 70, 70], [640, 1090, 70, 70], [700, 600, 70, 70], [1020, 560, 70, 70], [1020, 680, 70, 70], [820, 1000, 70, 70], [820, 230, 70, 70]],
    shrines: [[960, 650], [380, 200]],
    hazards: [
      { kind: 'jump', rect: [300, 1060, 110, 110], pair: 11, mirror: false },
      { kind: 'jump', rect: [1990, 130, 110, 110], pair: 11, mirror: false },
      { kind: 'jump', rect: [300, 130, 110, 110], pair: 12, mirror: false },
      { kind: 'jump', rect: [1990, 1060, 110, 110], pair: 12, mirror: false },
    ],
    special: 'canyon', music: 'battle_jungle',
  },
  {
    id: 'sky_temple', name: 'SKY TEMPLE', isNew: true, description: 'Un temple flottant battu par le vent. Couloirs d\'accélération et tremplins vers le centre.',
    theme: { floorA: '#f1f5f9', floorB: '#e2e8f0', wallTop: '#ffd166', wallSide: '#c9a227', border: '#7dd3fc', fog: '#bae6fd', light: '#ffffff', ambient: 0.9, accent: '#38bdf8' },
    scale: 1.45,
    walls: [...guards, [420, 300, 90, 90], [420, 910, 90, 90], [760, 200, 90, 90], [760, 1010, 90, 90], [940, 600, 90, 100]],
    centerWalls: [[1150, 200, 100, 100], [1150, 1000, 100, 100]],
    bushes: [[560, 560, 140, 180]],
    crates: [[620, 380, 60, 60], [620, 860, 60, 60]],
    shrines: [[1050, 380], [1050, 920]],
    hazards: [
      { kind: 'boost', rect: [300, 600, 500, 100], mirror: true },
      { kind: 'jump', rect: [560, 140, 100, 100], pair: 21, mirror: false },
      { kind: 'jump', rect: [1140, 820, 120, 100], pair: 21, mirror: false },
      { kind: 'jump', rect: [1740, 1060, 100, 100], pair: 22, mirror: false },
      { kind: 'jump', rect: [1140, 380, 120, 100], pair: 22, mirror: false },
    ],
    special: 'sky', music: 'battle_cold',
  },
  {
    id: 'neon_docks', name: 'NEON DOCKS', isNew: true, description: 'Des docks futuristes de nuit : conteneurs destructibles, couloirs serrés et téléporteurs.',
    theme: { floorA: '#1f2937', floorB: '#1a2230', wallTop: '#22d3ee', wallSide: '#0e7490', border: '#0b1220', fog: '#0b1220', light: '#c7d2fe', ambient: 0.6, accent: '#f472b6', bush: '#14532d' },
    walls: [...guards, [400, 160, 220, 80], [400, 1060, 220, 80], [760, 380, 80, 200], [760, 720, 80, 200]],
    centerWalls: [[1120, 120, 160, 90], [1120, 1090, 160, 90]],
    bushes: [[300, 560, 140, 180], [960, 160, 160, 120], [960, 1020, 160, 120]],
    crates: [[560, 420, 80, 80], [560, 800, 80, 80], [960, 520, 70, 70], [960, 710, 70, 70], [680, 620, 60, 60]],
    shrines: [[1060, 650]],
    hazards: [{ kind: 'teleport', rect: [180, 60, 100, 100], pair: 31, mirror: true }, { kind: 'teleport', rect: [180, 1140, 100, 100], pair: 32, mirror: true }],
    special: 'docks', music: 'battle_void',
  },
];

export const getArena = (id: string) => ARENAS.find((a) => a.id === id) ?? ARENAS[0];
