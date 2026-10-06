import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory, GrantedItem } from '../progression/Inventory';
import type { EventService } from '../events/EventService';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import { CRATES, DAILY_SHOP, OFFERS } from '../data/shop';
import { COSMETICS, RARITY_GEM_VALUE, getCosmetic } from '../data/cosmetics';
import { currentSeason } from '../data/seasons';
import type { CosmeticData, CrateData, Currency, RewardItem, ShopOfferData } from '../data/types';
import { Clock, DAY_MS, utcDayIndex, utcWeekIndex } from '../core/Time';
import { hashString, Rng } from '../core/Rng';
import { getProduct } from '../data/products';

export interface DailyItem { cosmetic: CosmeticData; price: { currency: Currency; amount: number }; owned: boolean; key: string }
export interface OfferView { offer: ShopOfferData; left: number; endsAt: number | null; value: number; available: boolean }

export const COINS_PER_GEM_REF = 33; // reference rate from the 30-gem coin offer (1000 coins)

/** Shop logic: daily rotation, offers with purchase windows, crates. Real-money offers are delegated to IapService. */
export class ShopService {
  constructor(private save: SaveSystem, private inv: Inventory, private events: EventService, private notes: NotificationCenter, private bus: EventBus<AppEvents>, private level: () => number) {}
  private get d() { return this.save.data; }

  dayKey(now = Clock.now()) { return String(utcDayIndex(now - DAILY_SHOP.refreshHourUtc * 3600_000)); }
  nextRefresh(now = Clock.now()) { return (utcDayIndex(now - DAILY_SHOP.refreshHourUtc * 3600_000) + 1) * DAY_MS + DAILY_SHOP.refreshHourUtc * 3600_000; }

  /** Same rotation for every player on a given day; changing DAILY_SHOP.seed (server) reshuffles it. */
  daily(now = Clock.now()): DailyItem[] {
    const key = this.dayKey(now);
    const rng = new Rng(hashString(DAILY_SHOP.seed + ':' + key));
    const out: DailyItem[] = [];
    for (const slot of DAILY_SHOP.slots) {
      if (slot.type === 'bundle') continue;
      const pool = COSMETICS.filter((c) => c.type === slot.type && c.source !== 'default' && c.source !== 'mastery' && c.source !== 'trophy_road' && c.source !== 'achievement' && !c.source.startsWith('pass') && c.source !== 'event');
      rng.shuffle(pool);
      for (const c of pool.slice(0, slot.count)) {
        const own = c.priceGems ? { currency: 'gems' as const, amount: c.priceGems } : c.priceCoins ? { currency: 'coins' as const, amount: c.priceCoins } : null;
        const byR = DAILY_SHOP.priceByRarity[c.rarity];
        const price = own ?? (byR.gems ? { currency: 'gems' as const, amount: byR.gems } : { currency: 'coins' as const, amount: byR.coins ?? 500 });
        out.push({ cosmetic: c, price, owned: this.inv.owns(c.id), key: `daily:${key}:${c.id}` });
      }
    }
    return out;
  }

  /** Called on app start / shop open; notifies once per rotation. */
  checkRefresh() {
    const key = this.dayKey();
    if (this.d.shop.lastDailySeen !== key) {
      const first = this.d.shop.lastDailySeen === '';
      this.d.shop.lastDailySeen = key;
      this.save.save();
      if (!first) { this.notes.push('shop', 'Boutique renouvelée !', 'De nouveaux objets sont disponibles aujourd\'hui.'); this.bus.emit('shopRefresh', { day: key }); }
    }
  }

  buyDaily(cosmeticId: string): GrantedItem[] | null {
    const item = this.daily().find((x) => x.cosmetic.id === cosmeticId);
    if (!item || item.owned) return null;
    const txn = `${item.key}`;
    const ok = item.price.currency === 'coins' ? this.inv.spendCoins(item.price.amount) : this.inv.spendGems(item.price.amount, item.key, txn);
    if (!ok) return null;
    return this.inv.grant([{ kind: 'cosmetic', id: cosmeticId }], { source: 'shop_daily', txn, verified: false });
  }

  windowKey(o: ShopOfferData, now = Clock.now()): string {
    switch (o.window) {
      case 'once': return 'once';
      case 'daily': return 'd' + utcDayIndex(now);
      case 'weekly': return 'w' + utcWeekIndex(now);
      case 'season': return currentSeason(now).id;
      case 'event': { const ev = this.events.active(now).find((e) => e.data.id === o.eventId); return 'e' + (ev ? ev.start : 0); }
    }
  }

  windowEnd(o: ShopOfferData, now = Clock.now()): number | null {
    switch (o.window) {
      case 'daily': return (utcDayIndex(now) + 1) * DAY_MS;
      case 'weekly': return (utcWeekIndex(now) + 1) * 7 * DAY_MS - 3 * DAY_MS;
      case 'season': return Date.parse(currentSeason(now).end);
      case 'event': { const ev = this.events.active(now).find((e) => e.data.id === o.eventId); return ev ? ev.end : null; }
      default: return null;
    }
  }

