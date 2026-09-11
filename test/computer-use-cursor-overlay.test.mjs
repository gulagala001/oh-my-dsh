import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { CursorOverlay } from '../browser-extension/cursor.js';
import { viewportGeometry } from '../src/computer-use/browser-screenshot.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';

test('the browser cursor is visible, excluded from capture, and does not block stop behind a JavaScript dialog', { timeout: 15000 }, async t => {
  const fixture = await startFixture(), browser = await chromium.launch();
  t.after(async () => { await browser.close(); await fixture.close(); });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); await page.goto(fixture.url + '/geometry');
  page.on('dialog', () => {});
  const cdp = await page.context().newCDPSession(page); await cdp.send('Page.enable');
  const send = (method, params) => cdp.send(method, params), cursor = new CursorOverlay(send, () => true);
  cdp.on('Page.javascriptDialogOpening', () => cursor.setDialog(true)); cdp.on('Page.javascriptDialogClosed', () => cursor.setDialog(false));
  const capture = () => send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const before = await capture(), { frameTree } = await send('Page.getFrameTree');
  const pointer = { x: 700, y: 350, type: 'mouseMoved', buttons: 0, at: Date.now(), source: 'fixture', sequence: 1, geometry: viewportGeometry(await send('Page.getLayoutMetrics')), loaderId: frameTree.frame.loaderId };
  await cursor.update('test', pointer);
  const shown = await capture(); assert.notEqual(shown.data, before.data, 'the actual rendered frame must contain a cursor');
  const hidden = await cursor.capture(capture); assert.equal(hidden.data, before.data, 'model capture must omit it without changing page pixels');
  await cursor.painting;
  const dialog = page.waitForEvent('dialog'); const open = page.evaluate(() => alert('cursor stop test')); await dialog;
  await cursor.stop('test');
  await send('Page.handleJavaScriptDialog', { accept: true }); await open; await cursor.hiding;
  assert.equal((await capture()).data, before.data, 'stopping must prevent a late script from restoring the cursor');
  await delay(1550);
  assert.equal((await cursor.capture(capture)).data, before.data, 'capturing after idle removal must still work');
  await cursor.update('test', { ...pointer, sequence: 2, at: Date.now() });
  assert.notEqual((await capture()).data, before.data, 'the next input can show a fresh cursor after idle expiry');
});

