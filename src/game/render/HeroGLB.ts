import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Rigged hero models generated with Tripo (Mixamo skeleton), loaded from `public/models/heroes/<id>.glb`.
 * `manifest.json` lists the heroes that have a model; every other hero keeps its procedural mesh.
 *
 * Animation: if the GLB carries clips (idle / walk / run …) they drive the locomotion; on top of that
 * (or alone, when there are no clips) the bones are posed procedurally from the same signals the
 * procedural heroes use (walk phase, run, attack, cast, hit, dance), so every model is fully animated.
 */

/** Height (model units, before the hero view scale) the GLB is normalised to — matches the procedural heroes. */
export const GLB_HERO_HEIGHT = 2.55;

interface Template { scene: THREE.Object3D; clips: THREE.AnimationClip[]; height: number }
const templates = new Map<string, Template>();
let loadPromise: Promise<void> | null = null;

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** Load every model listed in the manifest. Never throws: a missing/broken model falls back to the procedural hero. */
export function preloadHeroModels(onProgress?: (p: number) => void): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let ids: string[] = [];
    try {
      const r = await fetch(`${BASE}models/heroes/manifest.json`, { cache: 'no-cache' });
      if (r.ok) ids = ((await r.json()) as { heroes?: string[] }).heroes ?? [];
    } catch { /* no models shipped */ }
    if (!ids.length) { onProgress?.(1); return; }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${BASE}models/heroes/${id}.glb`);
        templates.set(id, prepareTemplate(gltf.scene, gltf.animations));
      } catch (e) {
        console.warn('[HeroGLB] could not load', id, e);
      }
      onProgress?.(++done / ids.length);
    }));
  })();
  return loadPromise;
}

export function hasHeroModel(heroId: string) { return templates.has(heroId); }

function prepareTemplate(scene: THREE.Object3D, clips: THREE.AnimationClip[]): Template {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  // skinned meshes: bounding box of the bind pose
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      box.union(b);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 1e-3);
  const k = GLB_HERO_HEIGHT / height;
  const center = box.getCenter(new THREE.Vector3());
  // wrap so we can normalise without touching the skeleton
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.scale.setScalar(k);
  holder.position.set(-center.x * k, -box.min.y * k, -center.z * k);
  holder.add(scene);
  // glTF characters face +Z; the hero views expect +X (see Models.ts: sides are ±Z)
  root.rotation.y = Math.PI / 2;
  root.add(holder);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false; // skinned bounds are unreliable once animated
    }
  });
  const wrapped = new THREE.Group();
  wrapped.add(root);
  return { scene: wrapped, clips, height: GLB_HERO_HEIGHT };
}

// ---------------------------------------------------------------- instance

export interface HeroAnimState {
  time: number;
  move: number;       // 0 idle .. 1 moving (smoothed)
  run: number;        // 0 walk .. 1 sprint
  walk: number;       // walk phase (radians)
  atk: number;        // 0..1 attack pulse
  cast: number;       // 0..1 ability pulse
  hit: number;        // 0..1 hit reaction
  dance: number;      // 0..1 dance blend
  style: number;      // 0 groove, 1 robot, 2 floss, 3 disco
}

type BoneKey = 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'legL' | 'legR' | 'shinL' | 'shinR';
const BONE_NAMES: Record<BoneKey, string[]> = {
  hips: ['hips', 'pelvis'],
  spine: ['spine'],
  chest: ['spine2', 'spine1', 'chest', 'upperchest'],
  neck: ['neck'],
  head: ['head'],
  armL: ['leftarm', 'leftupperarm', 'upperarml', 'larm'],
  armR: ['rightarm', 'rightupperarm', 'upperarmr', 'rarm'],
  foreL: ['leftforearm', 'leftlowerarm', 'lowerarml', 'lforearm'],
  foreR: ['rightforearm', 'rightlowerarm', 'lowerarmr', 'rforearm'],
  legL: ['leftupleg', 'leftupperleg', 'upperlegl', 'lthigh', 'leftthigh'],
  legR: ['rightupleg', 'rightupperleg', 'upperlegr', 'rthigh', 'rightthigh'],
  shinL: ['leftleg', 'leftlowerleg', 'lowerlegl', 'lcalf', 'leftcalf', 'leftshin'],
  shinR: ['rightleg', 'rightlowerleg', 'lowerlegr', 'rcalf', 'rightcalf', 'rightshin'],
};
const norm = (n: string) => n.toLowerCase().replace(/^.*[:|]/, '').replace(/^mixamorig/, '').replace(/[^a-z0-9]/g, '');

interface BoneRig { bone: THREE.Bone; rest: THREE.Quaternion; parentRestWorld: THREE.Quaternion; parentRestWorldInv: THREE.Quaternion }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

export class GLBHero {
  readonly root: THREE.Group;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: { idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; run?: THREE.AnimationAction; dance?: THREE.AnimationAction } = {};
  private bones: Partial<Record<BoneKey, BoneRig>> = {};
  private hipsRestY = 0;
  private hipsUnit = 1;
  private materials: THREE.MeshStandardMaterial[] = [];
  private outlines: THREE.Mesh[] = [];
  private outlineMats: THREE.ShaderMaterial[] = [];
  private opacity = 1;

  constructor(heroId: string, opts: { outline?: number; outlineColor?: string; tint?: string | null } = {}) {
    const t = templates.get(heroId);
    if (!t) throw new Error('no GLB for ' + heroId);
    this.root = SkeletonUtils.clone(t.scene) as THREE.Group;
    this.root.updateMatrixWorld(true);
    const tint = opts.tint ? new THREE.Color(opts.tint) : null;
    const skinned: THREE.SkinnedMesh[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const mats = src.map((mm) => {
        const c = (mm as THREE.MeshStandardMaterial).clone();
        c.transparent = true; c.depthWrite = true;
        if (tint) c.color.lerp(tint, 0.45);
        this.materials.push(c);
        return c;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(m as THREE.SkinnedMesh);
    });
    // toon outline (inverted hull) sharing the skeleton
    if (opts.outline) {
      for (const sm of skinned) {
        const om = makeSkinnedOutline(opts.outline, opts.outlineColor ?? '#1a1030');
        const ol = new THREE.SkinnedMesh(sm.geometry, om);
        ol.bind(sm.skeleton, sm.bindMatrix);
        ol.frustumCulled = false;
        sm.parent!.add(ol);
        ol.position.copy(sm.position); ol.quaternion.copy(sm.quaternion); ol.scale.copy(sm.scale);
        this.outlines.push(ol); this.outlineMats.push(om);
      }
    }
    // bones
    const all: THREE.Bone[] = [];
    this.root.traverse((o) => { if ((o as THREE.Bone).isBone) all.push(o as THREE.Bone); });
    const byName = new Map<string, THREE.Bone>();
    for (const b of all) { const n = norm(b.name); if (!byName.has(n)) byName.set(n, b); }
    this.root.updateMatrixWorld(true);
    for (const key of Object.keys(BONE_NAMES) as BoneKey[]) {
      const b = BONE_NAMES[key].map((n) => byName.get(n)).find(Boolean);
      if (!b) continue;
      const pw = new THREE.Quaternion();
      b.parent?.getWorldQuaternion(pw);
      // express in the hero root's space (ignore the root's own facing)
      const rootQ = new THREE.Quaternion(); this.root.getWorldQuaternion(rootQ);
      pw.premultiply(rootQ.invert());
      // account for the +Z -> +X re-orientation so our axes are the glTF model's axes
      pw.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
      this.bones[key] = { bone: b, rest: b.quaternion.clone(), parentRestWorld: pw, parentRestWorldInv: pw.clone().invert() };
    }
    const hips = this.bones.hips?.bone;
    if (hips) {
      this.hipsRestY = hips.position.y;
      // bone-space units per model unit (for the bob)
      const ws = new THREE.Vector3(); hips.parent?.getWorldScale(ws);
      const rs = new THREE.Vector3(); this.root.getWorldScale(rs);
      this.hipsUnit = rs.y / Math.max(1e-6, ws.y);
    }
    // clips
    if (t.clips.length) {
      this.mixer = new THREE.AnimationMixer(this.root);
      const pick = (re: RegExp) => t.clips.find((c) => re.test(c.name));
      const mk = (c?: THREE.AnimationClip) => { if (!c) return undefined; const a = this.mixer!.clipAction(c); a.play(); a.setEffectiveWeight(0); return a; };
      this.actions.idle = mk(pick(/idle|stand|breath/i));
      this.actions.walk = mk(pick(/walk/i));
      this.actions.run = mk(pick(/run|sprint|jog/i));
      this.actions.dance = mk(pick(/danc/i));
      if (!this.actions.idle && !this.actions.walk && !this.actions.run) {
        // unknown names: use the first clip as idle
        this.actions.idle = mk(t.clips[0]);
      }
    }
  }

  get hasClips() { return !!this.mixer; }

  setOpacity(op: number) {
    if (op === this.opacity) return;
    this.opacity = op;
    for (const m of this.materials) { m.opacity = op; m.depthWrite = op >= 1; }
    for (const o of this.outlines) o.visible = op >= 1;
  }

  setFlash(f: number) {
    for (const m of this.materials) m.emissive.setScalar(f * 0.9);
  }

  update(dt: number, s: HeroAnimState) {
    const B = this.bones;
    // ---- base pose: rest, then clips (if any) override the bones they animate
    for (const k in B) { const r = B[k as BoneKey]!; r.bone.quaternion.copy(r.rest); }
    if (B.hips) B.hips.bone.position.y = this.hipsRestY;
    if (this.mixer) {
      const { idle, walk, run, dance } = this.actions;
      const moving = s.move * (1 - s.dance);
      const wRun = run ? moving * s.run : 0;
      const wWalk = walk ? moving * (run ? 1 - s.run : 1) : 0;
      const wDance = dance ? s.dance : 0;
      const wIdle = Math.max(0, 1 - wRun - wWalk - wDance);
      idle?.setEffectiveWeight(idle ? wIdle + (walk || run ? 0 : moving) : 0);
      walk?.setEffectiveWeight(wWalk);
      run?.setEffectiveWeight(wRun);
      dance?.setEffectiveWeight(wDance);
      if (walk) walk.timeScale = 0.9 + s.run * 0.4;
      this.mixer.update(dt);
    }
    const proceduralLocomotion = !this.mixer || (!this.actions.walk && !this.actions.run);
    const proceduralDance = !this.actions.dance;
    const t = s.time;
    const beat = t * 7.5;
    const mv = proceduralLocomotion ? s.move : 0;
    const dz = proceduralDance ? s.dance : 0;
    const sw = Math.sin(s.walk);
    const style = s.style;

    // arms: T-pose -> down along the body (only when no clip already poses them)
    const lower = this.mixer ? 0 : 1.25;
    // ---- legs
    const legSwing = (side: number) => side * sw * (0.6 + s.run * 0.25) * mv;
    const knee = (side: number) => Math.max(0, side * Math.cos(s.walk)) * (0.9 + s.run * 0.4) * mv + 0.04 * (1 - mv) * (this.mixer ? 0 : 1);
    const danceLeg = (side: number) => (style < 0.5 ? side * Math.sin(beat) * 0.2 : style < 1.5 ? side * (Math.sin(t * 4) > 0 ? 0.3 : 0) : style < 2.5 ? Math.sin(t * 10) * 0.1 : side * 0.2);
    const danceKnee = (side: number) => Math.max(0, Math.sin(beat + (side > 0 ? 0 : Math.PI))) * 0.7;
    for (const [leg, shin, side] of [['legL', 'shinL', 1], ['legR', 'shinR', -1]] as const) {
      this.applyModel(B[leg], mix(-legSwing(side), danceLeg(side), dz), 0, 0);
      this.applyModel(B[shin], mix(knee(side), danceKnee(side), dz), 0, 0);
    }
    // ---- torso
    const twist = sw * 0.14 * mv - s.atk * 0.35;
    const lean = mv * (0.06 + s.run * 0.14) - s.hit * 0.35 + s.atk * 0.12;
    const dTwist = style < 0.5 ? Math.sin(t * 3.75) * 0.28 : style < 1.5 ? (Math.sin(t * 2) > 0 ? 0.3 : -0.3) : style < 2.5 ? -Math.sin(t * 10) * 0.22 : Math.sin(t * 2) * 0.45;
    const dRoll = Math.sin(beat) * (style < 0.5 ? 0.13 : 0.05);
    const breath = Math.sin(t * 2.4) * 0.025 * (1 - s.move);
    this.applyModel(B.spine, mix(lean * 0.5, 0, dz) + breath, mix(twist * 0.5, dTwist * 0.5, dz), mix(sw * 0.04 * mv, dRoll, dz));
    this.applyModel(B.chest, mix(lean * 0.5, 0, dz), mix(twist * 0.5, dTwist * 0.5, dz), 0);
    const headNod = Math.sin(t * 1.7) * 0.04 - s.atk * 0.1 + s.hit * 0.25 + dz * Math.sin(beat) * 0.15;
    this.applyModel(B.head, -lean * 0.4 + headNod, dz * Math.sin(beat * 0.5) * 0.12, 0);
    // ---- arms (side +1 = left = +X in glTF space)
    for (const [arm, fore, side] of [['armL', 'foreL', 1], ['armR', 'foreR', -1]] as const) {
      const swing = -side * sw * (0.5 + s.run * 0.3) * mv; // opposite to the leg on the same side
      const atk = side < 0 ? s.atk * 1.6 : 0;              // right arm strikes forward
      const castUp = s.cast * 1.1;                            // both arms rise
      const idleSway = (1 - s.move) * Math.sin(t * 1.3 + side) * 0.05;
      let raise = -lower + castUp + idleSway + s.hit * 0.4; // + = up (towards T-pose and above)
      let fwd = swing + atk + s.cast * 0.4;                 // + = forward
      // dance
      let dRaise: number, dFwd: number;
      if (style < 0.5) { dRaise = 1.2 + Math.sin(beat + (side > 0 ? 0 : Math.PI)) * 0.7; dFwd = 0.3; }
      else if (style < 1.5) { const up = (side > 0 ? Math.sin(t * 4) > 0 : Math.sin(t * 4) <= 0) ? 1 : 0; dRaise = -0.2 + up * 1.4; dFwd = 0.9 - up * 0.6; }
      else if (style < 2.5) { dRaise = -0.9; dFwd = Math.sin(t * 10) * 0.9; }
      else { dRaise = side > 0 ? 1.9 + Math.sin(t * 4) * 0.3 : -0.8; dFwd = 0.2; }
      raise = mix(raise, dRaise, dz);
      fwd = mix(fwd, dFwd, dz);
      // model-space: raise = rotation about Z (sign by side), forward = rotation about X
      this.applyModel(B[arm], -fwd, 0, side * raise, true);
      const bend = 0.25 + 0.35 * mv + s.cast * 0.5 + (side < 0 ? -s.atk * 0.25 : 0);
      const dBend = style > 0.5 && style < 1.5 ? 1.5 : style > 2.5 ? 0.15 : 0.7 + Math.sin(beat) * 0.4;
      this.applyModel(B[fore], 0, -side * mix(bend, dBend, dz), 0);
    }
    // ---- hips bob (walk bounce, dance hop)
    if (B.hips) {
      const bob = Math.abs(Math.cos(s.walk)) * 0.06 * mv + dz * Math.abs(Math.sin(beat)) * 0.08 - s.hit * 0.03;
      B.hips.bone.position.y += bob * this.hipsUnit;
    }
  }

  /**
   * Rotate a bone by (x, y, z) radians about the *model* axes (glTF space: +Y up, +Z forward, +X = character's left),
   * on top of its current local rotation. `order` true = apply Z before X (lower arm, then swing it).
   */
  private applyModel(r: BoneRig | undefined, x: number, y: number, z: number, zFirst = false) {
    if (!r || (x === 0 && y === 0 && z === 0)) return;
    _e.set(x, y, z, zFirst ? 'XYZ' : 'ZYX');
    _q.setFromEuler(_e);
    // local' = Wp^-1 * R * Wp * local
    _q2.copy(r.parentRestWorldInv).multiply(_q).multiply(r.parentRestWorld);
    r.bone.quaternion.premultiply(_q2);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    for (const m of this.outlineMats) m.dispose();
    this.mixer?.stopAllAction();
  }
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function makeSkinnedOutline(thickness: number, color: string) {
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, thickness: { value: thickness }, opacity: { value: 1 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float thickness;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vec3 n = normalize(normalMatrix * objectNormal);
        mv.xyz += n * thickness * (0.6 + 0.4 * clamp(-mv.z / 12.0, 0.0, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }`,
    side: THREE.BackSide,
  });
  return m;
}
