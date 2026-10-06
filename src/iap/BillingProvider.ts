/**
 * Platform billing abstraction.
 *  - NativeBillingProvider: Google Play Billing via the native `RiftBilling` Capacitor plugin (android/).
 *  - MockBillingProvider: development only — simulates every store outcome for tests and QA.
 */
export interface StoreProduct { id: string; price: string; title: string; available: boolean }

export interface StorePurchase {
  orderId: string;
  productId: string;
  purchaseToken: string;
  purchaseTime: number;
  acknowledged: boolean;
  state: 'purchased' | 'pending';
  /** Raw signed payload from the store (sent to the server for verification). */
  originalJson?: string;
  signature?: string;
}

export type PurchaseStatus = 'purchased' | 'pending' | 'cancelled' | 'already_owned' | 'unavailable' | 'network' | 'billing_unavailable' | 'error';

export interface PurchaseResult { status: PurchaseStatus; purchase?: StorePurchase; message?: string }

export interface BillingProvider {
  readonly name: string;
  init(): Promise<boolean>;
  getProducts(ids: string[]): Promise<StoreProduct[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  /** Purchases the store still knows about (non-consumables, unconsumed consumables, pending). */
  queryPurchases(): Promise<StorePurchase[]>;
  /** Acknowledge (non-consumable) or consume (consumable). Only after server validation + grant. */
  finish(p: StorePurchase, consumable: boolean): Promise<void>;
}

export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock';
  /** QA hook: the next purchase returns this status. */
  nextResult: PurchaseStatus = 'purchased';
  owned: StorePurchase[] = [];
  unavailable = new Set<string>();
  private seq = 1;
  constructor(private prices: Record<string, string>) {}
  async init() { return true; }
  async getProducts(ids: string[]) {
    return ids.map((id) => ({ id, price: this.prices[id] ?? '?', title: id, available: !this.unavailable.has(id) }));
  }
  async purchase(productId: string): Promise<PurchaseResult> {
    await new Promise((r) => setTimeout(r, 30));
    if (this.unavailable.has(productId)) return { status: 'unavailable', message: 'Produit indisponible' };
    const s = this.nextResult;
    this.nextResult = 'purchased';
    if (s !== 'purchased' && s !== 'pending') return { status: s, message: s };
    if (this.owned.some((p) => p.productId === productId && !p.productId.startsWith('gems') && p.productId !== 'special_bundle')) return { status: 'already_owned' };
    const p: StorePurchase = {
      orderId: `MOCK.${Date.now()}.${this.seq++}`, productId, purchaseToken: `mock-token-${this.seq}-${productId}`, purchaseTime: Date.now(),
      acknowledged: false, state: s, signature: 'mock-signature', originalJson: JSON.stringify({ productId }),
    };
    this.owned.push(p);
    return { status: s, purchase: p };
  }
  async queryPurchases() { return this.owned.slice(); }
  async finish(p: StorePurchase, consumable: boolean) {
    if (consumable) this.owned = this.owned.filter((o) => o.purchaseToken !== p.purchaseToken);
    else { const o = this.owned.find((x) => x.purchaseToken === p.purchaseToken); if (o) o.acknowledged = true; }
  }
}

/** Google Play Billing through the local Capacitor plugin `RiftBilling` (see android/app/src/main/java/.../RiftBillingPlugin.java). */
export class NativeBillingProvider implements BillingProvider {
  readonly name = 'google_play';
  private plugin: any;
  constructor() {
    const cap = (globalThis as any).Capacitor;
    this.plugin = cap?.Plugins?.RiftBilling ?? (cap?.registerPlugin ? cap.registerPlugin('RiftBilling') : null);
  }
  static isAvailable() { const cap = (globalThis as any).Capacitor; return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android'; }
  async init() {
    try { const r = await this.plugin.connect(); return !!r?.connected; } catch { return false; }
  }
  async getProducts(ids: string[]): Promise<StoreProduct[]> {
    try {
      const r = await this.plugin.getProducts({ ids });
      return (r.products ?? []).map((p: any) => ({ id: p.id, price: p.price, title: p.title, available: true }));
    } catch { return []; }
  }
  async purchase(productId: string): Promise<PurchaseResult> {
    try {
      const r = await this.plugin.purchase({ productId });
      return { status: r.status, purchase: r.purchase, message: r.message };
    } catch (e: any) { return { status: 'error', message: String(e?.message ?? e) }; }
  }
  async queryPurchases(): Promise<StorePurchase[]> {
    try { const r = await this.plugin.queryPurchases(); return r.purchases ?? []; } catch { return []; }
  }
  async finish(p: StorePurchase, consumable: boolean) {
    await this.plugin.finish({ purchaseToken: p.purchaseToken, consumable });
  }
}
