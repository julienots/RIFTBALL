import * as THREE from 'three';
import { toon, radialTexture } from './Toon';

/**
 * 3D lobby backdrop (menus): sky dome, giant swirling Rift portal, floating islands with crystals,
 * stadium arches with banners and seasonal scenery (volcano, winter, jungle, neon city).
 * Built procedurally, ~40 draw calls, animated by `update`.
 */
export type LobbyKind = 'embers' | 'snow' | 'leaves' | 'neon' | 'stars' | 'fiesta';

const NOISE = `
  float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
  float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;
const SKY_VS = `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
/** Sky dome: 3-stop gradient, drifting nebula clouds, horizon haze, two layers of twinkling stars (HDR: they bloom). */
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform float stars; uniform float time; varying vec3 vP;
  ${NOISE}
  void main(){
    vec3 d = normalize(vP); float y = d.y;
    vec3 c = y > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, y)) : mix(low, mid, smoothstep(-0.2, 0.12, y));
    float n = fbm(d * 2.6 + vec3(0.0, time * 0.012, 0.0)), n2 = fbm(d * 5.5 - vec3(time * 0.02, 0.0, 0.0));
    float neb = smoothstep(0.42, 0.8, n) * smoothstep(-0.05, 0.35, y);
    c += mix(low, mid * 1.6, n2) * neb * 0.7;
    c += low * exp(-abs(y - 0.02) * 6.0) * 0.55;
    vec3 q = floor(d * 190.0); float h1 = h(q);
    float s = step(0.9968, h1) * (0.55 + 0.45 * sin(time * 2.0 + h1 * 40.0));
    vec3 q2 = floor(d * 95.0); float h2 = h(q2 + 7.0);
    s += step(0.9982, h2) * 2.2 * (0.6 + 0.4 * sin(time * 1.3 + h2 * 30.0));
    c += vec3(s) * stars * smoothstep(0.05, 0.45, y) * (1.0 - neb * 0.6) * 2.4;
    gl_FragColor = vec4(c, 1.0);
  }`;
const PORTAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
/** Rift portal: turbulent spiral arms, white-hot HDR core, bright rim. */
const PORTAL_FS = `uniform float time; uniform vec3 c1; uniform vec3 c2; varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float tw = time * 0.5 + (1.0 - r) * 4.5;
    vec2 sp = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * p * 2.0;
    float n = fbm(vec3(sp * 3.2, time * 0.25));
    float arms = sin(a * 5.0 - r * 12.0 + time * 2.2 + n * 5.0) * 0.5 + 0.5;
    vec3 col = mix(c2, c1, clamp(arms * 0.65 + n * 0.5, 0.0, 1.0)) * (0.45 + 0.9 * n);
    col += vec3(1.0, 0.97, 0.92) * pow(1.0 - r, 2.6) * 1.5;
    col += c1 * smoothstep(0.72, 1.0, r) * 0.7;
    float alpha = smoothstep(1.0, 0.9, r);
    gl_FragColor = vec4(col, alpha);
  }`;
/** Holographic stage floor: rings pulsing outwards + radial spokes around the pedestal (additive). */
const STAGE_FS = `uniform float time; uniform vec3 color; uniform vec3 color2; varying vec2 vUv;
  void main(){
    vec2 p = (vUv - 0.5) * 2.0; float r = length(p) * 14.0; float a = atan(p.y, p.x);
    float rings = smoothstep(0.9, 1.0, sin(r * 2.4 - time * 1.6) * 0.5 + 0.5);
    float spokes = smoothstep(0.975, 1.0, cos(a * 24.0)) * smoothstep(0.5, 1.0, sin(r * 1.2 - time * 2.4) * 0.5 + 0.5);
    float dash = step(0.5, fract(a * 9.0 / 3.14159 + time * 0.08)) * smoothstep(0.06, 0.0, abs(r - 2.75));
    float fade = smoothstep(14.0, 2.5, r) * smoothstep(1.75, 2.3, r);
    vec3 c = mix(color, color2, sin(r * 0.6 - time) * 0.5 + 0.5) * (rings * 0.22 + spokes * 0.4) * fade + color2 * dash * 1.1;
    gl_FragColor = vec4(c, 1.0);
  }`;
/** Volumetric light cone: brightest where you look through the most "fog", soft towards the silhouette. */
const BEAM_VS = `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const BEAM_FS = `uniform vec3 color; uniform float intensity; varying vec3 vN; varying vec3 vV; varying float vY;
  void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.4); float a = f * smoothstep(0.0, 0.2, vY) * smoothstep(1.0, 0.25, vY); gl_FragColor = vec4(color * a * intensity, 1.0); }`;

