import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionBrowser } from '../src/computer-use/extension-browser.mjs';
import { BrowserViews } from '../src/computer-use/browser-view.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import sharp from 'sharp';

test('existing Chrome uses the shared actions and keeps previews and user tabs after stop', { timeout: 60000, skip: process.platform === 'win32' }, async t => {
  const env = await extensionFixture(t), page = await env.context.newPage();
  await page.goto(env.fixture.url);
  const host = new ExtensionBrowser(env.hub, env.browser), views = new BrowserViews(host);
  try {
    const tab = (await host.list('model')).find(tab => tab.url === env.fixture.url + '/');
    const record = await host.target('model', tab.id);
    assert.equal(record.id, tab.id);
    await assert.rejects(host.target('other', tab.id), /another conversation/);
    const state = await host.invoke('model', tab.id, 'getAXStateAndScreenshot');
    assert.match(state.state, /姓名/); assert.equal(Buffer.from(state.screenshot, 'base64').readUInt32BE(0), 0x89504e47);
    const name = Number(state.state.match(/(\d+) textbox "姓名"/)[1]);
    await host.invoke('model', tab.id, 'setValue', [name, '共享操作 中文 🧭']);
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '共享操作 中文 🧭');
    let frame, navigation;
    const unsubscribe = await views.subscribe(tab.id, (type, value) => { if (type === 'frame') frame = value; if (type === 'navigation') navigation = value; });
    await page.waitForFunction(() => document.readyState === 'complete');
    for (let i = 0; i < 100 && !frame; i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(frame?.data, 'real extension frames reach BrowserViews'); assert.equal(navigation.url, env.fixture.url + '/');
    await record.page.mouse.move(100, 100); await record.page.mouse.down();
    assert.equal(await page.evaluate(() => fixtureMouseHeld), true);
    await host.disconnect('model');
    assert.equal(await page.evaluate(() => fixtureMouseHeld), false);
    assert.equal(views.views.get(tab.id).record.page.isClosed(), false, 'stop preserves the preview connection');
    const resumed = await host.target('model', tab.id);
    await resumed.page.goto(env.fixture.url + '/cross-frames');
    const nested = await host.invoke('model', tab.id, 'getAXState');
    assert.match(nested.state, /外层输入/); assert.match(nested.state, /框架输入/);
    const inputId = Number(nested.state.match(/(\d+) textbox "框架输入"/)[1]);
    await host.invoke('model', tab.id, 'setValue', [inputId, '跨源 AX 输入']);
    assert.equal(await page.frameLocator('iframe').frameLocator('iframe').getByLabel('框架输入').inputValue(), '跨源 AX 输入');
    await unsubscribe(); await host.endTurn('model');
    assert.equal(page.isClosed(), false);
    assert.equal(host.entries.size, 0, 'all native leases end when the final observer/controller leaves');
    assert.equal(host.owners.has(tab.id), false);
    const rebound = await host.target('other', tab.id);
    assert.equal(rebound.page.url(), env.fixture.url + '/cross-frames');
  } finally {
    await views.close(); await host.close();
    assert.equal(page.isClosed(), false, 'unloading does not close an existing Chrome tab');
  }
});

