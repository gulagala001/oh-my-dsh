import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

async function until(fn) {
  const end = Date.now() + 8000;
  while (Date.now() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw new Error('The browser did not publish the expected pointer event');
}

for (const backend of ['managed', 'extension']) test(backend + ' assistant cursor follows real locator/drag input and clears on stop', { timeout: 35000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-cursor-')), cleanups = []; let manager, stage = 'fixture';
  const diagnostic = setTimeout(() => console.log('cursor fixture pending:', backend, stage), 10000); diagnostic.unref();
  t.after(() => clearTimeout(diagnostic));
  t.after(async () => { try { await manager?.close(); } finally { for (const close of cleanups) await close(); await rm(root, { recursive: true, force: true }); } });
  const external = backend === 'extension' ? await extensionFixture({ after: close => cleanups.push(close) }) : null;
  const fixture = external?.fixture ?? await startFixture(); if (!external) cleanups.push(() => fixture.close());
  manager = new ComputerUseManager(root, { native: { binary: join(root, 'absent') }, ...(external ? { extensionHub: external.hub } : {}) });
  stage = 'create'; const tab = await manager.dispatch('test', 'createBrowserTab', [external?.browser.id ?? 'browser', fixture.url + '/geometry']);
  const browser = manager.browserForTab(tab.id, tab.browserId);
  const record = await browser.target('test', tab.id);
  stage = 'observer'; const observer = await browser.target('observer', tab.id, { claim: false });
  stage = 'viewport';
  await observer.page.setViewportSize({ width: 1280, height: 720 });
  stage = 'event listener';
  await observer.page.evaluate(() => {
    window.cursorFixtureEvents = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) addEventListener(type, event => cursorFixtureEvents.push({ type, x: event.clientX, y: event.clientY, buttons: event.buttons }));
  });
  const events = []; let frame;
  stage = 'watch'; const close = await manager.watchBrowser('test', tab.id, (type, value) => {
    if (type === 'cursor') events.push(value);
    if (type === 'frame') frame = value;
  });
  cleanups.unshift(close); await until(() => frame);
  const run = async code => { const result = await manager.execute('test', code); assert.equal(result.error, undefined, JSON.stringify(result.error)); return result; };
  stage = 'bind'; await run(`var tab=await cua.getTab(${JSON.stringify(tab.id)},{browser:${JSON.stringify(tab.browserId)}}); await tab.markDeliverable();`);
  stage = 'observer click';
  await observer.page.mouse.click(700, 350);
  assert.equal(events.length, 0, 'the independent observer/user input must not become assistant feedback');
  const before = await browser.invoke('test', tab.id, 'getScreenshot');
  stage = 'locator click'; await run("await tab.playwright.locator('canvas').click({position:{x:700,y:350}});");
  const released = await until(() => events.findLast(event => event?.type === 'mouseReleased'));
  const truth = await observer.page.evaluate(() => cursorFixtureEvents.at(-1));
  assert.equal(released.x, truth.x); assert.equal(released.y, truth.y);
  assert.equal(released.buttons, 0); assert.ok(released.press, 'a fast press/release must retain the click pulse');
  assert.equal(released.loaderId, frame.loaderId);
  assert.deepEqual(released.geometry, frame.geometry);
  const after = await browser.invoke('test', tab.id, 'getScreenshot');
  assert.equal(after.screenshot, before.screenshot, 'the human cursor must not be painted into model screenshots');
  assert.equal(await observer.page.locator('body > *').count(), 2, 'feedback must not change fixture controls');

  // Slow only the fixture's public mouse call, so a real pressed drag can be
  // stopped deterministically while the input transport remains unmodified.
  const move = record.page.mouse.move.bind(record.page.mouse);
  record.page.mouse.move = async (...args) => { if (args[2]?.steps) { await move(args[0] - 100, args[1]); await delay(350); } return move(...args); };
  events.length = 0;
  stage = 'drag'; const dragging = manager.execute('test', 'await tab.drag([180,260],[480,260]);');
  await until(() => events.some(event => event?.buttons === 1));
  stage = 'stop'; const stop = manager.stop('test');
  assert.equal(events.at(-1), null, 'stop must clear the cursor before awaiting input cleanup');
  await stop; await dragging;
  stage = 'manual'; const last = events.length; await observer.page.mouse.click(650, 350); await delay(50);
  assert.equal(events.length, last, 'manual input after takeover must not revive the assistant cursor');
  stage = 'resume'; await manager.resume('test'); assert.equal(manager.sessions.get('test').pointer, null);

  const current = (await manager.dispatch('test', 'listTabs', [{ browser: browser.id }])).find(info => info.url.endsWith('/geometry'));
  await run(`tab=await cua.getTab(${JSON.stringify(current.id)},{browser:${JSON.stringify(browser.id)}}); await tab.playwright.locator('canvas').click({position:{x:650,y:350}});`);
  await until(() => manager.sessions.get('test').pointer);
  const delayedPointer = { ...manager.sessions.get('test').pointer, sessionId: 'test' };
  stage = 'end'; await manager.endTurn('test'); assert.equal(manager.sessions.get('test').pointer, null, 'turn completion must clear the cursor');
  manager.pointer(delayedPointer);
  assert.equal(manager.sessions.get('test').pointer, null, 'a queued observation from the completed turn must not revive its cursor');
  stage = 'done';
});
