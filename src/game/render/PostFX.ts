import * as THREE from 'three';

/**
 * v1.5 cinematic pipeline. The scene is rendered into an HDR (half-float, MSAA) target, then:
 *   half / quarter-res blur pyramid  -> depth-of-field (lobby) or tilt-shift (match)
 *   thresholded bloom pyramid        -> glow on emissive parts, portals, FX
 *   radial light shafts (optional)   -> god rays from the lobby portal
 *   composite                        -> chromatic fringe, sharpen, filmic tone mapping, colour grade,
 *                                       vignette, grain / dithering, sRGB output
 * Everything runs on small targets: about 6 fullscreen-equivalent passes at a fraction of the resolution.
 */

export interface GradeOptions {
  exposure: number;
  /** bloom strength / luminance threshold */
  bloom: number; threshold: number;
  /** 0 = none, 1 = focus disc (lobby: sharp around `focus`), 2 = tilt-shift (match: sharp horizontal band) */
  dofMode: 0 | 1 | 2;
  dof: number;
  focusX: number; focusY: number; focusR: number;
  vignette: number;
  saturation: number; contrast: number;
  /** split toning: shadows are pushed towards `shadowTint`, highlights towards `lightTint` */
  shadowTint: THREE.Color; lightTint: THREE.Color;
  /** chromatic fringe at the screen edges */
  fringe: number;
  /** light shafts: screen-space origin (0..1) and strength (0 = off) */
  raysX: number; raysY: number; rays: number;
  /** full-screen colour flash (hits, goals, mutations) */
  flash: THREE.Color; flashK: number;
}

export const defaultGrade = (): GradeOptions => ({
  exposure: 1, bloom: 0.9, threshold: 0.85, dofMode: 0, dof: 0, focusX: 0.5, focusY: 0.5, focusR: 0.3,
  vignette: 0.35, saturation: 1.12, contrast: 1.06, shadowTint: new THREE.Color('#1c2440'), lightTint: new THREE.Color('#fff3df'),
  fringe: 0.0, raysX: 0.5, raysY: 0.8, rays: 0, flash: new THREE.Color('#ffffff'), flashK: 0,
});

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** 13-tap downsample (Jimenez): stable, no fireflies. `uThreshold` > 0 applies a soft-knee bright pass. */
const DOWN_FS = `precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
vec3 pre(vec3 c){
  if (uThreshold <= 0.0) return c;
  c = min(c, vec3(24.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.6;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  return c * max(soft, br - uThreshold) / max(br, 1e-4);
}
void main(){
  vec2 t = uTexel;
  vec3 a = pre(texture2D(tMap, vUv + t * vec2(-2.0, -2.0)).rgb), b = pre(texture2D(tMap, vUv + t * vec2(0.0, -2.0)).rgb), c = pre(texture2D(tMap, vUv + t * vec2(2.0, -2.0)).rgb);
  vec3 d = pre(texture2D(tMap, vUv + t * vec2(-2.0, 0.0)).rgb), e = pre(texture2D(tMap, vUv).rgb), f = pre(texture2D(tMap, vUv + t * vec2(2.0, 0.0)).rgb);
  vec3 g = pre(texture2D(tMap, vUv + t * vec2(-2.0, 2.0)).rgb), h = pre(texture2D(tMap, vUv + t * vec2(0.0, 2.0)).rgb), i = pre(texture2D(tMap, vUv + t * vec2(2.0, 2.0)).rgb);
  vec3 j = pre(texture2D(tMap, vUv + t * vec2(-1.0, -1.0)).rgb), k = pre(texture2D(tMap, vUv + t * vec2(1.0, -1.0)).rgb);
  vec3 l = pre(texture2D(tMap, vUv + t * vec2(-1.0, 1.0)).rgb), m = pre(texture2D(tMap, vUv + t * vec2(1.0, 1.0)).rgb);
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(col, 1.0);
}`;

