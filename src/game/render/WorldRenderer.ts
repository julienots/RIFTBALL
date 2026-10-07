import * as THREE from 'three';
import type { Match } from '../Match';
import type { Hero, MatchEvent, Projectile, RiftEntity, Zone } from '../entities';
import type { Hazard, Wall } from '../../arenas/Arena';
import { QUALITY_PROFILES, type Quality, type QualityProfile } from '../../core/Settings';
import { getMutation } from '../../data/mutations';
import { heroGeometry, makeOutlineMaterial, decoGeometry, makeHeroMaterial, makeHeroOutline, makeHeroUniforms, type HeroAnimUniforms } from './Models';
import { radialTexture, ringTexture, toon, toonGradient } from './Toon';
import { Particles } from './Particles';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/Rng';

export const WS = 0.01; // world scale: sim units -> three units
export const TEAM_COLORS = ['#2f9bff', '#ff3b4e'];

interface HeroView {
  hero: Hero;
  group: THREE.Group;
  body: THREE.Mesh;
  outline: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  outlineMat: THREE.ShaderMaterial;
  u: HeroAnimUniforms;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  shield: THREE.Mesh;
  stun: THREE.Group;
  scale: number;
  px: number; py: number;
  wasAlive: boolean;
  skinKey: string;
}

interface RiftView { beam: THREE.Mesh | null; xray: THREE.Sprite; rift: RiftEntity; group: THREE.Group; core: THREE.Mesh; eyes: THREE.Group; rings: THREE.Mesh[]; aura: THREE.Sprite; shadow: THREE.Mesh; light: THREE.PointLight | null; px: number; py: number }

const RIFT_VS = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RIFT_FS = `uniform float time; uniform vec3 c1; uniform vec3 c2; uniform float mood; varying vec3 vN; varying vec3 vP;
  void main(){
    float fres = pow(1.0 - abs(vN.z), 2.2);
    float swirl = sin(vP.y * 9.0 + time * 4.0 + sin(vP.x * 7.0 + time * 2.0) * 1.5) * 0.5 + 0.5;
    float bands = sin((vP.x + vP.z) * 12.0 - time * 6.0) * 0.5 + 0.5;
    vec3 col = mix(c2, c1, swirl * 0.7 + 0.3);
    col += vec3(1.0) * pow(bands, 6.0) * 0.35;
    col = mix(col, vec3(1.0), fres * 0.8);
    col *= 1.0 + mood * 0.25 * sin(time * 20.0);
    gl_FragColor = vec4(col, 1.0);
  }`;

const SWIRL_FS = `uniform float time; uniform vec3 color; uniform float intensity; varying vec2 vUv;
  void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float a = atan(c.y, c.x);
    float s = sin(a * 3.0 + r * 10.0 - time * 5.0) * 0.5 + 0.5; float edge = smoothstep(1.0, 0.82, r) * smoothstep(0.0, 0.25, r);
    float ring = smoothstep(0.08, 0.0, abs(r - 0.92));
    gl_FragColor = vec4(color * (0.6 + s * 0.8) + ring * 0.5, (s * 0.55 + 0.25) * edge * intensity + ring * intensity); }`;
const UV_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const LAVA_FS = `uniform float time; uniform float active; uniform float warn; varying vec2 vUv;
  void main(){ vec2 p = vUv * 6.0; float n = sin(p.x * 1.7 + time * 1.3) * cos(p.y * 1.9 - time) + sin((p.x + p.y) * 2.3 + time * 2.0) * 0.5;
    vec3 hot = mix(vec3(1.0, 0.25, 0.0), vec3(1.0, 0.85, 0.2), smoothstep(-0.6, 1.0, n));
    vec3 crust = mix(vec3(0.16, 0.08, 0.07), vec3(0.4, 0.12, 0.05), smoothstep(0.3, 1.2, n));
    crust += vec3(0.9, 0.3, 0.0) * warn * (0.5 + 0.5 * sin(time * 18.0));
    vec2 e = min(vUv, 1.0 - vUv); float edge = smoothstep(0.0, 0.06, min(e.x, e.y));
    gl_FragColor = vec4(mix(crust, hot, active), 0.95 * edge + 0.05); }`;

const ICE_FS = `uniform float time; varying vec2 vUv;
  void main(){ float s = pow(sin((vUv.x * 3.0 + vUv.y * 2.0) * 6.2831 + time * 0.8) * 0.5 + 0.5, 12.0);
    vec2 e = min(vUv, 1.0 - vUv); float edge = smoothstep(0.0, 0.04, min(e.x, e.y));
    gl_FragColor = vec4(mix(vec3(0.72, 0.9, 1.0), vec3(1.0), s * 0.8), 0.55 * edge); }`;

