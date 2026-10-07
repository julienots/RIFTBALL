import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { paint, toonGradient } from './Toon';
import { getCharacter } from '../../data/characters';
import { resolvePalette } from '../../cosmetics/CosmeticsService';

/**
 * Procedural stylised 3D heroes (chibi proportions, expressive faces, signature props).
 * Each hero/skin is ONE merged geometry (1 draw call + 1 outline) carrying per-vertex:
 *   color · part (0 body, 1 leg L, 2 leg R, 3 arm L, 4 arm R, 5 head, 6 floating) · pivot · glow.
 * Limbs are animated in the vertex shader (walk cycle, attack swing, cast pose) — skinning without bones.
 * Model space: facing +X, up +Y, character ~3 units tall.
 */

export const PART = { BODY: 0, LEG_L: 1, LEG_R: 2, ARM_L: 3, ARM_R: 4, HEAD: 5, FLOAT: 6 } as const;
const PIVOTS: Record<number, [number, number, number]> = {
  0: [0, 0, 0], 1: [0, 0.78, 0.27], 2: [0, 0.78, -0.27], 3: [0, 1.38, 0.66], 4: [0, 1.38, -0.66], 5: [0, 1.42, 0], 6: [0, 0, 0],
};

type V3 = [number, number, number];
const parts: THREE.BufferGeometry[] = [];
let curPart = 0;
let pivotOverride: V3 | null = null;

