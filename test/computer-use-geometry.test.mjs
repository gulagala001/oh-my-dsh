import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ImageCoordinates } from '../src/computer-use/image-coordinates.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

async function setup(t, backend) {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-geometry-')), cleanups = []; let manager;
  t.after(async () => { try { await manager?.close(); } finally { for (const close of cleanups) await close(); await rm(root, { recursive: true, force: true }); } });
  const external = backend === 'extension' ? await extensionFixture({ after: close => cleanups.push(close) }, { headless: process.env.TRISOUL_CU_TEST_HEADFUL !== '1' }) : null;
  const fixture = external?.fixture ?? await startFixture();
  if (!external) cleanups.push(() => fixture.close());
  manager = new ComputerUseManager(root, { native: { binary: join(root, 'absent') }, ...(external ? { extensionHub: external.hub } : {}) });
  let tab, page;
  if (external) {
    page = await external.context.newPage(); await page.goto(fixture.url + '/geometry');
    tab = (await manager.dispatch('test', 'listTabs', [{ browser: external.browser.id }])).find(tab => tab.url.endsWith('/geometry'));
    tab = await manager.dispatch('test', 'getTab', [tab.id, { browser: tab.browserId }]);
  } else tab = await manager.dispatch('test', 'createBrowserTab', ['browser', fixture.url + '/geometry']);
  const browser = manager.browserForTab(tab.id, tab.browserId), record = await browser.target('test', tab.id);
  page ??= (await browser.target('fixture-observer', tab.id, { claim: false })).page;
  const driver = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const bound = await manager.execute('test', `const tab=await cua.getTab(${JSON.stringify(tab.id)},{browser:${JSON.stringify(tab.browserId)}});`);
  assert.equal(bound.error, undefined);
  return { manager, browser, tab, record, page, driver, external };
}

