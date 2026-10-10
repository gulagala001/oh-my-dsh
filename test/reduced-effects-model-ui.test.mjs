import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('manual reduced effects stop model movement in the native theme and survive reload', { timeout: 120000 }, async t => {
  const { page } = await frontendFixture(t, { modelProfile: {
    reasoningEfforts: { low: 'low', high: 'high', xhigh: 'xhigh' }, compat: { supportsReasoningEffort: true },
  } });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const trigger = page.getByRole('button', { name: '模型与思考强度', exact: true });
  const panel = page.getByRole('dialog', { name: '模型与思考强度', exact: true });
  await trigger.click();
  const slider = panel.getByRole('slider', { name: '思考强度', exact: true });
  await until(() => slider.isEnabled()); await slider.press('End');
  await until(async () => await slider.getAttribute('aria-valuetext') === 'Ultracode');
  const animation = () => panel.locator('.omd-effort-glow').evaluate(el => getComputedStyle(el).animationName);
  const sheen = () => panel.locator('.omd-effort-fill').evaluate(el => getComputedStyle(el, '::after').animationName);
  assert.notEqual(await animation(), 'none');
  assert.notEqual(await sheen(), 'none');
  await slider.press('Escape'); await panel.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '外观', exact: true }).click();
  assert.equal(await page.getByLabel('主题', { exact: true }).inputValue(), 'default');
  await page.getByLabel('降低透明与动态效果', { exact: true }).check();
  await page.keyboard.press('Escape'); await trigger.click();
  assert.equal(await animation(), 'none', 'manual preference also applies without an OMD skin class');
  assert.equal(await sheen(), 'none', 'manual preference stops the actual pseudo-element sheen');
  await slider.press('Escape'); await page.reload(); await trigger.waitFor(); await trigger.click();
  await until(() => slider.isEnabled());
  assert.equal(await animation(), 'none', 'the preference persists after a real reload');
  assert.equal(await sheen(), 'none', 'the pseudo-element preference also survives reload');
  await slider.press('Escape');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('降低透明与动态效果', { exact: true }).uncheck();
  await page.keyboard.press('Escape'); await trigger.click();
  assert.notEqual(await animation(), 'none', 'changing the saved preference restores the visual effect');
  assert.notEqual(await sheen(), 'none', 'changing the saved preference restores the pseudo-element effect');
});
