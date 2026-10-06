/** Wall clock helpers — kept in one place so tests/servers can override "now". */
let offset = 0;
export const Clock = {
  now(): number { return Date.now() + offset; },
  /** Testing hook: shift time forward (ms). */
  advance(ms: number) { offset += ms; },
  reset() { offset = 0; },
};

export const DAY_MS = 86_400_000;
export const utcDayIndex = (t = Clock.now()) => Math.floor(t / DAY_MS);
export const utcWeekIndex = (t = Clock.now()) => Math.floor((t / DAY_MS + 3) / 7); // weeks start Monday

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
