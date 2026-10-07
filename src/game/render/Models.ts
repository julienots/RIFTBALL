import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from './Toon';
import { getCharacter } from '../../data/characters';
import { resolvePalette } from '../../cosmetics/CosmeticsService';

/**
 * Procedural stylised 3D characters (chibi proportions, bold shapes, readable silhouettes).
 * Each hero/skin becomes ONE merged vertex-colored geometry (1 draw call + 1 outline call).
 * Model space: body radius ~1, height ~2.9, facing +X.
 */

type Part = THREE.BufferGeometry;
const parts: Part[] = [];

function add(geo: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  paint(g, color);
  parts.push(g);
}

const S = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const C = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const K = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const T = (r: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 8, 20, arc);

function eyes(color: string, y = 2.12, x = 0.66, spread = 0.3, glow = false) {
  if (!glow) {
    add(S(0.22, 12, 10), '#ffffff', [x, y, spread], [0, 0, 0], [0.6, 1.15, 1]);
    add(S(0.22, 12, 10), '#ffffff', [x, y, -spread], [0, 0, 0], [0.6, 1.15, 1]);
  }
  add(S(0.12, 10, 8), glow ? color : color, [x + 0.12, y + 0.02, spread], [0, 0, 0], [0.6, 1.2, 1]);
  add(S(0.12, 10, 8), glow ? color : color, [x + 0.12, y + 0.02, -spread], [0, 0, 0], [0.6, 1.2, 1]);
  if (!glow) {
    add(S(0.045, 6, 6), '#ffffff', [x + 0.2, y + 0.08, spread - 0.03]);
    add(S(0.045, 6, 6), '#ffffff', [x + 0.2, y + 0.08, -spread - 0.03]);
  }
}

function baseBody(p: ReturnType<typeof resolvePalette>, opts: { feet?: boolean; bodyScale?: [number, number, number]; headR?: number; headY?: number } = {}) {
  const bs = opts.bodyScale ?? [0.95, 0.95, 1];
  if (opts.feet !== false) {
    add(S(0.32, 12, 8), p.secondary, [0.12, 0.26, 0.42], [0, 0, 0], [1.3, 0.8, 1]);
    add(S(0.32, 12, 8), p.secondary, [0.12, 0.26, -0.42], [0, 0, 0], [1.3, 0.8, 1]);
  }
  add(S(0.85, 18, 14), p.primary, [0, 1.0, 0], [0, 0, 0], bs);
  add(C(0.8, 0.86, 0.18, 18), p.secondary, [0, 0.82, 0]); // belt
  add(S(0.26, 10, 8), p.skin, [0.3, 1.0, 0.95]);
  add(S(0.26, 10, 8), p.skin, [0.3, 1.0, -0.95]);
  const hr = opts.headR ?? 0.8, hy = opts.headY ?? 2.05;
  add(S(hr, 20, 16), p.skin, [0, hy, 0]);
}

function hat(kind: string | undefined, p: ReturnType<typeof resolvePalette>, top = 2.8) {
  switch (kind) {
    case 'crown':
      add(C(0.5, 0.55, 0.3, 12), '#ffd60a', [0, top, 0]);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(K(0.12, 0.3, 6), '#ffd60a', [Math.cos(a) * 0.45, top + 0.28, Math.sin(a) * 0.45]); }
      add(S(0.09, 8, 6), '#ff006e', [0.5, top, 0]);
      break;
    case 'beanie':
      add(S(0.78, 16, 10, ), p.accent, [0, top - 0.45, 0], [0, 0, 0], [1, 0.75, 1]);
      add(C(0.8, 0.8, 0.18, 16), p.secondary, [0, top - 0.45, 0]);
      add(S(0.2, 10, 8), '#ffffff', [0, top + 0.15, 0]);
      break;
    case 'visor':
      add(B(0.25, 0.22, 1.25), p.accent, [0.72, 2.15, 0]);
      break;
    case 'kasa':
      add(K(1.25, 0.55, 18), '#e9c46a', [0, top - 0.1, 0]);
      break;
    case 'horns':
      add(K(0.15, 0.65, 8), '#f1faee', [0, top - 0.25, 0.45], [0.5, 0, 0]);
      add(K(0.15, 0.65, 8), '#f1faee', [0, top - 0.25, -0.45], [-0.5, 0, 0]);
      break;
    case 'helmet':
      add(S(0.86, 18, 12, ), p.accent, [0, 2.15, 0], [0, 0, 0], [1, 0.85, 1]);
      add(B(0.12, 0.2, 1.3), p.secondary, [0.78, 2.05, 0]);
      break;
    case 'tricorn':
      add(C(0.95, 0.95, 0.1, 3), '#1b1b1b', [0, top - 0.2, 0], [0, Math.PI / 6, 0]);
      add(C(0.5, 0.6, 0.4, 12), '#1b1b1b', [0, top, 0]);
      add(S(0.1, 6, 6), '#ffd60a', [0.55, top - 0.05, 0]);
      break;
    case 'headphones':
      add(T(0.85, 0.08, Math.PI), p.secondary, [0, 2.1, 0], [0, 0, 0]);
      add(C(0.28, 0.28, 0.2, 12), p.accent, [0, 2.0, 0.82], [Math.PI / 2, 0, 0]);
      add(C(0.28, 0.28, 0.2, 12), p.accent, [0, 2.0, -0.82], [Math.PI / 2, 0, 0]);
      break;
    case 'halo':
      add(T(0.55, 0.07), '#fff3b0', [0, top + 0.35, 0], [Math.PI / 2, 0, 0]);
      break;
  }
}

