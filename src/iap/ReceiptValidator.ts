import type { StorePurchase } from './BillingProvider';
import { BuildConfig } from '../core/config';

export interface ValidationResult {
  valid: boolean;
  /** transient = retry later (server down / offline). Purchases are kept pending, never granted. */
  transient?: boolean;
  reason?: string;
  orderId?: string;
}

export interface ReceiptValidator { validate(p: StorePurchase): Promise<ValidationResult> }

/**
 * Production validator: the game server checks the purchase token with the Google Play Developer API
 * (purchases.products.get) and records it, then returns which items to grant. See /server.
 */
export class RemoteReceiptValidator implements ReceiptValidator {
  constructor(private base = BuildConfig.serverUrl, private playerId: () => string) {}
  async validate(p: StorePurchase): Promise<ValidationResult> {
    if (!this.base) return { valid: false, transient: true, reason: 'no_server' };
    try {
      const r = await fetch(this.base + '/v1/iap/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId(), productId: p.productId, purchaseToken: p.purchaseToken, orderId: p.orderId }),
      });
      if (r.status >= 500) return { valid: false, transient: true, reason: 'server_error' };
      const j = await r.json();
      return { valid: !!j.valid, reason: j.reason, orderId: j.orderId };
    } catch {
      return { valid: false, transient: true, reason: 'network' };
    }
  }
}

/** Development validator: accepts ONLY purchases produced by the mock store, and only in mock-enabled builds. */
export class DevReceiptValidator implements ReceiptValidator {
  async validate(p: StorePurchase): Promise<ValidationResult> {
    if (!BuildConfig.allowMockStore) return { valid: false, reason: 'mock_disabled' };
    if (p.signature !== 'mock-signature' || !p.purchaseToken.startsWith('mock-token-')) return { valid: false, reason: 'bad_signature' };
    if (p.state !== 'purchased') return { valid: false, transient: true, reason: 'pending' };
    return { valid: true, orderId: p.orderId };
  }
}