/** Three.js 2.5D renderer of a Match: pure view, never mutates the simulation. */
export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  particles!: Particles;
  private q: QualityProfile;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private matchRoot = new THREE.Group();
  private heroViews = new Map<number, HeroView>();
  private riftViews = new Map<number, RiftView>();
  private projViews = new Map<Projectile, THREE.Object3D>();
  private projPool: THREE.Object3D[] = [];
  private zoneViews = new Map<Zone, THREE.Mesh>();
  private zonePool: THREE.Mesh[] = [];
  private wallViews = new Map<Wall, THREE.Mesh>();
  private hazardViews = new Map<Hazard, THREE.Mesh>();
  private bushViews: { rect: { x: number; y: number; w: number; h: number }; mesh: THREE.Mesh }[] = [];
  private shockwaves: { mesh: THREE.Mesh; t: number; dur: number; r0: number; r1: number }[] = [];
  private bolts: { line: THREE.Line; t: number }[] = [];
  private animated: { mat: THREE.ShaderMaterial }[] = [];
  private portalViews: THREE.Group[] = [];
  private aim: THREE.Group;
  private aimLine: THREE.Mesh;
  private aimCircle: THREE.Mesh;
  private camTarget = new THREE.Vector3();
  private shake = 0;
  private time = 0;
  match: Match | null = null;
  viewerTeam: 0 | 1 = 0;
  focusId = -1;
  private tmpV = new THREE.Vector3();
  private projGeo: Record<string, THREE.BufferGeometry> = {};
  private projMats = new Map<string, THREE.Material>();
  private glowTex = radialTexture();
  private dynWallMat: Record<string, THREE.Material> = {};
  quality: Quality;
  // showcase (menus)
  readonly showcase = new THREE.Scene();
  readonly showcaseCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private showcaseHero: THREE.Group | null = null;
  private showcaseKey = '';
  showcaseActive = false;
  showcaseSpin = 0;

  constructor(public canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.q = QUALITY_PROFILES[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'LOW', powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 200);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#5d6b8a', 1.4);
    this.sun = new THREE.DirectionalLight('#fff4dc', 2.2);
    this.sun.position.set(-6, 14, 8);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.matchRoot);
    this.aim = new THREE.Group();
    this.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
    this.aimLine.rotation.x = -Math.PI / 2;
    this.aimCircle = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.aimCircle.rotation.x = -Math.PI / 2;
    this.aim.add(this.aimLine, this.aimCircle);
    this.aim.visible = false;
    this.aim.renderOrder = 5;
    this.scene.add(this.aim);
    this.setupProjectileAssets();
    this.setupShowcase();
    this.applyQuality(quality);
    this.resize();
  }

  applyQuality(q: Quality) {
    this.quality = q;
    this.q = QUALITY_PROFILES[q];
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.maxDpr) * this.q.resolutionScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.mapSize.set(q === 'HIGH' ? 2048 : 1024, q === 'HIGH' ? 2048 : 1024);
      const c = this.sun.shadow.camera;
      c.left = -16; c.right = 16; c.top = 10; c.bottom = -10; c.near = 1; c.far = 40;
      this.sun.shadow.bias = -0.002;
    }
    if (this.particles) { this.scene.remove(this.particles.points); }
    this.particles = new Particles(this.q.maxParticles);
    this.particles.mul = this.q.particleMul;
    this.scene.add(this.particles.points);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a similar horizontal field of view on every screen ratio
    this.camera.fov = THREE.MathUtils.clamp(36 * (1.9 / Math.max(1.2, w / h)), 30, 52);
    this.camera.updateProjectionMatrix();
    this.showcaseCam.aspect = w / h;
    this.showcaseCam.updateProjectionMatrix();
    this.particles?.setScale(h * this.renderer.getPixelRatio() * 0.9);
  }

  // ------------------------------------------------------------------ match setup

  setMatch(m: Match, viewerTeam: 0 | 1, focusId: number) {
    this.clearMatch();
    this.match = m;
    this.viewerTeam = viewerTeam;
    this.focusId = focusId;
    const th = m.arena.data.theme;
    this.scene.background = new THREE.Color(th.border);
    this.scene.fog = new THREE.Fog(th.border, 22, 46);
    this.hemi.color.set(th.light);
    this.hemi.intensity = 0.9 + th.ambient * 0.8;
    this.sun.color.set(th.light);
    this.buildArena(m);
    for (const h of m.heroes) this.ensureHero(h);
    const f = m.heroById(focusId) ?? m.heroes[0];
    if (f) this.camTarget.set(f.x * WS, 0, f.y * WS);
    this.updateCamera(1, true);
  }

  clearMatch() {
    const disposeTree = (o: THREE.Object3D) => o.traverse((c: any) => { if (c.geometry && !c.userData.sharedGeo) c.geometry.dispose?.(); if (c.material && c.userData.ownMat) c.material.dispose?.(); });
    disposeTree(this.matchRoot);
    this.matchRoot.clear();
    this.heroViews.clear(); this.riftViews.clear(); this.projViews.clear(); this.projPool = [];
    this.zoneViews.clear(); this.zonePool = []; this.wallViews.clear(); this.hazardViews.clear(); this.bushViews = [];
    this.shockwaves = []; this.bolts = []; this.animated = []; this.portalViews = [];
    this.particles?.clear();
    this.match = null;
  }

  private buildArena(m: Match) {
    const a = m.arena, th = a.data.theme;
    const W = a.w * WS, H = a.h * WS;
    // outer ground
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, H + 30), toon(th.border));
    outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.02, H / 2);
    outer.receiveShadow = true;
    this.matchRoot.add(outer);
    // floor texture
    const tex = this.floorTexture(m);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }));
    floor.userData.ownMat = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    this.matchRoot.add(floor);
    // raised rim around the arena
    const rimMat = toon(th.wallSide);
    const rimGeo: THREE.BufferGeometry[] = [];
    const rim = (x: number, z: number, w: number, d: number) => { const g = new THREE.BoxGeometry(w, 0.35, d); g.translate(x + w / 2, 0.175, z + d / 2); rimGeo.push(g); };
    rim(-0.4, -0.4, W + 0.8, 0.4); rim(-0.4, H, W + 0.8, 0.4);
    const p0 = a.portals[0];
    rim(-0.4, 0, 0.4, p0.y * WS); rim(-0.4, (p0.y + p0.h) * WS, 0.4, H - (p0.y + p0.h) * WS);
    rim(W, 0, 0.4, p0.y * WS); rim(W, (p0.y + p0.h) * WS, 0.4, H - (p0.y + p0.h) * WS);
    const rimMesh = new THREE.Mesh(mergeGeometries(rimGeo)!, rimMat);
    rimMesh.receiveShadow = true;
    this.matchRoot.add(rimMesh);
    // static walls merged (vertex colored top/sides)
    const wg: THREE.BufferGeometry[] = [];
    const wr = new Rng(5);
    const jitter = (hex: string, amt: number) => { const c = new THREE.Color(hex); const k = 1 + wr.range(-amt, amt); return '#' + c.multiplyScalar(k).getHexString(); };
    for (const w of a.walls) {
      if (w.dynamic || w.border) continue;
      const nx = Math.max(1, Math.round(w.w / 100)), ny = Math.max(1, Math.round(w.h / 100));
      const cw = w.w / nx, ch = w.h / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const hgt = wr.range(0.78, 0.98);
        wg.push(this.wallBox({ x: w.x + i * cw + 3, y: w.y + j * ch + 3, w: cw - 6, h: ch - 6 }, jitter(th.wallTop, 0.06), jitter(th.wallSide, 0.05), hgt));
        // cap stone detail
        wg.push(this.wallBox({ x: w.x + i * cw + 16, y: w.y + j * ch + 16, w: cw - 32, h: ch - 32 }, jitter(th.wallTop, 0.1), th.wallSide, hgt + 0.06));
      }
    }
    if (wg.length) {
      const geo = mergeGeometries(wg)!;
      const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
      mesh.userData.ownMat = true;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.matchRoot.add(mesh);
      const ol = new THREE.Mesh(geo, makeOutlineMaterial(0.025));
      ol.userData.sharedGeo = true;
      this.matchRoot.add(ol);
    }
    // bushes
    const rng = new Rng(7);
    for (const b of a.bushes) {
      const gs: THREE.BufferGeometry[] = [];
      for (let x = b.x + 30; x < b.x + b.w; x += 55) for (let y = b.y + 30; y < b.y + b.h; y += 55) {
        const r = rng.range(0.32, 0.44);
        const g = new THREE.IcosahedronGeometry(r, 1);
        g.scale(1, rng.range(0.75, 1), 1);
        g.translate(x * WS + rng.range(-0.08, 0.08), r * 0.7, y * WS + rng.range(-0.08, 0.08));
        gs.push(g);
      }
      if (!gs.length) continue;
      const mat = new THREE.MeshToonMaterial({ color: th.bush ?? '#2f8f3a', gradientMap: toonGradient(), transparent: true });
      const mesh = new THREE.Mesh(mergeGeometries(gs)!, mat);
      mesh.userData.ownMat = true;
      mesh.castShadow = true;
      this.matchRoot.add(mesh);
      this.bushViews.push({ rect: b, mesh });
    }
    // portals
    for (const p of a.portals) this.portalViews.push(this.buildPortal(p.x * WS, p.y * WS, p.w * WS, p.h * WS, p.team));
    // decoration around the arena
    this.buildDecor(m);
  }

  private wallBox(w: { x: number; y: number; w: number; h: number }, top: string, side: string, height: number) {
    const g = new THREE.BoxGeometry(w.w * WS, height, w.h * WS).toNonIndexed();
    g.translate((w.x + w.w / 2) * WS, height / 2, (w.y + w.h / 2) * WS);
    const n = g.attributes.normal, col = new Float32Array(n.count * 3);
    const ct = new THREE.Color(top), cs = new THREE.Color(side), cd = new THREE.Color(side).multiplyScalar(0.75);
    for (let i = 0; i < n.count; i++) {
      const c = n.getY(i) > 0.5 ? ct : Math.abs(n.getX(i)) > 0.5 ? cd : cs;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  }

  private floorTexture(m: Match) {
    const a = m.arena, th = a.data.theme;
    const px = 40; // pixels per 100 world units
    const c = document.createElement('canvas');
    c.width = Math.round((a.w / 100) * px); c.height = Math.round((a.h / 100) * px);
    const g = c.getContext('2d')!;
    const tiles = 1;
    for (let y = 0; y < c.height / px; y++) for (let x = 0; x < c.width / px; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? th.floorA : th.floorB;
      g.fillRect(x * px * tiles, y * px * tiles, px * tiles, px * tiles);
    }
    // subtle grain
    const rng = new Rng(3);
    g.globalAlpha = 0.08;
    for (let i = 0; i < 900; i++) { g.fillStyle = rng.chance(0.5) ? '#000' : '#fff'; g.fillRect(rng.range(0, c.width), rng.range(0, c.height), rng.range(1, 3), rng.range(1, 3)); }
    g.globalAlpha = 1;
    // team halves tint
    const grdL = g.createLinearGradient(0, 0, c.width * 0.3, 0);
    grdL.addColorStop(0, 'rgba(47,155,255,0.28)'); grdL.addColorStop(1, 'rgba(47,155,255,0)');
    g.fillStyle = grdL; g.fillRect(0, 0, c.width * 0.3, c.height);
    const grdR = g.createLinearGradient(c.width, 0, c.width * 0.7, 0);
    grdR.addColorStop(0, 'rgba(255,59,78,0.28)'); grdR.addColorStop(1, 'rgba(255,59,78,0)');
    g.fillStyle = grdR; g.fillRect(c.width * 0.7, 0, c.width * 0.3, c.height);
    // markings
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(c.width / 2, 0); g.lineTo(c.width / 2, c.height); g.stroke();
    g.beginPath(); g.arc(c.width / 2, c.height / 2, px * 2.2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.arc(c.width / 2, c.height / 2, px * 0.35, 0, Math.PI * 2); g.fill();
    for (const p of a.portals) {
      g.strokeStyle = p.team === 0 ? 'rgba(47,155,255,0.7)' : 'rgba(255,59,78,0.7)';
      const cx = (p.team === 0 ? p.x + p.w : p.x) / 100 * px, cy = (p.y + p.h / 2) / 100 * px;
      g.beginPath(); g.arc(cx, cy, px * 2.4, p.team === 0 ? -Math.PI / 2 : Math.PI / 2, p.team === 0 ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private buildPortal(x: number, z: number, w: number, d: number, team: 0 | 1) {
    const g = new THREE.Group();
    const col = TEAM_COLORS[team];
    const pillarMat = toon('#e9ecef');
    const cx = team === 0 ? x + w * 0.35 : x + w * 0.65;
    for (const zz of [z - 0.15, z + d + 0.15]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.8, 10), pillarMat);
      p.position.set(cx, 0.9, zz); p.castShadow = true; g.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), toon(col, { emissive: col, emissiveIntensity: 0.6 }));
      cap.position.set(cx, 1.9, zz); g.add(cap);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, d + 0.6), toon(col));
    beam.position.set(cx, 1.85, z + d / 2); beam.castShadow = true; g.add(beam);
    const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, color: { value: new THREE.Color(col) }, intensity: { value: 1 } }, vertexShader: UV_VS, fragmentShader: SWIRL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.animated.push({ mat });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(d * 1.05, 1.7), mat);
    disc.userData.ownMat = true;
    disc.position.set(cx, 0.9, z + d / 2); disc.rotation.y = Math.PI / 2;
    g.add(disc);
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, d), new THREE.MeshBasicMaterial({ map: radialTexture(col + 'cc', col + '00'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.set(x + w / 2, 0.02, z + d / 2);
    floorGlow.userData.ownMat = true;
    g.add(floorGlow);
    this.matchRoot.add(g);
    return g;
  }

  private buildDecor(m: Match) {
    const a = m.arena, th = a.data.theme;
    const W = a.w * WS, H = a.h * WS;
    const kinds: Record<string, ('tree' | 'rock' | 'crystal' | 'pillar' | 'icepillar' | 'lavarock' | 'beacon' | 'palm' | 'ruin')[]> = {
      none: ['tree', 'tree', 'rock', 'crystal'], lava_cycle: ['lavarock', 'lavarock', 'crystal', 'rock'], ice: ['icepillar', 'icepillar', 'rock', 'crystal'],
      void_portals: ['beacon', 'crystal', 'beacon', 'rock'], jungle: ['palm', 'ruin', 'tree', 'palm'],
    };
    const list = kinds[a.data.special] ?? kinds.none;
    const rng = new Rng(11);
    const gs: THREE.BufferGeometry[] = [];
    const place = (x: number, z: number) => {
      const k = rng.pick(list);
      const g = decoGeometry(k, th.accent, k === 'tree' || k === 'palm' ? (th.bush ?? '#2f8f3a') : th.wallSide);
      const s = rng.range(0.8, 1.5);
      g.scale(s, s, s); g.rotateY(rng.range(0, Math.PI * 2)); g.translate(x, 0, z);
      gs.push(g);
    };
    for (let x = -1.5; x < W + 1.5; x += rng.range(1.2, 2.2)) { place(x, -1.2 - rng.range(0, 1.6)); place(x, H + 1.2 + rng.range(0, 1.6)); }
    for (let z = -1; z < H + 1; z += rng.range(1.4, 2.4)) {
      if (Math.abs(z - H / 2) < 2.4) continue;
      place(-1.4 - rng.range(0, 1.4), z); place(W + 1.4 + rng.range(0, 1.4), z);
    }
    const geo = mergeGeometries(gs)!;
    const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    mesh.userData.ownMat = true;
    mesh.castShadow = this.q.shadows;
    this.matchRoot.add(mesh);
  }

  // ------------------------------------------------------------------ heroes

  private ensureHero(h: Hero): HeroView {
    let v = this.heroViews.get(h.id);
    const key = h.def.id + '|' + h.skinId;
    if (v && v.skinKey === key) return v;
    if (v) { this.matchRoot.remove(v.group); }
    const geo = heroGeometry(h.def.id, h.skinId);
    const isMeHero = h.id === this.focusId;
    const u = makeHeroUniforms(isMeHero ? '#ffe14d' : TEAM_COLORS[h.team]);
    const mat = makeHeroMaterial(u);
    const body = new THREE.Mesh(geo, mat);
    body.castShadow = this.q.shadows;
    body.userData.sharedGeo = true; body.userData.ownMat = true;
    const outlineMat = makeHeroOutline(u, h.pve && h.def.id === 'boss_golem' ? 0.05 : 0.065);
    outlineMat.transparent = true;
    const outline = new THREE.Mesh(geo, outlineMat);
    outline.userData.sharedGeo = true; outline.userData.ownMat = true;
    const scale = (h.radius * WS) * (h.pve && h.def.id === 'boss_golem' ? 1.05 : 1.38);
    const inner = new THREE.Group();
    inner.add(body, outline);
    inner.scale.setScalar(scale);
    const group = new THREE.Group();
    group.add(inner);
    const isMe = h.id === this.focusId;
    const ring = new THREE.Mesh(new THREE.RingGeometry(h.radius * WS * 1.05, h.radius * WS * (isMe ? 1.35 : 1.25), 36), new THREE.MeshBasicMaterial({ color: isMe ? '#ffe14d' : TEAM_COLORS[h.team], transparent: true, opacity: isMe ? 0.95 : 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.userData.ownMat = true;
    group.add(ring);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(h.radius * WS * 3);
    shadow.userData.ownMat = true;
    group.add(shadow);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(h.radius * WS * 1.6, 20, 14), new THREE.MeshBasicMaterial({ color: '#7fd8ff', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    shield.position.y = h.radius * WS * 1.2; shield.visible = false; shield.userData.ownMat = true;
    group.add(shield);
    const stun = new THREE.Group();
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), toon('#ffe14d', { emissive: '#ffe14d', emissiveIntensity: 1 })); s.position.set(Math.cos((i / 3) * 6.28) * 0.25, 0, Math.sin((i / 3) * 6.28) * 0.25); stun.add(s); }
    stun.position.y = h.radius * WS * 4.4; stun.visible = false;
    group.add(stun);
    this.matchRoot.add(group);
    v = { hero: h, group, body, outline, mat, outlineMat, u, ring, shadow, shield, stun, scale, px: h.x, py: h.y, wasAlive: h.alive, skinKey: key };
    this.heroViews.set(h.id, v);
    return v;
  }

  // ------------------------------------------------------------------ rift

  private ensureRift(r: RiftEntity): RiftView {
    let v = this.riftViews.get(r.id);
    if (v) return v;
    const group = new THREE.Group();
    const s = r.radius * WS * (r.clone ? 1.5 : 1.75);
    const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, c1: { value: new THREE.Color('#b388ff') }, c2: { value: new THREE.Color('#5a189a') }, mood: { value: 0 } }, vertexShader: RIFT_VS, fragmentShader: RIFT_FS });
    const core = new THREE.Mesh(new THREE.SphereGeometry(s, 32, 24), mat);
    core.userData.ownMat = true;
    group.add(core);
    const ol = new THREE.Mesh(new THREE.SphereGeometry(s * 1.08, 24, 16), new THREE.MeshBasicMaterial({ color: '#1a1030', side: THREE.BackSide }));
    ol.userData.ownMat = true;
    group.add(ol);
    // creature eyes
    const eyes = new THREE.Group();
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      white.scale.set(0.5, 1.15, 1); white.position.set(s * 0.82, s * 0.18, side * s * 0.36);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#160b2e' }));
      pupil.scale.set(0.5, 1.2, 1); pupil.position.set(s * 0.97, s * 0.2, side * s * 0.36);
      white.userData.ownMat = pupil.userData.ownMat = true;
      eyes.add(white, pupil);
    }
    group.add(eyes);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const rm = new THREE.Mesh(new THREE.TorusGeometry(s * (1.55 + i * 0.35), s * 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#e0aaff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      rm.userData.ownMat = true;
      rings.push(rm); group.add(rm);
    }
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#b388ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.setScalar(s * 7);
    aura.userData.ownMat = true;
    group.add(aura);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(150,90,255,0.75)', 'rgba(150,90,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(s * 8);
    shadow.userData.ownMat = true;
    this.matchRoot.add(shadow);
    let light: THREE.PointLight | null = null;
    if (this.q.glow && !r.clone) { light = new THREE.PointLight('#b388ff', 6, 5, 1.6); light.position.y = 0.4; group.add(light); }
    // X-ray silhouette: the Rift stays visible behind walls, bushes and players
    const xray = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color: '#d9b8ff', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    xray.scale.setScalar(s * 3.2); xray.renderOrder = 30; xray.userData.ownMat = true;
    group.add(xray);
    // light beam pointing at the main Rift from far away
    let beam: THREE.Mesh | null = null;
    if (!r.clone) {
      const c = document.createElement('canvas'); c.width = 4; c.height = 128;
      const g2 = c.getContext('2d')!; const grd = g2.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0.9)');
      g2.fillStyle = grd; g2.fillRect(0, 0, 4, 128);
      const tex = new THREE.CanvasTexture(c);
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.5, 16, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: '#c9a5ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      beam.userData.ownMat = true;
      beam.renderOrder = 9;
      this.matchRoot.add(beam);
    }
    this.matchRoot.add(group);
    v = { beam, xray, rift: r, group, core, eyes, rings, aura, shadow, light, px: r.x, py: r.y };
    this.riftViews.set(r.id, v);
    return v;
  }

  // ------------------------------------------------------------------ projectiles / zones / walls / hazards

  private setupProjectileAssets() {
    this.projGeo.bolt = new THREE.SphereGeometry(0.13, 10, 8);
    this.projGeo.spread = new THREE.SphereGeometry(0.1, 8, 6);
    this.projGeo.blades = new THREE.ConeGeometry(0.14, 0.05, 3).rotateX(Math.PI / 2);
    this.projGeo.lob = new THREE.IcosahedronGeometry(0.18, 0);
    this.projGeo.shell = new THREE.IcosahedronGeometry(0.2, 0);
    this.projGeo.boomerang = new THREE.TorusGeometry(0.16, 0.06, 6, 12);
    this.projGeo.wave = new THREE.TorusGeometry(0.28, 0.06, 6, 16, Math.PI);
    this.projGeo.boss = new THREE.SphereGeometry(0.2, 10, 8);
  }

  private projMat(color: string) {
    let m = this.projMats.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color }); this.projMats.set(color, m); }
    return m;
  }

  private acquireProj(p: Projectile): THREE.Object3D {
    let o = this.projPool.pop();
    if (!o) {
      o = new THREE.Group();
      const mesh = new THREE.Mesh(this.projGeo.bolt, this.projMat('#fff'));
      mesh.userData.sharedGeo = true;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.userData.ownMat = true;
      glow.scale.setScalar(0.7);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.4)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.userData.ownMat = true;
      o.add(mesh, glow, sh);
      this.matchRoot.add(o);
    }
    const mesh = o.children[0] as THREE.Mesh, glow = o.children[1] as THREE.Sprite;
    const kind = p.kind === 'spread' ? 'spread' : p.kind;
    mesh.geometry = this.projGeo[kind] ?? this.projGeo.bolt;
    mesh.material = this.projMat(p.kind === 'boss' ? '#ff4d6d' : p.color);
    (glow.material as THREE.SpriteMaterial).color.set(p.kind === 'boss' ? '#ff4d6d' : p.color);
    glow.scale.setScalar(p.kind === 'lob' || p.kind === 'shell' ? 0.9 : p.kind === 'wave' ? 1.1 : 0.7);
    glow.visible = this.q.glow || p.kind === 'boss';
    o.visible = true;
    return o;
  }

  private acquireZone(z: Zone): THREE.Mesh {
    let mesh = this.zonePool.pop();
    if (!mesh) {
      const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, color: { value: new THREE.Color() }, intensity: { value: 1 } }, vertexShader: UV_VS, fragmentShader: SWIRL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.userData.ownMat = true;
      mesh.rotation.x = -Math.PI / 2;
      this.matchRoot.add(mesh);
    }
    const col: Record<string, string> = { magnet_field: '#ff4d6d', storm: '#ffe600', heal: '#5cff9d', slow: '#4cc9f0', black_hole: '#7b2ff7', fire: '#ff6b35', eruption: '#ff3d00', electric_trail: '#00f0ff', lava_burst: '#ff5400' };
    const mat = mesh.material as THREE.ShaderMaterial;
    mat.uniforms.color.value.set(col[z.kind] ?? '#ffffff');
    mesh.scale.setScalar(z.radius * WS);
    mesh.position.set(z.x * WS, 0.04, z.y * WS);
    mesh.visible = true;
    return mesh;
  }

  private syncWalls(m: Match) {
    for (const w of m.arena.walls) {
      if (!w.dynamic || this.wallViews.has(w)) continue;
      const team = w.team as number;
      const top = team === 0 ? '#7cc4ff' : team === 1 ? '#ff8a96' : '#ffb347';
      const side = team === 0 ? '#2f6fd1' : team === 1 ? '#c22f45' : '#c46b12';
      const geo = this.wallBox({ x: -w.w / 2, y: -w.h / 2, w: w.w, h: w.h }, top, side, 0.75);
      const key = top;
      if (!this.dynWallMat[key]) this.dynWallMat[key] = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
      const mesh = new THREE.Mesh(geo, this.dynWallMat[key]);
      mesh.position.set((w.x + w.w / 2) * WS, 0, (w.y + w.h / 2) * WS);
      mesh.scale.y = 0.01;
      mesh.castShadow = this.q.shadows;
      this.matchRoot.add(mesh);
      this.wallViews.set(w, mesh);
    }
    for (const [w, mesh] of this.wallViews) {
      if (!m.arena.walls.includes(w)) {
        this.matchRoot.remove(mesh); mesh.geometry.dispose(); this.wallViews.delete(w);
        this.particles.burst(mesh.position.x, 0.4, mesh.position.z, 18, '#d9c7a5', 3, 0.25, 0.7, 2.5, -9);
        continue;
      }
      mesh.scale.y = Math.min(1, mesh.scale.y + 0.12);
      const dmg = w.maxHp > 0 ? w.hp / w.maxHp : 1;
      mesh.scale.x = mesh.scale.z = 0.92 + 0.08 * dmg;
    }
  }

  private syncHazards(m: Match) {
    for (const h of m.arena.hazards) {
      let mesh = this.hazardViews.get(h);
      if (!mesh) {
        let mat: THREE.Material;
        if (h.kind === 'lava') mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, active: { value: 1 }, warn: { value: 0 } }, vertexShader: UV_VS, fragmentShader: LAVA_FS, transparent: true, depthWrite: false });
        else if (h.kind === 'ice') mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: UV_VS, fragmentShader: ICE_FS, transparent: true, depthWrite: false });
        else mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, color: { value: new THREE.Color(h.kind === 'boost' ? '#ffd166' : h.pair % 2 ? '#4cc9f0' : '#f72585') }, intensity: { value: 1 } }, vertexShader: UV_VS, fragmentShader: SWIRL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        if (mat instanceof THREE.ShaderMaterial) this.animated.push({ mat });
        const w = h.w * WS, d = h.h * WS;
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
        mesh.userData.ownMat = true;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((h.x + h.w / 2) * WS, 0.015 + (h.kind === 'teleport' ? 0.01 : 0), (h.y + h.h / 2) * WS);
        mesh.renderOrder = 1;
        this.matchRoot.add(mesh);
        this.hazardViews.set(h, mesh);
        if (h.temporary) this.particles.burst(mesh.position.x, 0.2, mesh.position.z, 24, h.kind === 'lava' ? '#ff6b35' : '#9be7ff', 3, 0.3, 0.8);
      }
      const mat = mesh.material as THREE.ShaderMaterial;
      if (h.kind === 'lava') {
        mat.uniforms.active.value += ((h.active ? 1 : 0) - mat.uniforms.active.value) * 0.2;
        mat.uniforms.warn.value = m.arena.lavaWarning(h, m.time) ? 1 : 0;
        if (h.active && Math.random() < 0.3 * this.q.particleMul) this.particles.emit((h.x + Math.random() * h.w) * WS, 0.05, (h.y + Math.random() * h.h) * WS, 0, 1.5 + Math.random(), 0, '#ff9e00', 0.18, 0.6, -1);
      }
    }
    for (const [h, mesh] of this.hazardViews) {
      if (!m.arena.hazards.includes(h)) {
        this.matchRoot.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
        this.animated = this.animated.filter((a) => a.mat !== mesh.material);
        this.hazardViews.delete(h);
      }
    }
  }

  // ------------------------------------------------------------------ per-frame

  /** alpha: interpolation factor between the previous and current simulation step. */
  update(dt: number) {
    this.time += dt;
    const m = this.match;
    if (!m) return;
    const mutColor = getMutation(m.mutation).color;
    for (const a of this.animated) a.mat.uniforms.time.value = this.time;

    // heroes
    const seen = new Set<number>();
    for (const h of m.heroes) {
      seen.add(h.id);
      const v = this.ensureHero(h);
      this.updateHero(v, m, dt);
    }
    for (const [id, v] of this.heroViews) if (!seen.has(id)) { this.matchRoot.remove(v.group); this.heroViews.delete(id); }

    // rifts
    const rseen = new Set<number>();
    for (const r of m.rifts) {
      if (!r.alive) continue;
      rseen.add(r.id);
      this.updateRift(this.ensureRift(r), m, dt, mutColor);
    }
    for (const [id, v] of this.riftViews) if (!rseen.has(id)) {
      this.matchRoot.remove(v.group); this.matchRoot.remove(v.shadow); if (v.beam) this.matchRoot.remove(v.beam);
      this.particles.burst(v.group.position.x, 0.5, v.group.position.z, 30, '#00f5d4', 4, 0.3, 0.6);
      this.riftViews.delete(id);
    }

    // projectiles
    for (const p of m.projectiles) {
      let o = this.projViews.get(p);
      if (!p.active) { if (o) { o.visible = false; this.projPool.push(o); this.projViews.delete(p); } continue; }
      if (!o) { o = this.acquireProj(p); this.projViews.set(p, o); }
      const mesh = o.children[0], shadow = o.children[2];
      let y = 0.55;
      if (p.kind === 'lob' || p.kind === 'shell') { const k = Math.min(1, p.t / p.dur); y = 0.4 + Math.sin(k * Math.PI) * (p.kind === 'shell' ? 3.2 : 1.9); }
      o.position.set(p.x * WS, y, p.y * WS);
      shadow.position.y = -y + 0.02;
      mesh.rotation.y = -Math.atan2(p.vy, p.vx);
      if (p.kind === 'blades' || p.kind === 'boomerang' || p.kind === 'lob' || p.kind === 'shell') { mesh.rotation.x += dt * 14; mesh.rotation.y += dt * 9; }
      if (p.kind === 'wave') { mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.atan2(p.vy, p.vx) - Math.PI / 2; }
      if (this.q.particleMul > 0.5 && Math.random() < 0.5) this.particles.emit(o.position.x, y, o.position.z, 0, 0, 0, p.kind === 'boss' ? '#ff4d6d' : p.color, 0.16, 0.25, 0, 0);
    }

    // zones
    for (const z of m.zones) {
      let mesh = this.zoneViews.get(z);
      if (!z.active) { if (mesh) { mesh.visible = false; this.zonePool.push(mesh); this.zoneViews.delete(z); } continue; }
      if (!mesh) { mesh = this.acquireZone(z); this.zoneViews.set(z, mesh); }
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time * (z.kind === 'black_hole' || z.kind === 'magnet_field' ? -2 : 1);
      const life = (z.until - m.time) / Math.max(0.01, z.until - z.born);
      mat.uniforms.intensity.value = Math.min(1, life * 4) * (z.kind === 'eruption' && z.delay > 0 ? 0.5 + 0.5 * Math.sin(this.time * 30) : 1);
      if (z.kind === 'storm' && Math.random() < 0.25) this.particles.emit((z.x + (Math.random() - 0.5) * z.radius * 1.6) * WS, 2.5, (z.y + (Math.random() - 0.5) * z.radius * 1.6) * WS, 0, -9, 0, '#fff59d', 0.3, 0.3, 0, 0);
      if ((z.kind === 'fire' || z.kind === 'eruption') && Math.random() < 0.5 * this.q.particleMul) this.particles.emit((z.x + (Math.random() - 0.5) * z.radius) * WS, 0.1, (z.y + (Math.random() - 0.5) * z.radius) * WS, 0, 2, 0, Math.random() < 0.5 ? '#ff6b35' : '#ffd166', 0.25, 0.5, 0.5);
      if (z.kind === 'heal' && Math.random() < 0.3) this.particles.emit((z.x + (Math.random() - 0.5) * z.radius) * WS, 0.1, (z.y + (Math.random() - 0.5) * z.radius) * WS, 0, 1.4, 0, '#5cff9d', 0.2, 0.7, 0);
    }

    this.syncWalls(m);
    this.syncHazards(m);

    // bushes: transparent when the viewer's team stands inside
    for (const b of this.bushViews) {
      let inside = false;
      for (const h of m.heroes) if (h.alive && h.team === this.viewerTeam && h.x >= b.rect.x && h.x <= b.rect.x + b.rect.w && h.y >= b.rect.y && h.y <= b.rect.y + b.rect.h) inside = true;
      const mat = b.mesh.material as THREE.MeshToonMaterial;
      mat.opacity += ((inside ? 0.45 : 1) - mat.opacity) * 0.2;
    }

    // portals pulse when a carrier is close
    for (let i = 0; i < this.portalViews.length; i++) {
      const g = this.portalViews[i];
      g.children.forEach((c, k) => { if (k < 4 && c instanceof THREE.Mesh && c.geometry.type === 'SphereGeometry') c.position.y = 1.9 + Math.sin(this.time * 3 + k) * 0.05; });
    }

    // fx
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { this.matchRoot.remove(s.mesh); (s.mesh.material as THREE.Material).dispose(); this.shockwaves.splice(i, 1); continue; }
      s.mesh.scale.setScalar(s.r0 + (s.r1 - s.r0) * (1 - Math.pow(1 - k, 3)));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.t / 0.18);
      if (b.t <= 0) { this.matchRoot.remove(b.line); b.line.geometry.dispose(); (b.line.material as THREE.Material).dispose(); this.bolts.splice(i, 1); }
    }
    this.particles.update(dt);
    this.updateCamera(dt);
  }

  private updateHero(v: HeroView, m: Match, dt: number) {
    const h = v.hero;
    const visible = h.alive && m.isVisibleTo(h, this.viewerTeam);
    if (!h.alive && v.wasAlive) {
      this.particles.burst(h.x * WS, 0.6, h.y * WS, 40, h.def.palette.primary, 4, 0.35, 0.9, 3, -8);
      this.particles.burst(h.x * WS, 0.6, h.y * WS, 20, '#ffffff', 3, 0.25, 0.6, 2, -6);
      this.addShockwave(h.x, h.y, 0.3, 1.6, h.team === 0 ? TEAM_COLORS[0] : TEAM_COLORS[1], 0.5);
    }
    if (h.alive && !v.wasAlive) {
      v.px = h.x; v.py = h.y;
      this.particles.burst(h.x * WS, 0.3, h.y * WS, 30, TEAM_COLORS[h.team], 3, 0.3, 0.8, 4, -4);
    }
    v.wasAlive = h.alive;
    v.group.visible = visible || (h.alive && h.team === this.viewerTeam);
    if (!v.group.visible) return;
    // smooth positions toward the latest simulation state
    const k = Math.min(1, dt * 22);
    v.px += (h.x - v.px) * k; v.py += (h.y - v.py) * k;
    if (Math.abs(h.x - v.px) > 120 || Math.abs(h.y - v.py) > 120) { v.px = h.x; v.py = h.y; } // teleports
    let y = 0;
    if (h.leap) { const t = Math.min(1, h.leap.t / h.leap.dur); y = Math.sin(t * Math.PI) * 1.6; }
    v.group.position.set(v.px * WS, y, v.py * WS);
    const inner = v.group.children[0];
    // facing (smooth)
    const target = -h.facing;
    let diff = target - inner.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    inner.rotation.y += diff * Math.min(1, dt * 16);
    // squash & stretch animation
    const moving = Math.hypot(h.vx, h.vy) > 30;
    const bob = moving ? Math.abs(Math.sin(h.anim.walk * 0.9)) * 0.08 : Math.sin(this.time * 2.5 + h.id) * 0.02;
    const atk = h.anim.attackT > 0 ? Math.sin((h.anim.attackT / 0.22) * Math.PI) * 0.12 : 0;
    const cast = h.anim.castT > 0 ? Math.sin((h.anim.castT / 0.35) * Math.PI) * 0.18 : 0;
    inner.position.y = bob * v.scale * 4;
    inner.scale.set(v.scale * (1 + atk * 0.25 + cast * 0.2), v.scale * (1 - atk * 0.15 + cast * 0.4), v.scale * (1 + atk * 0.25 + cast * 0.2));
    inner.rotation.z = moving ? -0.12 : 0; // lean into the run
    // limb animation (vertex shader) + hit flash
    const u = v.u;
    u.uWalk.value = h.anim.walk * 0.9;
    u.uMove.value += ((moving ? 1 : 0) - u.uMove.value) * Math.min(1, dt * 10);
    u.uAtk.value = h.anim.attackT > 0 ? Math.sin((h.anim.attackT / 0.25) * Math.PI) : 0;
    u.uCast.value = h.anim.castT > 0 ? Math.sin((h.anim.castT / 0.35) * Math.PI) : 0;
    u.uTime.value = this.time + h.id;
    u.uFlash.value = h.anim.hitT > 0 ? 0.55 : 0;
    // ghosting (phase / invisible / bush for allies)
    const ghost = h.phaseUntil > m.time || h.invisUntil > m.time || (h.inBush && h.revealedUntil <= m.time);
    const op = ghost ? 0.45 : 1;
    v.mat.opacity = op; v.outlineMat.uniforms.opacity.value = op;
    v.outline.visible = op >= 1; v.mat.depthWrite = op >= 1;
    v.shield.visible = h.shield > 0 && h.shieldUntil > m.time;
    if (v.shield.visible) v.shield.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    v.stun.visible = h.stunUntil > m.time;
    if (v.stun.visible) v.stun.rotation.y += dt * 6;
    v.shadow.scale.setScalar(h.radius * WS * 3 * (1 - y * 0.25));
    (v.ring.material as THREE.MeshBasicMaterial).opacity = h.id === this.focusId ? 0.95 : 0.75;
    // dash trail / speed buff sparkles
    if ((h.dash || h.speedBuffUntil > m.time || h.carrying) && Math.random() < 0.6 * this.q.particleMul) {
      this.particles.emit(v.px * WS, 0.3 + Math.random() * 0.4, v.py * WS, 0, 0.3, 0, h.carrying ? '#c77dff' : h.def.palette.accent, 0.22, 0.45, 0, 0);
    }
    if (h.overdriveUntil > m.time && Math.random() < 0.3) this.particles.emit(v.px * WS, 0.1, v.py * WS, 0, 1.6, 0, '#ff70a6', 0.18, 0.6, 0);
  }

  private updateRift(v: RiftView, m: Match, dt: number, mutColor: string) {
    const r = v.rift;
    const k = Math.min(1, dt * 20);
    v.px += (r.x - v.px) * k; v.py += (r.y - v.py) * k;
    if (Math.abs(r.x - v.px) > 150 || Math.abs(r.y - v.py) > 150) { v.px = r.x; v.py = r.y; }
    const carrier = r.carrier >= 0 ? m.heroById(r.carrier) : null;
    // the Rift is ALWAYS visible (it is the focus of the game), even when its carrier hides in a bush
    v.group.visible = true; v.shadow.visible = true;
    const bob = Math.sin(this.time * 3 + r.id) * 0.08;
    let y = carrier ? (carrier.radius * WS) * 5.0 : 0.55 + bob;
    let x = v.px * WS, z = v.py * WS;
    if (carrier) { x = (this.heroViews.get(carrier.id)?.px ?? carrier.x) * WS; z = (this.heroViews.get(carrier.id)?.py ?? carrier.y) * WS; }
    if (r.state === 'PORTAL') y = 0.6 + Math.sin(this.time * 12) * 0.05;
    v.group.position.set(x, y, z);
    v.shadow.position.set(x, 0.03, z);
    if (v.beam) {
      v.beam.position.set(x, y + 2.25, z);
      (v.beam.material as THREE.MeshBasicMaterial).opacity = r.state === 'PORTAL' ? 0 : 0.55 + Math.sin(this.time * 4) * 0.15;
    }
    (v.xray.material as THREE.SpriteMaterial).opacity = 0.4 + Math.sin(this.time * 5) * 0.1;
    const isMut = r.state === 'MUTATING' || r.state === 'CLONING';
    const base = r.clone ? '#00f5d4' : m.mutation !== 'NORMAL' ? mutColor : '#b388ff';
    const mat = v.core.material as THREE.ShaderMaterial;
    mat.uniforms.time.value = this.time * (r.state === 'FRENZY' ? 2.5 : 1);
    (mat.uniforms.c1.value as THREE.Color).lerp(this.tmpColor.set(isMut ? (Math.sin(this.time * 25) > 0 ? '#ffffff' : '#ff3df5') : base), 0.15);
    (mat.uniforms.c2.value as THREE.Color).lerp(this.tmpColor.set(isMut ? '#ff3df5' : r.clone ? '#006d77' : '#3c096c'), 0.15);
    mat.uniforms.mood.value = r.mood;
    const pulse = isMut ? 1 + Math.sin(this.time * 30) * 0.12 + 0.15 : r.state === 'PORTAL' ? Math.max(0.2, 1 - r.stateTime) : 1;
    v.core.scale.setScalar(pulse);
    v.group.children[1].scale.setScalar(pulse);
    // eyes look at the nearest player; squint when angry, wide when scared
    v.eyes.rotation.y = -r.look;
    v.eyes.scale.set(1, r.mood > 0.3 ? 0.6 : r.mood < -0.3 ? 1.25 : 1, 1);
    const blink = (Math.floor(this.time * 10 + r.id * 7) % 37) === 0;
    if (blink) v.eyes.scale.y = 0.1;
    v.rings[0].rotation.set(this.time * 1.7, this.time * 0.6, 0);
    v.rings[1].rotation.set(-this.time * 1.1, 0, this.time * 1.3);
    for (const ring of v.rings) (ring.material as THREE.MeshBasicMaterial).color.set(base);
    (v.aura.material as THREE.SpriteMaterial).color.set(base);
    (v.xray.material as THREE.SpriteMaterial).color.set(base);
    if (v.beam) (v.beam.material as THREE.MeshBasicMaterial).color.set(base);
    v.aura.scale.setScalar(r.radius * WS * 1.25 * (7 + Math.sin(this.time * 4) * 0.8) * (isMut ? 1.6 : 1));
    if (v.light) { v.light.color.set(base); v.light.intensity = 5 + Math.sin(this.time * 5) * 1.5 + (isMut ? 6 : 0); }
    // trail & orbiting sparks
    const pm = this.q.particleMul;
    const speed = Math.hypot(r.vx, r.vy);
    if (Math.random() < (0.5 + Math.min(1, speed / 300)) * pm) this.particles.emit(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, z + (Math.random() - 0.5) * 0.2, -r.vx * WS * 0.2, 0.2, -r.vy * WS * 0.2, base, r.clone ? 0.2 : 0.32, 0.55, 0, 2);
    if (Math.random() < 0.4 * pm) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(x + Math.cos(a) * 0.45, y, z + Math.sin(a) * 0.45, -Math.sin(a) * 1.2, 0.6, Math.cos(a) * 1.2, '#ffffff', 0.12, 0.5, 0, 1);
    }
    if (m.mutation === 'ELECTRIC' && !r.clone && Math.random() < 0.3) this.particles.emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), 0, 0, 0, '#ffe600', 0.25, 0.15, 0, 0);
  }
  private tmpColor = new THREE.Color();

  private updateCamera(dt: number, snap = false) {
    const m = this.match;
    if (!m) return;
    const f = m.heroById(this.focusId);
    let tx = m.arena.center.x, ty = m.arena.center.y;
    if (f) {
      const v = this.heroViews.get(f.id);
      tx = v ? v.px : f.x; ty = v ? v.py : f.y;
      // look slightly ahead toward the action (the Rift)
      const r = m.mainRift();
      if (r) { tx += (r.x - tx) * 0.12; ty += (r.y - ty) * 0.12; }
    } else {
      const r = m.mainRift();
      if (r) { tx = r.x; ty = r.y; }
    }
    // clamp to arena
    tx = THREE.MathUtils.clamp(tx, 650, m.arena.w - 650);
    ty = THREE.MathUtils.clamp(ty, 380, m.arena.h - 330);
    const k = snap ? 1 : Math.min(1, dt * 6);
    this.camTarget.x += (tx * WS - this.camTarget.x) * k;
    this.camTarget.z += (ty * WS - this.camTarget.z) * k;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0, sz = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.camera.position.set(this.camTarget.x + sx, 9.6, this.camTarget.z + 9.4 + sz);
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + 1.1 + sz);
    if (this.q.shadows) {
      this.sun.position.set(this.camTarget.x - 6, 14, this.camTarget.z + 8);
      this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    }
  }

  addShake(a: number) { this.shake = Math.min(0.5, this.shake + a); }

  addShockwave(x: number, y: number, r0: number, r1: number, color: string, dur = 0.45) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: ringTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x * WS, 0.06, y * WS);
    mesh.scale.setScalar(r0);
    this.matchRoot.add(mesh);
    this.shockwaves.push({ mesh, t: 0, dur, r0, r1 });
  }

  private addBolt(points: number[], color: string) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 2; i += 2) {
      const ax = points[i] * WS, az = points[i + 1] * WS, bx = points[i + 2] * WS, bz = points[i + 3] * WS;
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, j = s === 0 || s === 6 ? 0 : 0.15;
        pts.push(new THREE.Vector3(ax + (bx - ax) * t + (Math.random() - 0.5) * j, 0.6 + (Math.random() - 0.5) * j, az + (bz - az) * t + (Math.random() - 0.5) * j));
      }
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, linewidth: 2 }));
    this.matchRoot.add(line);
    this.bolts.push({ line, t: 0.18 });
  }

  /** Visual reaction to simulation events. Returns nothing; audio/HUD handled by GameView. */
  onEvent(e: MatchEvent) {
    const m = this.match;
    if (!m) return;
    const P = this.particles;
    switch (e.t) {
      case 'hit': {
        const t = m.heroById(e.target);
        P.burst(e.x * WS, 0.6, e.y * WS, 6, t ? (t.team === 0 ? '#9fd3ff' : '#ffb3bd') : '#fff', 2.5, 0.18, 0.35, 1.5, -6);
        if (e.target === this.focusId) this.addShake(0.06);
        break;
      }
      case 'explosion':
        P.burst(e.x * WS, 0.3, e.y * WS, Math.min(60, 10 + e.radius / 6), e.color, Math.max(2, e.radius * WS * 4), 0.35, 0.6, 2.5, -6);
        this.addShockwave(e.x, e.y, 0.2, Math.max(0.5, e.radius * WS), e.color, 0.4);
        if (e.radius > 150) this.addShake(0.12);
        break;
      case 'chain': this.addBolt(e.points, '#9ff3ff'); break;
      case 'zap': this.addBolt([e.x, e.y, e.tx, e.ty], '#ffe600'); break;
      case 'melee': {
        const h = m.heroById(e.hero);
        if (!h) break;
        for (let i = 0; i < 10 * this.q.particleMul + 3; i++) {
          const a = e.angle + (Math.random() - 0.5) * 1.6, d = e.range * WS * (0.5 + Math.random() * 0.5);
          P.emit(h.x * WS + Math.cos(a) * d, 0.5, h.y * WS + Math.sin(a) * d, Math.cos(a), 0.5, Math.sin(a), '#ffffff', 0.25, 0.25, 0);
        }
        break;
      }
      case 'shot': P.burst(e.x * WS, 0.55, e.y * WS, 4, '#ffffff', 1.5, 0.15, 0.2, 0.5, 0); break;
      case 'teleport':
        P.burst(e.fx * WS, 0.6, e.fy * WS, 24, '#9ff3ff', 3, 0.25, 0.5, 1, 0);
        P.burst(e.x * WS, 0.6, e.y * WS, 24, '#ffffff', 3, 0.25, 0.5, 1, 0);
        break;
      case 'capture': { const r = m.rifts.find((x) => x.id === e.rift); if (r) { P.burst(r.x * WS, 0.8, r.y * WS, 30, '#e0aaff', 3.5, 0.3, 0.6, 2, -3); this.addShockwave(r.x, r.y, 0.3, 1.5, '#e0aaff', 0.4); } break; }
      case 'throw': { const r = m.rifts.find((x) => x.id === e.rift); if (r) P.burst(r.x * WS, 0.7, r.y * WS, 16, '#ffffff', 2.5, 0.25, 0.4, 1, 0); break; }
      case 'goal': {
        const c = TEAM_COLORS[e.team];
        for (let i = 0; i < 3; i++) this.addShockwave(e.x, e.y, 0.3, 3 + i * 1.5, i === 1 ? '#ffffff' : c, 0.6 + i * 0.25);
        P.burst(e.x * WS, 1, e.y * WS, 120, c, 7, 0.45, 1.4, 6, -7);
        P.burst(e.x * WS, 1, e.y * WS, 80, '#ffe14d', 6, 0.35, 1.4, 7, -8);
        this.addShake(0.4);
        break;
      }
      case 'ability': {
        const h = m.heroById(e.hero);
        if (!h) break;
        P.burst(h.x * WS, 0.5, h.y * WS, e.ult ? 50 : 18, e.ult ? '#ffe14d' : h.def.palette.accent, e.ult ? 5 : 3, 0.3, 0.6, 2, -4);
        if (e.ult) { this.addShockwave(h.x, h.y, 0.3, 2.5, '#ffe14d', 0.5); this.addShake(0.15); }
        break;
      }
      case 'wall': P.burst((e.x + e.w / 2) * WS, 0.2, (e.y + e.h / 2) * WS, 20, '#d9c7a5', 2.5, 0.3, 0.6, 2, -6); break;
      case 'mutation_warn': { const r = m.mainRift(); if (r) this.addShockwave(r.x, r.y, 0.5, 6, '#ff3df5', 1.2); break; }
      case 'mutation_start': {
        const r = m.mainRift();
        const c = getMutation(e.mutation).color;
        if (r) { this.addShockwave(r.x, r.y, 0.5, 10, c, 1); P.burst(r.x * WS, 0.8, r.y * WS, 140, c, 8, 0.45, 1.2, 4, -4); }
        this.addShake(0.3);
        break;
      }
      case 'kill': break;
      case 'respawn': break;
    }
  }

  // ------------------------------------------------------------------ aim indicator

  setAim(visible: boolean, hero?: Hero, dx = 0, dy = 0, dist = 0, kind: 'line' | 'point' | 'self' = 'line', radius = 0, color = '#ffffff') {
    this.aim.visible = visible && !!hero;
    if (!visible || !hero) return;
    const x = hero.x * WS, z = hero.y * WS;
    (this.aimLine.material as THREE.MeshBasicMaterial).color.set(color);
    (this.aimCircle.material as THREE.MeshBasicMaterial).color.set(color);
    if (kind === 'line') {
      const len = dist * WS;
      this.aimLine.visible = true; this.aimCircle.visible = false;
      this.aimLine.scale.set(len, 0.22, 1);
      this.aimLine.position.set(x + dx * len / 2, 0.05, z + dy * len / 2);
      this.aimLine.rotation.z = -Math.atan2(dy, dx);
    } else {
      this.aimLine.visible = kind === 'point';
      this.aimCircle.visible = true;
      const px = kind === 'self' ? x : x + dx * dist * WS, pz = kind === 'self' ? z : z + dy * dist * WS;
      this.aimCircle.position.set(px, 0.05, pz);
      this.aimCircle.scale.setScalar(Math.max(0.3, radius * WS));
      if (kind === 'point') { const len = dist * WS; this.aimLine.scale.set(len, 0.08, 1); this.aimLine.position.set(x + dx * len / 2, 0.05, z + dy * len / 2); this.aimLine.rotation.z = -Math.atan2(dy, dx); }
    }
  }

  // ------------------------------------------------------------------ projection for DOM HUD

  toScreen(x: number, y: number, height: number, out: { x: number; y: number; visible: boolean }) {
    this.tmpV.set(x * WS, height, y * WS).project(this.camera);
    out.x = (this.tmpV.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight;
    out.visible = this.tmpV.z < 1;
    return out;
  }

  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Screen pixel -> simulation coordinates on the ground plane. */
  screenToGround(sx: number, sy: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, p)) return null;
    return { x: p.x / WS, y: p.z / WS };
  }

  heroScreenHeight(h: Hero) { const v = this.heroViews.get(h.id); return (h.radius * WS) * (h.pve && h.def.id === 'boss_golem' ? 3.6 : 4.4) + (v ? v.group.position.y : 0); }
  heroRenderPos(h: Hero) { const v = this.heroViews.get(h.id); return v ? { x: v.px, y: v.py } : { x: h.x, y: h.y }; }

  // ------------------------------------------------------------------ menu showcase

  private setupShowcase() {
    const s = this.showcase;
    s.background = new THREE.Color('#2a1a5e');
    s.add(new THREE.HemisphereLight('#ffffff', '#6b5bd6', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(3, 6, 5); s.add(key);
    const rim = new THREE.DirectionalLight('#b388ff', 2.2); rim.position.set(-4, 3, -4); s.add(rim);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.4, 40), toon('#ffd166'));
    ped.position.y = -0.2; s.add(ped);
    const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.18, 40), toon('#7b61ff'));
    ped2.position.y = -0.46; s.add(ped2);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(179,136,255,0.7)', 'rgba(179,136,255,0)'), transparent: true, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01; s.add(glow);
    this.showcaseCam.position.set(0, 1.75, 7.6);
    this.showcaseCam.lookAt(0, 0.95, 0);
  }

  setShowcase(heroId: string, skinId: string, offsetX = 0) {
    const key = heroId + '|' + skinId;
    this.showcaseCam.position.set(-offsetX, 1.75, 7.6);
    this.showcaseCam.lookAt(-offsetX, 0.95, 0);
    if (key === this.showcaseKey) return;
    this.showcaseKey = key;
    if (this.showcaseHero) this.showcase.remove(this.showcaseHero);
    const geo = heroGeometry(heroId, skinId);
    const g = new THREE.Group();
    this.showcaseU = makeHeroUniforms('#c9a5ff');
    const body = new THREE.Mesh(geo, makeHeroMaterial(this.showcaseU));
    const ol = new THREE.Mesh(geo, makeHeroOutline(this.showcaseU, 0.05));
    g.add(body, ol);
    g.scale.setScalar(0.7);
    g.rotation.y = -Math.PI / 2 + 0.5;
    this.showcase.add(g);
    this.showcaseHero = g;
    this.showcasePop = 0.35;
  }
  private showcasePop = 0;
  private showcaseU: HeroAnimUniforms | null = null;

  renderShowcase(dt: number) {
    this.time += dt;
    if (this.showcaseHero) {
      this.showcaseSpin += dt * 0.5;
      this.showcaseHero.rotation.y = Math.PI / 2 + Math.sin(this.showcaseSpin) * 0.55 - Math.PI;
      this.showcaseHero.position.y = Math.abs(Math.sin(this.time * 2)) * 0.05;
      if (this.showcaseU) {
        // idle: breathing + an occasional flourish (cast pose)
        this.showcaseU.uTime.value = this.time;
        const cyc = this.time % 6;
        this.showcaseU.uCast.value = cyc > 4.6 && cyc < 5.6 ? Math.sin(((cyc - 4.6) / 1.0) * Math.PI) * 0.7 : 0;
      }
      if (this.showcasePop > 0) { this.showcasePop -= dt; const k = 1 + Math.sin((this.showcasePop / 0.35) * Math.PI) * 0.15; this.showcaseHero.scale.set(0.7 / k, 0.7 * k, 0.7 / k); }
      else this.showcaseHero.scale.setScalar(0.7);
    }
    this.renderer.render(this.showcase, this.showcaseCam);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  /** Offscreen portrait of a hero (data URL) for UI cards. */
  portrait(heroId: string, skinId: string, size = 256): string {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#555577', 2));
    const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(2, 3, 4); scene.add(d);
    const geo = heroGeometry(heroId, skinId);
    const g = new THREE.Group();
    const pu = makeHeroUniforms('#ffffff');
    pu.uCast.value = 0.25;
    const body = new THREE.Mesh(geo, makeHeroMaterial(pu));
    const olm = makeHeroOutline(pu, 0.06);
    g.add(body, new THREE.Mesh(geo, olm));
    g.rotation.y = -Math.PI / 2 + 0.45;
    scene.add(g);
    const big = heroId === 'boss_golem';
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, big ? 2.6 : 2.3, big ? 9 : 6.6);
    cam.lookAt(0, big ? 1.8 : 1.6, 0);
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevRatio = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 1);
    rt.dispose(); olm.dispose(); (body.material as THREE.Material).dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    // flip Y + linear->sRGB already handled by render target colorSpace
    for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    void prevSize; void prevRatio;
    return c.toDataURL('image/png');
  }

  get drawCalls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }
}