export function buildHeroGeometry(heroId: string, skinId?: string): THREE.BufferGeometry {
  parts.length = 0;
  const def = getCharacter(heroId);
  const p = resolvePalette(heroId, skinId);
  switch (def.model) {
    case 'magnet':
      baseBody(p);
      add(S(0.84, 18, 10, ), p.primary, [0, 2.2, 0], [0, 0, 0], [1, 0.72, 1]);
      add(C(0.86, 0.86, 0.14, 18), p.accent, [0.02, 2.22, 0], [0, 0, 0.12]);
      eyes(p.eyes);
      add(T(0.42, 0.14, Math.PI), '#e63946', [0.75, 1.15, 0.9], [0, Math.PI / 2, Math.PI / 2]);
      add(B(0.22, 0.3, 0.3), '#e9ecef', [0.75, 0.73, 1.32], [0, 0, 0]);
      add(B(0.22, 0.3, 0.3), '#e9ecef', [0.75, 0.73, 0.48], [0, 0, 0]);
      add(C(0.12, 0.12, 0.7, 8), p.accent, [-0.1, 2.95, 0]);
      add(S(0.18, 10, 8), '#e63946', [-0.1, 3.32, 0]);
      break;
    case 'blink':
      baseBody(p, { bodyScale: [0.85, 1, 0.9] });
      add(K(0.92, 1.4, 14), p.secondary, [-0.1, 2.55, 0], [0, 0, 0.2]);
      add(B(0.18, 0.3, 1.25), p.secondary, [0.6, 2.1, 0]);
      eyes(p.eyes, 2.1, 0.7, 0.28, true);
      add(T(0.7, 0.16), p.accent, [0, 1.55, 0], [Math.PI / 2, 0, 0]);
      add(K(0.1, 0.8, 6), '#e9ecef', [0.75, 1.05, 1.0], [0, 0, -Math.PI / 2]);
      add(K(0.1, 0.8, 6), '#e9ecef', [0.75, 1.05, -1.0], [0, 0, -Math.PI / 2]);
      break;
    case 'block':
      add(B(0.5, 0.4, 0.5), p.secondary, [0.1, 0.22, 0.42]);
      add(B(0.5, 0.4, 0.5), p.secondary, [0.1, 0.22, -0.42]);
      add(B(1.6, 1.45, 1.7), p.primary, [0, 1.12, 0]);
      add(B(1.65, 0.22, 1.75), p.secondary, [0, 0.62, 0]);
      add(B(1.4, 1.25, 1.4), p.skin, [0, 2.4, 0]);
      add(B(1.5, 0.35, 1.5), p.accent, [0, 3.15, 0]);
      add(B(0.5, 0.25, 0.5), p.accent, [0.3, 3.4, 0.3]);
      eyes(p.eyes, 2.45, 0.68, 0.32);
      add(B(0.5, 0.5, 0.5), p.skin, [0.5, 1.1, 1.05]);
      add(B(0.5, 0.5, 0.5), p.skin, [0.5, 1.1, -1.05]);
      add(B(0.6, 0.35, 0.7), '#bc4749', [0.95, 1.1, 1.05]);
      break;
    case 'shade':
      add(K(1.15, 2.2, 16), p.secondary, [0, 1.1, 0]);
      add(S(0.78, 18, 14), p.skin, [0, 2.15, 0]);
      add(K(0.85, 1.25, 14), p.primary, [-0.15, 2.65, 0], [0, 0, 0.35]);
      eyes(p.eyes, 2.15, 0.62, 0.3, true);
      add(S(0.2, 8, 6), p.accent, [0.4, 1.2, 1.0]);
      add(S(0.2, 8, 6), p.accent, [0.4, 1.2, -1.0]);
      add(S(0.14, 8, 6), p.accent, [-0.8, 0.5, 0.6]);
      add(S(0.1, 8, 6), p.accent, [-1.0, 0.9, -0.5]);
      break;
    case 'volt':
      baseBody(p);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(K(0.24, 0.9, 6), p.primary, [Math.cos(a) * 0.45 - 0.15, 2.75, Math.sin(a) * 0.45], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7 + 0.3]);
      }
      add(S(0.82, 16, 10), p.primary, [-0.08, 2.3, 0], [0, 0, 0], [1, 0.6, 1]);
      eyes(p.eyes);
      add(B(0.12, 0.6, 0.2), p.accent, [0.82, 1.15, 0.1], [0, 0, 0.5]);
      add(B(0.12, 0.5, 0.2), p.accent, [0.84, 0.8, -0.05], [0, 0, -0.5]);
      add(S(0.22, 10, 8), p.accent, [0.3, 1.0, 1.0]);
      add(S(0.22, 10, 8), p.accent, [0.3, 1.0, -1.0]);
      break;
    case 'flux':
      baseBody(p);
      add(S(0.82, 16, 10), p.secondary, [-0.1, 2.35, 0], [0, 0, 0], [1, 0.55, 1]);
      eyes(p.eyes);
      add(C(0.35, 0.35, 1.0, 12), p.secondary, [-0.85, 1.2, 0]);
      add(S(0.36, 12, 8), p.accent, [-0.85, 1.75, 0]);
      add(S(0.34, 14, 10), p.accent, [0.7, 1.15, 1.15]);
      add(S(0.34, 14, 10), p.accent, [0.7, 1.15, -1.15]);
      add(T(0.5, 0.05), p.accent, [0.7, 1.15, 1.15], [Math.PI / 2, 0, 0]);
      break;
    case 'titan':
      add(B(0.6, 0.5, 0.6), p.secondary, [0.1, 0.25, 0.5]);
      add(B(0.6, 0.5, 0.6), p.secondary, [0.1, 0.25, -0.5]);
      add(B(1.7, 1.6, 2.0), p.primary, [0, 1.25, 0]);
      add(S(0.62, 14, 10), p.secondary, [0, 2.0, 1.05]);
      add(S(0.62, 14, 10), p.secondary, [0, 2.0, -1.05]);
      add(S(0.55, 14, 10), p.skin, [0.35, 1.1, 1.3]);
      add(S(0.55, 14, 10), p.skin, [0.35, 1.1, -1.3]);
      add(S(0.62, 16, 12), p.skin, [0.1, 2.45, 0]);
      add(B(0.7, 0.55, 1.1), p.primary, [0.15, 2.65, 0]);
      add(B(0.2, 0.14, 0.9), p.eyes, [0.52, 2.5, 0]);
      add(K(0.18, 0.55, 6), p.accent, [0, 3.1, 0]);
      break;
    case 'arc':
      baseBody(p);
      add(S(0.82, 16, 10), p.secondary, [-0.15, 2.3, 0], [0, 0, 0], [1, 0.7, 1.02]);
      eyes(p.eyes);
      add(T(0.2, 0.06), p.accent, [0.55, 2.62, 0.25], [0, Math.PI / 2, 0]);
      add(T(0.2, 0.06), p.accent, [0.55, 2.62, -0.25], [0, Math.PI / 2, 0]);
      add(C(0.28, 0.32, 1.6, 12), p.secondary, [-0.55, 1.75, 0.55], [0, 0, -0.75]);
      add(C(0.34, 0.34, 0.15, 12), p.accent, [-0.05, 2.25, 0.55], [0, 0, -0.75]);
      break;
    case 'pulse':
      baseBody(p, { bodyScale: [1, 0.9, 1] });
      eyes(p.eyes);
      add(S(0.81, 16, 10), p.primary, [-0.12, 2.3, 0], [0, 0, 0], [1, 0.62, 1]);
      add(C(0.05, 0.05, 0.75, 6), '#adb5bd', [0, 3.0, 0]);
      add(S(0.18, 10, 8), p.accent, [0, 3.42, 0.1]);
      add(S(0.18, 10, 8), p.accent, [0, 3.42, -0.1]);
      add(K(0.24, 0.3, 8), p.accent, [0, 3.22, 0], [Math.PI, 0, 0]);
      add(B(0.1, 0.4, 0.12), '#e63946', [0.83, 1.05, 0]);
      add(B(0.1, 0.12, 0.4), '#e63946', [0.83, 1.05, 0]);
      break;
    case 'vortex':
      baseBody(p);
      add(K(0.75, 1.3, 12), p.primary, [-0.1, 2.75, 0], [0, 0, 0.5]);
      eyes(p.eyes);
      add(T(1.15, 0.09), p.accent, [0, 1.2, 0], [Math.PI / 2 - 0.25, 0, 0]);
      add(T(1.35, 0.06), p.primary, [0, 1.5, 0], [Math.PI / 2 + 0.3, 0, 0.2]);
      break;
    case 'ember':
      baseBody(p);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(K(0.3, 1.0 + (i % 2) * 0.4, 7), i % 2 ? p.accent : p.primary, [Math.cos(a) * 0.4 - 0.2, 2.8, Math.sin(a) * 0.4], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.4 + 0.4]);
      }
      add(S(0.82, 16, 10), p.primary, [-0.1, 2.3, 0], [0, 0, 0], [1, 0.6, 1]);
      eyes(p.eyes);
      add(S(0.24, 10, 8), p.accent, [0.3, 1.0, 1.0]);
      add(S(0.24, 10, 8), p.accent, [0.3, 1.0, -1.0]);
      break;
    case 'golem':
      add(new THREE.DodecahedronGeometry(1.3, 0), p.primary, [0, 1.35, 0], [0.3, 0.4, 0]);
      add(new THREE.DodecahedronGeometry(0.75, 0), p.skin, [0.2, 2.7, 0], [0.2, 0.1, 0.3]);
      add(new THREE.DodecahedronGeometry(0.62, 0), p.secondary, [0.5, 1.3, 1.45], [0.5, 0, 0]);
      add(new THREE.DodecahedronGeometry(0.62, 0), p.secondary, [0.5, 1.3, -1.45], [0.5, 0, 0]);
      add(new THREE.OctahedronGeometry(0.4, 0), p.accent, [-0.4, 2.6, 0.7], [0, 0, 0.6]);
      add(new THREE.OctahedronGeometry(0.5, 0), p.accent, [-0.6, 2.4, -0.5], [0, 0, -0.5]);
      add(new THREE.OctahedronGeometry(0.35, 0), p.accent, [-0.9, 1.6, 0.2], [0, 0, 0.9]);
      add(S(0.16, 8, 6), p.eyes, [0.88, 2.8, 0.25]);
      add(S(0.16, 8, 6), p.eyes, [0.88, 2.8, -0.25]);
      break;
    case 'minion':
      add(S(1.0, 16, 12), p.primary, [0, 1.0, 0], [0, 0, 0], [1, 0.9, 1]);
      add(K(0.18, 0.55, 6), p.accent, [0, 1.9, 0.45], [0.4, 0, 0]);
      add(K(0.18, 0.55, 6), p.accent, [0, 1.9, -0.45], [-0.4, 0, 0]);
      add(S(0.36, 12, 10), '#ffffff', [0.78, 1.2, 0], [0, 0, 0], [0.6, 1, 1]);
      add(S(0.18, 10, 8), p.eyes, [0.98, 1.2, 0], [0, 0, 0], [0.6, 1, 1]);
      add(S(0.25, 8, 6), p.secondary, [0.1, 0.2, 0.45]);
      add(S(0.25, 8, 6), p.secondary, [0.1, 0.2, -0.45]);
      break;
  }
  hat((p as any).hat, p, def.model === 'block' ? 3.3 : def.model === 'titan' ? 3.0 : 2.85);
  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  parts.length = 0;
  return merged;
}