function add(geo: THREE.BufferGeometry, color: string, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], glow = 0, part = curPart) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();
  g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  paint(g, color);
  const n = g.attributes.position.count;
  const pv = pivotOverride ?? PIVOTS[part];
  const pa = new Float32Array(n), pi = new Float32Array(n * 3), gl = new Float32Array(n);
  for (let i = 0; i < n; i++) { pa[i] = part; pi[i * 3] = pv[0]; pi[i * 3 + 1] = pv[1]; pi[i * 3 + 2] = pv[2]; gl[i] = glow; }
  g.setAttribute('part', new THREE.BufferAttribute(pa, 1));
  g.setAttribute('pivot', new THREE.BufferAttribute(pi, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
  parts.push(g);
}
const on = (p: number, fn: () => void, pivot: V3 | null = null) => { const prev = curPart, pp = pivotOverride; curPart = p; pivotOverride = pivot; fn(); curPart = prev; pivotOverride = pp; };

const S = (r: number, w = 18, h = 14, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, w, h, ps, pl, ts, tl);
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const RB = (x: number, y: number, z: number, r = 0.08) => new RoundedBoxGeometry(x, y, z, 2, Math.min(r, x / 2.1, y / 2.1, z / 2.1));
const C = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const K = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const T = (r: number, t: number, arc = Math.PI * 2, rs = 10, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts, arc);
const CAP = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);
const lathe = (pts: [number, number][], seg = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

type Pal = ReturnType<typeof resolvePalette>;
const darken = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const lighten = (hex: string, k: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();

// ---------------------------------------------------------------- shared anatomy

interface BodyOpts { shoe?: string; pants?: string; glove?: string; torso?: string; torsoScale?: V3; noLegs?: boolean; noArms?: boolean; headR?: number; headY?: number; skin?: string; sleeve?: string; belt?: string | null }

function body(p: Pal, o: BodyOpts = {}) {
  const shoe = o.shoe ?? darken(p.secondary, 0.8), pants = o.pants ?? p.secondary, glove = o.glove ?? p.skin, torso = o.torso ?? p.primary, sleeve = o.sleeve ?? torso;
  if (!o.noLegs) {
    for (const [part, z] of [[PART.LEG_L, 0.27], [PART.LEG_R, -0.27]] as const) on(part, () => {
      add(CAP(0.19, 0.32), pants, [0, 0.5, z]);
      add(RB(0.52, 0.24, 0.34, 0.11), shoe, [0.09, 0.13, z]);
      add(B(0.53, 0.05, 0.35), '#f1f1f1', [0.09, 0.03, z]);
    });
  }
  on(PART.BODY, () => {
    const ts = o.torsoScale ?? [1, 1, 1];
    add(lathe([[0, 0.62], [0.44, 0.66], [0.56, 0.82], [0.6, 1.08], [0.62, 1.3], [0.5, 1.48], [0.2, 1.56], [0, 1.57]]), torso, [0, 0, 0], [0, 0, 0], ts);
    if (o.belt !== null) add(T(0.5 * ts[0], 0.07, Math.PI * 2, 8, 28), o.belt ?? darken(pants, 0.7), [0, 0.74, 0], [Math.PI / 2, 0, 0], [1, ts[2] / ts[0], 1]);
  });
  if (!o.noArms) {
    for (const [part, z] of [[PART.ARM_L, 0.7], [PART.ARM_R, -0.7]] as const) on(part, () => {
      add(S(0.2, 12, 10), sleeve, [0, 1.36, z * 0.95]);
      add(CAP(0.13, 0.36), sleeve, [0, 1.08, z]);
      add(S(0.18, 12, 10), glove, [0.02, 0.8, z]);
    });
  }
  on(PART.HEAD, () => add(S(o.headR ?? 0.8, 26, 20), o.skin ?? p.skin, [0, o.headY ?? 2.08, 0]));
}

type EyeStyle = 'normal' | 'glow' | 'cool' | 'angry' | 'happy' | 'visor';
function face(p: Pal, style: EyeStyle = 'normal', y = 2.1, x = 0.62, spread = 0.29, opts: { mouth?: 'smile' | 'smirk' | 'o' | 'none'; brows?: boolean; cheeks?: boolean } = {}) {
  on(PART.HEAD, () => {
    if (style === 'glow') {
      for (const s of [1, -1]) add(S(0.13, 12, 10), p.eyes, [x + 0.1, y, s * spread], [0, 0, 0], [0.5, 1.15, 1.25], 1);
      return;
    }
    if (style === 'visor') {
      add(RB(0.22, 0.28, 1.05, 0.1), darken(p.secondary, 0.6), [x + 0.06, y, 0]);
      add(B(0.04, 0.08, 0.86), p.eyes, [x + 0.18, y, 0], [0, 0, 0], [1, 1, 1], 1);
      return;
    }
    for (const s of [1, -1]) {
      const sq = style === 'happy' ? 0.55 : style === 'cool' ? 0.8 : 1;
      add(S(0.21, 16, 12), '#ffffff', [x, y, s * spread], [0, 0, 0], [0.42, 1.12 * sq, 0.9]);
      add(S(0.13, 12, 10), p.eyes, [x + 0.1, y - 0.01, s * (spread - 0.02)], [0, 0, 0], [0.4, 1.05 * sq, 0.9]);
      add(S(0.07, 10, 8), '#120a24', [x + 0.15, y - 0.01, s * (spread - 0.03)], [0, 0, 0], [0.4, 1.1 * sq, 0.9]);
      add(S(0.035, 6, 6), '#ffffff', [x + 0.19, y + 0.06 * sq, s * (spread - 0.07)]);
      if (style === 'cool') add(B(0.1, 0.07, 0.34), darken(p.skin, 0.75), [x + 0.06, y + 0.17, s * spread], [s * -0.12, 0, 0]);
    }
    if (opts.brows !== false) for (const s of [1, -1]) {
      const tilt = style === 'angry' ? 0.38 : style === 'happy' ? -0.2 : 0.16;
      add(RB(0.08, 0.07, 0.3, 0.03), darken(p.secondary, 0.55), [x + 0.06, y + 0.29, s * spread], [s * tilt, 0, 0]);
    }
    const mouth = opts.mouth ?? 'smirk';
    if (mouth === 'smile') add(T(0.12, 0.03, Math.PI, 6, 12), '#5a1a2a', [x + 0.15, y - 0.3, 0], [0, Math.PI / 2, Math.PI]);
    if (mouth === 'smirk') add(T(0.1, 0.03, Math.PI * 0.7, 6, 12), '#5a1a2a', [x + 0.15, y - 0.3, -0.04], [0, Math.PI / 2, Math.PI * 1.1]);
    if (mouth === 'o') add(S(0.06, 8, 6), '#5a1a2a', [x + 0.16, y - 0.3, 0], [0, 0, 0], [0.4, 1, 1]);
    if (opts.cheeks) for (const s of [1, -1]) add(S(0.08, 8, 6), '#ff8fa3', [x - 0.02, y - 0.2, s * 0.48], [0, 0, 0], [0.3, 0.6, 1]);
  });
}

function hat(kind: string | undefined, p: Pal, top: number) {
  if (!kind) return;
  on(PART.HEAD, () => {
    switch (kind) {
      case 'crown':
        add(C(0.46, 0.5, 0.26, 16), '#ffd60a', [0, top, 0]);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(K(0.1, 0.28, 6), '#ffd60a', [Math.cos(a) * 0.42, top + 0.25, Math.sin(a) * 0.42]); add(S(0.05, 6, 6), i % 2 ? '#ff006e' : '#3ec7ff', [Math.cos(a) * 0.5, top, Math.sin(a) * 0.5], [0, 0, 0], [1, 1, 1], 0.6); }
        break;
      case 'beanie':
        add(S(0.8, 20, 12, ), p.accent, [0, top - 0.42, 0], [0, 0, 0], [1, 0.72, 1]);
        add(T(0.78, 0.1, Math.PI * 2, 8, 24), p.secondary, [0, top - 0.42, 0], [Math.PI / 2, 0, 0]);
        add(S(0.2, 10, 8), '#ffffff', [0, top + 0.18, 0]);
        break;
      case 'visor':
        add(RB(0.22, 0.24, 1.2, 0.08), p.accent, [0.7, 2.14, 0], [0, 0, 0], [1, 1, 1], 0.7);
        break;
      case 'kasa':
        add(K(1.25, 0.5, 20), '#e9c46a', [0, top - 0.05, 0]);
        add(T(1.1, 0.04, Math.PI * 2, 6, 30), '#c08b2c', [0, top - 0.28, 0], [Math.PI / 2, 0, 0]);
        break;
      case 'horns':
        for (const s of [1, -1]) add(K(0.14, 0.7, 10), '#f1faee', [-0.05, top - 0.15, s * 0.5], [s * 0.55, 0, 0.2]);
        break;
      case 'helmet':
        add(S(0.88, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), p.accent, [0, 2.12, 0]);
        add(RB(0.14, 0.18, 1.4, 0.05), p.secondary, [0.78, 2.12, 0]);
        add(K(0.12, 0.35, 8), p.secondary, [0, top + 0.15, 0]);
        break;
      case 'tricorn':
        add(C(0.98, 0.98, 0.08, 3), '#1b1b1b', [0, top - 0.18, 0], [0, Math.PI / 6, 0]);
        add(C(0.5, 0.58, 0.42, 14), '#1b1b1b', [0, top, 0]);
        add(S(0.09, 8, 6), '#ffd60a', [0.56, top - 0.05, 0]);
        break;
      case 'headphones':
        add(T(0.86, 0.07, Math.PI, 8, 20), p.secondary, [0, 2.12, 0], [Math.PI / 2, 0, Math.PI / 2]);
        for (const s of [1, -1]) add(C(0.28, 0.28, 0.2, 14), p.accent, [0, 2.0, s * 0.82], [Math.PI / 2, 0, 0], [1, 1, 1], 0.3);
        break;
      case 'halo':
        on(PART.FLOAT, () => add(T(0.55, 0.06, Math.PI * 2, 8, 30), '#fff3b0', [0, top + 0.45, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 1), [0.3, 0, 0]);
        break;
    }
  });
}

// ---------------------------------------------------------------- heroes

const BUILDERS: Record<string, (p: Pal) => number> = {
  magnet: (p) => {
    body(p, { shoe: '#2b2d42', pants: p.secondary, glove: p.accent, belt: p.accent });
    on(PART.BODY, () => {
      add(RB(0.5, 0.62, 0.7, 0.12), darken(p.secondary, 0.9), [-0.55, 1.1, 0]); // battery backpack
      add(C(0.1, 0.1, 0.5, 10), p.accent, [-0.62, 1.55, 0.18], [0, 0, 0], [1, 1, 1], 0.8);
      add(C(0.1, 0.1, 0.5, 10), p.accent, [-0.62, 1.55, -0.18], [0, 0, 0], [1, 1, 1], 0.8);
      add(T(0.22, 0.05, Math.PI * 2, 6, 16), '#e9ecef', [0.58, 1.15, 0], [0, Math.PI / 2, 0]); // chest badge
      add(S(0.12, 10, 8), '#e63946', [0.6, 1.15, 0], [0, 0, 0], [0.5, 1, 1]);
    });
    face(p, 'cool', 2.08, 0.62, 0.29, { mouth: 'smirk', cheeks: true });
    on(PART.HEAD, () => {
      add(S(0.84, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), p.primary, [-0.04, 2.1, 0], [0, 0, 0.12]); // hair cap
      add(T(0.7, 0.09, Math.PI * 2, 8, 26), '#2b2d42', [0.05, 2.5, 0], [Math.PI / 2, 0.2, 0]);           // goggles strap
      for (const s of [1, -1]) { add(C(0.17, 0.17, 0.14, 14), '#2b2d42', [0.48, 2.55, s * 0.24], [0, 0, Math.PI / 2 - 0.4]); add(C(0.12, 0.12, 0.15, 14), '#9ff3ff', [0.5, 2.56, s * 0.24], [0, 0, Math.PI / 2 - 0.4], [1, 1, 1], 0.7); }
      add(CAP(0.17, 0.7), p.primary, [-0.85, 2.25, 0], [0, 0, 0.9]); // ponytail
      add(S(0.12, 8, 6), p.accent, [-0.6, 2.42, 0]);
    });
    on(PART.ARM_R, () => { // giant horseshoe magnet
      add(T(0.36, 0.13, Math.PI, 10, 18), '#e63946', [0.42, 0.78, -0.72], [Math.PI / 2, 0, -Math.PI / 2]);
      add(RB(0.3, 0.2, 0.28, 0.05), '#e9ecef', [0.78, 0.42, -0.72]);
      add(RB(0.3, 0.2, 0.28, 0.05), '#e9ecef', [0.78, 1.14, -0.72]);
    });
    on(PART.FLOAT, () => { add(S(0.06, 6, 6), '#ffe600', [1.15, 0.55, -0.72], [0, 0, 0], [1, 1, 1], 1); add(S(0.05, 6, 6), '#ffe600', [1.15, 1.0, -0.72], [0, 0, 0], [1, 1, 1], 1); }, [0.7, 0, 0]);
    return 2.9;
  },
  blink: (p) => {
    body(p, { shoe: '#14162e', pants: darken(p.secondary, 1.2), glove: '#14162e', torso: p.secondary, sleeve: p.secondary, belt: p.primary });
    on(PART.BODY, () => {
      add(T(0.52, 0.16, Math.PI * 2, 10, 24), p.primary, [0.05, 1.5, 0], [Math.PI / 2, 0, 0]); // scarf
      add(RB(0.14, 0.75, 0.22, 0.06), p.primary, [-0.55, 1.15, 0.12], [0.2, 0, 0.35]);            // scarf tail
      add(RB(0.12, 0.6, 0.2, 0.05), p.primary, [-0.62, 1.0, -0.12], [-0.25, 0, 0.5]);
      add(B(0.62, 0.08, 0.12), p.accent, [0.25, 1.05, 0], [0, 0, 0.6], [1, 1, 1], 0.4);              // chest strap
    });
    on(PART.HEAD, () => {
      add(S(0.86, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), p.secondary, [-0.04, 2.08, 0]); // hood
      add(K(0.5, 0.7, 14), p.secondary, [-0.55, 2.5, 0], [0, 0, 1.05]);                         // hood tip
      add(S(0.81, 22, 14, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), darken(p.secondary, 0.8), [0.02, 2.06, 0]); // mask lower face
    });
    face(p, 'glow', 2.13, 0.6, 0.28);
    on(PART.HEAD, () => add(B(0.05, 0.05, 0.8), p.eyes, [0.79, 2.13, 0], [0, 0, 0], [1, 1, 1], 1));
    for (const [part, z] of [[PART.ARM_L, 0.7], [PART.ARM_R, -0.7]] as const) on(part, () => {
      add(C(0.03, 0.04, 0.2, 6), '#5c3d2e', [0.12, 0.8, z]);
      add(K(0.08, 0.75, 4), '#e9ecef', [0.5, 0.82, z], [0, 0, -Math.PI / 2], [1, 1, 0.4]);
      add(B(0.05, 0.08, 0.26), p.accent, [0.18, 0.81, z], [0, 0, 0], [1, 1, 1], 0.6);
    });
    return 2.9;
  },
  block: (p) => {
    for (const [part, z] of [[PART.LEG_L, 0.32], [PART.LEG_R, -0.32]] as const) on(part, () => { add(RB(0.42, 0.45, 0.42, 0.08), '#3d5a80', [0, 0.46, z]); add(RB(0.6, 0.26, 0.44, 0.1), '#5c3d2e', [0.1, 0.13, z]); });
    on(PART.BODY, () => {
      add(RB(1.4, 1.15, 1.45, 0.22), '#3d5a80', [0, 1.08, 0]);           // overalls
      add(RB(1.42, 0.55, 1.47, 0.18), p.primary, [0, 1.42, 0]);          // shirt
      for (const s of [1, -1]) add(B(0.06, 0.6, 0.14), '#3d5a80', [0.71, 1.35, s * 0.36]);
      add(RB(0.36, 0.3, 0.06, 0.05), '#29466b', [0.73, 1.0, 0], [0, Math.PI / 2, 0]);
      add(RB(0.5, 0.18, 0.8, 0.05), p.accent, [-0.72, 0.92, 0]);         // tool belt pouch
    });
    for (const [part, z] of [[PART.ARM_L, 0.85], [PART.ARM_R, -0.85]] as const) on(part, () => { add(RB(0.36, 0.55, 0.36, 0.1), p.primary, [0, 1.2, z]); add(RB(0.36, 0.32, 0.36, 0.1), p.skin, [0.02, 0.8, z]); }, [0, 1.42, z]);
    on(PART.HEAD, () => {
      add(RB(1.25, 1.1, 1.25, 0.28), p.skin, [0, 2.3, 0]);
      add(S(0.8, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#ffd166', [0, 2.72, 0], [0, 0, 0], [1, 0.75, 1]); // hard hat
      add(C(0.92, 0.92, 0.07, 24), '#ffd166', [0.12, 2.72, 0]);
      add(B(0.5, 0.2, 0.08), '#f4a261', [0.4, 2.98, 0], [0, 0, -0.5]);
    });
    face(p, 'happy', 2.32, 0.62, 0.3, { mouth: 'smile', cheeks: true });
    on(PART.ARM_R, () => { add(C(0.05, 0.05, 0.9, 8), '#8d5b3a', [0.35, 0.82, -0.85], [0, 0, Math.PI / 2]); add(RB(0.38, 0.28, 0.24, 0.06), '#bc4749', [0.8, 0.82, -0.85]); }, [0, 1.42, -0.85]);
    return 3.25;
  },
  shade: (p) => {
    on(PART.BODY, () => {
      add(lathe([[0, 0.25], [0.95, 0.1], [0.88, 0.5], [0.66, 1.0], [0.55, 1.45], [0.3, 1.62], [0, 1.65]], 24), p.secondary, [0, 0, 0]);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(K(0.22, 0.45, 5), p.secondary, [Math.cos(a) * 0.85, 0.06, Math.sin(a) * 0.85], [Math.PI, 0, 0]); }
      add(T(0.62, 0.06, Math.PI * 2, 6, 24), p.accent, [0, 1.15, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 0.8);
      add(K(0.2, 0.35, 4), p.accent, [0.6, 1.0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.3], 0.9);
    });
    for (const [part, z] of [[PART.ARM_L, 0.72], [PART.ARM_R, -0.72]] as const) on(part, () => { add(K(0.2, 0.75, 10), p.secondary, [0, 1.05, z], [Math.PI, 0, 0]); add(S(0.15, 10, 8), p.skin, [0.05, 0.7, z]); });
    on(PART.HEAD, () => {
      add(S(0.74, 22, 18), p.skin, [0, 2.1, 0]);
      add(S(0.9, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), p.primary, [-0.12, 2.12, 0]);
      add(K(0.62, 1.1, 16), p.primary, [-0.6, 2.7, 0], [0, 0, 1.1]);
    });
    face(p, 'glow', 2.12, 0.6, 0.27);
    on(PART.FLOAT, () => { for (let i = 0; i < 3; i++) add(S(0.12 - i * 0.02, 8, 6), p.accent, [-0.6 - i * 0.35, 1.2 + i * 0.3, (i % 2 ? 1 : -1) * 0.6], [0, 0, 0], [1, 1, 1], 1); }, [1.7, 0, 0]);
    return 2.95;
  },
  volt: (p) => {
    body(p, { shoe: '#1e2a78', pants: '#1e2a78', glove: p.accent, torso: p.secondary, sleeve: p.primary, belt: p.primary });
    on(PART.BODY, () => {
      add(RB(0.08, 0.5, 0.2, 0.03), p.primary, [0.6, 1.22, 0.06], [0, 0, 0.45], [1, 1, 1], 0.7);
      add(RB(0.08, 0.42, 0.2, 0.03), p.primary, [0.62, 0.92, -0.05], [0, 0, -0.45], [1, 1, 1], 0.7);
      add(T(0.55, 0.08, Math.PI * 2, 8, 24), p.primary, [0, 1.5, 0], [Math.PI / 2, 0, 0]);
    });
    for (const [part, z] of [[PART.ARM_L, 0.7], [PART.ARM_R, -0.7]] as const) on(part, () => { add(C(0.22, 0.22, 0.3, 14), '#2b2d42', [0, 0.92, z]); for (let k = 0; k < 2; k++) add(T(0.23, 0.04, Math.PI * 2, 6, 18), p.accent, [0, 0.85 + k * 0.14, z], [Math.PI / 2, 0, 0], [1, 1, 1], 0.9); });
    on(PART.HEAD, () => {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(K(0.26, 1.05, 6), i % 3 ? p.primary : lighten(p.primary, 0.4), [Math.cos(a) * 0.42 - 0.2, 2.75, Math.sin(a) * 0.48], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.7 + 0.5]);
      }
      add(S(0.83, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), p.primary, [-0.08, 2.14, 0]);
      add(K(0.14, 0.6, 6), p.primary, [0.5, 2.6, 0.2], [0, 0, -1.2]);
    });
    face(p, 'angry', 2.06, 0.62, 0.29, { mouth: 'smirk' });
    on(PART.FLOAT, () => { add(S(0.07, 6, 6), p.accent, [0.3, 3.3, 0.3], [0, 0, 0], [1, 1, 1], 1); add(S(0.06, 6, 6), p.accent, [-0.5, 3.1, -0.4], [0, 0, 0], [1, 1, 1], 1); }, [0.9, 0, 0]);
    return 3.2;
  },
  flux: (p) => {
    body(p, { shoe: '#073b4c', pants: '#073b4c', glove: '#e9ecef', torso: '#e9ecef', sleeve: '#e9ecef', belt: p.primary });
    on(PART.BODY, () => {
      add(RB(0.06, 1.0, 0.75, 0.03), p.primary, [0.6, 1.05, 0], [0, 0, 0.05]); // lab coat stripe
      add(C(0.24, 0.24, 0.9, 14), '#adb5bd', [-0.6, 1.25, 0.2]);                // twin tanks
      add(C(0.24, 0.24, 0.9, 14), '#adb5bd', [-0.6, 1.25, -0.2]);
      add(C(0.18, 0.18, 0.7, 14), p.primary, [-0.66, 1.25, 0.2], [0, 0, 0], [1, 1, 1], 0.6);
      add(C(0.18, 0.18, 0.7, 14), p.accent, [-0.66, 1.25, -0.2], [0, 0, 0], [1, 1, 1], 0.6);
      add(T(0.3, 0.05, Math.PI, 6, 14), '#adb5bd', [-0.35, 1.7, 0], [0, Math.PI / 2, 0]);
    });
    on(PART.HEAD, () => {
      add(S(0.84, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), p.secondary, [-0.1, 2.16, 0]);
      for (let i = 0; i < 5; i++) add(K(0.16, 0.5, 6), p.secondary, [-0.3 + i * 0.12, 2.85, -0.3 + i * 0.15], [0.3 - i * 0.15, 0, 0.6]);
      for (const s of [1, -1]) add(T(0.18, 0.05, Math.PI * 2, 6, 14), '#adb5bd', [0.68, 2.12, s * 0.28], [0, Math.PI / 2, 0]);
      add(B(0.04, 0.04, 0.2), '#adb5bd', [0.76, 2.13, 0]);
    });
    face(p, 'normal', 2.1, 0.6, 0.28, { mouth: 'smile' });
    on(PART.FLOAT, () => { add(S(0.27, 16, 12), p.accent, [0.8, 1.15, 0.95], [0, 0, 0], [1, 1, 1], 1); add(T(0.42, 0.03, Math.PI * 2, 6, 20), p.primary, [0.8, 1.15, 0.95], [1.2, 0, 0.4], [1, 1, 1], 1); }, [0.5, 0, 0]);
    on(PART.FLOAT, () => { add(S(0.27, 16, 12), p.primary, [0.8, 1.15, -0.95], [0, 0, 0], [1, 1, 1], 1); add(T(0.42, 0.03, Math.PI * 2, 6, 20), p.accent, [0.8, 1.15, -0.95], [-1.2, 0, 0.4], [1, 1, 1], 1); }, [2.5, 0, 0]);
    return 2.95;
  },
  titan: (p) => {
    for (const [part, z] of [[PART.LEG_L, 0.38], [PART.LEG_R, -0.38]] as const) on(part, () => { add(CAP(0.26, 0.3), '#2b2d42', [0, 0.52, z]); add(RB(0.7, 0.32, 0.48, 0.12), p.secondary, [0.12, 0.16, z]); }, [0, 0.82, z]);
    on(PART.BODY, () => {
      add(lathe([[0, 0.65], [0.6, 0.7], [0.82, 1.0], [0.95, 1.4], [0.9, 1.75], [0.5, 1.95], [0, 1.97]], 22), p.primary, [0, 0, 0]);
      add(RB(0.3, 0.6, 0.9, 0.1), p.secondary, [0.72, 1.35, 0]);
      add(S(0.13, 10, 8), p.accent, [0.88, 1.35, 0], [0, 0, 0], [0.5, 1, 1], 0.9);
      add(T(0.7, 0.1, Math.PI * 2, 8, 24), '#2b2d42', [0, 0.78, 0], [Math.PI / 2, 0, 0]);
    });
    for (const [part, z] of [[PART.ARM_L, 1.1], [PART.ARM_R, -1.1]] as const) on(part, () => {
      add(S(0.5, 16, 12), p.secondary, [0, 1.8, z * 0.95], [0, 0, 0], [1, 0.8, 1]);         // pauldron
      add(K(0.12, 0.35, 8), p.accent, [0, 2.15, z * 0.95]);
      add(CAP(0.22, 0.4), '#2b2d42', [0, 1.3, z]);
      add(RB(0.66, 0.6, 0.6, 0.18), p.primary, [0.12, 0.85, z]);                            // huge fist
      add(B(0.08, 0.5, 0.5), p.accent, [0.46, 0.85, z], [0, 0, 0], [1, 1, 1], 0.4);
    }, [0, 1.8, z]);
    on(PART.HEAD, () => {
      add(S(0.55, 20, 14), p.skin, [0.12, 2.25, 0]);
      add(S(0.62, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), p.primary, [0.1, 2.32, 0]);
      add(K(0.15, 0.45, 8), p.accent, [0.05, 2.95, 0]);
    }, [0, 1.9, 0]);
    face(p, 'visor', 2.22, 0.5, 0.24);
    return 3.1;
  },
  arc: (p) => {
    body(p, { shoe: '#3a0ca3', pants: p.secondary, glove: '#5c3d2e', torso: p.primary, sleeve: p.primary, belt: '#5c3d2e' });
    on(PART.BODY, () => {
      for (let i = 0; i < 5; i++) add(C(0.06, 0.06, 0.2, 8), '#ffd166', [0.35 - i * 0.15, 1.1 + i * 0.09, 0.45 - i * 0.2], [0.6, 0, 0.4]); // bandolier shells
      add(T(0.62, 0.05, Math.PI * 2, 6, 24), '#5c3d2e', [0, 1.1, 0], [Math.PI / 2 - 0.6, 0, 0]);
      add(C(0.28, 0.32, 1.7, 14), darken(p.secondary, 1.2), [-0.45, 1.6, 0.52], [0, 0, -0.85]);  // mortar
      add(C(0.35, 0.35, 0.16, 14), p.accent, [0.18, 2.15, 0.52], [0, 0, -0.85]);
      add(C(0.2, 0.2, 0.05, 14), '#14162e', [0.25, 2.2, 0.52], [0, 0, -0.85]);
    });
    on(PART.HEAD, () => {
      add(S(0.84, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), p.secondary, [-0.08, 2.12, 0]);
      add(C(0.85, 0.8, 0.22, 20), p.accent, [-0.05, 2.65, 0], [0, 0, 0.15]); // beret
      add(S(0.1, 8, 6), p.accent, [-0.05, 2.8, 0]);
      for (const s of [1, -1]) { add(T(0.17, 0.06, Math.PI * 2, 6, 16), '#5c3d2e', [0.55, 2.48, s * 0.24], [0, Math.PI / 2, 0]); add(C(0.13, 0.13, 0.05, 14), '#9ff3ff', [0.58, 2.48, s * 0.24], [0, 0, Math.PI / 2], [1, 1, 1], 0.6); }
      add(CAP(0.14, 0.5), p.secondary, [-0.4, 1.75, 0.65], [0.3, 0, 0.2]); add(CAP(0.14, 0.5), p.secondary, [-0.4, 1.75, -0.65], [-0.3, 0, 0.2]);
    });
    face(p, 'cool', 2.08, 0.62, 0.29, { mouth: 'smile', cheeks: true });
    return 2.95;
  },
  pulse: (p) => {
    body(p, { shoe: '#ffffff', pants: '#e9ecef', glove: p.primary, torso: p.secondary, sleeve: p.secondary, belt: p.primary });
    on(PART.BODY, () => {
      add(RB(0.08, 0.42, 0.14, 0.03), '#e63946', [0.62, 1.15, 0]);
      add(RB(0.08, 0.14, 0.42, 0.03), '#e63946', [0.62, 1.15, 0]);
      add(RB(0.45, 0.55, 0.62, 0.12), p.primary, [-0.55, 1.15, 0]);
      add(S(0.14, 10, 8), p.accent, [-0.8, 1.4, 0], [0, 0, 0], [1, 1, 1], 1);
    });
    on(PART.HEAD, () => {
      add(S(0.83, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), p.primary, [-0.1, 2.16, 0]);
      for (const s of [1, -1]) add(S(0.32, 14, 10), p.primary, [-0.25, 2.25, s * 0.68]); // pigtails
      add(T(0.84, 0.05, Math.PI, 6, 18), '#e9ecef', [0, 2.12, 0], [Math.PI / 2, 0, Math.PI / 2]);
      add(C(0.12, 0.12, 0.08, 10), p.accent, [0.15, 2.05, 0.82], [Math.PI / 2, 0, 0], [1, 1, 1], 0.8);
      add(CAP(0.03, 0.25), '#adb5bd', [0.4, 1.9, 0.75], [0, 0, 1.2]);
    });
    on(PART.FLOAT, () => { add(C(0.03, 0.03, 0.6, 6), '#adb5bd', [0, 3.0, 0]); add(S(0.17, 12, 10), p.accent, [0.02, 3.4, 0.09], [0, 0, 0], [1, 1, 1], 1); add(S(0.17, 12, 10), p.accent, [0.02, 3.4, -0.09], [0, 0, 0], [1, 1, 1], 1); add(K(0.23, 0.28, 10), p.accent, [0.02, 3.22, 0], [Math.PI, 0, 0], [1, 1, 1], 1); }, [1.2, 0, 0]);
    face(p, 'happy', 2.08, 0.62, 0.29, { mouth: 'smile', cheeks: true });
    return 2.95;
  },
  vortex: (p) => {
    body(p, { shoe: '#240046', pants: p.secondary, glove: p.skin, torso: p.secondary, sleeve: p.primary, belt: p.accent });
    on(PART.BODY, () => {
      add(lathe([[0, 0.25], [0.7, 0.3], [0.64, 0.7], [0.5, 0.75]], 20), p.primary, [0, 0, 0]); // robe skirt
      add(RB(0.08, 0.7, 0.3, 0.03), p.accent, [0.58, 1.1, 0], [0, 0, 0], [1, 1, 1], 0.5);
    });
    on(PART.HEAD, () => {
      add(S(0.84, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), p.primary, [-0.08, 2.14, 0]);
      for (let i = 0; i < 4; i++) add(T(0.25 + i * 0.12, 0.08, Math.PI * 1.3, 6, 16), lighten(p.primary, i * 0.12), [-0.2, 2.75 + i * 0.08, 0], [Math.PI / 2, 0, i * 0.8]);
    });
    face(p, 'cool', 2.08, 0.62, 0.29, { mouth: 'smirk' });
    on(PART.ARM_R, () => { add(C(0.05, 0.05, 2.2, 8), '#8d5b3a', [0.25, 1.0, -0.72]); add(S(0.2, 14, 10), p.accent, [0.25, 2.15, -0.72], [0, 0, 0], [1, 1, 1], 1); add(T(0.28, 0.03, Math.PI * 2, 6, 18), p.primary, [0.25, 2.15, -0.72], [0.6, 0, 0.6], [1, 1, 1], 1); });
    on(PART.FLOAT, () => { add(T(1.1, 0.05, Math.PI * 1.5, 6, 30), p.accent, [0, 1.1, 0], [Math.PI / 2 - 0.25, 0, 0], [1, 1, 1], 1); add(T(1.3, 0.035, Math.PI * 1.2, 6, 30), p.primary, [0, 1.5, 0], [Math.PI / 2 + 0.3, 0, 1], [1, 1, 1], 0.8); }, [3.1, 0, 0]);
    return 3.0;
  },
  ember: (p) => {
    body(p, { shoe: '#2e1f27', pants: p.secondary, glove: p.accent, torso: p.secondary, sleeve: p.primary, belt: p.accent });
    on(PART.BODY, () => { add(T(0.55, 0.14, Math.PI * 2, 8, 24), p.primary, [0.05, 1.5, 0], [Math.PI / 2, 0, 0]); add(RB(0.12, 0.6, 0.2, 0.05), p.primary, [-0.58, 1.15, 0.15], [0.3, 0, 0.4]); });
    on(PART.HEAD, () => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(K(0.3, 1.0 + (i % 3) * 0.35, 7), i % 2 ? p.accent : p.primary, [Math.cos(a) * 0.4 - 0.25, 2.8, Math.sin(a) * 0.45], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.5 + 0.55], [1, 1, 1], i % 2 ? 0.9 : 0.5);
      }
      add(S(0.83, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), p.primary, [-0.08, 2.15, 0], [0, 0, 0], [1, 1, 1], 0.3);
    });
    face(p, 'angry', 2.06, 0.62, 0.29, { mouth: 'smirk' });
    for (const [part, z] of [[PART.ARM_L, 0.7], [PART.ARM_R, -0.7]] as const) on(part, () => add(K(0.14, 0.4, 7), p.accent, [0.05, 0.65, z], [Math.PI, 0, 0], [1, 1, 1], 1));
    return 3.3;
  },
  golem: (p) => {
    on(PART.BODY, () => {
      add(new THREE.DodecahedronGeometry(1.3, 1), p.primary, [0, 1.45, 0], [0.3, 0.4, 0], [1, 1.05, 1.1]);
      add(new THREE.OctahedronGeometry(0.42, 0), p.accent, [0.95, 1.5, 0], [0, 0, 0], [0.6, 1.4, 0.6], 1);
      for (let i = 0; i < 5; i++) add(new THREE.OctahedronGeometry(0.4 + (i % 2) * 0.15, 0), p.accent, [-0.7 + (i % 2) * 0.2, 2.3 + (i % 3) * 0.1, -0.9 + i * 0.45], [0, 0, 0.5 - i * 0.2], [0.6, 1.8, 0.6], 1);
    });
    for (const [part, z] of [[PART.LEG_L, 0.6], [PART.LEG_R, -0.6]] as const) on(part, () => add(new THREE.DodecahedronGeometry(0.5, 0), p.secondary, [0.1, 0.4, z], [0.3, 0, 0]), [0, 0.9, z]);
    for (const [part, z] of [[PART.ARM_L, 1.45], [PART.ARM_R, -1.45]] as const) on(part, () => { add(new THREE.DodecahedronGeometry(0.5, 0), p.secondary, [0, 1.8, z], [0.5, 0, 0]); add(new THREE.DodecahedronGeometry(0.68, 0), p.primary, [0.4, 1.0, z], [0.2, 0.4, 0]); }, [0, 2.0, z]);
    on(PART.HEAD, () => { add(new THREE.DodecahedronGeometry(0.72, 0), p.skin, [0.35, 2.75, 0], [0.2, 0.1, 0.3]); for (const s of [1, -1]) add(S(0.15, 8, 6), p.eyes, [0.98, 2.85, s * 0.25], [0, 0, 0], [0.5, 1, 1.2], 1); }, [0, 2.3, 0]);
    return 3.6;
  },
  minion: (p) => {
    for (const [part, z] of [[PART.LEG_L, 0.42], [PART.LEG_R, -0.42]] as const) on(part, () => add(S(0.28, 10, 8), p.secondary, [0.1, 0.22, z], [0, 0, 0], [1.3, 0.8, 1]));
    on(PART.BODY, () => {
      add(S(1.0, 20, 16), p.primary, [0, 1.05, 0], [0, 0, 0], [1, 0.92, 1]);
      for (const s of [1, -1]) add(K(0.17, 0.6, 8), p.accent, [-0.1, 1.95, s * 0.45], [s * 0.5, 0, 0.2]);
      add(S(0.4, 16, 12), '#ffffff', [0.78, 1.25, 0], [0, 0, 0], [0.5, 1, 1]);
      add(S(0.2, 12, 10), p.eyes, [0.95, 1.25, 0], [0, 0, 0], [0.5, 1, 1], 1);
      add(K(0.08, 0.2, 4), '#ffffff', [0.92, 0.82, 0.18], [0, 0, Math.PI]); add(K(0.08, 0.2, 4), '#ffffff', [0.92, 0.82, -0.18], [0, 0, Math.PI]);
    });
    for (const [part, z] of [[PART.ARM_L, 0.95], [PART.ARM_R, -0.95]] as const) on(part, () => add(K(0.16, 0.5, 6), p.secondary, [0.2, 0.9, z], [0, 0, -0.6]), [0, 1.2, z]);
    return 2.1;
  },
};

