import { describe, it, expect } from 'vitest';
import { MemoryBackend } from '../../src/save/Storage';
import { SaveSystem } from '../../src/save/SaveSystem';
import { createDefaultSave } from '../../src/save/SaveData';

describe('Save', () => {
  it('save then load restores the same data', () => {
    const kv = new MemoryBackend();
    const s = new SaveSystem(kv);
    s.data.coins = 1234; s.data.profile.name = 'Testeur'; s.data.cosmetics.push('emote_fire');
    s.writeNow();
    const s2 = new SaveSystem(kv);
    expect(s2.loadReport.source).toBe('primary');
    expect(s2.data.coins).toBe(1234);
    expect(s2.data.profile.name).toBe('Testeur');
    expect(s2.data.cosmetics).toContain('emote_fire');
  });

  it('corrupted primary falls back to backup', () => {
    const kv = new MemoryBackend();
    const s = new SaveSystem(kv);
    s.data.coins = 111; s.writeNow();
    s.data.coins = 222; s.writeNow(); // backup now holds 111
    kv.set('riftball.save', '{garbage');
    const s2 = new SaveSystem(kv);
    expect(s2.loadReport.corrupted).toBe(true);
    expect(s2.loadReport.source).toBe('backup');
    expect(s2.data.coins).toBe(111);
  });

  it('tampered save (bad checksum) is not trusted', () => {
    const kv = new MemoryBackend();
    const s = new SaveSystem(kv);
    s.writeNow();
    const env = JSON.parse(kv.get('riftball.save')!);
    const data = JSON.parse(env.data); data.coins = 99999999;
    env.data = JSON.stringify(data);
    kv.set('riftball.save', JSON.stringify(env));
    kv.remove('riftball.save.bak');
    const s2 = new SaveSystem(kv);
    expect(s2.data.coins).not.toBe(99999999);
  });

  it('gem balance is derived from the ledger only', () => {
    const kv = new MemoryBackend();
    const s = new SaveSystem(kv);
    s.data.ledger.push({ id: 'a', kind: 'grant', amount: 100, source: 't', at: 0, verified: true });
    s.data.ledger.push({ id: 'a', kind: 'grant', amount: 100, source: 't', at: 0, verified: true }); // duplicate txn
    s.data.gems = 50000; // edited cache
    s.writeNow();
    const s2 = new SaveSystem(kv);
    expect(s2.data.gems).toBe(100);
  });

  it('migrates v1 saves to the current version', () => {
    const kv = new MemoryBackend();
    const v1: any = createDefaultSave();
    v1.version = 1; v1.gems = 75; delete v1.ledger; delete v1.matchHistory; delete v1.crates;
    for (const k of Object.keys(v1.heroes)) delete v1.heroes[k].trophies;
    const json = JSON.stringify(v1);
    kv.set('riftball.save', JSON.stringify({ v: 1, data: json, sum: SaveSystem.checksum(json) }));
    const s = new SaveSystem(kv);
    expect(s.loadReport.migratedFrom).toBe(1);
    expect(s.data.version).toBe(3);
    expect(s.data.gems).toBe(75);
    expect(Array.isArray(s.data.matchHistory)).toBe(true);
    expect(s.data.heroes.magnet.trophies).toBe(0);
  });

  it('total corruption starts a fresh profile without crashing', () => {
    const kv = new MemoryBackend();
    kv.set('riftball.save', 'null'); kv.set('riftball.save.bak', '42');
    const s = new SaveSystem(kv);
    expect(s.loadReport.source).toBe('new');
    expect(s.data.level).toBe(1);
  });
});