const heroGeoCache = new Map<string, THREE.BufferGeometry>();
export function heroGeometry(heroId: string, skinId?: string) {
  const key = heroId + '|' + (skinId ?? '');
  let g = heroGeoCache.get(key);
  if (!g) { g = buildHeroGeometry(heroId, skinId); heroGeoCache.set(key, g); }
  return g;
}

/** Outline shader: extrude along normals, back faces, flat dark color. */
export function makeOutlineMaterial(thickness = 0.06, color = '#1a1030') {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
    vertexShader: `uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }`,
    side: THREE.BackSide,
    transparent: false,
  });
}

// ---------------------------------------------------------------- environment decoration

export function decoGeometry(kind: 'tree' | 'rock' | 'crystal' | 'pillar' | 'icepillar' | 'lavarock' | 'beacon' | 'palm' | 'ruin', accent: string, base: string): THREE.BufferGeometry {
  parts.length = 0;
  switch (kind) {
    case 'tree':
      add(C(0.18, 0.25, 0.9, 8), '#8d5b3a', [0, 0.45, 0]);
      add(K(0.9, 1.3, 9), base, [0, 1.3, 0]);
      add(K(0.7, 1.0, 9), accent, [0, 1.95, 0]);
      break;
    case 'palm':
      add(C(0.14, 0.2, 1.6, 7), '#a47148', [0, 0.8, 0], [0, 0, 0.1]);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(B(1.1, 0.06, 0.32), base, [Math.cos(a) * 0.45 + 0.08, 1.6, Math.sin(a) * 0.45], [0, -a, -0.45]); }
      break;
    case 'rock':
      add(new THREE.DodecahedronGeometry(0.6, 0), base, [0, 0.35, 0], [0.4, 0.7, 0.2], [1.2, 0.8, 1]);
      add(new THREE.DodecahedronGeometry(0.35, 0), accent, [0.55, 0.2, 0.3], [0.1, 0.2, 0.5]);
      break;
    case 'crystal':
      add(new THREE.OctahedronGeometry(0.4, 0), accent, [0, 0.6, 0], [0, 0, 0], [0.7, 1.7, 0.7]);
      add(new THREE.OctahedronGeometry(0.25, 0), accent, [0.35, 0.35, 0.15], [0, 0, 0.5], [0.7, 1.5, 0.7]);
      add(new THREE.DodecahedronGeometry(0.3, 0), base, [0, 0.1, 0]);
      break;
    case 'pillar':
      add(C(0.35, 0.4, 1.8, 8), base, [0, 0.9, 0]);
      add(B(0.95, 0.25, 0.95), accent, [0, 1.9, 0]);
      add(B(0.95, 0.2, 0.95), accent, [0, 0.1, 0]);
      break;
    case 'icepillar':
      add(new THREE.OctahedronGeometry(0.5, 0), accent, [0, 0.9, 0], [0, 0.4, 0], [0.8, 2.2, 0.8]);
      add(new THREE.OctahedronGeometry(0.3, 0), base, [0.45, 0.4, 0.2], [0, 0, 0.4], [0.8, 1.6, 0.8]);
      break;
    case 'lavarock':
      add(new THREE.DodecahedronGeometry(0.6, 0), '#2b1d1d', [0, 0.35, 0], [0.3, 0.5, 0], [1.1, 0.9, 1]);
      add(new THREE.OctahedronGeometry(0.22, 0), accent, [0.2, 0.75, 0.1]);
      break;
    case 'beacon':
      add(C(0.12, 0.3, 1.8, 6), base, [0, 0.9, 0]);
      add(S(0.28, 10, 8), accent, [0, 1.95, 0]);
      add(T(0.45, 0.04), accent, [0, 1.95, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'ruin':
      add(B(0.9, 1.4, 0.9), base, [0, 0.7, 0]);
      add(B(1.1, 0.25, 1.1), accent, [0, 1.5, 0], [0, 0, 0.12]);
      add(S(0.35, 8, 6), '#2d6a4f', [0.4, 1.6, 0.3]);
      break;
  }
  const merged = mergeGeometries(parts, false)!;
  parts.length = 0;
  return merged;
}
