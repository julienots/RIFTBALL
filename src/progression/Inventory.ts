import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import type { SaveSystem } from '../save/SaveSystem';
import type { RewardItem } from '../data/types';
import { getCosmetic } from '../data/cosmetics';
import { CRATES } from '../data/shop';
import { ECONOMY } from '../data/progression';
import { getCharacter } from '../data/characters';
import { SaveSystem as SS } from '../save/SaveSystem';
import type { NotificationCenter } from '../notifications/NotificationCenter';

export interface GrantContext {
  source: string;
  /** Unique transaction id — grants are idempotent per (txn, index). */
  txn: string;
  verified: boolean;
}

export interface GrantedItem { item: RewardItem; duplicate?: boolean; coinsInstead?: number }

/**
 * The only place allowed to change currencies & ownership. Premium currency moves through an
 * append-only ledger so balances can be audited, de-duplicated and revoked (refunds).
 */
export class Inventory {
  onPassXp: (amount: number) => void = () => {};
  onXp: (amount: number) => void = () => {};

  constructor(private save: SaveSystem, private bus: EventBus<AppEvents>, private notes: NotificationCenter) {}
  private get d() { return this.save.data; }

  get coins() { return this.d.coins; }
  get gems() { return this.d.gems; }
  owns(id: string) { return this.d.cosmetics.includes(id); }
  hasEntitlement(key: string) { return !!this.d.entitlements[key]; }
  hasHero(id: string) { return !!this.d.heroes[id]?.unlocked; }

  grant(items: RewardItem[], ctx: GrantContext): GrantedItem[] {
    const out: GrantedItem[] = [];
    items.forEach((item, i) => {
      const txn = `${ctx.txn}#${i}`;
      switch (item.kind) {
        case 'coins': this.d.coins += Math.max(0, Math.floor(item.amount)); out.push({ item }); break;
        case 'gems': {
          if (this.d.ledger.some((e) => e.id === txn && e.kind === 'grant')) break; // already granted
          this.d.ledger.push({ id: txn, kind: 'grant', amount: Math.floor(item.amount), source: ctx.source, at: Date.now(), verified: ctx.verified });
          this.d.gems = SS.ledgerBalance(this.d);
          out.push({ item });
          break;
        }
        case 'xp': this.onXp(item.amount); out.push({ item }); break;
        case 'passXp': this.onPassXp(item.amount); out.push({ item }); break;
        case 'crate': this.d.crates[item.id] = (this.d.crates[item.id] ?? 0) + item.count; out.push({ item }); break;
        case 'hero': {
          const h = this.d.heroes[item.id];
          if (h && !h.unlocked) {
            h.unlocked = true;
            out.push({ item });
            this.bus.emit('unlocked', { kind: 'hero', id: item.id });
            this.notes.push('reward', 'Nouveau héros !', `${getCharacter(item.id).name} a rejoint votre équipe.`);
          } else { this.d.coins += 1000; out.push({ item, duplicate: true, coinsInstead: 1000 }); }
          break;
        }
        case 'cosmetic': {
          if (item.id.startsWith('pass_')) {
            if (!this.d.entitlements[item.id]) this.d.entitlements[item.id] = { source: ctx.source.startsWith('iap') ? 'iap' : ctx.source.startsWith('gems') ? 'gems' : 'reward', txn, at: Date.now() };
            out.push({ item });
            break;
          }
          const c = getCosmetic(item.id);
          if (!c) { console.warn('unknown cosmetic', item.id); break; }
          if (this.owns(item.id)) {
            const coins = CRATES[0].duplicateCoins[c.rarity];
            this.d.coins += coins;
            out.push({ item, duplicate: true, coinsInstead: coins });
          } else {
            this.d.cosmetics.push(item.id);
            out.push({ item });
            this.bus.emit('unlocked', { kind: 'cosmetic', id: item.id });
            if (c.type === 'skin') this.notes.push('skin', 'Nouveau skin !', `${c.name} est dans votre collection.`);
          }
          break;
        }
      }
    });
    this.changed();
    return out;
  }

  spendCoins(amount: number): boolean {
    if (amount < 0 || this.d.coins < amount) return false;
    this.d.coins -= amount;
    this.changed();
    return true;
  }

  /** Spend gems through the ledger. `txn` must be unique per purchase (prevents double spending). */
  spendGems(amount: number, source: string, txn: string): boolean {
    if (amount < 0 || this.d.gems < amount) return false;
    if (this.d.ledger.some((e) => e.id === txn && e.kind === 'spend')) return false;
    this.d.ledger.push({ id: txn, kind: 'spend', amount, source, at: Date.now(), verified: false });
    this.d.gems = SS.ledgerBalance(this.d);
    this.changed();
    return true;
  }

  /** Refund / chargeback reported by the platform: revoke what the transaction granted. */
  revokeTransaction(orderId: string, grants: RewardItem[]) {
    grants.forEach((g, i) => {
      const txn = `iap:${orderId}#${i}`;
      if (g.kind === 'gems' && this.d.ledger.some((e) => e.id === txn && e.kind === 'grant') && !this.d.ledger.some((e) => e.id === txn && e.kind === 'revoke')) {
        this.d.ledger.push({ id: txn, kind: 'revoke', amount: g.amount, source: 'refund', at: Date.now(), verified: true });
      }
      if (g.kind === 'cosmetic' && g.id.startsWith('pass_')) delete this.d.entitlements[g.id];
      if (g.kind === 'cosmetic' && !g.id.startsWith('pass_')) this.d.cosmetics = this.d.cosmetics.filter((c) => c !== g.id);
    });
    this.d.gems = SS.ledgerBalance(this.d);
    this.changed();
  }

  /** Coin income from matches is capped per day (anti-farm). Returns the amount actually granted. */
  grantMatchCoins(amount: number, day: number): number {
    if (this.d.dailyCoins.day !== day) this.d.dailyCoins = { day, amount: 0 };
    const room = Math.max(0, ECONOMY.dailyMatchCoinCap - this.d.dailyCoins.amount);
    const given = Math.min(room, amount);
    this.d.dailyCoins.amount += given;
    this.d.coins += given;
    this.changed();
    return given;
  }

  changed() {
    this.save.save();
    this.bus.emit('wallet', { coins: this.d.coins, gems: this.d.gems });
  }
}
