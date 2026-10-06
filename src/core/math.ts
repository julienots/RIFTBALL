export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export interface Rect { x: number; y: number; w: number; h: number }

export function pointInRect(px: number, py: number, r: Rect) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Circle vs AABB overlap test; returns push-out vector into `out` when overlapping. */
export function circleRectPush(cx: number, cy: number, cr: number, r: Rect, out: { x: number; y: number }): boolean {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return false;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    out.x = (dx / d) * (cr - d);
    out.y = (dy / d) * (cr - d);
  } else {
    // center inside rect: push out along smallest axis
    const left = cx - r.x, right = r.x + r.w - cx, top = cy - r.y, bottom = r.y + r.h - cy;
    const m = Math.min(left, right, top, bottom);
    out.x = m === left ? -(left + cr) : m === right ? right + cr : 0;
    out.y = m === top ? -(top + cr) : m === bottom ? bottom + cr : 0;
  }
  return true;
}

/** Segment vs AABB (slab test). */
export function segmentHitsRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dy = y1 - y0;
  if (Math.abs(dx) < 1e-9) { if (x0 < r.x || x0 > r.x + r.w) return false; }
  else {
    let t1 = (r.x - x0) / dx, t2 = (r.x + r.w - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) { if (y0 < r.y || y0 > r.y + r.h) return false; }
  else {
    let t1 = (r.y - y0) / dy, t2 = (r.y + r.h - y0) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
