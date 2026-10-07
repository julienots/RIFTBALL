import * as THREE from 'three';

/**
 * Pooled GPU particles: one THREE.Points draw call for every particle in the game.
 * Struct-of-arrays on the CPU, zero allocations per frame.
 */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private maxLife: Float32Array; private size0: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private cursor = 0;
  private active = 0;
  private tmpColor = new THREE.Color();
  mul = 1;

  constructor(private capacity: number) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vx = new Float32Array(capacity); this.vy = new Float32Array(capacity); this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity); this.maxLife = new Float32Array(capacity); this.size0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity); this.drag = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(12, 0, 6.5), 60);
    const m = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vColor; varying float vAlpha; uniform float scale;
        void main(){ vColor = color; vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * (0.6 + a * 0.8), a * vAlpha); }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(px: number) { (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = px; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string | THREE.Color, size: number, life: number, gravity = 0, drag = 1.5) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    const c = typeof color === 'string' ? this.tmpColor.set(color) : color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = this.size0[i] = size; this.alpha[i] = 1;
    this.life[i] = this.maxLife[i] = life; this.grav[i] = gravity; this.drag[i] = drag;
  }

  /** Radial burst helper. count is scaled by quality. */
  burst(x: number, y: number, z: number, count: number, color: string, speed: number, size: number, life: number, up = 1.5, gravity = -4) {
    const n = Math.max(1, Math.round(count * this.mul));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.emit(x, y, z, Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), gravity);
    }
  }

  update(dt: number) {
    let act = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      act++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.pos[i * 3] += this.vx[i] * dt; this.pos[i * 3 + 1] += this.vy[i] * dt; this.pos[i * 3 + 2] += this.vz[i] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vy[i] *= -0.3; }
      this.alpha[i] = k;
      this.size[i] = this.size0[i] * (0.4 + 0.6 * k);
    }
    this.active = act;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  get count() { return this.active; }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}