interface Theme { top: string; mid: string; low: string; stars: number; ground: string; ground2: string; rock: string; crystal: string; portal1: string; portal2: string; banner: string; arch: string }
const THEMES: Record<LobbyKind, Theme> = {
  embers: { top: '#1a0508', mid: '#5c1a1b', low: '#ff6b35', stars: 0.4, ground: '#3a1a14', ground2: '#ff4800', rock: '#2b1d1d', crystal: '#ff9f1c', portal1: '#ffd166', portal2: '#ff3d00', banner: '#ff6b35', arch: '#3d2c2e' },
  snow: { top: '#0b132b', mid: '#1b3a6b', low: '#8ecae6', stars: 1, ground: '#dbe9f4', ground2: '#4cc9f0', rock: '#8da9c4', crystal: '#a2d2ff', portal1: '#caf0f8', portal2: '#4361ee', banner: '#4cc9f0', arch: '#5c7aa3' },
  leaves: { top: '#081c15', mid: '#1b4332', low: '#95d5b2', stars: 0.3, ground: '#2d6a4f', ground2: '#ffd166', rock: '#6c584c', crystal: '#80ed99', portal1: '#d8f3dc', portal2: '#2d6a4f', banner: '#ffb703', arch: '#7f5539' },
  neon: { top: '#05000f', mid: '#2a0845', low: '#f72585', stars: 1, ground: '#10002b', ground2: '#4cc9f0', rock: '#240046', crystal: '#f72585', portal1: '#4cc9f0', portal2: '#f72585', banner: '#f72585', arch: '#3c096c' },
  fiesta: { top: '#0d0221', mid: '#3c096c', low: '#ff4ecd', stars: 0.8, ground: '#1b0636', ground2: '#ffd60a', rock: '#2b0a4a', crystal: '#00f5d4', portal1: '#ffd60a', portal2: '#ff4ecd', banner: '#ff4ecd', arch: '#3c096c' },
  stars: { top: '#10002b', mid: '#3c096c', low: '#7b61ff', stars: 1, ground: '#2a1a5e', ground2: '#b388ff', rock: '#3c2a5e', crystal: '#c77dff', portal1: '#e0aaff', portal2: '#5a189a', banner: '#7b61ff', arch: '#4a3a7a' },
};

const beamMat = (color: string, intensity: number) => new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: intensity } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
const own = <T extends THREE.Object3D>(o: T) => { o.traverse((x) => { x.userData.ownMat = true; }); return o; };

export class LobbyScene {
  readonly group = new THREE.Group();
  private sky: THREE.ShaderMaterial;
  private portal: THREE.ShaderMaterial;
  private portalRing: THREE.Mesh;
  private islands: { o: THREE.Object3D; y: number; p: number }[] = [];
  private spinners: THREE.Object3D[] = [];
  private waves: THREE.Mesh[] = [];
  private blinkers: THREE.MeshStandardMaterial[] = [];
  private tiles: THREE.MeshBasicMaterial[] = [];
  private beams: THREE.Mesh[] = [];
  private disco: THREE.Object3D | null = null;
  private stage: THREE.ShaderMaterial;
  private rig: { o: THREE.Object3D; i: number }[] = [];
  private bokeh: THREE.Points;
  readonly theme: Theme;