test('cursor rendering respects strict CSP, existing modal focus, and overlapping captures', { timeout: 15000 }, async t => {
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('http://cursor.fixture/', route => route.fulfill({ headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'none'; style-src 'none'; trusted-types 'none'; require-trusted-types-for 'script'" }, body: '<!doctype html><title>Cursor CSP fixture</title><dialog><input aria-label="existing field"><button>Save</button></dialog>' }));
  await page.goto('http://cursor.fixture/');
  await page.evaluate(() => { document.querySelector('dialog').showModal(); document.querySelector('input').focus(); });
  const cdp = await page.context().newCDPSession(page), send = (method, params) => cdp.send(method, params);
  const cursor = new CursorOverlay(send, () => true), capture = () => send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const before = await capture(), { frameTree } = await send('Page.getFrameTree');
  const pointer = { x: 200, y: 200, type: 'mouseMoved', buttons: 0, at: Date.now(), source: 'fixture', sequence: 1, geometry: viewportGeometry(await send('Page.getLayoutMetrics')), loaderId: frameTree.frame.loaderId };
  await cursor.update('test', pointer);
  assert.deepEqual(await page.evaluate(() => ({ modal: document.querySelector('dialog').open, focus: document.activeElement.tagName })), { modal: true, focus: 'INPUT' });
  assert.notEqual((await capture()).data, before.data);
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const first = cursor.capture(async () => { started(); await new Promise(resolve => { release = resolve; }); return capture(); });
  await ready;
  const second = await cursor.capture(capture); assert.equal(second.data, before.data);
  await cursor.update('test', { ...pointer, sequence: 2, x: 300, at: Date.now() });
  assert.equal((await capture()).data, before.data, 'a concurrent input cannot show the cursor while another capture is pending');
  release(); assert.equal((await first).data, before.data); await cursor.painting;
  assert.notEqual((await capture()).data, before.data, 'the latest cursor returns after the last capture finishes');
});

test('the external Chrome window shows the real assistant cursor across zoom and pan without contaminating model images', { timeout: 30000, skip: process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-window-cursor-')), cleanup = []; let manager;
  t.after(async () => { try { await manager?.close(); } finally { for (const close of cleanup) await close(); if (!process.env.TRISOUL_CU_UI_ARTIFACTS) await rm(root, { recursive: true, force: true }); else console.log('Window cursor artifacts:', root); } });
  const headful = process.env.TRISOUL_CU_TEST_HEADFUL === '1';
  const env = await extensionFixture({ after: close => cleanup.push(close) }, { headless: !headful });
  manager = new ComputerUseManager(root, { extensionHub: env.hub, native: { binary: join(root, 'absent') } });
  const tab = await manager.dispatch('test', 'createBrowserTab', [env.browser.id, env.fixture.url + '/geometry']);
  const backend = manager.browserForTab(tab.id, tab.browserId); assert.equal(backend.windowCursor, true);
  const page = env.context.pages().find(page => page.url().endsWith('/geometry')), cdp = await env.context.newCDPSession(page);
  if (headful) await page.bringToFront();
  const worker = env.context.serviceWorkers().find(worker => worker.url() === env.origin + 'worker.js');
  const nativeId = backend.records.get(tab.id).nativeTabId;
  // Keep the visible fixture inside the native Chrome content surface even
  // while its toolbar animates. Surface clipping has separate geometry tests.
  await page.setViewportSize({ width: 1280, height: headful ? 500 : 720 });
  const run = async code => { const result = await manager.execute('test', code); assert.equal(result.error, undefined, JSON.stringify(result.error)); };
  await run(`const tab=await cua.getTab(${JSON.stringify(tab.id)},{browser:${JSON.stringify(tab.browserId)}}); await tab.markDeliverable();`);
  const rawCapture = () => cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  for (const [zoom, scale, pan] of [[1, 1, false], [1, 2, true], [1.5, 2, true]]) {
    await page.reload();
    // macOS overlay scrollbars legitimately fade after a click. Keep only
    // this pixel-equality fixture static; production pages retain their styles.
    await page.evaluate(() => { document.documentElement.style.scrollbarWidth = 'none'; });
    await worker.evaluate(async ({ id, zoom }) => chrome.tabs.setZoom(id, zoom), { id: nativeId, zoom });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
    if (pan) { await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }); await cdp.send('Input.synthesizeScrollGesture', { x: 300, y: headful ? 100 : 180, xDistance: -80, yDistance: 0, gestureSourceType: 'touch', speed: 800 }); }
    const initial = viewportGeometry(await cdp.send('Page.getLayoutMetrics'));
    assert.equal(initial.scale, scale); assert.equal(initial.zoom, zoom); if (pan) assert.ok(initial.pageX > 20);
    const before = await backend.invoke('test', tab.id, 'getScreenshot');
    const focused = await page.evaluate(() => document.activeElement.tagName);
    await run('await tab.click([240,200]);');
    const layer = page.locator('[data-trisoul-cursor]'); await layer.waitFor({ timeout: 8000 });
    await delay(50); // Let the short movement interpolation reach its endpoint.
    const pointer = manager.sessions.get('test').pointer; assert.ok(pointer);
    const { data: image } = await rawCapture(), { data, info } = await sharp(Buffer.from(image, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = pointer.x * initial.scale * initial.rasterScale, y = pointer.y * initial.scale * initial.rasterScale, dpr = initial.rasterScale / initial.zoom;
    let count = 0, minX = Infinity, minY = Infinity;
    for (let row = Math.floor(y); row < Math.min(info.height, y + 27 * dpr); row++) for (let col = Math.floor(x); col < Math.min(info.width, x + 23 * dpr); col++) {
      const at = (row * info.width + col) * info.channels;
      if (data[at] < 70 && data[at + 1] < 70 && data[at + 2] < 70) { count++; minX = Math.min(minX, col); minY = Math.min(minY, row); }
    }
    assert.ok(count > 25 * dpr * dpr && minX - x < 5 * dpr && minY - y < 5 * dpr, JSON.stringify({ zoom, scale, pan, x, y, count, minX, minY, dpr }));
    assert.equal(await page.evaluate(() => document.activeElement.tagName), focused, 'showing the pointer must not steal focus');
    const after = await backend.invoke('test', tab.id, 'getScreenshot');
    if (process.env.TRISOUL_CU_UI_ARTIFACTS) {
      await writeFile(join(root, `before-${zoom}-${scale}.png`), Buffer.from(before.screenshot, 'base64'));
      await writeFile(join(root, `after-${zoom}-${scale}.png`), Buffer.from(after.screenshot, 'base64'));
    }
    const beforeImage = sharp(Buffer.from(before.screenshot, 'base64')), afterImage = sharp(Buffer.from(after.screenshot, 'base64'));
    const beforeSize = await beforeImage.metadata(), afterSize = await afterImage.metadata();
    const common = { left: 0, top: 0, width: Math.min(beforeSize.width, afterSize.width), height: Math.min(beforeSize.height, afterSize.height) };
    // Native Chrome's captured surface can lose/gain a row even with the
    // cursor disabled and unchanged emulated geometry. Compare every shared
    // page pixel, including the complete cursor area, not PNG byte encoding.
    assert.ok(pointer.x * initial.scale + 24 < common.width && pointer.y * initial.scale + 28 < common.height);
    assert.ok((await beforeImage.extract(common).ensureAlpha().raw().toBuffer()).equals(await afterImage.extract(common).ensureAlpha().raw().toBuffer()), 'the model must receive unchanged visible page pixels without the helper cursor');
    assert.deepEqual(viewportGeometry(await cdp.send('Page.getLayoutMetrics')), initial);
    const status = await env.popup.evaluate(() => chrome.runtime.sendMessage({ action: 'status' }));
    assert.ok(status.controls.every(control => !control.cursorError), JSON.stringify(status.controls));
    if (process.env.TRISOUL_CU_UI_ARTIFACTS) await writeFile(join(root, `window-cursor-${zoom}-${scale}.png`), Buffer.from(image, 'base64'));
  }
  await manager.stop('test');
  await page.locator('[data-trisoul-cursor]').waitFor({ state: 'hidden', timeout: 500 });
});
