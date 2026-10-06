import type { SaveSystem } from '../save/SaveSystem';
import type { Inventory } from '../progression/Inventory';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/AppEvents';
import type { NotificationCenter } from '../notifications/NotificationCenter';
import { currentSeason } from '../data/seasons';
import type { RewardItem, SeasonData } from '../data/types';
import { Clock } from '../core/Time';

export type PassTrack = 'free' | 'premium' | 'plus';

/** RIFT PASS: seasonal progression with FREE / PREMIUM / PLUS tracks. Cosmetic & currency rewards only. */
export class BattlePassService {
  constructor(private save: SaveSystem, private inv: Inventory, private bus: EventBus<AppEvents>, private notes: NotificationCenter) {}

  get season(): SeasonData { return currentSeason(Clock.now()); }
  private get p() {
    const d = this.save.data;
    if (d.pass.seasonId !== this.season.id) {
      d.pass = { seasonId: this.season.id, xp: 0, claimedFree: [], claimedPremium: [], claimedPlus: [] };
      this.save.save();
    }
    return d.pass;
  }
  get premiumKey() { return `pass_premium_${this.season.id}`; }
  get plusKey() { return `pass_plus_${this.season.id}`; }
  get hasPremium() { return this.inv.hasEntitlement(this.premiumKey); }
  get hasPlus() { return this.inv.hasEntitlement(this.plusKey); }
  get xp() { return this.p.xp; }
  /** Tier 1 is available immediately; tier k needs (k-1) * xpPerTier. */
  get tier() { return Math.min(this.season.passTiers, 1 + Math.floor(this.p.xp / this.season.passXpPerTier)); }
  get tierProgress() {
    if (this.tier >= this.season.passTiers) return 1;
    return (this.p.xp % this.season.passXpPerTier) / this.season.passXpPerTier;
  }
  get timeLeftMs() { return Date.parse(this.season.end) - Clock.now(); }

  addXp(amount: number) {
    if (amount <= 0) return;
    const before = this.tier;
    const mul = this.hasPlus ? 1.2 : 1; // PASS+ accelerates cosmetic progression only
    const max = (this.season.passTiers - 1) * this.season.passXpPerTier;
    this.p.xp = Math.min(max + this.season.passXpPerTier - 1, this.p.xp + Math.round(amount * mul));
    const after = this.tier;
    if (after > before) {
      this.bus.emit('passTier', { tier: after });
      this.notes.push('pass', `RIFT PASS — Palier ${after} !`, 'De nouvelles récompenses vous attendent.');
    }
    this.save.save();
  }

  reward(tier: number, track: PassTrack): RewardItem | undefined {
    const r = this.season.rewards.find((x) => x.tier === tier);
    return track === 'free' ? r?.free : track === 'premium' ? r?.premium : r?.plus;
  }

  isClaimed(tier: number, track: PassTrack) {
    const p = this.p;
    return (track === 'free' ? p.claimedFree : track === 'premium' ? p.claimedPremium : p.claimedPlus).includes(tier);
  }

  canClaim(tier: number, track: PassTrack) {
    if (tier > this.tier || this.isClaimed(tier, track) || !this.reward(tier, track)) return false;
    if (track === 'premium' && !this.hasPremium) return false;
    if (track === 'plus' && !this.hasPlus) return false;
    return true;
  }

  claim(tier: number, track: PassTrack) {
    if (!this.canClaim(tier, track)) return null;
    const p = this.p;
    (track === 'free' ? p.claimedFree : track === 'premium' ? p.claimedPremium : p.claimedPlus).push(tier);
    return this.inv.grant([this.reward(tier, track)!], { source: `pass_${track}`, txn: `pass:${this.season.id}:${track}:${tier}`, verified: false });
  }

  claimAll() {
    const out = [];
    for (let t = 1; t <= this.tier; t++) for (const tr of ['free', 'premium', 'plus'] as PassTrack[]) if (this.canClaim(t, tr)) out.push(...(this.claim(t, tr) ?? []));
    return out;
  }

  get claimableCount() {
    let n = 0;
    for (let t = 1; t <= this.tier; t++) for (const tr of ['free', 'premium', 'plus'] as PassTrack[]) if (this.canClaim(t, tr)) n++;
    return n;
  }

  /** Premium pass bought with gems (virtual currency). Real-money path goes through IapService. */
  buyPremiumWithGems(plus = false): boolean {
    const key = plus ? this.plusKey : this.premiumKey;
    if (this.inv.hasEntitlement(key)) return false;
    const price = plus ? this.season.passPlusPriceGems : this.season.passPriceGems;
    if (!this.inv.spendGems(price, key, `gems:${key}`)) return false;
    const grants: RewardItem[] = plus ? [{ kind: 'cosmetic', id: this.premiumKey }, { kind: 'cosmetic', id: this.plusKey }] : [{ kind: 'cosmetic', id: this.premiumKey }];
    this.inv.grant(grants, { source: `gems:${key}`, txn: `gems:${key}`, verified: false });
    return true;
  }
}