  purchasesIn(o: ShopOfferData) { return this.d.shop.purchases[`${o.id}@${this.windowKey(o)}`] ?? 0; }

  offers(now = Clock.now()): OfferView[] {
    return OFFERS.filter((o) => {
      if (o.eventId && !this.events.isActive(o.eventId, now)) return false;
      if (o.minLevel && this.level() < o.minLevel) return false;
      if (o.window === 'once' && this.purchasesIn(o) >= o.limit) return false;
      return true;
    }).map((o) => {
      const left = Math.max(0, o.limit - this.purchasesIn(o));
      const ownedAll = o.items.every((i) => i.kind === 'cosmetic' && (i.id.startsWith('pass_') ? this.inv.hasEntitlement(i.id) : this.inv.owns(i.id)));
      return { offer: o, left, endsAt: this.windowEnd(o, now), value: this.valueOf(o.items), available: left > 0 && !ownedAll };
    });
  }

  /** Honest reference value in gems (sum of each item's standalone price). */
  valueOf(items: RewardItem[]): number {
    let v = 0;
    for (const i of items) {
      if (i.kind === 'gems') v += i.amount;
      else if (i.kind === 'coins') v += Math.round(i.amount / COINS_PER_GEM_REF);
      else if (i.kind === 'cosmetic') {
        if (i.id.startsWith('pass_premium')) v += currentSeason(Clock.now()).passPriceGems;
        else { const c = getCosmetic(i.id); if (c) v += c.priceGems ?? (c.priceCoins ? Math.round(c.priceCoins / COINS_PER_GEM_REF) : RARITY_GEM_VALUE[c.rarity]); }
      } else if (i.kind === 'crate') { const c = CRATES.find((x) => x.id === i.id); if (c) v += Math.round((c.priceCoins * i.count) / COINS_PER_GEM_REF); }
    }
    return v;
  }

  /** Virtual-currency offers only. Real-money offers must go through IapService.purchase(). */
  buyOffer(offerId: string): GrantedItem[] | null {
    const view = this.offers().find((v) => v.offer.id === offerId);
    if (!view || !view.available) return null;
    const o = view.offer;
    if ('productId' in o.price) throw new Error('Real-money offer — use IapService');
    const wkey = `${o.id}@${this.windowKey(o)}`;
    const txn = `offer:${wkey}:${this.purchasesIn(o)}`;
    const ok = o.price.currency === 'coins' ? this.inv.spendCoins(o.price.amount) : this.inv.spendGems(o.price.amount, o.id, txn);
    if (!ok) return null;
    this.d.shop.purchases[wkey] = (this.d.shop.purchases[wkey] ?? 0) + 1;
    return this.inv.grant(o.items, { source: `offer:${o.id}`, txn, verified: false });
  }

  /** Mark a real-money offer window as consumed (called by IapService after validation). */
  markOfferPurchasedForProduct(productId: string) {
    for (const o of OFFERS) {
      if ('productId' in o.price && o.price.productId === productId) {
        const wkey = `${o.id}@${this.windowKey(o)}`;
        this.d.shop.purchases[wkey] = (this.d.shop.purchases[wkey] ?? 0) + 1;
      }
    }
    this.save.save();
  }

  productFor(o: ShopOfferData) { return 'productId' in o.price ? getProduct(o.price.productId) : undefined; }

  // ---------------------------------------------------------------- crates (cosmetic only, coins only, odds displayed)

  crates(): CrateData[] { return CRATES; }

  buyCrate(id: string): boolean {
    const c = CRATES.find((x) => x.id === id);
    if (!c || !this.inv.spendCoins(c.priceCoins)) return false;
    this.d.crates[id] = (this.d.crates[id] ?? 0) + 1;
    this.save.save();
    return true;
  }

  openCrate(id: string, rng: () => number = Math.random): GrantedItem[] | null {
    const c = CRATES.find((x) => x.id === id);
    if (!c || (this.d.crates[id] ?? 0) <= 0) return null;
    this.d.crates[id]--;
    const items: RewardItem[] = [];
    for (let i = 0; i < c.items; i++) {
      let roll = rng() * 100, rarity = c.table[0].rarity;
      for (const t of c.table) { if (roll < t.chance) { rarity = t.rarity; break; } roll -= t.chance; }
      // prefer unowned cosmetics of that rarity; duplicates convert to coins (shown to the player)
      const pool = COSMETICS.filter((x) => x.rarity === rarity && x.source !== 'default' && x.source !== 'mastery' && x.source !== 'trophy_road' && x.source !== 'achievement' && !x.source.startsWith('pass'));
      const fresh = pool.filter((x) => !this.inv.owns(x.id) && !items.some((it) => it.kind === 'cosmetic' && it.id === x.id));
      const from = fresh.length ? fresh : pool;
      if (from.length) items.push({ kind: 'cosmetic', id: from[Math.floor(rng() * from.length)].id });
      else items.push({ kind: 'coins', amount: c.duplicateCoins[rarity] });
    }
    return this.inv.grant(items, { source: `crate:${id}`, txn: `crate:${id}:${Date.now()}:${Math.floor(rng() * 1e9)}`, verified: false });
  }
}