async function pixels(data) {
  return sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function centroid(image, color, half) {
  let x = 0, y = 0, count = 0;
  for (let p = 0; p < image.data.length; p += 4) {
    const px = (p / 4) % image.info.width;
    if (half !== undefined && (px < image.info.width / 2) !== half) continue;
    const [r, g, b] = image.data.subarray(p, p + 3);
    if (color === 'red' ? r > 150 && g < 100 && b < 120 : b > 150 && r < 100 && g > 50 && g < 160) {
      x += px; y += Math.floor((p / 4) / image.info.width); count++;
    }
  }
  assert.ok(count > 30, `the ${color} target must be present in the screenshot`);
  return [x / count, y / count];
}
async function modelImage(s) {
  const result = await s.manager.execute('test', 'await tab.getScreenshot();'); assert.equal(result.error, undefined);
  const block = result.blocks.find(b => b.type === 'image'); assert.ok(block.capture.geometry);
  const source = Buffer.from(block.data, 'base64');
  const preview = await sharp(source).resize({ width: Math.round(block.capture.width / 2) }).png().toBuffer();
  const metadata = await sharp(preview).metadata(), coordinates = new ImageCoordinates();
  const ref = { attachmentId: 'fixture' };
  coordinates.remember('test', block.capture, ref);
  const attachments = { async readImageRequest() { return metadata; } }, dispose = coordinates.watch(attachments);
  try { for await (const _ of coordinates.stream('test', async function* () { yield await attachments.readImageRequest(ref); })) {} } finally { dispose(); }
  return { image: await pixels(preview), frames: coordinates.frames('test') };
}

for (const backend of ['managed', 'extension']) {
  test(backend + ' screenshot points survive pinch zoom and pan through the model-preview mapping', { timeout: 45000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
    const s = await setup(t, backend);
    for (const pan of [false, true]) {
      await s.page.reload();
      await s.driver.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await s.driver.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      if (pan) await s.driver.send('Input.synthesizeScrollGesture', { x: 300, y: 180, xDistance: -80, yDistance: 0, gestureSourceType: 'touch', speed: 800 });
      const before = await s.driver.send('Page.getLayoutMetrics');
      if (pan) assert.ok(before.cssVisualViewport.pageX > 20, 'the second case must really pan the viewport');
      const { image, frames } = await modelImage(s);
      assert.deepEqual((await s.driver.send('Page.getLayoutMetrics')).cssVisualViewport, before.cssVisualViewport, 'capturing must preserve pinch and pan');
      const red = centroid(image, 'red');
      const clicked = await s.manager.execute('test', `await tab.click(${JSON.stringify(red)});`, { coordinateFrames: frames });
      assert.equal(clicked.error, undefined, JSON.stringify(clicked.error));
      assert.equal(await s.page.evaluate(() => geometryFixture.redHit), true, 'the actual pointer must hit the visible red circle');
      const next = await modelImage(s), from = centroid(next.image, 'blue', true), to = centroid(next.image, 'blue', false);
      const dragged = await s.manager.execute('test', `await tab.drag(${JSON.stringify(from)},${JSON.stringify(to)});`, { coordinateFrames: next.frames });
      assert.equal(dragged.error, undefined, JSON.stringify(dragged.error));
      assert.equal(await s.page.evaluate(() => geometryFixture.dragComplete), true, 'the actual pointer sequence must complete the drag');
      assert.deepEqual(await s.page.evaluate(() => geometryFixture.events.map(event => event.type)), ['red-hit', 'drag-start', 'drag-complete']);
    }
  });

  test(backend + ' rejects an old model screenshot after resize, scroll, navigation or reconnect', { timeout: 45000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
    const s = await setup(t, backend);
    for (const change of ['resize', 'scroll', 'navigation', 'reconnect']) {
      await s.page.reload(); await s.page.setViewportSize({ width: 1280, height: 720 });
      const { image, frames } = await modelImage(s), red = centroid(image, 'red');
      if (change === 'resize') await s.page.setViewportSize({ width: 900, height: 600 });
      if (change === 'scroll') await s.page.evaluate(() => scrollTo(0, 100));
      if (change === 'navigation') await s.page.reload();
      if (change === 'reconnect') await s.browser.disconnect('test');
      const count = await s.page.evaluate(() => geometryFixture.clicks.length);
      const rejected = await s.manager.execute('test', `await tab.getScreenshot({emit:false}); await tab.click(${JSON.stringify(red)});`, { coordinateFrames: frames });
      assert.match(rejected.error?.message ?? '', /screenshot geometry has changed/, change);
      assert.equal(await s.page.evaluate(() => geometryFixture.clicks.length), count, 'a quiet new capture cannot make coordinates from the old model image valid');
      const fresh = await modelImage(s);
      const result = await s.manager.execute('test', `await tab.click(${JSON.stringify(centroid(fresh.image, 'red'))});`, { coordinateFrames: fresh.frames });
      assert.equal(result.error, undefined); assert.equal(await s.page.evaluate(() => geometryFixture.redHit), true);
    }
  });

  test(backend + ' manual preview pixels hit the displayed control after pinch and pan', { timeout: 30000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
    const s = await setup(t, backend); let frame;
    const close = await s.manager.watchBrowser('test', s.tab.id, (type, value) => { if (type === 'frame') frame = value; });
    const metadata = new Map();
    s.manager.viewsFor(s.tab).views.get(s.tab.id).cdp.on('Page.screencastFrame', event => metadata.set(event.data, event.metadata));
    try {
      for (const zoom of backend === 'extension' ? [1, 1.5] : [1]) for (const pan of [false, true]) {
        await s.driver.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await s.page.evaluate(() => scrollTo(0, 0));
        if (s.external) {
          const worker = s.external.context.serviceWorkers().find(worker => worker.url() === s.external.origin + 'worker.js');
          await worker.evaluate(({ id, zoom }) => chrome.tabs.setZoom(id, zoom), { id: s.tab.nativeTabId, zoom });
        }
        await s.page.reload();
        await s.driver.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
        await s.driver.send('Emulation.setTouchEmulationEnabled', { enabled: true });
        if (pan) await s.driver.send('Input.synthesizeScrollGesture', { x: 300, y: 180, xDistance: -80, yDistance: 0, gestureSourceType: 'touch', speed: 800 });
        const { cssVisualViewport: viewport } = await s.driver.send('Page.getLayoutMetrics');
        assert.equal(viewport.scale, 2, 'the fixture must actually retain two-times pinch zoom');
        assert.equal(viewport.zoom, zoom);
        if (pan) assert.ok(viewport.pageX > 20, 'the fixture must actually pan the zoomed viewport');
        const end = Date.now() + 5000;
        while (Date.now() < end && (!frame || frame.geometry.width !== viewport.clientWidth || Math.abs(frame.scrollX - viewport.pageX) > 1)) await new Promise(resolve => setTimeout(resolve, 20));
        assert.ok(frame); assert.equal(frame.geometry.width, viewport.clientWidth, JSON.stringify({ viewport, recentMetadata: [...metadata.values()].slice(-3) })); assert.ok(Math.abs(frame.scrollX - viewport.pageX) <= 1);
        const selected = frame, picture = await pixels(Buffer.from(selected.data, 'base64')), red = centroid(picture, 'red');
        t.diagnostic(JSON.stringify({ zoom, pan, metadata: metadata.get(selected.data), viewport, image: { width: picture.info.width, height: picture.info.height }, frame: { width: selected.width, height: selected.height }, red }));
        const input = { tabId: s.tab.id, actor: selected.actor, frameId: selected.id, controlEpoch: s.manager.status('test').controlEpoch, x: red[0] / picture.info.width, y: red[1] / picture.info.height };
        await s.manager.manualInput('test', { ...input, type: 'pointerdown' });
        await s.manager.manualInput('test', { ...input, type: 'pointerup', controlEpoch: s.manager.status('test').controlEpoch });
        assert.equal(await s.page.evaluate(() => geometryFixture.redHit), true, JSON.stringify({ pan, image: picture.info, frame: { width: frame.width, height: frame.height }, clicks: await s.page.evaluate(() => geometryFixture.clicks) }));
        const hit = await s.page.evaluate(() => geometryFixture.clicks.at(-1));
        assert.ok(Math.abs(hit.x - 260) < 1.5 && Math.abs(hit.y - 150) < 1.5, JSON.stringify(hit));
        await s.manager.resume('test');
      }
    } finally { await close(); }
  });
}

test('a queued JPEG from before browser zoom cannot acquire the new preview geometry', { timeout: 30000, skip: process.platform === 'win32' }, async t => {
  const s = await setup(t, 'extension');
  await s.driver.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  let actor;
  const close = await s.manager.watchBrowser('test', s.tab.id, (type, value) => { if (type === 'ready') actor = value.actor; });
  const views = s.manager.viewsFor(s.tab), view = views.views.get(s.tab.id);
  let oldEvent;
  view.cdp.on('Page.screencastFrame', event => { oldEvent = event; });
  try {
    await s.page.evaluate(() => { document.body.style.backgroundColor = '#f3f5fa'; });
    const end = Date.now() + 5000;
    while (Date.now() < end && (!oldEvent || oldEvent.metadata.timestamp < (view.screencastAfter ?? 0))) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(oldEvent); assert.equal(oldEvent.metadata.pageScaleFactor, 2);
    await view.cdp.send('Page.stopScreencast'); await view.flushing;
    const worker = s.external.context.serviceWorkers().find(worker => worker.url() === s.external.origin + 'worker.js');
    await worker.evaluate(id => chrome.tabs.setZoom(id, 1.5), s.tab.nativeTabId);
    const viewport = (await s.driver.send('Page.getLayoutMetrics')).cssVisualViewport;
    assert.equal(viewport.zoom, 1.5); assert.equal(viewport.scale, 2); assert.equal(viewport.pageX, 0);
    view.pending = { event: oldEvent, loaderId: view.loaderId }; await views.flush(view);
    const frame = view.latest;
    assert.equal(frame.geometry.zoom, 1.5); assert.equal(frame.mediaType, 'image/png', 'the stale JPEG must be replaced by a current geometry-checked screenshot');
    const picture = await pixels(Buffer.from(frame.data, 'base64')), red = centroid(picture, 'red');
    const input = { tabId: s.tab.id, actor, frameId: frame.id, controlEpoch: s.manager.status('test').controlEpoch, x: red[0] / picture.info.width, y: red[1] / picture.info.height };
    await s.manager.manualInput('test', { ...input, type: 'pointerdown' });
    await s.manager.manualInput('test', { ...input, type: 'pointerup', controlEpoch: s.manager.status('test').controlEpoch });
    const hit = await s.page.evaluate(() => geometryFixture.clicks.at(-1));
    assert.ok(Math.abs(hit.x - 260) < 1.5 && Math.abs(hit.y - 150) < 1.5, JSON.stringify(hit));
  } finally { await close(); }
});
