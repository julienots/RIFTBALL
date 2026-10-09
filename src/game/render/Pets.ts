import * as THREE from 'three';
import { toon } from './Toon';

/** Procedural companions (pets): small stylised creatures that float next to a hero. ~1 unit tall. */
const S = (r: number) => new THREE.SphereGeometry(r, 16, 12);
const K = (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg);
const O = (r: number) => new THREE.OctahedronGeometry(r, 0);

function mesh(g: THREE.BufferGeometry, color: string, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0], glow = 0) {
  const m = new THREE.Mesh(g, toon(color, glow ? { emissive: color, emissiveIntensity: glow } : {}));
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
  m.userData.ownMat = true;
  return m;
}

function eyes(g: THREE.Group, x: number, y: number, z: number, size = 0.09, color = '#120a24') {
  for (const s of [1, -1]) {
    g.add(mesh(S(size), '#ffffff', [x, y, s * z], [0.5, 1.1, 1]));
    g.add(mesh(S(size * 0.55), color, [x + size * 0.35, y, s * z], [0.5, 1.1, 1]));
  }
}

export function buildPet(model: string, color: string, accent: string): THREE.Group {
  const g = new THREE.Group();
  const wings = (c: string, y = 0, spread = 0.38, glow = 0) => { for (const s of [1, -1]) { const w = mesh(K(0.22, 0.5, 3), c, [-0.05, y, s * spread], [1, 1, 0.25], [s * 1.2, 0, 0.4], glow); w.userData.wing = s; g.add(w); } };
  switch (model) {
    case 'orb':
      g.add(mesh(S(0.32), color, [0, 0, 0], [1, 1, 1], [0, 0, 0], 0.6));
      g.add(mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24), accent, [0, 0, 0], [1, 1, 1], [1.2, 0, 0.3], 1));
      eyes(g, 0.26, 0.05, 0.1);
      break;
    case 'drone':
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 16), color, [0, 0, 0]));
      g.add(mesh(S(0.2), accent, [0, 0.1, 0], [1, 0.6, 1], [0, 0, 0], 0.5));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; const r = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12), '#2b2d42', [Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38]); r.userData.spin = 1; g.add(r); }
      g.add(mesh(S(0.06), '#ff006e', [0.33, -0.02, 0], [1, 1, 1], [0, 0, 0], 1));
      break;
    case 'cat':
      g.add(mesh(S(0.3), color, [0, 0, 0]));
      for (const s of [1, -1]) g.add(mesh(K(0.1, 0.2, 6), color, [-0.02, 0.28, s * 0.15], [1, 1, 1], [s * 0.3, 0, 0]));
      g.add(mesh(S(0.05), '#ff8fa3', [0.29, -0.04, 0]));
      eyes(g, 0.24, 0.06, 0.11, 0.08, '#2d6a4f');
      g.add(mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 8), color, [-0.32, 0.05, 0], [1, 1, 1], [0, 0, 0.8]));
      break;
    case 'crystal':
      g.add(mesh(O(0.3), color, [0, 0, 0], [0.8, 1.4, 0.8], [0, 0, 0], 0.7));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const c = mesh(O(0.08), accent, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [1, 1, 1], [0, 0, 0], 1); c.userData.orbit = a; g.add(c); }
      break;
    case 'ghost':
      g.add(mesh(S(0.3), color, [0, 0.05, 0], [1, 1, 1], [0, 0, 0], 0.25));
      g.add(mesh(K(0.3, 0.35, 12), color, [0, -0.2, 0], [1, 1, 1], [Math.PI, 0, 0], 0.25));
      eyes(g, 0.24, 0.08, 0.1, 0.08, accent);
      break;
    case 'bat':
      g.add(mesh(S(0.22), color, [0, 0, 0]));
      for (const s of [1, -1]) g.add(mesh(K(0.06, 0.14, 5), color, [0, 0.2, s * 0.09]));
      wings(color, 0, 0.3);
      eyes(g, 0.17, 0.04, 0.08, 0.06, accent);
      break;
    case 'penguin':
      g.add(mesh(new THREE.CapsuleGeometry(0.22, 0.2, 6, 12), color, [0, 0, 0]));
      g.add(mesh(S(0.19), accent, [0.08, -0.04, 0], [0.7, 1.1, 1]));
      g.add(mesh(K(0.06, 0.16, 6), '#ffb703', [0.26, 0.1, 0], [1, 1, 1], [0, 0, -Math.PI / 2]));
      eyes(g, 0.18, 0.18, 0.08, 0.06);
      wings(color, 0, 0.24);
      break;
    case 'parrot':
      g.add(mesh(S(0.25), color, [0, 0, 0]));
      g.add(mesh(K(0.07, 0.18, 6), accent, [0.28, 0, 0], [1, 1, 1], [0, 0, -Math.PI / 2]));
      g.add(mesh(K(0.08, 0.35, 6), '#e63946', [-0.3, -0.05, 0], [1, 1, 1], [0, 0, Math.PI / 2 + 0.4]));
      wings(accent, 0.02, 0.26);
      eyes(g, 0.2, 0.08, 0.1, 0.06);
      break;
    case 'robot':
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), color, [0, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.12, 0.32), accent, [0.22, 0.03, 0], [1, 1, 1], [0, 0, 0], 1));
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), '#adb5bd', [0, 0.3, 0]));
      g.add(mesh(S(0.05), accent, [0, 0.42, 0], [1, 1, 1], [0, 0, 0], 1));
      break;
    case 'dragon':
      g.add(mesh(new THREE.CapsuleGeometry(0.18, 0.3, 6, 12), color, [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]));
      g.add(mesh(S(0.17), color, [0.32, 0.12, 0]));
      for (const s of [1, -1]) g.add(mesh(K(0.04, 0.16, 5), accent, [0.28, 0.3, s * 0.08], [1, 1, 1], [s * 0.3, 0, 0.3]));
      eyes(g, 0.43, 0.15, 0.07, 0.05, '#ffd60a');
      wings(accent, 0.12, 0.25);
      g.add(mesh(K(0.06, 0.3, 5), color, [-0.38, -0.04, 0], [1, 1, 1], [0, 0, Math.PI / 2 + 0.3]));
      break;
    case 'phoenix':
      g.add(mesh(S(0.23), color, [0, 0, 0], [1, 1, 1], [0, 0, 0], 0.8));
      g.add(mesh(K(0.07, 0.16, 6), accent, [0.26, 0.02, 0], [1, 1, 1], [0, 0, -Math.PI / 2], 0.6));
      for (let i = 0; i < 3; i++) g.add(mesh(K(0.06, 0.3, 6), accent, [-0.05 - i * 0.06, 0.25, (i - 1) * 0.08], [1, 1, 1], [0, 0, 0.4], 1));
      wings(accent, 0.05, 0.3, 0.9);
      eyes(g, 0.19, 0.07, 0.09, 0.05);
      break;
    case 'fifi':
    default:
      g.add(mesh(O(0.3), color, [0, 0, 0], [1, 1, 1], [0, 0, 0], 0.7));
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 5), accent, [0, 0.3, 0], [1, 1, 1], [0, 0, 0], 0.8));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(K(0.04, 0.12, 4), accent, [Math.cos(a) * 0.16, 0.4, Math.sin(a) * 0.16], [1, 1, 1], [0, 0, 0], 0.8)); }
      eyes(g, 0.2, 0.04, 0.1, 0.08, '#7209b7');
      break;
  }
  return g;
}

/** Per-frame animation: bobbing, flapping wings, spinning rotors, orbiting shards. */
export function animatePet(g: THREE.Group, t: number) {
  for (const c of g.children) {
    if (c.userData.wing) c.rotation.x = c.userData.wing * (1.2 + Math.sin(t * 14) * 0.5);
    if (c.userData.spin) c.rotation.y += 0.6;
    if (c.userData.orbit !== undefined) { const a = c.userData.orbit + t * 2; c.position.set(Math.cos(a) * 0.45, Math.sin(t * 3 + c.userData.orbit) * 0.1, Math.sin(a) * 0.45); }
  }
}
