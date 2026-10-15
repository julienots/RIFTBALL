import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Match } from '../Match';
import { Rng } from '../../core/Rng';

/**
 * Hand-painted arena art (v1.0.8 redesign): high resolution floor with bevelled tiles, grout, wear,
 * per-theme materials (grass, basalt, frost, metal, moss, sandstone, marble, disco), contact shadows
 * under walls and bushes, and crisp field markings. Plus sculpted wall blocks (plinth, body, cap).
 */
export const FLOOR_PX = 96; // pixels per 100 world units

type Style = 'grass' | 'basalt' | 'frost' | 'metal' | 'moss' | 'sand' | 'marble' | 'disco';
const STYLE: Record<string, Style> = { none: 'grass', lava_cycle: 'basalt', ice: 'frost', void_portals: 'metal', docks: 'metal', jungle: 'moss', canyon: 'sand', sky: 'marble', fiesta: 'disco' };

const shade = (hex: string, k: number) => { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.multiplyScalar(1 + k); return '#' + c.getHexString(); };

export function paintFloor(m: Match): HTMLCanvasElement {
  const a = m.arena, th = a.data.theme, style = STYLE[a.data.special] ?? 'grass';
  const px = FLOOR_PX, u = px / 100; // canvas px per world unit
  const c = document.createElement('canvas');
  c.width = Math.min(4096, Math.round(a.w * u)); c.height = Math.min(4096, Math.round(a.h * u));
  const g = c.getContext('2d')!;
  const rng = new Rng(3);
  const W = c.width, H = c.height;
  // ---- base tiles
  const tile = style === 'grass' || style === 'moss' ? px : px / 2; // big turf squares vs. stone tiles
  for (let y = 0, j = 0; y < H; y += tile, j++) for (let x = 0, i = 0; x < W; x += tile, i++) {
    const base = (i + j) % 2 === 0 ? th.floorA : th.floorB;
    const v = rng.range(-0.05, 0.05);
    g.fillStyle = shade(base, v);
    g.fillRect(x, y, tile, tile);
    if (style === 'grass' || style === 'moss') continue;
    // bevel: light top-left, dark bottom-right, grout
    const b = Math.max(2, tile * 0.06);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, tile, b); g.fillRect(x, y, b, tile);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + tile - b, tile, b); g.fillRect(x + tile - b, y, b, tile);
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + tile - 1.5, tile, 1.5); g.fillRect(x + tile - 1.5, y, 1.5, tile);
    if (style === 'metal') {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (const [dx, dy] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) { g.beginPath(); g.arc(x + tile * dx, y + tile * dy, 2.2, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 1; k < 4; k++) g.fillRect(x + tile * 0.2, y + (tile * k) / 4, tile * 0.6, 1);
    } else if (style === 'marble') {
      g.strokeStyle = 'rgba(120,130,150,0.18)'; g.lineWidth = 1.2; g.beginPath();
      let vx = x + rng.range(0, tile), vy = y; g.moveTo(vx, vy);
      for (let k = 0; k < 5; k++) { vx += rng.range(-tile * 0.25, tile * 0.25); vy += tile / 5; g.lineTo(vx, vy); }
      g.stroke();
    } else if (style === 'frost') {
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath(); g.moveTo(x + tile * 0.1, y + tile * 0.9); g.lineTo(x + tile * 0.9, y + tile * 0.1); g.lineTo(x + tile * 0.95, y + tile * 0.2); g.lineTo(x + tile * 0.2, y + tile * 0.95); g.fill();
    } else if (style === 'basalt') {
      g.strokeStyle = 'rgba(255,90,20,0.35)'; g.lineWidth = 1.5; g.beginPath();
      let cx = x + rng.range(0, tile), cy = y + rng.range(0, tile); g.moveTo(cx, cy);
      for (let k = 0; k < 3; k++) { cx += rng.range(-tile * 0.3, tile * 0.3); cy += rng.range(-tile * 0.3, tile * 0.3); g.lineTo(cx, cy); }
      g.stroke();
    } else if (style === 'sand') {
      g.fillStyle = 'rgba(120,60,20,0.08)'; for (let k = 0; k < 3; k++) g.fillRect(x, y + tile * (0.25 + k * 0.25), tile, 2);
    } else if (style === 'disco') {
      const glow = ['#ff4ecd', '#ffd60a', '#00f5d4', '#4cc9f0', '#9d4edd'][(i * 3 + j * 7) % 5];
      const grd = g.createRadialGradient(x + tile / 2, y + tile / 2, 1, x + tile / 2, y + tile / 2, tile * 0.7);
      grd.addColorStop(0, glow + '55'); grd.addColorStop(1, glow + '00');
      g.fillStyle = grd; g.fillRect(x + b, y + b, tile - 2 * b, tile - 2 * b);
    }
  }
  // ---- organic detail
  if (style === 'grass' || style === 'moss') {
    // mowing stripes + blades + small flowers / pebbles
    for (let x = 0, k = 0; x < W; x += px * 1.5, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; g.fillRect(x, 0, px * 1.5, H); }
    for (let n = 0; n < (W * H) / 260; n++) {
      const x = rng.range(0, W), y = rng.range(0, H), l = rng.range(3, 7);
      g.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(0,40,0,0.14)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-2, 2), y - l); g.stroke();
    }
    for (let n = 0; n < (W * H) / 9000; n++) {
      const x = rng.range(0, W), y = rng.range(0, H);
      g.fillStyle = style === 'moss' ? 'rgba(90,80,60,0.35)' : rng.pick(['#ffffff', '#ffd166', '#ff8fab', '#bde0fe']);
      g.beginPath(); g.arc(x, y, rng.range(1.5, 3), 0, 7); g.fill();
    }
    if (style === 'moss') for (let n = 0; n < 40; n++) {
      // broken flagstones peeking through the moss
      const x = rng.range(0, W), y = rng.range(0, H), s = rng.range(px * 0.3, px * 0.6);
      g.fillStyle = 'rgba(160,145,115,0.55)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, rng.range(0, 3), 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke();
    }
  }
  // wear / dirt patches
  for (let n = 0; n < 70; n++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(px * 0.3, px * 1.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.6);
    grd.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine grain
  g.globalAlpha = 0.07;
  for (let i = 0; i < (W * H) / 120; i++) { g.fillStyle = rng.chance(0.5) ? '#000' : '#fff'; g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(1, 2.5), rng.range(1, 2.5)); }
  g.globalAlpha = 1;
  // ---- team halves tint
  const grdL = g.createLinearGradient(0, 0, W * 0.32, 0);
  grdL.addColorStop(0, 'rgba(47,155,255,0.26)'); grdL.addColorStop(1, 'rgba(47,155,255,0)');
  g.fillStyle = grdL; g.fillRect(0, 0, W * 0.32, H);
  const grdR = g.createLinearGradient(W, 0, W * 0.68, 0);
  grdR.addColorStop(0, 'rgba(255,59,78,0.26)'); grdR.addColorStop(1, 'rgba(255,59,78,0)');
  g.fillStyle = grdR; g.fillRect(W * 0.68, 0, W * 0.32, H);
  // ---- contact shadows (ambient occlusion) under walls, bushes and the border
  g.save();
  g.filter = `blur(${Math.round(px * 0.12)}px)`;
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (const w of a.walls) { if (w.dynamic || w.border) continue; g.fillRect(w.x * u - px * 0.05, w.y * u - px * 0.02, w.w * u + px * 0.16, w.h * u + px * 0.2); }
  g.fillStyle = 'rgba(0,30,0,0.22)';
  for (const b of a.bushes) g.fillRect(b.x * u, b.y * u + px * 0.08, b.w * u, b.h * u);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 0, W, px * 0.12); g.fillRect(0, H - px * 0.08, W, px * 0.08);
  g.restore();
  // ---- markings: crisp double lines with a soft outer glow
  const line = (draw: () => void, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); draw(); g.stroke(); };
  const mark = (draw: () => void) => { line(draw, 9, 'rgba(255,255,255,0.12)'); line(draw, 4.5, 'rgba(255,255,255,0.6)'); };
  const cx = W / 2, cy = H / 2;
  mark(() => { g.moveTo(cx, 0); g.lineTo(cx, cy - px * 2.6); g.moveTo(cx, cy + px * 2.6); g.lineTo(cx, H); });
  mark(() => g.arc(cx, cy, px * 2.6, 0, Math.PI * 2));
  line(() => g.arc(cx, cy, px * 2.15, 0, Math.PI * 2), 2, 'rgba(255,255,255,0.35)');
  // center emblem: rift star
  g.save(); g.translate(cx, cy);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  for (let k = 0; k < 16; k++) { const ang = (k / 16) * Math.PI * 2, r = k % 2 ? px * 0.55 : px * 1.35; g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, px * 0.38, 0, 7); g.fill();
  g.restore();
  // lane dashes
  g.setLineDash([px * 0.35, px * 0.35]);
  line(() => { g.moveTo(px * 3, H * 0.25); g.lineTo(W - px * 3, H * 0.25); g.moveTo(px * 3, H * 0.75); g.lineTo(W - px * 3, H * 0.75); }, 2.5, 'rgba(255,255,255,0.16)');
  g.setLineDash([]);
  // portal goal areas with team colour
  for (const p of a.portals) {
    const col = p.team === 0 ? '47,155,255' : '255,59,78';
    const gx = (p.team === 0 ? p.x + p.w : p.x) * u, gy = (p.y + p.h / 2) * u;
    const a0 = p.team === 0 ? -Math.PI / 2 : Math.PI / 2, a1 = p.team === 0 ? Math.PI / 2 : Math.PI * 1.5;
    g.fillStyle = `rgba(${col},0.14)`; g.beginPath(); g.moveTo(gx, gy); g.arc(gx, gy, px * 2.8, a0, a1); g.fill();
    line(() => g.arc(gx, gy, px * 2.8, a0, a1), 10, `rgba(${col},0.18)`);
    line(() => g.arc(gx, gy, px * 2.8, a0, a1), 5, `rgba(${col},0.85)`);
    line(() => g.arc(gx, gy, px * 1.6, a0, a1), 2.5, `rgba(${col},0.55)`);
    // chevrons pointing at the goal
    g.fillStyle = `rgba(${col},0.35)`;
    for (let k = 0; k < 3; k++) {
      const dir = p.team === 0 ? -1 : 1, x0 = gx + dir * -px * (3.4 + k * 0.6);
      g.beginPath(); g.moveTo(x0 + dir * px * 0.3, gy); g.lineTo(x0 - dir * px * 0.05, gy - px * 0.35); g.lineTo(x0 - dir * px * 0.05, gy - px * 0.2); g.lineTo(x0 + dir * px * 0.12, gy); g.lineTo(x0 - dir * px * 0.05, gy + px * 0.2); g.lineTo(x0 - dir * px * 0.05, gy + px * 0.35); g.closePath(); g.fill();
    }
  }
  // hazard frames (boost lanes / jump pads get painted borders so they read well)
  for (const h of a.hazards) {
    if (h.kind !== 'boost' && h.kind !== 'jump') continue;
    g.strokeStyle = h.kind === 'boost' ? 'rgba(255,209,102,0.7)' : 'rgba(255,123,0,0.7)'; g.lineWidth = 4; g.setLineDash([px * 0.18, px * 0.12]);
    g.strokeRect(h.x * u - 4, h.y * u - 4, h.w * u + 8, h.h * u + 8); g.setLineDash([]);
  }
  // shrine plates
  for (const s of a.shrines) { const grd = g.createRadialGradient(s.x * u, s.y * u, 0, s.x * u, s.y * u, px * 0.9); grd.addColorStop(0, 'rgba(255,255,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(s.x * u, s.y * u, px * 0.9, 0, 7); g.fill(); }
  return c;
}

/** One sculpted wall block: dark plinth, bevelled body, lighter cap with a trim lip. Vertex-coloured. */
export function wallBlock(x: number, z: number, w: number, d: number, height: number, top: string, side: string): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const piece = (geo: THREE.BufferGeometry, y: number, ctop: string, cside: string) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.translate(x, y, z);
    const n = g.attributes.normal, col = new Float32Array(n.count * 3);
    const ct = new THREE.Color(ctop), cs = new THREE.Color(cside), cd = new THREE.Color(cside).multiplyScalar(0.78);
    for (let i = 0; i < n.count; i++) {
      const ny = n.getY(i), nx = Math.abs(n.getX(i));
      const cc = ny > 0.55 ? ct : nx > 0.5 ? cd : cs;
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    out.push(g);
  };
  const r = Math.min(0.08, Math.min(w, d) * 0.15);
  piece(new THREE.BoxGeometry(w + 0.1, 0.14, d + 0.1), 0.07, shade(side, -0.3), shade(side, -0.35));
  piece(new RoundedBoxGeometry(w, height - 0.16, d, 2, r), 0.14 + (height - 0.16) / 2, top, side);
  piece(new RoundedBoxGeometry(w + 0.06, 0.12, d + 0.06, 2, 0.04), height - 0.02, shade(top, 0.12), shade(top, -0.18));
  return out;
}