/** 4-tap box downsample (cheap blur pyramid for the depth of field). */
const BOX_FS = `precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(min(c * 0.25, vec3(32.0)), 1.0);
}`;

/** 9-tap tent upsample, added to the next level (the target is blended additively). */
const UP_FS = `precision highp float;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uGain; varying vec2 vUv;
void main(){
  vec2 t = uTexel;
  vec3 c = texture2D(tMap, vUv).rgb * 4.0;
  c += (texture2D(tMap, vUv + vec2(t.x, 0.0)).rgb + texture2D(tMap, vUv - vec2(t.x, 0.0)).rgb + texture2D(tMap, vUv + vec2(0.0, t.y)).rgb + texture2D(tMap, vUv - vec2(0.0, t.y)).rgb) * 2.0;
  c += texture2D(tMap, vUv + t).rgb + texture2D(tMap, vUv - t).rgb + texture2D(tMap, vUv + vec2(t.x, -t.y)).rgb + texture2D(tMap, vUv + vec2(-t.x, t.y)).rgb;
  gl_FragColor = vec4(c * (uGain / 16.0), 1.0);
}`;

/** Radial blur of the bright pass towards a screen-space light: volumetric shafts. */
const RAYS_FS = `precision highp float;
uniform sampler2D tMap; uniform vec2 uCenter; uniform float uAspect; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 dir = (uCenter - vUv);
  float jitter = hash(vUv * 311.0);
  vec3 acc = vec3(0.0); float w = 1.0, tot = 0.0;
  for (int i = 0; i < 14; i++) {
    float k = (float(i) + jitter) / 14.0;
    acc += texture2D(tMap, vUv + dir * k * 0.85).rgb * w; tot += w; w *= 0.9;
  }
  vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
  gl_FragColor = vec4(acc / tot * smoothstep(1.25, 0.0, length(d)), 1.0);
}`;