test('TrisoulX runtime and manual pane route to existing Chrome and reject ended bindings', { timeout: 60000, skip: process.platform === 'win32' }, async t => {
  const { ComputerUseManager } = await import('../src/computer-use/manager.mjs');
  const env = await extensionFixture(t), page = await env.context.newPage();
  await page.goto(env.fixture.url);
  const manager = new ComputerUseManager(env.root + '/manager', { extensionHub: env.hub, native: { binary: env.root + '/missing-native' } });
  let closeView;
  try {
    const browserId = env.browser.id;
    assert.ok((await manager.dispatch('model', 'listBrowsers')).some(browser => browser.id === browserId));
    const tabs = await manager.dispatch('model', 'listTabs', [{ browser: browserId }]);
    const tab = tabs.find(tab => tab.url === env.fixture.url + '/');
    const code = `const browser = await cua.getBrowser({id:${JSON.stringify(browserId)}}); const tab = await browser.tabs.get(${JSON.stringify(tab.id)}); await tab.playwright.getByLabel('姓名',{exact:true}).fill('模型统一工具 中文'); await tab.playwright.getByRole('button',{name:'保存',exact:true}).click(); await tab.getScreenshot();`;
    const result = await manager.execute('model', code);
    assert.equal(result.error, undefined, JSON.stringify(result.error)); assert.ok(result.blocks.some(block => block.type === 'image'));
    assert.equal(await page.evaluate(() => fixtureEvents.at(-1).value.name), '模型统一工具 中文');
    assert.equal(manager.status('model').target.browserId, browserId);
    assert.ok((await manager.listUserTabs('model')).some(info => info.id === tab.id && info.available));
    let frame;
    closeView = await manager.watchBrowser('model', tab.id, (type, value) => { if (type === 'frame') frame = value; });
    for (let i = 0; i < 100 && !frame; i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(frame);
    await manager.stop('model');
    assert.ok(manager.viewsFor(tab).views.get(tab.id));
    const box = await page.getByLabel('姓名', { exact: true }).boundingBox();
    const input = { tabId: tab.id, actor: frame.actor, frameId: frame.id, controlEpoch: manager.status('model').controlEpoch, x: (box.x + box.width / 2) / frame.width, y: (box.y + box.height / 2) / frame.height };
    await manager.manualInput('model', { ...input, type: 'pointerdown' });
    await manager.manualInput('model', { ...input, type: 'pointerup' });
    await manager.manualInput('model', { ...input, type: 'text', text: ' 手动接管' });
    assert.match(await page.getByLabel('姓名', { exact: true }).inputValue(), /手动接管/);
    await manager.resume('model');
    const rebound = await manager.execute('model', `const tab = await cua.getTab(${JSON.stringify(tab.id)},{browser:${JSON.stringify(browserId)}}); nodeRepl.write(await tab.title());`);
    assert.equal(rebound.error, undefined, JSON.stringify(rebound.error));
    const entry = manager.browserFor(browserId).entries.get(tab.id);
    await env.hub.call(browserId, 'detach', { tabId: entry.gateway.tab.id * 1, leaseId: entry.gateway.leaseId });
    for (let i = 0; i < 100 && manager.status('model').target; i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(manager.status('model').target, null);
    const fresh = (await manager.dispatch('model', 'listTabs', [{ browser: browserId }])).find(info => info.url === env.fixture.url + '/');
    assert.notEqual(fresh.id, tab.id, 'explicitly ended control permanently invalidates old target IDs');
    await assert.rejects(manager.dispatch('model', 'target', [{ ...tab, kind: 'tab' }, 'pressKey', ['a']]), /control has ended/);
    assert.equal(page.isClosed(), false);
  } finally {
    const results = await Promise.allSettled([closeView?.(), manager.close()]);
    const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
    assert.equal(page.isClosed(), false);
  }
});

test('new external tabs use real navigation, preserve handoffs and close temporary tabs', { timeout: 60000, skip: process.platform === 'win32' }, async t => {
  const env = await extensionFixture(t), host = new ExtensionBrowser(env.hub, env.browser);
  try {
    const tab = await host.create('model', env.fixture.url);
    const record = await host.target('model', tab.id);
    assert.equal(record.page.url(), env.fixture.url + '/');
    await host.disconnect('model');
    await host.endTurn('model');
    assert.equal((await host.list('test')).some(info => info.id === tab.id), false);
    const kept = await host.create('model', env.fixture.url + '/handoff');
    host.keepForUser('model', kept.id); await host.endTurn('model');
    assert.ok((await host.list('test')).some(info => info.id === kept.id));
  } finally { await host.close(); }
});

test('failed native detach stays retryable after the last logical client has closed', { timeout: 30000, skip: process.platform === 'win32' }, async t => {
  const env = await extensionFixture(t), page = await env.context.newPage(); await page.goto(env.fixture.url);
  const host = new ExtensionBrowser(env.hub, env.browser);
  const worker = env.context.serviceWorkers().find(worker => worker.url() === env.origin + 'worker.js');
  try {
    const tab = (await host.list('model')).find(tab => tab.url === env.fixture.url + '/');
    const record = await host.target('model', tab.id); await record.page.mouse.move(80, 80); await record.page.mouse.down();
    await worker.evaluate(tabId => {
      const detach = chrome.debugger.detach;
      globalThis.restoreDetach = () => { chrome.debugger.detach = detach; };
      chrome.debugger.detach = target => target.tabId === tabId ? Promise.reject(new Error('Fixture native detach failure')) : detach.call(chrome.debugger, target);
    }, tab.nativeTabId);
    await assert.rejects(host.disconnect('model'), /Fixture native detach failure/);
    assert.equal(await page.evaluate(() => fixtureMouseHeld), false, 'actor input was released before the native detach failed');
    await worker.evaluate(() => globalThis.restoreDetach());
    await host.disconnect('model');
    assert.equal(host.entries.size, 0, 'retry must finish the native lease, not just discard the closed logical client');
    const status = await env.popup.evaluate(() => chrome.runtime.sendMessage({ action: 'status' }));
    assert.equal(status.controls.length, 0);
    assert.equal(page.isClosed(), false);
  } finally { await worker.evaluate(() => globalThis.restoreDetach?.()); await host.close(); }
});

test('cancelling a pending Chrome tab creation waits for removal and preserves existing tabs', { timeout: 30000, skip: process.platform === 'win32' }, async t => {
  const env = await extensionFixture(t), page = await env.context.newPage(); await page.goto(env.fixture.url);
  const host = new ExtensionBrowser(env.hub, env.browser), controller = new AbortController();
  const worker = env.context.serviceWorkers().find(worker => worker.url() === env.origin + 'worker.js');
  try {
    const before = (await host.list('model')).map(tab => tab.nativeTabId).sort();
    await worker.evaluate(() => {
      const create = chrome.tabs.create;
      globalThis.restoreCreation = () => { chrome.tabs.create = create; globalThis.allowCreation?.(); };
      chrome.tabs.create = async options => {
        await new Promise(resolve => { globalThis.allowCreation = resolve; });
        return create.call(chrome.tabs, options);
      };
    });
    let settled = false;
    const creating = host.create('model', env.fixture.url, controller.signal).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
    for (let i = 0; i < 100 && !await worker.evaluate(() => !!globalThis.allowCreation); i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(await worker.evaluate(() => !!globalThis.allowCreation), true);
    controller.abort(new Error('Fixture tab creation cancelled'));
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(settled, false, 'stop waits for the actual in-flight native creation');
    await worker.evaluate(() => globalThis.allowCreation());
    assert.match((await creating).error.message, /creation cancelled/);
    assert.deepEqual((await host.list('model')).map(tab => tab.nativeTabId).sort(), before);
    assert.equal(page.isClosed(), false);
  } finally { await worker.evaluate(() => globalThis.restoreCreation?.()); await host.close(); }
});

test('external screenshots preserve emulation and their pixels point to the actual controls across browser zoom', { timeout: 60000, skip: process.platform === 'win32' }, async t => {
  const env = await extensionFixture(t, { headless: process.env.TRISOUL_CU_TEST_HEADFUL !== '1' }), page = await env.context.newPage(); await page.goto(env.fixture.url + '/visual');
  const host = new ExtensionBrowser(env.hub, env.browser), original = await page.context().newCDPSession(page);
  try {
    const tab = (await host.list('model')).find(tab => tab.url.endsWith('/visual'));
    await host.target('model', tab.id);
    const worker = env.context.serviceWorkers().find(worker => worker.url() === env.origin + 'worker.js');
    for (const scale of [1, 2]) for (const zoom of [1, 1.5, .8]) {
      await worker.evaluate(({ id, zoom }) => chrome.tabs.setZoom(id, zoom), { id: tab.nativeTabId, zoom });
      await original.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: scale, mobile: false });
      await page.reload();
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const result = await host.invoke('model', tab.id, 'getScreenshot');
      assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), before, 'observing must not clear another client\'s viewport or device scale');
      const { data, info } = await sharp(Buffer.from(result.screenshot, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x = 0, y = 0, count = 0;
      for (let p = 0; p < data.length; p += 4) if (data[p] > 150 && data[p + 1] < 100 && data[p + 2] < 120) {
        x += (p / 4) % info.width; y += Math.floor((p / 4) / info.width); count++;
      }
      assert.ok(count > 100, 'the target must be visible in the returned image');
      assert.ok(Math.abs(x / count - before.width * .78) < 2 && Math.abs(y / count - before.height * .32) < 2, 'PNG pixels must use input coordinates without stretching a cropped surface');
      await host.invoke('model', tab.id, 'click', [[x / count, y / count]]);
      assert.equal(await page.evaluate(() => visualFixture.redHit), true, `actual pixel click, emulated DPR ${scale}, zoom ${zoom}`);
    }
  } finally { await host.close(); }
});
