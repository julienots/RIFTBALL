/** Haptic feedback via Capacitor on device, navigator.vibrate on web. */
let hapticsMod: any = null;
let loading = false;

export function haptic(kind: 'light' | 'medium' | 'heavy', enabled: boolean) {
  if (!enabled) return;
  const cap = (globalThis as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    if (!hapticsMod && !loading) { loading = true; import('@capacitor/haptics').then((m) => { hapticsMod = m; }).catch(() => {}); return; }
    if (hapticsMod) hapticsMod.Haptics.impact({ style: kind === 'light' ? 'LIGHT' : kind === 'medium' ? 'MEDIUM' : 'HEAVY' }).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(kind === 'light' ? 8 : kind === 'medium' ? 18 : 35); } catch { /* ignore */ }
}
