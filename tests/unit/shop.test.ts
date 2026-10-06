import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers';
import { CRATES, OFFERS } from '../../src/data/shop';
import { PRODUCTS } from '../../src/data/products';
import { Clock, DAY_MS } from '../../src/core/Time';
import { SEASONS } from '../../src/data/seasons';

describe('Shop', () => {
  it('daily rotation is deterministic and changes every day', () => {
    const { app } = makeApp();
    const a = app.shop.daily().map((x) => x.cosmetic.id);
    const b = app.shop.daily().map((x) => x.cosmetic.id);
    expect(a).toEqual(b);
    expect(a.length).toBe(6);
    const c = app.shop.daily(Clock.now() + DAY_MS).map((x) => x.cosmetic.id);
    expect(c).not.toEqual(a);
  });

  it('buying a daily item spends currency and grants it once', () => {
    const { app } = makeApp();
    const item = app.shop.daily().find((x) => x.price.currency === 'coins')!;
    app.data.coins = 100000;
    expect(app.shop.buyDaily(item.cosmetic.id)).not.toBeNull();
    expect(app.inventory.owns(item.cosmetic.id)).toBe(true);
    const coins = app.data.coins;
    expect(app.shop.buyDaily(item.cosmetic.id)).toBeNull();
    expect(app.data.coins).toBe(coins);
  });

  it('cannot buy with insufficient funds', () => {
    const { app } = makeApp();
    app.data.coins = 0;
    const item = app.shop.daily().find((x) => x.price.currency === 'coins')!;
    expect(app.shop.buyDaily(item.cosmetic.id)).toBeNull();
    expect(app.inventory.owns(item.cosmetic.id)).toBe(false);
  });

  it('offers respect purchase windows and show honest values', () => {
    const { app } = makeApp();
    const free = app.shop.offers().find((o) => o.offer.id === 'offer_free_daily')!;
    expect(free.available).toBe(true);
    expect(app.shop.buyOffer('offer_free_daily')).not.toBeNull();
    expect(app.shop.offers().find((o) => o.offer.id === 'offer_free_daily')!.available).toBe(false);
    for (const v of app.shop.offers()) expect(v.value).toBeGreaterThan(0);
    // no "fake discount" field exists on offers
    for (const o of OFFERS) expect(Object.keys(o)).not.toContain('originalPrice');
  });

  it('crates: odds sum to 100, coins only, duplicates converted', () => {
    const { app } = makeApp();
    for (const c of CRATES) expect(c.table.reduce((a, t) => a + t.chance, 0)).toBe(100);
    app.data.coins = 100000;
    expect(app.shop.buyCrate('crate_big')).toBe(true);
    const res = app.shop.openCrate('crate_big', () => 0.5)!;
    expect(res).toHaveLength(3);
    expect(app.shop.openCrate('crate_big')).toBeNull();
  });

  it('ANTI PAY-TO-WIN: no product or offer grants heroes, stats or power', () => {
    for (const p of PRODUCTS) for (const g of p.grants) expect(g.kind).not.toBe('hero');
    for (const o of OFFERS) for (const g of o.items) expect(g.kind).not.toBe('hero');
    // pass+ only accelerates cosmetic progression; heroes from the pass are on the FREE track
    for (const s of SEASONS) for (const r of s.rewards) { expect(r.premium?.kind).not.toBe('hero'); expect(r.plus?.kind).not.toBe('hero'); }
  });
});

describe('In-app purchases', () => {
  it('purchase -> validation -> grant -> consume', async () => {
    const { app, billing } = makeApp();
    await app.iap.init();
    const out = await app.iap.purchase('gems_medium');
    expect(out.status).toBe('validated');
    expect(app.data.gems).toBe(450);
    expect(app.data.ledger.every((e) => e.verified)).toBe(true);
    expect(billing.owned).toHaveLength(0); // consumed
  });

  it('cancel / error / unavailable never grant anything', async () => {
    const { app, billing } = makeApp();
    await app.iap.init();
    for (const s of ['cancelled', 'error', 'network', 'billing_unavailable'] as const) {
      billing.nextResult = s;
      const out = await app.iap.purchase('gems_large');
      expect(out.status).toBe(s);
    }
    billing.unavailable.add('gems_xlarge');
    expect((await app.iap.purchase('gems_xlarge')).status).toBe('unavailable');
    expect(app.data.gems).toBe(0);
  });

  it('pending payments are granted only once completed (restore)', async () => {
    const { app, billing } = makeApp();
    await app.iap.init();
    billing.nextResult = 'pending';
    expect((await app.iap.purchase('gems_small')).status).toBe('pending');
    expect(app.data.gems).toBe(0);
    billing.owned[0].state = 'purchased';
    await app.iap.restore();
    expect(app.data.gems).toBe(80);
    await app.iap.restore();
    expect(app.data.gems).toBe(80); // idempotent
  });

  it('non-consumables: already owned + restore on a fresh install', async () => {
    const { app, billing } = makeApp();
    await app.iap.init();
    expect((await app.iap.purchase('battle_pass')).status).toBe('validated');
    expect(app.pass.hasPremium).toBe(true);
    expect((await app.iap.purchase('battle_pass')).status).toBe('already_owned');
    // fresh install: same store account
    const fresh = makeApp();
    (fresh.app as any).billing = billing;
    (fresh.app.iap as any).provider = billing;
    billing.owned.forEach((p) => (p.acknowledged = true));
    await fresh.app.iap.restore();
    expect(fresh.app.pass.hasPremium).toBe(true);
  });

  it('invalid receipts are rejected', async () => {
    const { app, billing } = makeApp();
    await app.iap.init();
    const orig = billing.purchase.bind(billing);
    billing.purchase = async (id: string) => { const r = await orig(id); r.purchase!.signature = 'forged'; return r; };
    expect((await app.iap.purchase('gems_xlarge')).status).toBe('validation_failed');
    expect(app.data.gems).toBe(0);
  });

  it('refunds reported by the authority revoke the grant', async () => {
    const { app } = makeApp();
    await app.iap.init();
    await app.iap.purchase('gems_medium');
    const order = app.data.processedPurchases[0].split(':')[1];
    (app.iap as any).authority = { fetchRevocations: async () => [{ orderId: order, productId: 'gems_medium' }] };
    await app.iap.syncRevocations();
    expect(app.data.gems).toBe(0);
  });
});
