import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture } from './fixtures/frontend.mjs';

test('one failed component query leaves other component rows ready and repair available', { timeout: 60000 }, async t => {
  const { page, errors } = await frontendFixture(t);
  await page.route('**/trisoul-x/components', route => route.fulfill({ json: {
    automatic: false, codegraph: { enabled: false, projects: [] },
    computerUse: { enabled: true, paths: {}, operations: {}, setup: {
      browser: { installed: true },
      native: { platform: 'win32', supported: true, installed: true, interactive: true, captureSupported: true },
      extension: { browsers: [], error: 'registry query failed', installation: { platform: 'win32', supported: true, prepared: null, error: 'registry query failed' } },
    } },
  } }));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await dialog.getByRole('button', { name: '基础组件', exact: true }).click();
  const rows = dialog.locator('.cx-component-row');
  for (const name of ['内置浏览器', '桌面控制']) {
    const row = rows.filter({ hasText: name });
    await row.waitFor(); assert.match(await row.innerText(), /已就绪/);
  }
  const chrome = rows.filter({ hasText: '日常 Chrome' });
  assert.match(await chrome.innerText(), /需要处理/);
  assert.match(await chrome.innerText(), /registry query failed/);
  assert.equal(await chrome.getByRole('button', { name: '准备 Chrome 连接' }).isEnabled(), true);
  assert.deepEqual(errors, []);
});
