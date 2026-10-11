import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, frontendEnvironment, until } from './fixtures/frontend.mjs';
import { INSTALLED_VERSION, releaseHostVersion } from '../src/version.mjs';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

let registrationBundle;
const flushRegistration = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function registrationFixture(t, phase = 'fetch') {
  registrationBundle ??= build({ entryPoints: [fileURLToPath(new URL('../src/client/recommended-plugins.jsx', import.meta.url))], bundle: true,
    write: false, platform: 'browser', format: 'cjs', define: { 'process.env.NODE_ENV': '"production"' } });
  const code = (await registrationBundle).outputFiles[0].text;
  class TrackedEvents extends EventTarget {
    listeners = new Set();
    addEventListener(type, callback, options) { this.listeners.add(callback); super.addEventListener(type, callback, options); }
    removeEventListener(type, callback, options) { this.listeners.delete(callback); super.removeEventListener(type, callback, options); }
  }
  const window = new TrackedEvents(), document = new TrackedEvents(); document.visibilityState = 'visible';
  const fetchRead = deferred(), bodyRead = deferred(), timers = new Map(), entries = new Set(), reads = [];
  let now = 0, timerId = 0, cleanup;
  const response = { ok: true, json: () => bodyRead.promise };
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, window, document, AbortController,
    fetch: (url, { signal }) => { reads.push({ url, signal }); return phase === 'body' ? Promise.resolve(response) : fetchRead.promise; },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  module.exports.applyRecommendedPlugins({ slots: {
    inject(name, setup) { cleanup = setup(); },
    register(metadata) { entries.add(metadata.id); return () => entries.delete(metadata.id); },
  } });
  t.after(() => cleanup());
  await flushRegistration();
  const advance = async ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    await flushRegistration();
  };
  const settle = async (config = {}) => { fetchRead.resolve(response); bodyRead.resolve(config); await flushRegistration(); };
  const save = config => { const event = new Event('omd:settings-saved'); event.detail = config; window.dispatchEvent(event); };
  const assertStopped = () => {
    assert.equal(timers.size, 0, 'no timeout or next poll remains');
    assert.equal(document.listeners.size, 0, 'visibility listener was removed');
    assert.equal(reads[0].signal.aborted, true, 'the initial read is cancelled');
  };
  return { entries, reads, advance, settle, save, cleanup: () => cleanup(), assertStopped, window };
}

for (const phase of ['fetch', 'body']) {
  test(`recommendation registration recovers from a stalled ${phase} after ten seconds`, async t => {
    const f = await registrationFixture(t, phase);
    await f.advance(9999); assert.equal(f.entries.size, 0);
    await f.advance(1); assert.equal(f.entries.size, 1, 'timeout makes the default recommendation entry available');
    f.assertStopped();
    await f.settle({ recommendedPluginsPageEnabled: false });
    assert.equal(f.entries.size, 1, 'late configuration cannot undo timeout recovery');
    await f.advance(60000); assert.equal(f.reads.length, 1, 'this initialization never becomes continuous polling');
  });
  test(`recommendation registration keeps a saved preference over a stalled ${phase}`, async t => {
    const f = await registrationFixture(t, phase);
    f.save({ recommendedPluginsPageEnabled: false }); await flushRegistration();
    f.assertStopped();
    await f.advance(10000); await f.settle({ recommendedPluginsPageEnabled: true });
    assert.equal(f.entries.size, 0, 'neither timeout nor a late read overrides the saved preference');
    f.save({ recommendedPluginsPageEnabled: true }); assert.equal(f.entries.size, 1);
  });
  test(`recommendation registration cleans up a stalled ${phase} on unload`, async t => {
    const f = await registrationFixture(t, phase);
    f.cleanup(); await flushRegistration(); f.assertStopped();
    assert.equal(f.window.listeners.size, 0, 'settings listener was removed');
    await f.advance(10000); await f.settle({ recommendedPluginsPageEnabled: true });
    assert.equal(f.entries.size, 0, 'nothing is registered after disposal');
  });
}

test('recommendation registration stops after a successful initial read', async t => {
  const f = await registrationFixture(t);
  await f.settle({ recommendedPluginsPageEnabled: false }); f.assertStopped();
  assert.equal(f.entries.size, 0);
  await f.advance(60000); assert.equal(f.reads.length, 1);
  f.save({ recommendedPluginsPageEnabled: true }); assert.equal(f.entries.size, 1);
});

