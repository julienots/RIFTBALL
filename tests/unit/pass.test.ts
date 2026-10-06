import { describe, it, expect } from 'vitest';
import { makeApp } from './helpers';

describe('Battle pass', () => {
  it('tier progression from XP', () => {
    const { app } = makeApp();
    expect(app.pass.tier).toBe(1);
    app.pass.addXp(2500);
    expect(app.pass.tier).toBe(3);
    app.pass.addXp(1e9);
    expect(app.pass.tier).toBe(app.pass.season.passTiers);
  });

  it('free rewards claimable once; premium gated', () => {
    const { app } = makeApp();
    app.pass.addXp(5000);
    expect(app.pass.canClaim(1, 'free')).toBe(true);
    expect(app.pass.claim(1, 'free')).not.toBeNull();
    expect(app.inventory.hasHero('ember')).toBe(true);
    expect(app.pass.claim(1, 'free')).toBeNull();
    expect(app.pass.canClaim(2, 'premium')).toBe(false);
    expect(app.pass.canClaim(10, 'free')).toBe(false); // not reached
  });

  it('premium via gems unlocks premium track; plus accelerates', () => {
    const { app } = makeApp();
    expect(app.pass.buyPremiumWithGems()).toBe(false); // no gems
    app.inventory.grant([{ kind: 'gems', amount: 500 }], { source: 'test', txn: 'test-gems', verified: true });
    expect(app.pass.buyPremiumWithGems()).toBe(true);
    expect(app.pass.hasPremium).toBe(true);
    expect(app.data.gems).toBe(500 - app.pass.season.passPriceGems);
    expect(app.pass.canClaim(1, 'premium')).toBe(true);
    const claimed = app.pass.claimAll();
    expect(claimed.length).toBeGreaterThan(1);
    expect(app.pass.buyPremiumWithGems()).toBe(false); // already owned
  });
});
