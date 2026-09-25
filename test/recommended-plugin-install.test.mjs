import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { setTimeout as delay } from 'node:timers/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('recommended plugin installs, checks updates and uninstalls through the host in an isolated profile', { timeout: 180000, skip: process.env.OMD_LIVE_PLUGIN_TESTS !== '1' ? 'Online third-party smoke; set OMD_LIVE_PLUGIN_TESTS=1' : false }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const status = () => page.evaluate(async () => {
    const response = await fetch('/trisoul-x/recommended-plugins');
    if (!response.ok) throw Error(`Plugin status ${response.status}`); return response.json();
  });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置' });
  await settings.getByRole('button', { name: '推荐插件', exact: true }).click();
  const card = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: 'dsh-status-rotator', exact: true }) });
  const blender = page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: 'DSH × Blender', exact: true }) });
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  assert.equal(await blender.getByRole('button', { name: '安装', exact: true }).count(), 0);
  assert.match(await blender.innerText(), /尚未提供 DSH 标准插件包安装清单/);
  assert.equal((await status()).autoUpdate, false);
  const toggle = settings.getByRole('switch', { name: '自动更新推荐插件' });
  await toggle.click(); await until(async () => (await status()).autoUpdate); await until(() => toggle.isChecked());
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await settings.getByRole('button', { name: '推荐插件', exact: true }).click();
  await until(() => toggle.isChecked());
  await toggle.click(); await until(async () => !(await status()).autoUpdate); await until(async () => !(await toggle.isChecked()));
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.installed; }, 120000);
  await until(() => card.getByRole('button', { name: '更新', exact: true }).isEnabled());
  assert.match(await card.innerText(), /已安装 · v/);
  await card.getByRole('button', { name: '更新', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.message === '已是核验版本'; }, 30000);
  assert.equal((await status()).plugins.find(p => p.id === 'dsh-status-rotator').version, '0.27.0');
  await verifyRotatorTitles(f);
  // Seed an older real release in this disposable profile, then exercise an
  // actual package upgrade, not only a "latest already installed" check.
  const cli = fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url));
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'trisoul-x', 'add', 'dsh-status-rotator@0.20.0'], { env: { ...process.env, DSH_HOME: f.home }, timeout: 60000 });
  await until(async () => (await status()).plugins.find(p => p.id === 'dsh-status-rotator').version === '0.20.0');
  await until(() => card.getByRole('button', { name: '更新', exact: true }).isEnabled());
  await card.getByRole('button', { name: '更新', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && p.version !== '0.20.0' && p.restartRequired; }, 60000);
  await card.getByText('待重启', { exact: true }).waitFor();
  await until(() => card.getByRole('button', { name: '卸载', exact: true }).isEnabled());
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await until(async () => { const s = await status(), p = s.plugins.find(p => p.id === 'dsh-status-rotator');
    if (p.error) throw Error(p.error); return !s.busy && !p.installed; }, 60000);
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  assert.deepEqual(f.errors, []);
});

async function verifyRotatorTitles(f) {
  const published = await readFile(join(f.home, 'profiles', 'trisoul-x', 'node_modules', 'dsh-status-rotator', 'lib', 'client.js'), 'utf8');
  const brand = await build({ stdin: { contents: `import { brandDocumentTitle } from './src/client/document-title.mjs'; window.brandDocumentTitle = brandDocumentTitle;`,
    resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  const probe = await f.context.newPage();
  try {
    await probe.route('**/omd-rotator-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>DeepSeek Harness</title></head><body></body></html>' }));
    for (const order of ['before', 'after']) {
      await probe.goto(new URL('/omd-rotator-probe', f.page.url()).href);
      await probe.addScriptTag({ content: brand.outputFiles[0].text });
      await probe.evaluate(() => {
        window.rotatorDoc = { config: { title: { enabled: false }, reloadIntervalMs: 250, danmaku: { enabled: false } }, phrases: { zh: ['核验状态文案'] } };
        window.fetch = async () => ({ ok: true, status: 200, json: async () => structuredClone(window.rotatorDoc) });
        window.rotatorDisposers = [];
        window.rotatorContext = {
          locale: { register: () => () => {}, subscribe: () => () => {}, getLocale: () => ({ active: 'zh' }), bind: () => null },
          slots: { inject: () => {}, register: () => ({dispose() {}}) },
          effect: callback => { const cleanup = callback(); if (typeof cleanup === 'function') window.rotatorDisposers.push(cleanup); },
          get: () => undefined,
        };
        window.__ModuleLoader__ = { load: def => { window.rotatorPlugin = def.factory(name => {
          if (name === 'react') return { useState: () => null, useEffect: () => null, useCallback: fn => fn, useRef: () => ({current:null}), createElement: () => null };
          throw Error('Unexpected module: ' + name);
        }); } };
      });
      await probe.addScriptTag({content: published});
      await probe.evaluate(order => {
        if (order === 'before') window.releaseBrand = window.brandDocumentTitle(document);
        window.rotatorPlugin.apply(window.rotatorContext);
        if (order === 'after') window.releaseBrand = window.brandDocumentTitle(document);
        const previous = Object.getOwnPropertyDescriptor(document, 'title');
        window.restoreCounter = () => Object.defineProperty(document, 'title', previous);
        window.titleWrites = 0;
        Object.defineProperty(document, 'title', { configurable: true,
          get: () => previous.get.call(document), set: value => { window.titleWrites++; previous.set.call(document, value); } });
        document.title = '核验会话 — DeepSeek Harness';
      }, order);
      await delay(1400);
      assert.equal(await probe.title(), '核验会话 — Oh My DSH', order);
      assert.equal(await probe.evaluate(() => window.titleWrites), 1, 'disabled title rotation must not write: ' + order);
      await probe.evaluate(() => { window.rotatorDoc.config.title = {enabled:true, idleTemplate:'插件空闲'}; document.dispatchEvent(new Event('visibilitychange')); });
      await until(async () => (await probe.title()) === '插件空闲');
      await probe.evaluate(() => { document.title = '新会话 — DeepSeek Harness'; });
      await until(async () => (await probe.title()) === '插件空闲');
      await probe.evaluate(() => { window.rotatorDoc.config.title = {enabled:false}; document.dispatchEvent(new Event('visibilitychange')); });
      await until(async () => (await probe.title()) === '新会话 — Oh My DSH');
      const settled = await probe.evaluate(() => window.titleWrites); await delay(1100);
      assert.equal(await probe.evaluate(() => window.titleWrites), settled, 'restored title stays stable');
      await probe.evaluate(() => { window.restoreCounter(); for (const dispose of window.rotatorDisposers.reverse()) dispose(); window.releaseBrand(); });
      await probe.evaluate(() => { document.title = '退出后 — DeepSeek Harness'; });
      assert.equal(await probe.title(), '退出后 — DeepSeek Harness');
    }
  } finally { await probe.close(); }
}