for (const phase of ['fetch', 'body']) test(`recommendation entry opens in a browser after a stalled ${phase}`, { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-recommendation-registration-'));
  let browser, reads = 0;
  const errors = [];
  const server = createServer((req, res) => {
    if (req.url === '/trisoul-x/api/settings') {
      reads++;
      if (phase === 'body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
      return;
    }
    if (req.url === '/trisoul-x/recommended-plugins') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ autoUpdate: false, plugins: [] })); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<main id="settings"></main><main id="page"></main>');
  });
  t.after(async () => {
    try { await browser?.close(); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
  });
  await Promise.all(['user-home', 'config', 'cache', 'data', 'state', 'tmp'].map(name => mkdir(join(root, name), { recursive: true })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  // Render the actual recommendation component through a minimal settings-slot
  // adapter; this check needs neither a DSH process nor a repository build.
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { applyRecommendedPlugins } from './src/client/recommended-plugins.jsx';
    const root = createRoot(document.getElementById('page'));
    applyRecommendedPlugins({ slots: {
      inject(name, setup) { window.disposeRecommendations = setup(); },
      register(metadata, Component) {
        const button = document.createElement('button'); button.textContent = metadata.label();
        button.onclick = () => root.render(React.createElement(Component));
        document.getElementById('settings').append(button);
        return () => button.remove();
      }
    } });`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife' });
  browser = await chromium.launch({ headless: true, env: frontendEnvironment(root), args: ['--use-mock-keychain', '--password-store=basic'] });
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const entry = page.getByRole('button', { name: '推荐插件', exact: true });
  assert.equal(await entry.count(), 0, 'the initial read is still outstanding');
  await entry.waitFor({ timeout: 15000 }); await entry.click();
  await page.getByRole('heading', { name: '推荐插件', exact: true }).waitFor();
  assert.equal(reads, 1, 'initial settings are only requested once');
  await page.evaluate(() => window.disposeRecommendations());
  assert.equal(await entry.count(), 0);
  assert.deepEqual(errors, []);
});

test('recommended page defaults on, hides only after a successful save and persists', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const readConfig = () => page.evaluate(async () => (await fetch('trisoul-x/api/settings')).json());
  const dialog = page.getByRole('dialog', { name: '设置' });
  const entry = dialog.getByRole('button', { name: '推荐插件', exact: true });
  const open = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await dialog.getByRole('button', { name: 'Oh My DSH', exact: true }).click();
    await dialog.getByRole('switch', { name: '显示推荐插件页面' }).waitFor();
  };
  await open();
  const toggle = dialog.getByRole('switch', { name: '显示推荐插件页面' });
  const save = dialog.getByRole('button', { name: '保存设置', exact: true });
  assert.equal(await toggle.isChecked(), true);
  assert.equal(await entry.count(), 1);
  const before = await readConfig();
  await toggle.uncheck();
  assert.equal(await entry.count(), 1, 'unsaved edits do not hide the page');
  await page.route('**/trisoul-x/api/settings', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: { error: 'save failed fixture' } }) : route.continue());
  await save.click();
  await dialog.getByRole('alert').filter({ hasText: 'save failed fixture' }).waitFor();
  assert.equal(await entry.count(), 1, 'failed save leaves the page available');
  await page.unroute('**/trisoul-x/api/settings');
  await save.click();
  await until(async () => await entry.count() === 0);
  assert.equal((await readConfig()).recommendedPluginsAutoUpdate, before.recommendedPluginsAutoUpdate);
  await page.reload();
  await open();
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await entry.count(), 0, 'hidden preference survives a fresh client load');
  await toggle.check(); await save.click();
  await until(async () => await entry.count() === 1);
  await entry.click();
  await dialog.getByRole('heading', { name: '推荐插件', exact: true }).waitFor();
  assert.equal(await dialog.locator('.tx-recommended-card').count(), 10);
  assert.equal(await dialog.getByRole('heading', { name: 'Jevify', exact: true }).count(), 0);
  const status = await (await page.request.get(new URL('trisoul-x/recommended-plugins', page.url()).href)).json();
  assert.equal(status.plugins.length, 10);
  assert.equal(status.plugins.some(plugin => plugin.id === 'jevify'), false);
  const iui = status.plugins.find(plugin => plugin.id === 'dsh-intelligent-ui');
  const actualHost = releaseHostVersion(INSTALLED_VERSION);
  const build = recommendedPlugins.find(plugin => plugin.id === iui.id).hostBuilds[actualHost];
  const iuiCard = dialog.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: '智能交互回答 · Intelligent UI', exact: true }) });
  await until(async () => (await iuiCard.locator('.tx-recommended-version').innerText()).includes('未安装'));
  assert.equal(iui.hostVersion, actualHost, 'real native Loader resolves the running host manifest');
  assert.equal(iui.expectedVersion, build.version);
  assert.equal(iui.review.version, build.version);
  assert.equal(iui.review.sha256, build.sha256);
  assert.equal(iui.installed, false, 'Intelligent UI remains optional and is never installed by opening recommendations');
  assert.ok((await iuiCard.innerText()).includes(build.version));
  assert.equal(await iuiCard.getByRole('button', { name: '安装', exact: true }).isEnabled(), !iui.unavailable);
  for (const action of ['install', 'update', 'uninstall']) {
    const removed = await page.request.post(new URL('trisoul-x/recommended-plugins', page.url()).href, { data: { id: 'jevify', action } });
    assert.equal(removed.status(), 400);
    assert.match((await removed.json()).error, /未知/);
  }
  for (const [id, name, version] of [
    ['dsh-plugin-subscriptions', '订阅登录 · Subscriptions', '0.9.8-omd.1'],
    ['omd-intent-assistant', '需求理解 · OMD UI 增强版', '0.3.0'],
  ]) {
    const card = dialog.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await until(async () => (await card.locator('.tx-recommended-version').innerText()).includes('未安装'));
    assert.ok((await card.locator('.tx-recommended-review').innerText()).includes(version));
    assert.match(await card.innerText(), /DSH 0\.2\.0-rc\.2 · OMD 0\.2\.0-rc\.2\.omd\.0\.9\.0/);
    assert.match(await card.innerText(), /DSH 0\.2\.1-alpha\.1 · OMD 0\.2\.1-alpha\.1\.omd\.0\.9\.0/);
    if (actualHost === '0.2.1-alpha.2') {
      assert.match(status.plugins.find(plugin => plugin.id === id).unavailable, /暂不提供公开安装/);
      assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), false);
      const blocked = await page.request.post(new URL('trisoul-x/recommended-plugins', page.url()).href, { data: { id, action: 'install' } });
      assert.equal(blocked.status(), 400);
      assert.match((await blocked.json()).error, /暂不提供公开安装/);
    } else {
      assert.equal(status.plugins.find(plugin => plugin.id === id).unavailable, null);
      assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), true);
    }
    assert.match(await card.innerText(), /非上游/);
  }
  for (const [id, name, version] of [
    ['dsh-turn-rewind', '回合回滚 · Turn Rewind', '0.3.9'],
  ]) {
    const card = dialog.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await until(async () => (await card.locator('.tx-recommended-version').innerText()).includes('未安装'));
    assert.ok((await card.innerText()).includes(version));
    if (releaseHostVersion(INSTALLED_VERSION) === '0.2.0-rc.2') {
      assert.equal(status.plugins.find(plugin => plugin.id === id).unavailable, null);
      assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), true);
    } else {
      assert.match(await card.innerText(), /不兼容 DSH 0\.2\.1-alpha\.1/);
      assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), false);
      const blocked = await page.request.post(new URL('trisoul-x/recommended-plugins', page.url()).href, { data: { id, action: 'install' } });
      assert.equal(blocked.status(), 400);
      assert.match((await blocked.json()).error, /不兼容 DSH 0\.2\.1-alpha\.1/);
    }
  }
  assert.equal((await readConfig()).recommendedPluginsPageEnabled, true);
  assert.deepEqual(f.errors, []);
});

test('failed recommendation settings stay visible across polling and can be retried', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let fail = true, reads = 0;
  await page.route('**/trisoul-x/recommended-plugins', route => {
    if (route.request().method() === 'POST' && fail) return route.fulfill({ status: 500, json: { error: '无法保存自动更新设置，请重试' } });
    if (route.request().method() === 'GET') reads++;
    return route.continue();
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置' });
  await dialog.getByRole('button', { name: '推荐插件', exact: true }).click();
  const toggle = dialog.getByRole('switch', { name: '自动更新推荐插件' });
  await until(() => toggle.isEnabled());
  await toggle.click();
  const error = dialog.getByRole('alert').filter({ hasText: '无法保存自动更新设置' });
  const previousReads = reads;
  await until(() => reads >= previousReads + 2);
  assert.equal(await error.isVisible(), true, 'successful status reads do not erase a failed write');
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await toggle.isEnabled(), true, 'a failed write must allow retry');
  fail = false;
  await toggle.click();
  await until(() => toggle.isChecked());
  assert.equal(await error.count(), 0);
  assert.deepEqual(f.errors, []);
});
