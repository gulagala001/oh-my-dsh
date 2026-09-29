import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('right workbench keeps readable navigation and expands memory in the main scroll area', { timeout: 90000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.setViewportSize({ width: 1100, height: 800 });
  const summary = '本地视觉检查：界面以对话为中心，右侧用于查看任务、上下文与记忆。重要信息保留来源，避免重复抄录。'.repeat(10) + '完整记忆的结尾。';
  await page.route(/\/trisoul-x\/api\/dream\?/, async route => {
    const response = await route.fetch(), data = await response.json();
    await route.fulfill({ json: { ...data, globalMemory: { ref: 'visual-memory', revision: 1, updatedAt: Date.now(), summary } } });
  });
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const workbench = page.locator('.tx-workbench'), nav = workbench.getByRole('navigation', { name: '工作台导航' });
  await until(async () => (await workbench.boundingBox())?.width > 300);
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  const expand = workbench.getByRole('button', { name: '展开完整记忆', exact: true });
  await expand.waitFor();
  const text = workbench.locator('.cx-dream-memory > .cx-prose');
  assert.ok((await text.innerText()).endsWith('…'));
  assert.ok(!(await text.innerText()).includes('完整记忆的结尾。'));
  await expand.click();
  assert.equal(await text.innerText(), summary);
  assert.equal(await text.evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'memory text has no nested scrollport');
  const collapse = workbench.getByRole('button', { name: '收起记忆', exact: true });
  assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
  assert.equal(await collapse.evaluate(el => el === document.activeElement), true);
  await nav.getByRole('button', { name: '上下文', exact: true }).click();
  await nav.getByRole('button', { name: '记忆', exact: true }).click();
  assert.equal(await collapse.getAttribute('aria-expanded'), 'true', 'switching workbench pages preserves reading state');
  await collapse.click();
  assert.equal(await expand.getAttribute('aria-expanded'), 'false');

  const handle = page.locator('[data-side="rightbar"]'), bounds = await handle.boundingBox();
  assert.ok(bounds, 'the native right-pane resize handle is present');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(1100 - 320, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await until(async () => { const width = (await workbench.boundingBox()).width; return width >= 315 && width <= 325; });
  const pane = await workbench.boundingBox();
  for (const button of await nav.getByRole('button').all()) {
    const box = await button.boundingBox();
    assert.ok(box.x >= pane.x && box.x + box.width <= pane.x + pane.width + 1, 'every destination remains visible in a narrow right pane');
    assert.ok(box.height >= 32, 'navigation keeps a usable click target');
  }
  for (const name of ['任务', '上下文', '记忆', '电脑', '监控']) {
    await nav.getByRole('button', { name, exact: true }).click();
    const selected = workbench.locator('.tx-workbench-page:not([hidden])');
    assert.equal(await selected.getAttribute('aria-label'), name);
    assert.equal(await selected.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, name + ': no horizontal spill');
    assert.equal(await nav.isVisible(), true);
  }
  assert.deepEqual(errors, []);
});
