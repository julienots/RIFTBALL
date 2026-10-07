/**
 * RIFTBALL authoritative server — reference implementation (Node >= 20, zero dependencies).
 *
 *  GET  /v1/health                  liveness
 *  POST /v1/iap/verify              verify a Google Play purchase token, record it, return grants
 *  GET  /v1/iap/revocations         refunded/voided orders for the caller (client revokes them)
 *  POST /v1/rtdn                    Google Play Real-Time Developer Notifications (Pub/Sub push)
 *  POST /v1/match/report            validate a match report (plausibility + de-dup)
 *  POST /v1/analytics               anonymous analytics batch
 *
 * Env: PORT, PACKAGE_NAME (com.superessence.riftball), GOOGLE_SERVICE_ACCOUNT (path to JSON key with
 * androidpublisher scope), DATA_DIR. Without a service account the server refuses purchases (never trusts the client).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateMatchReport } from './validate.mjs';

const PORT = +(process.env.PORT || 8787);
const PKG = process.env.PACKAGE_NAME || 'com.superessence.riftball';
const DATA = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
fs.mkdirSync(DATA, { recursive: true });
const DB_FILE = path.join(DATA, 'db.json');
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { purchases: {}, revoked: [], matches: {}, analytics: 0 };
const persist = () => fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)) || fs.renameSync(DB_FILE + '.tmp', DB_FILE);

const PRODUCTS = new Set(['gems_small', 'gems_medium', 'gems_large', 'gems_xlarge', 'starter_pack', 'season_pack', 'special_bundle', 'battle_pass', 'battle_pass_plus']);

// ------------------------------------------------------------- Google OAuth (service account JWT)
let tokenCache = { token: '', exp: 0 };
async function googleToken() {
  if (tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!keyPath) throw new Error('no_service_account');
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${unsigned}.${sig}` });
  const j = await r.json();
  if (!j.access_token) throw new Error('oauth_failed');
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function playGetProduct(productId, token) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers: { authorization: 'Bearer ' + (await googleToken()) } });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error('play_' + r.status);
  return r.json();
}

// ------------------------------------------------------------- handlers
async function verify(body) {
  const { playerId, productId, purchaseToken } = body;
  if (!playerId || !PRODUCTS.has(productId) || typeof purchaseToken !== 'string') return [400, { valid: false, reason: 'bad_request' }];
  const existing = db.purchases[purchaseToken];
  if (existing) {
    // a token can only ever belong to one player
    if (existing.playerId !== playerId) return [409, { valid: false, reason: 'token_reused' }];
    return [200, { valid: true, orderId: existing.orderId, duplicate: true }];
  }
  let p;
  try { p = await playGetProduct(productId, purchaseToken); } catch (e) { return [503, { valid: false, reason: String(e.message) }]; }
  if (!p) return [200, { valid: false, reason: 'unknown_token' }];
  if (p.purchaseState !== 0) return [200, { valid: false, reason: p.purchaseState === 2 ? 'pending' : 'cancelled' }];
  db.purchases[purchaseToken] = { playerId, productId, orderId: p.orderId, at: Date.now(), test: p.purchaseType === 0 };
  persist();
  return [200, { valid: true, orderId: p.orderId }];
}

function rtdn(body) {
  // Pub/Sub push: { message: { data: base64(json) } }
  try {
    const n = JSON.parse(Buffer.from(body.message.data, 'base64').toString());
    const v = n.voidedPurchaseNotification || n.oneTimeProductNotification;
    if (n.voidedPurchaseNotification) {
      const rec = db.purchases[v.purchaseToken];
      if (rec) { db.revoked.push({ orderId: rec.orderId, productId: rec.productId, playerId: rec.playerId, at: Date.now() }); persist(); }
    }
  } catch { /* ignore malformed */ }
  return [204, null];
}

let onlineOutcome = () => null;
let onlineStats = () => ({});
/** Called by the game server so rewards of online matches are checked against the authoritative result. */
function setOnlineResults(outcomeFn, stats) { onlineOutcome = outcomeFn; onlineStats = stats; }

function report(body, playerId) {
  const verdict = validateMatchReport(body, (id) => !!db.matches[`${playerId}:${id}`]);
  if (verdict.accepted && String(body.matchId).startsWith('online-')) {
    const outcome = onlineOutcome(body.matchId, playerId);
    if (!outcome) return [200, { accepted: false, reason: 'unknown_online_match' }];
    if (outcome !== body.outcome) return [200, { accepted: false, reason: 'outcome_mismatch' }];
  }
  if (verdict.accepted) { db.matches[`${playerId}:${body.matchId}`] = Date.now(); persist(); }
  return [200, verdict];
}

// ------------------------------------------------------------- http
const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const playerId = (req.headers.authorization || '').replace('Bearer ', '') || 'anon';
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 256 * 1024) { res.writeHead(413); return res.end(); } }
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400); return res.end(); }
  let out = [404, { error: 'not_found' }];
  try {
    if (url.pathname === '/v1/health') out = [200, { ok: true, ...onlineStats() }];
    else if (url.pathname === '/v1/iap/verify' && req.method === 'POST') out = await verify(body);
    else if (url.pathname === '/v1/iap/revocations') out = [200, db.revoked.filter((r) => r.playerId === playerId).map(({ orderId, productId }) => ({ orderId, productId }))];
    else if (url.pathname === '/v1/rtdn' && req.method === 'POST') out = rtdn(body);
    else if (url.pathname === '/v1/match/report' && req.method === 'POST') out = report(body, playerId);
    else if (url.pathname === '/v1/analytics' && req.method === 'POST') { db.analytics += (body.events || []).length; out = [204, null]; }
  } catch (e) { out = [500, { error: 'internal' }]; console.error(e); }
  res.writeHead(out[0], { 'content-type': 'application/json' });
  res.end(out[1] === null ? '' : JSON.stringify(out[1]));
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs') && !process.env.RIFT_EMBEDDED) server.listen(PORT, () => console.log(`RIFTBALL server on :${PORT} (package ${PKG})`));
export { server, verify, report, setOnlineResults };
