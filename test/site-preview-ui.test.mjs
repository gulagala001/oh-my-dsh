import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { staticSite } from './fixtures/static-site.mjs';

test('product previews explain failed images, retry from the keyboard and ignore late requests', { timeout: 60000 }, async t => {
  const origin = await staticSite(t, fileURLToPath(new URL('../docs', import.meta.url)));
  const browser = await chromium.launch({ headless: true });
  let release;
  t.after(async () => { release?.(); await browser.close(); });
  const page = await browser.newPage({ viewport: { width: 390, height: 850 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.route('**/site/media/launchpad-recall.jpg', route => route.abort());
  await page.locator('#hero-memory').click();
  const panel = page.locator('#hero-panel'), status = panel.getByRole('status');
  await status.filter({ hasText: '暂时无法加载' }).waitFor();
  assert.equal(await panel.getAttribute('aria-busy'), 'false');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'hero-memory');
  assert.equal(await page.locator('#hero-image').isVisible(), false, 'a failed new selection must not present the previous image as its result');
  await page.unroute('**/site/media/launchpad-recall.jpg');
  await page.locator('#hero-memory').press('Enter');
  await page.waitForFunction(() => document.querySelector('#hero-image').getAttribute('src') === 'site/media/launchpad-recall.jpg');
  await status.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#hero-image').isVisible(), true);

  await page.locator('#hero-cu').click();
  await page.waitForFunction(() => document.querySelector('#hero-panel').getAttribute('aria-busy') === 'false');
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  await page.route('**/site/media/launchpad-recall.jpg', async route => {
    const response = await route.fetch();
    await new Promise(resolve => { release = resolve; started(); });
    await route.fulfill({ response });
  });
  await page.locator('#hero-memory').click(); await waiting;
  await page.locator('#hero-tasks').click();
  await page.waitForFunction(() => document.querySelector('#hero-image').getAttribute('src') === 'site/media/launchpad-tasks.jpg');
  const delayed = page.waitForResponse(response => response.url().endsWith('/site/media/launchpad-recall.jpg'));
  release(); await delayed;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#hero-image').getAttribute('src'), 'site/media/launchpad-tasks.jpg');
  assert.equal(await panel.getAttribute('aria-labelledby'), 'hero-tasks');
  assert.equal(await status.isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});
