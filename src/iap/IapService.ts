import type { BillingProvider, PurchaseStatus, StorePurchase, StoreProduct } from './BillingProvider';
import type { ReceiptValidator } from './ReceiptValidator';
import type { Inventory } from '../progression/Inventory';
import type { SaveSystem } from '../save/SaveSystem';
import type { ShopService } from '../shop/ShopService';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import type { Analytics } from '../analytics/Analytics';
import type { Connectivity } from '../networking/Connectivity';
import type { Authority } from '../networking/Authority';
import { PRODUCTS, getProduct } from '../data/products';

export interface IapOutcome { status: PurchaseStatus | 'validated' | 'validation_failed' | 'validation_pending' | 'offline'; message: string }

const MESSAGES: Record<string, string> = {
  validated: 'Achat confirmé ! Merci pour votre soutien.',
  pending: 'Paiement en attente. Les objets seront ajoutés après confirmation du paiement.',
  cancelled: 'Achat annulé.',
  already_owned: 'Vous possédez déjà cet article. Utilisez « Restaurer les achats ».',
  unavailable: 'Ce produit est actuellement indisponible.',
  network: 'Connexion impossible. Vérifiez votre réseau.',
  offline: 'Les achats nécessitent une connexion Internet.',
  billing_unavailable: 'Le service de paiement n\'est pas disponible sur cet appareil.',
  error: 'Une erreur de paiement est survenue. Vous n\'avez pas été débité.',
  validation_failed: 'L\'achat n\'a pas pu être vérifié. Contactez le support si vous avez été débité.',
  validation_pending: 'Achat reçu — vérification en cours. Il sera ajouté automatiquement.',
};

/**
 * Purchase flow:  buy -> store confirmation -> SERVER VALIDATION -> grant (idempotent by orderId) -> acknowledge/consume.
 * A purchase is never granted on button press, nor without validation. Unvalidated purchases stay pending
 * (Google refunds unacknowledged purchases after 3 days) and are retried on next launch / restore.
 */
export class IapService {
  products: StoreProduct[] = [];
  ready = false;
  busy = false;

  constructor(
    private provider: BillingProvider, private validator: ReceiptValidator, private inv: Inventory, private save: SaveSystem,
    private shop: ShopService, private notes: NotificationCenter, private analytics: Analytics, private net: Connectivity, private authority: Authority,
    private requireNetwork: boolean,
  ) {}

  get providerName() { return this.provider.name; }

  async init() {
    this.ready = await this.provider.init();
    if (this.ready) this.products = await this.provider.getProducts(PRODUCTS.map((p) => p.id));
    if (this.ready) await this.processOutstanding();
    await this.syncRevocations();
    return this.ready;
  }

  priceOf(productId: string) {
    return this.products.find((p) => p.id === productId)?.price ?? getProduct(productId)?.fallbackPrice ?? '—';
  }

  isOwnedOneTime(productId: string) {
    const p = getProduct(productId);
    return !!p?.oneTimeKey && this.save.data.processedPurchases.some((x) => x.startsWith(productId + ':'));
  }

  async purchase(productId: string): Promise<IapOutcome> {
    const product = getProduct(productId);
    if (!product) return { status: 'unavailable', message: MESSAGES.unavailable };
    if (this.requireNetwork && !this.net.networkUp) return { status: 'offline', message: MESSAGES.offline };
    if (!this.ready) { this.ready = await this.provider.init(); if (!this.ready) return { status: 'billing_unavailable', message: MESSAGES.billing_unavailable }; }
    if (this.busy) return { status: 'error', message: 'Un achat est déjà en cours.' };
    if (this.isOwnedOneTime(productId)) return { status: 'already_owned', message: MESSAGES.already_owned };
    this.busy = true;
    this.analytics.track('purchase_started', { product: productId });
    try {
      const res = await this.provider.purchase(productId);
      if (res.status === 'purchased' && res.purchase) return await this.handlePurchase(res.purchase);
      if (res.status === 'pending' && res.purchase) {
        this.notes.push('reward', 'Paiement en attente', `${product.title} sera ajouté dès confirmation.`);
        return { status: 'pending', message: MESSAGES.pending };
      }
      if (res.status === 'already_owned') { await this.restore(); return { status: 'already_owned', message: MESSAGES.already_owned }; }
      return { status: res.status, message: MESSAGES[res.status] ?? MESSAGES.error };
    } finally { this.busy = false; }
  }

