import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-band ramp used by every toon material (cel-shaded look). */
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map<string, THREE.Material>();

export function toon(color: string | number, opts: { emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissiveIntensity ?? 0, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return m;
}

/** Vertex-colored toon material (merged character meshes = 1 draw call). */
export const vertexToon = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });

let outlineMat: THREE.MeshBasicMaterial | null = null;
/** Inverted-hull outline material (thick dark cartoon outline). */
export function outlineMaterial() {
  if (!outlineMat) outlineMat = new THREE.MeshBasicMaterial({ color: '#1a1030', side: THREE.BackSide });
  return outlineMat;
}

/** Soft radial glow texture for sprites / blob shadows. */
const texCache = new Map<string, THREE.Texture>();
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const key = inner + outer + size;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function ringTexture(size = 256) {
  const key = 'ring' + size;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = size * 0.06;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.35; g.lineWidth = size * 0.12;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2); g.stroke();
  t = new THREE.CanvasTexture(c);
  texCache.set(key, t);
  return t;
}

/** Paint all vertices of a geometry with one color (for merging). */
export function paint(geo: THREE.BufferGeometry, color: string | THREE.Color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
