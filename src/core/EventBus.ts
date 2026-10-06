type Handler<T> = (payload: T) => void;

/** Typed pub/sub used to decouple systems (match -> missions, shop -> notifications, ...). */
export class EventBus<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Handler<any>>>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) { set = new Set(); this.map.set(type, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error('[EventBus]', String(type), e); }
    }
  }

  clear() { this.map.clear(); }
}
