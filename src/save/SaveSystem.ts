import { hashString } from '../core/Rng';
import type { KVBackend } from './Storage';
import { createDefaultSave, MIGRATIONS, SAVE_VERSION, type SaveData } from './SaveData';
import { PLAYABLE } from '../data/characters';
import { DEFAULT_SETTINGS } from '../core/Settings';

const SALT = 'rb::integrity::v1';

/**
 * Robust local save:
 *  - JSON envelope {v, data, sum} with an integrity checksum (detects corruption / casual edits);
 *  - primary + backup slot, written alternately: a crash during write never loses both;
 *  - versioned migrations;
 *  - repair pass (missing fields, new heroes, gem balance recomputed from the ledger).
 * NOTE: a local checksum is not real security. The authoritative copy of premium data must live on the
 * server (see /src/networking/Authority.ts); the local save is a cache in online mode.
 */
export class SaveSystem {
  data: SaveData;
  loadReport: { source: 'primary' | 'backup' | 'new'; corrupted: boolean; migratedFrom: number | null } = { source: 'new', corrupted: false, migratedFrom: null };
  private dirty = false;
  private timer: any = null;

  constructor(private kv: KVBackend, private key = 'riftball.save') {
    this.data = this.load();
  }

  static checksum(json: string) { return hashString(SALT + json + json.length).toString(36); }

  private readSlot(slot: string): SaveData | null {
    const raw = this.kv.get(slot);
    if (!raw) return null;
    try {
      const env = JSON.parse(raw);
      if (!env || typeof env.data !== 'string' || typeof env.sum !== 'string') return null;
      if (SaveSystem.checksum(env.data) !== env.sum) { this.loadReport.corrupted = true; return null; }
      return JSON.parse(env.data);
    } catch {
      this.loadReport.corrupted = true;
      return null;
    }
  }

  load(): SaveData {
    let data = this.readSlot(this.key);
    if (data) this.loadReport.source = 'primary';
    else {
      data = this.readSlot(this.key + '.bak');
      if (data) this.loadReport.source = 'backup';
    }
    if (!data) { this.loadReport.source = 'new'; data = createDefaultSave(); }
    data = this.migrate(data);
    this.repair(data);
    this.data = data;
    if (this.loadReport.source !== 'primary') this.writeNow();
    return data;
  }

  private migrate(d: any): SaveData {
    let v = Number(d.version) || 1;
    if (v < SAVE_VERSION) this.loadReport.migratedFrom = v;
    while (v < SAVE_VERSION) {
      const fn = MIGRATIONS[v];
      if (!fn) break;
      d = fn(d);
      v = d.version;
    }
    return d;
  }

  /** Fill missing fields and recompute derived values so a partial/old save can never crash the game. */
  repair(d: SaveData) {
    const def = createDefaultSave();
    for (const k of Object.keys(def) as (keyof SaveData)[]) if ((d as any)[k] === undefined) (d as any)[k] = (def as any)[k];
    d.settings = { ...DEFAULT_SETTINGS, ...d.settings };
    d.profile = { ...def.profile, ...d.profile };
    d.stats = { ...def.stats, ...d.stats };
    d.equipped = { ...def.equipped, ...d.equipped };
    for (const c of PLAYABLE) if (!d.heroes[c.id]) d.heroes[c.id] = def.heroes[c.id];
    for (const id of def.cosmetics) if (!d.cosmetics.includes(id)) d.cosmetics.push(id);
    d.cosmetics = Array.from(new Set(d.cosmetics));
    d.coins = Math.max(0, Math.floor(Number(d.coins) || 0));
    d.trophies = Math.max(0, Math.floor(Number(d.trophies) || 0));
    // Premium balance is derived from the ledger only.
    d.gems = SaveSystem.ledgerBalance(d);
    if (d.processedMatches.length > 100) d.processedMatches = d.processedMatches.slice(-100);
    if (d.inbox.length > 60) d.inbox = d.inbox.slice(-60);
    if (d.matchHistory.length > 30) d.matchHistory = d.matchHistory.slice(-30);
  }

  static ledgerBalance(d: SaveData) {
    let b = 0;
    const seen = new Set<string>();
    for (const e of d.ledger) {
      const key = e.kind + ':' + e.id;
      if (seen.has(key)) continue; // duplicated transaction ids never count twice
      seen.add(key);
      b += e.kind === 'grant' ? e.amount : -e.amount;
    }
    return Math.max(0, b);
  }

  /** Debounced persist (coalesces many writes in the same frame). */
  save() {
    this.dirty = true;
    if (this.timer) return;
    const run = () => { this.timer = null; if (this.dirty) this.writeNow(); };
    this.timer = typeof setTimeout !== 'undefined' ? setTimeout(run, 250) : null;
    if (!this.timer) run();
  }

  writeNow() {
    this.dirty = false;
    this.data.updatedAt = Date.now();
    const json = JSON.stringify(this.data);
    const env = JSON.stringify({ v: SAVE_VERSION, data: json, sum: SaveSystem.checksum(json) });
    // backup first, then primary
    const prev = this.kv.get(this.key);
    if (prev) this.kv.set(this.key + '.bak', prev);
    this.kv.set(this.key, env);
  }

  flush() { if (this.dirty) this.writeNow(); }

  reset() {
    this.kv.remove(this.key);
    this.kv.remove(this.key + '.bak');
    this.data = createDefaultSave();
    this.writeNow();
  }

  /** Export for future cloud sync (account link). */
  exportJson() { return JSON.stringify(this.data); }
}