const FINAL_FS = `precision highp float;
uniform sampler2D tScene; uniform sampler2D tHalf; uniform sampler2D tQuarter; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform vec2 uTexel; uniform float uAspect; uniform float uTime;
uniform float uExposure; uniform float uBloom; uniform float uDofMode; uniform float uDof; uniform vec3 uFocus;
uniform float uVignette; uniform float uSaturation; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uLightTint;
uniform float uFringe; uniform float uRays; uniform vec3 uFlash; uniform float uFlashK; uniform float uSharpen;
varying vec2 vUv;
// Khronos PBR Neutral: keeps hues and saturated team colours intact, compresses highlights only
vec3 neutral(vec3 c){
  const float startCompression = 0.8 - 0.04, desaturation = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) return c;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3(newPeak), g);
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv, cc = uv - 0.5;
  float edge = dot(cc, cc);
  // ---- depth of field: how far (0..1) this pixel is from the focus region
  float blurK = 0.0;
  if (uDofMode > 1.5) blurK = smoothstep(uFocus.z, uFocus.z + 0.34, abs(uv.y - uFocus.y));
  else if (uDofMode > 0.5) { vec2 fd = (uv - uFocus.xy) * vec2(uAspect * 0.62, 1.0); blurK = smoothstep(uFocus.z, uFocus.z + 0.42, length(fd)); }
  blurK *= uDof;
  // ---- scene colour with a chromatic fringe growing towards the corners
  vec3 col;
  if (uFringe > 0.0) {
    vec2 off = cc * edge * uFringe;
    col = vec3(texture2D(tScene, uv - off).r, texture2D(tScene, uv).g, texture2D(tScene, uv + off).b);
  } else col = texture2D(tScene, uv).rgb;
  vec3 hlf = texture2D(tHalf, uv).rgb;
  // ---- sharpen what is in focus (unsharp mask against the half-res copy)
  col += (col - hlf) * uSharpen * (1.0 - blurK);
  col = max(col, vec3(0.0));
  if (blurK > 0.001) {
    vec3 qtr = texture2D(tQuarter, uv).rgb;
    vec3 soft = mix(hlf, qtr, smoothstep(0.35, 1.0, blurK));
    col = mix(col, soft, smoothstep(0.0, 0.5, blurK));
  }
  // ---- glow
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;
  if (uRays > 0.0) col += texture2D(tRays, uv).rgb * uRays;
  col *= uExposure;
  col = neutral(col);
  // ---- grade: split toning, contrast around mid-grey, saturation
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.0) + (uShadowTint - 0.5) * 0.5, vec3(1.0) + (uLightTint - 0.5) * 0.3, smoothstep(0.0, 0.7, l));
  col = (col - 0.5) * uContrast + 0.5;
  l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  // ---- vignette
  col *= 1.0 - uVignette * smoothstep(0.12, 0.62, edge);
  col = mix(col, uFlash, uFlashK);
  col = clamp(col, 0.0, 1.0);
  // linear -> sRGB
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  // film grain doubles as dithering (kills banding in the sky gradients)
  float n = hash(uv / uTexel + fract(uTime) * 61.0) - 0.5;
  col += n * (1.6 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const LEVELS = 4;

export class PostFX {
  /** MSAA HDR scene target */
  private scene!: THREE.WebGLRenderTarget;
  private half!: THREE.WebGLRenderTarget;
  private quarter!: THREE.WebGLRenderTarget;
  private bloom: THREE.WebGLRenderTarget[] = [];
  private rays!: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mDown: THREE.ShaderMaterial; private mBox: THREE.ShaderMaterial; private mUp: THREE.ShaderMaterial; private mRays: THREE.ShaderMaterial; private mFinal: THREE.ShaderMaterial;
  private w = 0; private h = 0; private samples = 0;
  private type: THREE.TextureDataType;
  private time = 0;
  /** 1 = bloom + grade, 2 = + depth of field, fringe, light shafts */
  level: 1 | 2 = 2;

  constructor(private renderer: THREE.WebGLRenderer) {
    const ext = renderer.extensions;
    // HDR needs a renderable half-float buffer; otherwise an 8-bit pipeline still gives glow + grade
    this.type = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const mk = (fs: string, uniforms: Record<string, THREE.IUniform>, add = false) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NoBlending, toneMapped: false });
    this.mDown = mk(DOWN_FS, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });
    this.mBox = mk(BOX_FS, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP_FS, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uGain: { value: 1 } }, true);
    this.mRays = mk(RAYS_FS, { tMap: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.8) }, uAspect: { value: 1 } });
    this.mFinal = mk(FINAL_FS, {
      tScene: { value: null }, tHalf: { value: null }, tQuarter: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uTexel: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTime: { value: 0 },
      uExposure: { value: 1 }, uBloom: { value: 1 }, uDofMode: { value: 0 }, uDof: { value: 0 }, uFocus: { value: new THREE.Vector3(0.5, 0.5, 0.3) },
      uVignette: { value: 0.3 }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uShadowTint: { value: new THREE.Color() }, uLightTint: { value: new THREE.Color() },
      uFringe: { value: 0 }, uRays: { value: 0 }, uFlash: { value: new THREE.Color() }, uFlashK: { value: 0 }, uSharpen: { value: 0.3 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mFinal);
    this.quad.frustumCulled = false;
  }

  /** (Re)allocates the targets for a drawing-buffer size and MSAA sample count. */
  setSize(w: number, h: number, samples: number) {
    w = Math.max(8, Math.floor(w)); h = Math.max(8, Math.floor(h));
    if (w === this.w && h === this.h && samples === this.samples) return;
    this.dispose();
    this.w = w; this.h = h; this.samples = samples;
    const rt = (tw: number, th: number, depth = false, s = 0) => {
      const t = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(tw)), Math.max(2, Math.floor(th)), { type: this.type, format: THREE.RGBAFormat, depthBuffer: depth, stencilBuffer: false, samples: s, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      t.texture.wrapS = t.texture.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    this.scene = rt(w, h, true, samples);
    this.half = rt(w / 2, h / 2);
    this.quarter = rt(w / 4, h / 4);
    this.bloom = [];
    for (let i = 0; i < LEVELS; i++) this.bloom.push(rt(w / (4 << i), h / (4 << i)));
    this.rays = rt(w / 4, h / 4);
  }

  private pass(mat: THREE.ShaderMaterial, src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget | null, texelOf: THREE.WebGLRenderTarget = src) {
    mat.uniforms.tMap.value = src.texture;
    (mat.uniforms.uTexel.value as THREE.Vector2).set(1 / texelOf.width, 1 / texelOf.height);
    this.quad.material = mat;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.quad, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, g: GradeOptions, dt: number) {
    const r = this.renderer;
    this.time += dt;
    const autoClear = r.autoClear;
    r.autoClear = true;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // shadow maps are up to date: the fullscreen passes must not touch them
    const shadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.autoClear = false;
    // blur pyramid (also feeds the bright pass)
    this.pass(this.mBox, this.scene, this.half);
    this.pass(this.mBox, this.half, this.quarter);
    // bloom: bright pass -> down -> up
    this.mDown.uniforms.uThreshold.value = g.threshold;
    this.pass(this.mDown, this.quarter, this.bloom[0]);
    this.mDown.uniforms.uThreshold.value = 0;
    for (let i = 1; i < LEVELS; i++) this.pass(this.mDown, this.bloom[i - 1], this.bloom[i]);
    for (let i = LEVELS - 1; i > 0; i--) { this.mUp.uniforms.uGain.value = 1.0; this.pass(this.mUp, this.bloom[i], this.bloom[i - 1]); }
    const u = this.mFinal.uniforms;
    const full = this.level === 2;
    const rays = full && g.rays > 0;
    if (rays) {
      (this.mRays.uniforms.uCenter.value as THREE.Vector2).set(g.raysX, g.raysY);
      this.mRays.uniforms.uAspect.value = this.w / this.h;
      this.mRays.uniforms.tMap.value = this.bloom[1].texture;
      this.quad.material = this.mRays;
      r.setRenderTarget(this.rays);
      r.render(this.quad, this.cam);
    }
    u.tScene.value = this.scene.texture; u.tHalf.value = this.half.texture; u.tQuarter.value = this.quarter.texture; u.tBloom.value = this.bloom[0].texture; u.tRays.value = this.rays.texture;
    (u.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
    u.uAspect.value = this.w / this.h; u.uTime.value = this.time;
    u.uExposure.value = g.exposure; u.uBloom.value = g.bloom;
    u.uDofMode.value = full ? g.dofMode : 0; u.uDof.value = full ? g.dof : 0;
    (u.uFocus.value as THREE.Vector3).set(g.focusX, g.focusY, g.focusR);
    u.uVignette.value = g.vignette; u.uSaturation.value = g.saturation; u.uContrast.value = g.contrast;
    (u.uShadowTint.value as THREE.Color).copy(g.shadowTint); (u.uLightTint.value as THREE.Color).copy(g.lightTint);
    u.uFringe.value = full ? g.fringe : 0; u.uRays.value = rays ? g.rays : 0;
    (u.uFlash.value as THREE.Color).copy(g.flash); u.uFlashK.value = g.flashK;
    u.uSharpen.value = full ? 0.35 : 0.2;
    this.quad.material = this.mFinal;
    r.setRenderTarget(null);
    r.render(this.quad, this.cam);
    r.autoClear = autoClear;
    r.shadowMap.autoUpdate = shadowAuto;
  }

  dispose() {
    this.scene?.dispose(); this.half?.dispose(); this.quarter?.dispose(); this.rays?.dispose();
    for (const b of this.bloom) b.dispose();
    this.bloom = [];
    this.w = this.h = 0;
  }
}
