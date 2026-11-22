import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(resolve(process.env.OMD_STOCK_TEST_DEPENDENCIES, 'package.json'));
const { chromium } = require('playwright');
const [port, mode] = process.argv.slice(2);
const sleep = ms => new Promise(done => setTimeout(done, ms));
let browser;
for (let attempt = 0; attempt < 60 && !browser; attempt++) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }); }
  catch { await sleep(500); }
}
assert(browser, 'Stock desktop did not open CDP');
async function verify() {
  let page;
  for (let attempt = 0; attempt < 80 && !page; attempt++) {
    const pages = browser.contexts().flatMap(context => context.pages());
    const welcome = pages.find(value => value.url().endsWith('/welcome.html'));
    if (welcome) await welcome.evaluate(() => { if (window.dshWelcome?.skip) setTimeout(() => window.dshWelcome.skip(), 0); }).catch(() => {});
    page = pages.find(value => value.url() === 'dsh-app://app/');
    if (!page) await sleep(500);
  }
  assert(page);
  await page.waitForFunction(() => typeof window.dshDesktop?.browser?.acquire === 'function', null, { timeout: 20000 });
  if (mode === 'init') return;
  assert.equal(await page.evaluate(() => typeof window.dshDesktop.browser.acquireOpenCU), 'undefined');
  const rpc = method => page.evaluate(async method => {
    const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: {} } }) });
    const body = await response.text();
    if (!response.ok || !body) return null;
    return JSON.parse(body).result;
  }, method);
  let versions;
  for (let attempt = 0; attempt < 50; attempt++) {
    versions = await rpc('pluginManager/listBundles').catch(() => null);
    if (versions?.ok) break;
    await sleep(600);
  }
  assert(versions?.ok, 'Desktop plugin inventory unavailable');
  const inventory = Array.isArray(versions.value) ? versions.value : versions.value.items ?? versions.value.bundles ?? versions.value.entries;
  for (const [name, version] of [['oh-my-dsh','0.2.2-rc.5.omd.1.9.3']]) {
    const entry = inventory.find(row => row.name === name);
    assert(entry?.enabled, name);
    assert.equal(entry.version ?? entry.installedVersion, version);
  }
  await page.evaluate(() => {
    localStorage.setItem('omd.skins.v1', JSON.stringify({ selected: 'google-material-expressive', reduceEffects: true }));
  });
  await page.reload();
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return root.dataset.omdLayout === 'google-material-expressive' && root.hasAttribute('data-omd-reduce-effects')
      && Boolean(document.querySelector('style[data-omd-skin-style]'));
  }, null, { timeout: 30000 });
  const header = page.locator('header[data-window-drag][class*="_headerBlank"]');
  await header.waitFor({ timeout: 15000 });
  const surface = await header.evaluate(node => ({
    header: getComputedStyle(node).backgroundColor,
    conversation: getComputedStyle(node.closest('[data-phase]')).backgroundColor,
    reduced: getComputedStyle(node).animationName,
  }));
  assert.equal(surface.header, surface.conversation);
  assert.equal(surface.reduced, 'none');
  const frame = page.locator('[data-omd-surface="frame"]');
  await frame.waitFor();
  const switcher = page.locator('[data-sidebar-toggle]').filter({ visible: true }).first();
  await switcher.waitFor();
  if (await frame.getAttribute('data-sidebar-collapsed') === 'true') await switcher.click();
  await page.waitForFunction(() => !document.querySelector('[data-omd-surface="frame"]')?.hasAttribute('data-sidebar-collapsed'));
  const right = page.getByRole('button', { name: /打开右侧边栏|open right sidebar/i }).filter({ visible: true }).first();
  if (await right.isVisible()) await right.click({ timeout: 4000 });
  await switcher.click();
  await page.waitForFunction(() => {
    const frame = document.querySelector('[data-omd-surface="frame"]');
    return frame?.dataset.sidebarCollapsed === 'true' && getComputedStyle(frame).gridTemplateColumns.startsWith('0px ');
  });
  const create = page.locator('[data-omd-surface="sidebar"] button[class*="_newSession"]').filter({ visible: true }).first();
  const app = page.locator('[data-windows-menu]').getByRole('menuitem', { name: /应用|^App(?:lication)?$/i });
  const [button, menu] = await Promise.all([create.boundingBox(), app.boundingBox()]);
  assert(button && menu);
  assert.equal(button.width, 28);
  assert.equal(button.height, 28);
  assert(button.x + button.width <= menu.x);
  await create.click({ timeout: 5000 });
  await app.click({ timeout: 5000 });
  try {
    await app.evaluate(element => {
      if (element.getAttribute('aria-expanded') !== 'true') throw Error('Windows native application menu did not open');
    });
  } finally {
    spawnSync('powershell.exe', ['-NoProfile', '-Command', "(New-Object -ComObject WScript.Shell).SendKeys('{ESC}')"], { timeout: 5000 });
  }
  console.log('Stock Windows rc.5 installed the exact release. Material caption controls and blank conversation header passed.');
}
try { await verify(); } finally { await browser.close(); }
