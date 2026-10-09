import * as THREE from 'three';
import { toon } from './Toon';

/**
 * 3D lobby backdrop (menus): sky dome, giant swirling Rift portal, floating islands with crystals,
 * stadium arches with banners and seasonal scenery (volcano, winter, jungle, neon city).
 * Built procedurally, ~40 draw calls, animated by `update`.
 */
export type LobbyKind = 'embers' | 'snow' | 'leaves' | 'neon' | 'stars';

const SKY_VS = `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform float stars; uniform float time; varying vec3 vP;
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
  void main(){
    float y = vP.y;
    vec3 c = y > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, y)) : mix(low, mid, smoothstep(-0.2, 0.12, y));
    vec3 q = floor(vP * 220.0);
    float s = step(0.996, h(q)) * stars * smoothstep(0.1, 0.5, y) * (0.6 + 0.4 * sin(time * 2.0 + h(q) * 30.0));
    gl_FragColor = vec4(c + vec3(s), 1.0);
  }`;
const PORTAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const PORTAL_FS = `uniform float time; uniform vec3 c1; uniform vec3 c2; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float sw = sin(a * 5.0 - r * 12.0 + time * 2.2) * 0.5 + 0.5;
    float sw2 = sin(a * 3.0 + r * 8.0 - time * 1.4) * 0.5 + 0.5;
    vec3 col = mix(c2, c1, sw * 0.7 + sw2 * 0.3);
    col += vec3(1.0) * pow(1.0 - r, 3.0) * 0.9;
    float alpha = smoothstep(1.0, 0.85, r) * (0.75 + 0.25 * sw);
    gl_FragColor = vec4(col, alpha);
  }`;

interface Theme { top: string; mid: string; low: string; stars: number; ground: string; ground2: string; rock: string; crystal: string; portal1: string; portal2: string; banner: string; arch: string }
const THEMES: Record<LobbyKind, Theme> = {
  embers: { top: '#1a0508', mid: '#5c1a1b', low: '#ff6b35', stars: 0.4, ground: '#3a1a14', ground2: '#ff4800', rock: '#2b1d1d', crystal: '#ff9f1c', portal1: '#ffd166', portal2: '#ff3d00', banner: '#ff6b35', arch: '#3d2c2e' },
  snow: { top: '#0b132b', mid: '#1b3a6b', low: '#8ecae6', stars: 1, ground: '#dbe9f4', ground2: '#4cc9f0', rock: '#8da9c4', crystal: '#a2d2ff', portal1: '#caf0f8', portal2: '#4361ee', banner: '#4cc9f0', arch: '#5c7aa3' },
  leaves: { top: '#081c15', mid: '#1b4332', low: '#95d5b2', stars: 0.3, ground: '#2d6a4f', ground2: '#ffd166', rock: '#6c584c', crystal: '#80ed99', portal1: '#d8f3dc', portal2: '#2d6a4f', banner: '#ffb703', arch: '#7f5539' },
  neon: { top: '#05000f', mid: '#2a0845', low: '#f72585', stars: 1, ground: '#10002b', ground2: '#4cc9f0', rock: '#240046', crystal: '#f72585', portal1: '#4cc9f0', portal2: '#f72585', banner: '#f72585', arch: '#3c096c' },
  stars: { top: '#10002b', mid: '#3c096c', low: '#7b61ff', stars: 1, ground: '#2a1a5e', ground2: '#b388ff', rock: '#3c2a5e', crystal: '#c77dff', portal1: '#e0aaff', portal2: '#5a189a', banner: '#7b61ff', arch: '#4a3a7a' },
};

const own = <T extends THREE.Object3D>(o: T) => { o.traverse((x) => { x.userData.ownMat = true; }); return o; };

