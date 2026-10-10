import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('composer usage disclosure works while external appearance owns the page and survives theme changes', { timeout: 90000 }, async t => {
  const { page, root, errors } = await frontendFixture(t, {
    reply: () => ({ delta: { role: 'assistant', content: '用量折叠检查。' }, finish_reason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }),
  });
  const toggle = page.getByRole('button', { name: '用量详情', exact: true });
  const dock = page.locator('[data-slot="conversation.composer.dock"]');
  const stats = {
    activity: dock.locator('[data-composer-stat="activity"], [data-composer-usage-fixture="activity"]'),
    usage: dock.locator('[data-composer-stat="usage"], [data-composer-usage-fixture="usage"]'),
    context: dock.locator('.tx-stats-line'),
  };
  const assertDisclosure = async (expanded, label) => {
    await until(async () => await toggle.getAttribute('aria-expanded') === String(expanded));
    const visible = Object.fromEntries(await Promise.all(Object.entries(stats).map(async ([name, locator]) => [name, await locator.isVisible()])));
    if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, label + '.png'), animations: 'disabled' });
    if (Object.values(visible).some(value => value !== expanded)) {
      t.diagnostic(JSON.stringify(await dock.evaluate((element, phase) => {
        const describe = node => ({ tag: node.tagName, attributes: Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value])), display: getComputedStyle(node).display });
        return { phase, rootClass: document.documentElement.className, dock: describe(element), details: [...element.querySelectorAll('[data-composer-stat], [data-composer-stats], [data-composer-usage-fixture], .tx-stats-line')].map(node => ({ ...describe(node), parent: describe(node.parentElement), grandparent: describe(node.parentElement.parentElement) })) };
      }, label)));
    }
    assert.deepEqual(visible, { activity: expanded, usage: expanded, context: expanded }, label + ': all usage details follow the disclosure');
  };
  t.after(() => { if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Composer usage UI artifacts:', root); });

  await assertDisclosure(true, 'default-expanded');
  await toggle.click();
  await assertDisclosure(false, 'default-collapsed');
  await toggle.click();
  await assertDisclosure(true, 'default-reexpanded');

  // Use the real shared ownership contract to suspend OMD appearance.
  await page.evaluate(() => {
    const broker = document[Symbol.for('omd.omaa.appearance.v1')];
    window.releaseComposerUsageAppearance = broker.register({
      id: 'omaa-composer-usage-fixture', priority: 10,
      select: () => ({ key: 'native-composer-usage-fixture' }), mount: () => () => {},
    });
  });
  await until(() => page.evaluate(() => !document.documentElement.classList.contains('trisoul-shell')));
  await assertDisclosure(true, 'external-expanded');
  await toggle.click();
  await assertDisclosure(false, 'external-collapsed');
  await toggle.click();
  await assertDisclosure(true, 'external-reexpanded');

  // Exercise the older host's combined public wrapper using the actual live
  // pills. Their content and event handlers remain intact and are restored.
  await dock.evaluate(element => {
    const nodes = [...element.querySelectorAll('[data-composer-stat]')].filter(node => ['activity', 'usage'].includes(node.getAttribute('data-composer-stat')));
    if (nodes.length !== 2) throw new Error('Expected both real host statistics pills');
    const saved = nodes.map(node => ({ node, parent: node.parentNode, next: node.nextSibling, kind: node.getAttribute('data-composer-stat') }));
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-composer-stats', '');
    saved[0].parent.insertBefore(wrapper, saved[0].node);
    for (const { node, kind } of saved) {
      node.setAttribute('data-composer-usage-fixture', kind);
      node.removeAttribute('data-composer-stat');
      wrapper.append(node);
    }
    window.restoreComposerUsageHostNodes = () => {
      for (const { node, parent, next, kind } of saved.toReversed()) {
        parent.insertBefore(node, next);
        node.setAttribute('data-composer-stat', kind);
        node.removeAttribute('data-composer-usage-fixture');
      }
      wrapper.remove();
    };
  });
  try {
    await assertDisclosure(true, 'external-combined-expanded');
    await toggle.click();
    await assertDisclosure(false, 'external-combined-collapsed');
    assert.equal(await dock.locator('[data-composer-stats]').isVisible(), false);
    await toggle.click();
    await assertDisclosure(true, 'external-combined-reexpanded');
    assert.equal(await dock.locator('[data-composer-stats]').isVisible(), true);
  } finally {
    await page.evaluate(() => window.restoreComposerUsageHostNodes());
  }
  await toggle.click();
  await assertDisclosure(false, 'external-collapsed-again');

  await page.evaluate(() => window.releaseComposerUsageAppearance());
  await until(() => page.evaluate(() => document.documentElement.classList.contains('trisoul-shell')));
  await assertDisclosure(false, 'restored-collapsed');

  const selectTheme = async (theme, mode) => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('主题', { exact: true }).selectOption(theme);
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await page.locator(`html[data-omd-skin="${theme}"][data-appearance="${mode}"]`).waitFor();
    await page.keyboard.press('Escape');
  };
  await selectTheme('codex-desktop', 'dark');
  await assertDisclosure(false, 'codex-dark-collapsed');
  await toggle.click();
  await assertDisclosure(true, 'codex-dark-expanded');
  await selectTheme('google-material-expressive', 'light');
  await assertDisclosure(true, 'material-light-expanded');
  await toggle.click();
  await assertDisclosure(false, 'material-light-collapsed');
  assert.deepEqual(errors, []);
});
