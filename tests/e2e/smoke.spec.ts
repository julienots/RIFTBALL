import { test, expect } from '@playwright/test';

test('boot -> home -> tutorial -> match -> results, no runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?skipintro');
  await page.waitForSelector('.home', { timeout: 90_000 });
  await expect(page.locator('text=JOUER')).toBeVisible();

  // first PLAY starts the tutorial
  await page.click('text=JOUER');
  await page.waitForSelector('.tut', { timeout: 30_000 });
  await expect(page.locator('.tut .st')).toContainText('1/8');

  // skip the tutorial and run a ranked match to the end
  await page.evaluate(() => { const r = (window as any).__rift; r.app.data.tutorialDone = true; r.c.session.forfeit(); });
  await page.waitForSelector('.home', { timeout: 30_000 });
  await page.click('text=JOUER');
  await page.waitForSelector('#hud', { timeout: 30_000 });
  await page.evaluate(() => { const m = (window as any).__rift.c.session.match; m.time = 120; m.score[0] = 3; m.clock = 0.1; m.phase = 'play'; });
  await page.waitForSelector('.results', { timeout: 60_000 });
  await expect(page.locator('.results .head')).toContainText('VICTOIRE');
  await expect(page.locator('.reward-row')).toBeVisible();
  const trophies = await page.evaluate(() => (window as any).__rift.app.data.trophies);
  expect(trophies).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