  constructor(readonly kind: LobbyKind) {
    const T = THEMES[kind] ?? THEMES.stars;
    const g = this.group;
    this.theme = T;
    // sky dome
    this.sky = new THREE.ShaderMaterial({ uniforms: { top: { value: new THREE.Color(T.top) }, mid: { value: new THREE.Color(T.mid) }, low: { value: new THREE.Color(T.low) }, stars: { value: T.stars }, time: { value: 0 } }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
    g.add(own(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), this.sky)));
    // ground: big disc + glowing rings + tile ring
    // polished stage floor (reflects the season sky); the hole under the pedestal lets its mirror image show through
    const ground = new THREE.Mesh(new THREE.RingGeometry(1.3, 40, 72, 6), toon(T.ground, { roughness: 0.24, metalness: 0.55 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.56; ground.receiveShadow = true; g.add(own(ground));
    this.stage = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, color: { value: new THREE.Color(T.ground2) }, color2: { value: new THREE.Color(T.portal1) } }, vertexShader: PORTAL_VS, fragmentShader: STAGE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), this.stage);
    holo.rotation.x = -Math.PI / 2; holo.position.y = -0.548; g.add(own(holo));
    // raised steps around the pedestal with a glowing lip
    for (const [r, hgt] of [[3.05, 0.1], [2.45, 0.2]] as const) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.12, hgt, 64, 1, true), toon(T.arch, { roughness: 0.35, metalness: 0.6 }));
      step.position.y = -0.56 + hgt / 2; g.add(own(step));
      const cap = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r, 64), toon(T.arch, { roughness: 0.3, metalness: 0.6 }));
      cap.rotation.x = -Math.PI / 2; cap.position.y = -0.56 + hgt; cap.receiveShadow = true; g.add(own(cap));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 96), toon(T.ground2, { emissive: T.ground2, emissiveIntensity: 1.5 }));
      lip.rotation.x = Math.PI / 2; lip.position.y = -0.56 + hgt; g.add(own(lip));
    }
    for (const [r0, r1, o] of [[2.2, 2.32, 0.9], [3.4, 3.48, 0.6], [5.2, 5.26, 0.4]] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), new THREE.MeshBasicMaterial({ color: T.ground2, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -0.54; g.add(own(ring)); this.spinners.push(ring);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.5), i % 3 === 0 ? toon(T.ground2, { emissive: T.ground2, emissiveIntensity: 1.3 }) : toon(i % 2 ? T.arch : T.ground, { roughness: 0.4, metalness: 0.4 }));
      tile.position.set(Math.cos(a) * 4.3, -0.5, Math.sin(a) * 4.3); tile.rotation.y = -a; tile.castShadow = true; g.add(own(tile));
    }
    // giant Rift portal in the sky
    this.portal = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(T.portal1) }, c2: { value: new THREE.Color(T.portal2) } }, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS, transparent: true, depthWrite: false, fog: false });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), this.portal);
    disc.position.set(0, 6.1, -18); g.add(own(disc));
    this.portalRing = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.26, 12, 64), toon(T.portal1, { emissive: T.portal1, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.6 }));
    this.portalRing.position.copy(disc.position); g.add(own(this.portalRing));
    // carved outer frame + four anchor pylons holding the portal
    const frame = new THREE.Mesh(new THREE.TorusGeometry(4.95, 0.2, 8, 8), toon(T.arch, { roughness: 0.45, metalness: 0.5 }));
    frame.position.copy(disc.position); frame.position.z -= 0.25; frame.rotation.z = Math.PI / 8; g.add(own(frame));
    // light pouring out of the portal towards the stage
    for (const [rx, len, rad, k] of [[1.05, 15, 4.6, 0.07], [1.2, 13, 2.6, 0.1]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 32, 1, true), beamMat(T.portal1, k));
      cone.geometry.translate(0, -len / 2, 0); cone.position.copy(disc.position); cone.rotation.x = -rx; g.add(own(cone));
    }
    // stage lighting rig: slow sweeping volumetric beams behind the hero
    for (let i = 0; i < 6; i++) {
      const holder = new THREE.Group();
      const sx = i % 2 ? 1 : -1, row = i >> 1;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 + row * 0.4, 22, 20, 1, true), beamMat(i % 3 === 0 ? T.crystal : i % 3 === 1 ? T.portal1 : T.ground2, 0.13));
      cone.geometry.translate(0, -11, 0); cone.rotation.x = Math.PI;
      holder.add(cone); holder.position.set(sx * (4.5 + row * 3.6), -0.5, -7 - row * 3.5);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.5, 12), toon(T.arch, { roughness: 0.4, metalness: 0.6 })); lamp.position.copy(holder.position); lamp.position.y += 0.1; g.add(own(lamp));
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.portal1).multiplyScalar(1.6) })); lens.rotation.x = -Math.PI / 2; lens.position.copy(lamp.position); lens.position.y += 0.26; g.add(own(lens));
      g.add(own(holder)); this.rig.push({ o: holder, i });
    }
    // out-of-focus light orbs drifting in front of the camera
    {
      const n = 26, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 9; pos[i * 3 + 1] = 0.2 + Math.abs(Math.sin(i * 78.233) * 43758.5453 % 1) * 4.2; pos[i * 3 + 2] = 1.5 + Math.abs(Math.sin(i * 45.164) * 43758.5453 % 1) * 4;
        c.set([T.portal1, T.crystal, T.ground2][i % 3]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.bokeh = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.34, map: radialTexture('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'), vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.bokeh.frustumCulled = false; g.add(own(this.bokeh));
    }
    for (let i = 0; i < 8; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 0.8 }));
      shard.userData.orbit = (i / 8) * Math.PI * 2; shard.userData.r = 5.3; shard.userData.c = disc.position.clone();
      g.add(own(shard)); this.spinners.push(shard);
    }
    const light = new THREE.PointLight(T.portal1, 26, 34, 1.6); light.position.set(0, 5, -12); g.add(light);
    // floating islands with crystals
    const spots: [number, number, number, number][] = [[-7.5, 2.6, -9, 1.2], [7.8, 3.4, -10, 1.4], [-11, 5, -15, 1.6], [11.5, 6.2, -17, 1.8], [-4.5, 7.5, -20, 1.2], [5, 1.4, -6.5, 0.8]];
    spots.forEach(([x, y, z, s], i) => {
      const isl = new THREE.Group();
      isl.add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.2, 0.5, 9), toon(T.ground)));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.03, 6, 36), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 2 })); halo.rotation.x = Math.PI / 2; halo.position.y = 0.26; isl.add(halo);
      const under = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 9), toon(T.rock)); under.position.y = -1.35; under.rotation.x = Math.PI; isl.add(under);
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (k % 2) * 0.12, 0), toon(T.crystal, { emissive: T.crystal, emissiveIntensity: 1.8, roughness: 0.15 })); c.position.set(-0.5 + k * 0.5, 0.55 + (k % 2) * 0.2, (k - 1) * 0.3); c.scale.set(0.7, 1.7, 0.7); isl.add(c); }
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
        this.blinkers.push(stripe as THREE.MeshStandardMaterial);
      }
      for (let i = -6; i <= 6; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 40), new THREE.MeshBasicMaterial({ color: '#f72585', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); l.rotation.x = -Math.PI / 2; l.position.set(i * 3, -0.53, -14); g.add(own(l)); }
    } else if (this.kind === 'fiesta') {
      // light-up dance floor (each tile has its own colour material, animated in update)
      const cols = ['#ff4ecd', '#ffd60a', '#00f5d4', '#4cc9f0', '#9d4edd'];
      for (let ix = -5; ix <= 5; ix++) for (let iz = 0; iz < 7; iz++) {
        if (Math.abs(ix) < 2 && iz < 2) continue; // keep the hero pedestal clear
        const mat = new THREE.MeshBasicMaterial({ color: cols[(ix + iz + 10) % cols.length], transparent: true, opacity: 0.5 });
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), mat);
        tile.rotation.x = -Math.PI / 2; tile.position.set(ix * 1.65, -0.535, 1 - iz * 1.65); tile.userData.k = ix * 0.7 + iz * 1.3;
        g.add(own(tile)); this.tiles.push(mat);
      }
      // DJ stage with speaker stacks in the back
      const stage = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 4), toon('#240046')); stage.position.set(0, 0, -15); g.add(own(stage));
      const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 1.4), toon('#10002b')); deck.position.set(0, 1.1, -14.4); g.add(own(deck));
      for (const sx of [-1, 1]) {
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), toon('#111111')); plat.position.set(sx * 1, 1.64, -14.4); g.add(own(plat)); this.spinners.push(plat);
        for (let k = 0; k < 3; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 1.6), toon('#1b1b2f')); sp.position.set(sx * 5.5, 1.55 + k * 1.95, -15); g.add(own(sp));
          for (const dy of [-0.4, 0.45]) { const cone = new THREE.Mesh(new THREE.CylinderGeometry(dy < 0 ? 0.6 : 0.35, dy < 0 ? 0.6 : 0.35, 0.1, 20), toon('#2b2d42')); cone.rotation.x = Math.PI / 2; cone.position.set(sx * 5.5, sp.position.y + dy, -14.15); cone.userData.pump = k + dy; g.add(own(cone)); this.waves.push(cone); }
        }
      }
      // giant disco ball over the portal
      const ball = new THREE.Group();
      ball.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), new THREE.MeshStandardMaterial({ color: '#e0e1dd', metalness: 0.9, roughness: 0.15, flatShading: true, emissive: '#3c096c', emissiveIntensity: 0.6 })));
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 6), toon('#adb5bd')); rope.position.y = 4.6; ball.add(rope);
      ball.position.set(0, 11, -12); g.add(own(ball)); this.disco = ball;
      for (const [x, c] of [[-3, '#ffffff'], [3, '#ffd60a']] as const) { const l = new THREE.PointLight(c, 10, 20, 1.5); l.position.set(x, 9, -10); g.add(l); }
      // sweeping stage light beams
      for (let i = 0; i < 6; i++) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.geometry.translate(0, -8, 0);
        const holder = new THREE.Group(); holder.position.set((i - 2.5) * 4, 0.8, -15); holder.add(beam); beam.rotation.x = Math.PI; holder.userData.beam = i;
        g.add(own(holder)); this.beams.push(holder as unknown as THREE.Mesh);
      }
      // city skyline with balloons
      for (let i = 0; i < 12; i++) { const h = 5 + Math.abs(rnd(i)) * 9; const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3), toon('#1b0636')); b.position.set((i - 5.5) * 5, h / 2 - 0.6, -30 - Math.abs(rnd(i + 3)) * 6); g.add(own(b)); }
      for (let i = 0; i < 10; i++) { const bl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), toon(cols[i % cols.length])); bl.position.set((i - 4.5) * 2.6, 6 + Math.abs(rnd(i + 11)) * 4, -9 - Math.abs(rnd(i)) * 6); bl.scale.y = 1.2; bl.userData.balloon = i; g.add(own(bl)); this.waves.push(bl); }
    } else {
      for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.SphereGeometry(1.5 + i, 20, 14), toon(['#7b61ff', '#c77dff', '#4cc9f0', '#ff70a6'][i])); pl.position.set((i - 1.5) * 12, 10 + i * 2, -34); g.add(own(pl)); }
    }
  }

  update(t: number, dt: number) {
    this.sky.uniforms.time.value = t;
    this.portal.uniforms.time.value = t;
    this.stage.uniforms.time.value = t;
    for (const b of this.rig) { b.o.rotation.z = Math.sin(t * 0.35 + b.i * 1.7) * 0.42; b.o.rotation.x = -0.18 + Math.sin(t * 0.27 + b.i * 0.9) * 0.2; }
    const bp = this.bokeh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) { bp.setY(i, bp.getY(i) + dt * (0.05 + (i % 5) * 0.012)); if (bp.getY(i) > 4.6) bp.setY(i, 0.1); bp.setX(i, bp.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05); }
    bp.needsUpdate = true;
    this.portalRing.rotation.z = t * 0.15;
    for (const it of this.islands) { it.o.position.y = it.y + Math.sin(t * 0.7 + it.p) * 0.35; it.o.rotation.y += dt * 0.08; }
    for (const s of this.spinners) {
      if (s.userData.orbit !== undefined) { const a = s.userData.orbit + t * 0.4; const c = s.userData.c as THREE.Vector3; s.position.set(c.x + Math.cos(a) * s.userData.r, c.y + Math.sin(a) * s.userData.r, c.z + 0.3); s.rotation.y += dt * 2; }
      else if (s instanceof THREE.Mesh && s.geometry.type === 'RingGeometry') s.rotation.z += dt * 0.2;
      else s.rotation.y += dt * 1.5;
    }
    for (const w of this.waves) {
      if (w.userData.aurora !== undefined) { w.position.x = Math.sin(t * 0.2 + w.userData.aurora) * 4; (w.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 0.8 + w.userData.aurora * 2); }
      else if (w.userData.pump !== undefined) w.scale.setScalar(1 + Math.max(0, Math.sin(t * 13.6 + w.userData.pump)) * 0.18);
      else if (w.userData.balloon !== undefined) w.position.y += Math.sin(t * 1.2 + w.userData.balloon) * 0.004;
      else w.rotation.x = Math.sin(t * 2 + w.position.x) * 0.06;
    }
    // fiesta: beat-synced floor, sweeping beams, spinning disco ball
    const beat = Math.floor(t * 2.15);
    for (let i = 0; i < this.tiles.length; i++) this.tiles[i].opacity = ((i * 7 + beat) % 5 === 0 ? 0.85 : 0.25) + 0.1 * Math.sin(t * 4 + i);
    for (const b of this.beams) { const i = b.userData.beam as number; b.rotation.z = Math.sin(t * 0.9 + i * 1.1) * 0.55; b.rotation.x = -0.35 + Math.sin(t * 0.7 + i) * 0.25; }
    if (this.disco) this.disco.rotation.y += dt * 0.6;
    for (const b of this.blinkers) b.emissiveIntensity = 1.2 + Math.sin(t * 6 + b.id) * 0.4;
  }

  dispose() {
    // toon() materials are shared (cache): only geometries and our own shader/basic materials are freed
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && !mat.userData.cached) mat.dispose(); });
    for (const b of this.blinkers) b.dispose();
  }
}
