import * as THREE from 'three';

/**
 * v1.5 image-based lighting: instead of one neutral studio for everything, each arena / lobby gets its own
 * procedural HDR sky (zenith, horizon and ground colours, a hot sun disc, a cool kicker, a soft-box strip)
 * pre-filtered through PMREM. Reflections and ambient light now match the place the heroes stand in.
 */
export interface SkySpec { top: string; horizon: string; ground: string; sun: string; /** sun radiance multiplier */ power?: number; /** overall ambient level */ level?: number }

const VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sun; uniform vec3 sunDir; uniform float power; uniform float level; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 sky = mix(horizon, top, pow(clamp(d.y, 0.0, 1.0), 0.55));
  vec3 col = d.y > 0.0 ? sky : mix(horizon, ground, pow(clamp(-d.y * 3.0, 0.0, 1.0), 0.6));
  col *= level;
  // bright haze band on the horizon: readable rim reflections on rounded shapes
  col += horizon * exp(-abs(d.y) * 9.0) * 0.5 * level;
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sun * (pow(s, 600.0) * 40.0 + pow(s, 24.0) * 1.6) * power;
  // cool kicker behind + a long overhead soft-box (glossy highlights on eyes, metal and plastic)
  float k = max(dot(d, normalize(vec3(-sunDir.x, 0.35, -sunDir.z))), 0.0);
  col += mix(top, vec3(1.0), 0.5) * pow(k, 40.0) * 2.2 * power;
  float box = smoothstep(0.82, 0.9, d.y) * smoothstep(0.5, 0.2, abs(d.x));
  col += vec3(1.0) * box * 1.6 * level;
  gl_FragColor = vec4(col, 1.0);
}`;

let pmrem: THREE.PMREMGenerator | null = null;
let pmremOwner: THREE.WebGLRenderer | null = null;

/** Builds a pre-filtered environment (≈6 MB of GPU memory): the caller owns it and disposes it when replaced. */
export function skyEnvironment(renderer: THREE.WebGLRenderer, spec: SkySpec, sunDir = new THREE.Vector3(-6, 14, 8)): THREE.Texture {
  if (!pmrem || pmremOwner !== renderer) { pmrem = new THREE.PMREMGenerator(renderer); pmremOwner = renderer; }
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(spec.top) }, horizon: { value: new THREE.Color(spec.horizon) }, ground: { value: new THREE.Color(spec.ground) }, sun: { value: new THREE.Color(spec.sun) }, sunDir: { value: sunDir.clone().normalize() }, power: { value: spec.power ?? 1 }, level: { value: spec.level ?? 1 } },
    vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), mat);
  scene.add(dome);
  const prevTarget = renderer.getRenderTarget();
  const tex = pmrem.fromScene(scene, 0.035).texture;
  renderer.setRenderTarget(prevTarget);
  dome.geometry.dispose(); mat.dispose();
  return tex;
}
