/**
 * Key/value persistence. Synchronous in-memory API backed by localStorage (web/WebView) and mirrored to
 * Capacitor Preferences on device (survives WebView storage eviction). Tests use the in-memory backend.
 */
export interface KVBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryBackend implements KVBackend {
  map = new Map<string, string>();
  get(k: string) { return this.map.get(k) ?? null; }
  set(k: string, v: string) { this.map.set(k, v); }
  remove(k: string) { this.map.delete(k); }
}

export class LocalStorageBackend implements KVBackend {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch (e) { console.warn('localStorage write failed', e); } }
  remove(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
}

/** Mirrors writes to Capacitor Preferences when running natively. */
export class NativeMirroredBackend extends LocalStorageBackend {
  private prefs: any = null;
  async init(keys: string[]) {
    try {
      const cap = (window as any).Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const mod = await import('@capacitor/preferences');
      this.prefs = mod.Preferences;
      // hydrate: if the WebView storage was cleared, restore from native prefs
      for (const k of keys) {
        const local = super.get(k);
        const { value } = await this.prefs.get({ key: k });
        if (!local && value) super.set(k, value);
      }
    } catch (e) { console.warn('Preferences unavailable', e); }
  }
  override set(k: string, v: string) {
    super.set(k, v);
    if (this.prefs) this.prefs.set({ key: k, value: v }).catch(() => {});
  }
  override remove(k: string) {
    super.remove(k);
    if (this.prefs) this.prefs.remove({ key: k }).catch(() => {});
  }
}
