import { App } from '../../src/core/App';
import { MemoryBackend } from '../../src/save/Storage';
import { MockBillingProvider } from '../../src/iap/BillingProvider';
import { DevReceiptValidator } from '../../src/iap/ReceiptValidator';
import { PRODUCTS } from '../../src/data/products';
import { BuildConfig } from '../../src/core/config';
import { Match } from '../../src/game/Match';

export function makeApp(kv = new MemoryBackend()) {
  (BuildConfig as any).allowMockStore = true;
  const billing = new MockBillingProvider(Object.fromEntries(PRODUCTS.map((p) => [p.id, p.fallbackPrice])));
  const app = new App({ kv, billing, validator: new DevReceiptValidator(), requireNetworkForIap: false });
  return { app, kv, billing };
}

export function runUntil(m: Match, pred: (m: Match) => boolean, maxSeconds = 60) {
  const steps = maxSeconds * 60;
  for (let i = 0; i < steps && !pred(m); i++) { m.step(1 / 60); }
  return pred(m);
}

export function skipCountdown(m: Match) { runUntil(m, (x) => x.phase === 'play', 5); }