export function buildHeroGeometry(heroId: string, skinId?: string): THREE.BufferGeometry {
  parts.length = 0;
  curPart = 0; pivotOverride = null;
  const def = getCharacter(heroId);
  const p = resolvePalette(heroId, skinId);
  const top = (BUILDERS[def.model] ?? BUILDERS.magnet)(p);
  hat((p as any).hat, p, top);
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

// ---------------------------------------------------------------- animated materials

export interface HeroAnimUniforms { uWalk: { value: number }; uMove: { value: number }; uAtk: { value: number }; uCast: { value: number }; uTime: { value: number }; uFlash: { value: number }; uRim: { value: THREE.Color } }

const ANIM_GLSL = /* glsl */ `
attribute float part; attribute vec3 pivot; attribute float glow;
uniform float uWalk; uniform float uMove; uniform float uAtk; uniform float uCast; uniform float uTime;
varying float vGlow;
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 partRot(){
  float sw = sin(uWalk);
  if (part < 0.5) return rotX(0.0);
  if (part < 1.5) return rotZ(sw * 0.75 * uMove);
  if (part < 2.5) return rotZ(-sw * 0.75 * uMove);
  if (part < 3.5) return rotZ(-sw * 0.6 * uMove + uCast * 2.2) * rotX(-uCast * 0.5 - 0.06);
  if (part < 4.5) return rotZ(sw * 0.6 * uMove + uAtk * 1.7 + uCast * 2.2) * rotX(uCast * 0.5 + 0.06);
  if (part < 5.5) return rotZ(sin(uTime * 1.7) * 0.05 - uMove * 0.08 + uAtk * 0.12) * rotX(sin(uWalk * 2.0) * 0.06 * uMove);
  return rotX(0.0);
}
vec3 animPos(vec3 p){
  vec3 q = partRot() * (p - pivot) + pivot;
  if (part > 5.5) { q.y += sin(uTime * 3.0 + pivot.x) * 0.12; q = rotX(0.0) * q; }
  return q;
}
`;

function patchVertex(shader: THREE.WebGLProgramParametersWithUniforms, u: HeroAnimUniforms) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = ANIM_GLSL + shader.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = partRot() * vec3(normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif')
    .replace('#include <begin_vertex>', 'vec3 transformed = animPos(vec3(position)); vGlow = glow;');
}

export function makeHeroUniforms(rim = '#ffffff'): HeroAnimUniforms {
  return { uWalk: { value: 0 }, uMove: { value: 0 }, uAtk: { value: 0 }, uCast: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uRim: { value: new THREE.Color(rim) } };
}

/** Toon + team-colored rim light + emissive glow parts + hit flash, with vertex-shader limb animation. */
export function makeHeroMaterial(u: HeroAnimUniforms) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), transparent: true });
  m.onBeforeCompile = (shader) => {
    patchVertex(shader, u);
    shader.fragmentShader = 'varying float vGlow; uniform float uFlash; uniform vec3 uRim;\n' + shader.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGlow * 0.85;')
      .replace('#include <opaque_fragment>', `
        float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += uRim * smoothstep(0.55, 0.95, rimF) * 0.55;
        outgoingLight = mix(outgoingLight, vec3(1.0), uFlash);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rift-hero-v2';
  return m;
}

/** Outline shader sharing the same skeleton-less animation. */
export function makeHeroOutline(u: HeroAnimUniforms, thickness = 0.065, color = '#1a1030') {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, thickness: { value: thickness }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
    vertexShader: ANIM_GLSL + `uniform float thickness; void main(){ vec3 p = animPos(position) + normalize(partRot() * normal) * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }`,
    side: THREE.BackSide,
  });
}

/** Static outline for non-animated meshes (walls). */
export function makeOutlineMaterial(thickness = 0.06, color = '#1a1030') {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
    vertexShader: `uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }`,
    side: THREE.BackSide,
  });
}

// ---------------------------------------------------------------- environment decoration

export function decoGeometry(kind: 'tree' | 'rock' | 'crystal' | 'pillar' | 'icepillar' | 'lavarock' | 'beacon' | 'palm' | 'ruin', accent: string, base: string): THREE.BufferGeometry {
  parts.length = 0; curPart = 0; pivotOverride = null;
  const d = (geo: THREE.BufferGeometry, color: string, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) => add(geo, color, pos, rot, scale);
  switch (kind) {
    case 'tree': d(C(0.18, 0.25, 0.9, 8), '#8d5b3a', [0, 0.45, 0]); d(K(0.9, 1.3, 9), base, [0, 1.3, 0]); d(K(0.7, 1.0, 9), accent, [0, 1.95, 0]); break;
    case 'palm': d(C(0.14, 0.2, 1.6, 7), '#a47148', [0, 0.8, 0], [0, 0, 0.1]); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; d(B(1.1, 0.06, 0.32), base, [Math.cos(a) * 0.45 + 0.08, 1.6, Math.sin(a) * 0.45], [0, -a, -0.45]); } break;
    case 'rock': d(new THREE.DodecahedronGeometry(0.6, 0), base, [0, 0.35, 0], [0.4, 0.7, 0.2], [1.2, 0.8, 1]); d(new THREE.DodecahedronGeometry(0.35, 0), accent, [0.55, 0.2, 0.3], [0.1, 0.2, 0.5]); break;
    case 'crystal': d(new THREE.OctahedronGeometry(0.4, 0), accent, [0, 0.6, 0], [0, 0, 0], [0.7, 1.7, 0.7]); d(new THREE.OctahedronGeometry(0.25, 0), accent, [0.35, 0.35, 0.15], [0, 0, 0.5], [0.7, 1.5, 0.7]); d(new THREE.DodecahedronGeometry(0.3, 0), base, [0, 0.1, 0]); break;
    case 'pillar': d(C(0.35, 0.4, 1.8, 8), base, [0, 0.9, 0]); d(B(0.95, 0.25, 0.95), accent, [0, 1.9, 0]); d(B(0.95, 0.2, 0.95), accent, [0, 0.1, 0]); break;
    case 'icepillar': d(new THREE.OctahedronGeometry(0.5, 0), accent, [0, 0.9, 0], [0, 0.4, 0], [0.8, 2.2, 0.8]); d(new THREE.OctahedronGeometry(0.3, 0), base, [0.45, 0.4, 0.2], [0, 0, 0.4], [0.8, 1.6, 0.8]); break;
    case 'lavarock': d(new THREE.DodecahedronGeometry(0.6, 0), '#2b1d1d', [0, 0.35, 0], [0.3, 0.5, 0], [1.1, 0.9, 1]); d(new THREE.OctahedronGeometry(0.22, 0), accent, [0.2, 0.75, 0.1]); break;
    case 'beacon': d(C(0.12, 0.3, 1.8, 6), base, [0, 0.9, 0]); d(S(0.28, 10, 8), accent, [0, 1.95, 0]); d(T(0.45, 0.04), accent, [0, 1.95, 0], [Math.PI / 2, 0, 0]); break;
    case 'ruin': d(B(0.9, 1.4, 0.9), base, [0, 0.7, 0]); d(B(1.1, 0.25, 1.1), accent, [0, 1.5, 0], [0, 0, 0.12]); d(S(0.35, 8, 6), '#2d6a4f', [0.4, 1.6, 0.3]); break;
  }
  const merged = mergeGeometries(parts, false)!;
  parts.length = 0;
  for (const n of ['part', 'pivot', 'glow']) merged.deleteAttribute(n);
  return merged;
}