  private async handlePurchase(p: StorePurchase): Promise<IapOutcome> {
    const product = getProduct(p.productId);
    if (!product) return { status: 'unavailable', message: MESSAGES.unavailable };
    const key = `${p.productId}:${p.orderId}`;
    if (this.save.data.processedPurchases.includes(key)) {
      // already granted earlier (e.g. app killed before acknowledgement): just finish it
      await this.provider.finish(p, product.type === 'consumable').catch(() => {});
      return { status: 'validated', message: MESSAGES.validated };
    }
    const v = await this.validator.validate(p);
    if (!v.valid) {
      if (v.transient) return { status: 'validation_pending', message: MESSAGES.validation_pending };
      this.analytics.track('purchase_failed', { product: p.productId, reason: v.reason ?? '' });
      return { status: 'validation_failed', message: MESSAGES.validation_failed };
    }
    this.inv.grant(product.grants, { source: `iap:${p.productId}`, txn: `iap:${p.orderId}`, verified: true });
    this.save.data.processedPurchases.push(key);
    this.shop.markOfferPurchasedForProduct(p.productId);
    this.save.writeNow(); // persist the grant BEFORE acknowledging with the store
    await this.provider.finish(p, product.type === 'consumable');
    this.notes.push('reward', 'Achat confirmé', product.title);
    this.analytics.track('purchase_completed', { product: p.productId });
    return { status: 'validated', message: MESSAGES.validated };
  }

  /** Re-validate everything the store reports (pending that completed, unacknowledged, non-consumables). */
  async processOutstanding(): Promise<number> {
    const list = await this.provider.queryPurchases();
    let n = 0;
    for (const p of list) {
      if (p.state !== 'purchased') continue;
      const key = `${p.productId}:${p.orderId}`;
      if (this.save.data.processedPurchases.includes(key)) { if (!p.acknowledged) { const pr = getProduct(p.productId); await this.provider.finish(p, pr?.type === 'consumable').catch(() => {}); } continue; }
      const out = await this.handlePurchase(p);
      if (out.status === 'validated') n++;
    }
    return n;
  }

  /** "Restore purchases" button. Grants are idempotent (orderId-based), so restoring twice never duplicates. */
  async restore(): Promise<IapOutcome> {
    if (this.requireNetwork && !this.net.networkUp) return { status: 'offline', message: MESSAGES.offline };
    if (!this.ready) this.ready = await this.provider.init();
    if (!this.ready) return { status: 'billing_unavailable', message: MESSAGES.billing_unavailable };
    const n = await this.processOutstanding();
    await this.syncRevocations();
    return { status: 'validated', message: n > 0 ? `${n} achat(s) restauré(s).` : 'Tous vos achats sont déjà à jour.' };
  }

  /** Refunds / chargebacks reported by the server (Google voided purchases / RTDN) are revoked locally. */
  async syncRevocations() {
    try {
      const list = await this.authority.fetchRevocations();
      for (const r of list) {
        const key = `${r.productId}:${r.orderId}`;
        if (!this.save.data.processedPurchases.includes(key)) continue;
        const product = getProduct(r.productId);
        if (product) this.inv.revokeTransaction(r.orderId, product.grants);
        this.save.data.processedPurchases = this.save.data.processedPurchases.filter((x) => x !== key);
        this.notes.push('reward', 'Achat remboursé', `${product?.title ?? r.productId} a été retiré suite à un remboursement.`);
      }
    } catch { /* offline: try later */ }
  }
}
