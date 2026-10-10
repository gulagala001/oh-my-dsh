import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { cleanEnvironment } from './host.mjs';

export async function checkBrowser({ host, sessionId, checks, directory, trace, signal }) {
  let executablePath = chromium.executablePath();
  if (host.isolation === 'native' && process.platform === 'darwin') {
    const wrapper = join(host.root, 'browser-sandbox.sh');
    const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
    const profile = '(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:' + new URL(host.origin).port + '"))';
    await writeFile(wrapper, '#!/bin/sh\nexec /usr/bin/sandbox-exec -p ' + quote(profile) + ' ' + quote(executablePath) + ' "$@"\n', { mode: 0o700 });
    executablePath = wrapper;
  }
  const browser = await chromium.launch({ headless: true, executablePath, env: cleanEnvironment(host.root, host.home), args: ['--use-mock-keychain', '--password-store=basic'] });
  const aborted = () => { void browser.close().catch(() => {}); };
  signal?.addEventListener('abort', aborted, { once: true });
  try {
    signal?.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', locale: 'zh-CN', serviceWorkers: 'block' });
    const errors = [], denied = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== host.origin) { denied.push(url.origin); await route.abort(); return; }
      if (url.pathname === '/trisoul-x/api/version') { await route.fulfill({ json: { currentVersion: 'simulation', latestVersion: 'simulation', status: 'current', severity: 'none', releases: [] } }); return; }
      await route.continue();
    });
    await context.addCookies(host.cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: host.origin }; }));
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    // Browser timers remain real. Backend virtual time is explicitly reported;
    // this verifies actual rendering/clicks rather than pretending both clocks
    // are one perfectly deterministic scheduler.
    await host.rpc('session/rename', { sessionId, title: '模拟器真实会话验收' });
    await page.goto(host.origin);
    const welcome = page.getByRole('button', { name: '继续', exact: true });
    await welcome.waitFor(); await welcome.click(); await welcome.waitFor({ state: 'hidden' });
    await page.getByText('模拟器真实会话验收', { exact: true }).first().click();
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
    await checks.check('真实 Web 会话与工作台点击', async () => {
      const guide = page.locator('[data-sidebar-right-guide]:visible');
      await guide.waitFor();
      await guide.locator('[data-sidebar-right-guide-entry="trisoul-x-context"]').click();
      await page.locator('.tx-workbench[data-section="tasks"]').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: '用量详情', exact: true }).waitFor();
      await page.locator('[data-composer-input]').fill('模拟器草稿保留检查');
      assert.equal(await page.locator('[data-composer-input]').innerText(), '模拟器草稿保留检查');
      assert.deepEqual(errors, []); assert.deepEqual(denied, []);
    });
    await page.screenshot({ path: join(directory, 'web-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: join(directory, 'web-dark.png') });
    await checks.check('明暗主题截图后的最终浏览器状态', () => { assert.deepEqual(errors, []); assert.deepEqual(denied, []); signal?.throwIfAborted(); });
    trace({ type: 'ui/verified', sessionId, clock: 'real', screenshots: ['web-light.png', 'web-dark.png'] });
    return browser;
  } catch (error) { await browser.close(); throw error; }
  finally { signal?.removeEventListener('abort', aborted); }
}