export class LobbyScene {
  readonly group = new THREE.Group();
  private sky: THREE.ShaderMaterial;
  private portal: THREE.ShaderMaterial;
  private portalRing: THREE.Mesh;
  private islands: { o: THREE.Object3D; y: number; p: number }[] = [];
  private spinners: THREE.Object3D[] = [];
  private waves: THREE.Mesh[] = [];
  private blinkers: THREE.MeshToonMaterial[] = [];

  constructor(readonly kind: LobbyKind) {
    const T = THEMES[kind] ?? THEMES.stars;
    const g = this.group;
    // sky dome
    this.sky = new THREE.ShaderMaterial({ uniforms: { top: { value: new THREE.Color(T.top) }, mid: { value: new THREE.Color(T.mid) }, low: { value: new THREE.Color(T.low) }, stars: { value: T.stars }, time: { value: 0 } }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
    g.add(own(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), this.sky)));
    // ground: big disc + glowing rings + tile ring
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), toon(T.ground));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.56; g.add(own(ground));
    for (const [r0, r1, o] of [[2.2, 2.32, 0.9], [3.4, 3.48, 0.6], [5.2, 5.26, 0.4]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), new THREE.MeshBasicMaterial({ color: T.ground2, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.54; g.add(own(ring)); this.spinners.push(ring);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.5), toon(i % 2 ? T.arch : T.ground));
      tile.position.set(Math.cos(a) * 4.3, -0.5, Math.sin(a) * 4.3); tile.rotation.y = -a; g.add(own(tile));
    }
    // giant Rift portal in the sky
    this.portal = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(T.portal1) }, c2: { value: new THREE.Color(T.portal2) } }, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, transparent: true, depthWrite: false, fog: false });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), this.portal);
    disc.position.set(0, 6.1, -18); g.add(own(disc));
    this.portalRing = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.26, 12, 64), toon(T.portal1, { emissive: T.portal1, emissiveIntensity: 1.2 }));
    this.portalRing.position.copy(disc.position); g.add(own(this.portalRing));
    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 0.8 }));
      shard.userData.orbit = (i / 8) * Math.PI * 2; shard.userData.r = 5.3; shard.userData.c = disc.position.clone();
      g.add(own(shard)); this.spinners.push(shard);
    }
    const light = new THREE.PointLight(T.portal1, 30, 30, 1.6); light.position.set(0, 5, -12); g.add(light);
    // floating islands with crystals
    const spots: [number, number, number, number][] = [[-7.5, 2.6, -9, 1.2], [7.8, 3.4, -10, 1.4], [-11, 5, -15, 1.6], [11.5, 6.2, -17, 1.8], [-4.5, 7.5, -20, 1.2], [5, 1.4, -6.5, 0.8]];
    spots.forEach(([x, y, z, s], i) => {
      const isl = new THREE.Group();
      isl.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.2, 0.5, 9), toon(T.ground)));
      const under = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 9), toon(T.rock)); under.position.y = -1.35; under.rotation.x = Math.PI; isl.add(under);
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (k % 2) * 0.12, 0), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 0.9 })); c.position.set(-0.5 + k * 0.5, 0.55 + (k % 2) * 0.2, (k - 1) * 0.3); c.scale.set(0.7, 1.7, 0.7); isl.add(c); }
      this.decorIsland(isl, T, i);
      isl.position.set(x, y, z); isl.scale.setScalar(s);
      g.add(own(isl)); this.islands.push({ o: isl, y, p: i * 1.3 });
    });
    // stadium arches + banners on both sides
    for (const sx of [-1, 1]) {
      const arch = new THREE.Group();
      for (const dz of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), toon(T.arch)); p.position.set(0, 2, dz); arch.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 2.6), toon(T.arch)); top.position.y = 4.7; arch.add(top);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 1 })); gem.position.y = 5.4; arch.add(gem); this.spinners.push(gem);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8, 1, 8), toon(T.banner)); banner.position.set(0.4 * -sx, 2.8, 0); banner.rotation.y = sx * Math.PI / 2; arch.add(banner); this.waves.push(banner);
      arch.position.set(sx * 6.4, -0.5, -3.5); arch.rotation.y = sx * 0.35;
      g.add(own(arch));
    }
    this.scenery(T);
  }

  private decorIsland(isl: THREE.Group, T: Theme, i: number) {
    if (this.kind === 'leaves' && i % 2 === 0) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 6), toon('#7f5539')); trunk.position.set(0.5, 1, 0.2); isl.add(trunk); for (let k = 0; k < 5; k++) { const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.3), toon('#52b788')); const a = (k / 5) * Math.PI * 2; leaf.position.set(0.5 + Math.cos(a) * 0.4, 1.8, 0.2 + Math.sin(a) * 0.4); leaf.rotation.set(0, -a, -0.4); isl.add(leaf); } }
    if (this.kind === 'snow') { const snow = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.12, 9), toon('#ffffff')); snow.position.y = 0.3; isl.add(snow); }
    if (this.kind === 'neon') { const n = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.04, 6, 24), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 1.4 })); n.rotation.x = Math.PI / 2; n.position.y = 0.27; isl.add(n); }
  }

  private scenery(T: Theme) {
    const g = this.group;
    const rnd = (i: number) => (Math.sin(i * 91.7) * 43758.5453) % 1;
    if (this.kind === 'embers') {
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * 9 + rnd(i) * 3, h = 6 + Math.abs(rnd(i + 3)) * 6;
        const v = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.abs(rnd(i)) * 2, h, 7), toon('#2b1416')); v.position.set(x, h / 2 - 0.6, -26 - Math.abs(rnd(i + 9)) * 6); g.add(own(v));
        const lava = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 7), toon('#ff6b35', { emissive: '#ff4800', emissiveIntensity: 1.6 })); lava.position.set(x, h - 0.9, v.position.z); g.add(own(lava));
      }
      for (const sx of [-1, 1]) { const river = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 30), toon('#ff6b35', { emissive: '#ff4800', emissiveIntensity: 1.4 })); river.rotation.x = -Math.PI / 2; river.position.set(sx * 9.5, -0.53, -14); river.rotation.z = sx * 0.25; g.add(own(river)); }
    } else if (this.kind === 'snow') {
      for (let i = 0; i < 8; i++) {
        const x = (i - 3.5) * 8 + rnd(i) * 3, h = 7 + Math.abs(rnd(i + 3)) * 7;
        const m = new THREE.Mesh(new THREE.ConeGeometry(4.5, h, 6), toon('#5c7aa3')); m.position.set(x, h / 2 - 0.6, -28 - Math.abs(rnd(i + 5)) * 5); g.add(own(m));
        const cap = new THREE.Mesh(new THREE.ConeGeometry(4.5 * 0.38, h * 0.38, 6), toon('#ffffff')); cap.position.set(x, h - 0.6 - h * 0.19, m.position.z); g.add(own(cap));
      }
      for (let i = 0; i < 10; i++) { const sx = i % 2 ? 1 : -1; const tree = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 7), toon('#1b4332')); tree.position.set(sx * (8 + (i >> 1) * 1.6), 0.7, -6 - (i >> 1) * 3); g.add(own(tree)); const s = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 7), toon('#ffffff')); s.position.set(tree.position.x, 1.75, tree.position.z); g.add(own(s)); }
      for (let i = 0; i < 3; i++) { const a = new THREE.Mesh(new THREE.PlaneGeometry(40, 5, 24, 1), new THREE.MeshBasicMaterial({ color: ['#80ffdb', '#4cc9f0', '#b5179e'][i], transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); a.position.set(0, 13 + i * 2.2, -30 - i * 3); a.userData.aurora = i; g.add(own(a)); this.waves.push(a); }
    } else if (this.kind === 'leaves') {
      for (let i = 0; i < 9; i++) { const sx = i % 2 ? 1 : -1; const z = -5 - (i >> 1) * 3.2; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4, 7), toon('#7f5539')); trunk.position.set(sx * (8 + (i % 3)), 1.4, z); trunk.rotation.z = sx * 0.12; g.add(own(trunk)); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.6), toon(k % 2 ? '#52b788' : '#2d6a4f')); leaf.position.set(trunk.position.x + Math.cos(a) * 0.9, 3.4, z + Math.sin(a) * 0.9); leaf.rotation.set(0, -a, -0.45); g.add(own(leaf)); } }
      for (let i = 0; i < 5; i++) { const ruin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3 + (i % 3) * 1.5, 1.6), toon('#b08968')); ruin.position.set((i - 2) * 6, 1, -24 - (i % 2) * 4); g.add(own(ruin)); const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2), toon('#7f5539')); cap.position.set(ruin.position.x, ruin.position.y + (3 + (i % 3) * 1.5) / 2 + 0.2, ruin.position.z); g.add(own(cap)); }
    } else if (this.kind === 'neon') {
      for (let i = 0; i < 14; i++) {
        const h = 4 + Math.abs(rnd(i)) * 12, x = (i - 7) * 4.2 + rnd(i + 2) * 1.5;
        const b = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), toon('#140021')); b.position.set(x, h / 2 - 0.6, -24 - Math.abs(rnd(i + 7)) * 8); g.add(own(b));
        const stripe = toon(i % 2 ? '#4cc9f0' : '#f72585', { emissive: i % 2 ? '#4cc9f0' : '#f72585', emissiveIntensity: 1.5 }).clone(); // animated: own copy
        for (let k = 1; k < h / 2; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.05), stripe); w.position.set(x, k * 2 - 0.6, b.position.z + 1.53); g.add(own(w)); }
        this.blinkers.push(stripe as THREE.MeshToonMaterial);
      }
      for (let i = -6; i <= 6; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 40), new THREE.MeshBasicMaterial({ color: '#f72585', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); l.rotation.x = -Math.PI / 2; l.position.set(i * 3, -0.53, -14); g.add(own(l)); }
    } else {
      for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.SphereGeometry(1.5 + i, 20, 14), toon(['#7b61ff', '#c77dff', '#4cc9f0', '#ff70a6'][i])); pl.position.set((i - 1.5) * 12, 10 + i * 2, -34); g.add(own(pl)); }
    }
  }

  update(t: number, dt: number) {
    this.sky.uniforms.time.value = t;
    this.portal.uniforms.time.value = t;
    this.portalRing.rotation.z = t * 0.15;
    for (const it of this.islands) { it.o.position.y = it.y + Math.sin(t * 0.7 + it.p) * 0.35; it.o.rotation.y += dt * 0.08; }
    for (const s of this.spinners) {
      if (s.userData.orbit !== undefined) { const a = s.userData.orbit + t * 0.4; const c = s.userData.c as THREE.Vector3; s.position.set(c.x + Math.cos(a) * s.userData.r, c.y + Math.sin(a) * s.userData.r, c.z + 0.3); s.rotation.y += dt * 2; }
      else if (s instanceof THREE.Mesh && s.geometry.type === 'RingGeometry') s.rotation.z += dt * 0.2;
      else s.rotation.y += dt * 1.5;
    }
    for (const w of this.waves) {
      if (w.userData.aurora !== undefined) { w.position.x = Math.sin(t * 0.2 + w.userData.aurora) * 4; (w.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 0.8 + w.userData.aurora * 2); }
      else w.rotation.x = Math.sin(t * 2 + w.position.x) * 0.06;
    }
    for (const b of this.blinkers) b.emissiveIntensity = 1.2 + Math.sin(t * 6 + b.id) * 0.4;
  }

  dispose() {
    // toon() materials are shared (cache): only geometries and our own shader/basic materials are freed
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && !(mat as any).isMeshToonMaterial) mat.dispose(); });
    for (const b of this.blinkers) b.dispose();
  }
}
