import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(20); }
  throw new Error('Timed out waiting for browser observation');
}

// CDP layout dimensions exclude classic scrollbar gutters; innerWidth does not.
const viewportSize = page => page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, windowWidth: innerWidth, windowHeight: innerHeight }));

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-view-'));
  const manager = new ComputerUseManager(directory, { native: { binary: join(directory, 'absent') } });
  const fixture = await startFixture();
  t.after(async () => { await manager.close(); await fixture.close(); await rm(directory, { recursive: true, force: true }); });
  const tab = await manager.dispatch('test', 'createBrowserTab', ['browser', fixture.url]);
  let frame, actor, epoch = 0, dialog, navigation;
  const controller = new AbortController();
  const close = await manager.watchBrowser('test', tab.id, (event, value) => {
    if (event === 'ready') actor = value.actor;
    if (event === 'frame') { frame = value; epoch = value.controlEpoch; }
    if (event === 'control') epoch = value.controlEpoch;
    if (event === 'dialog') dialog = value;
    if (event === 'navigation') navigation = value;
  }, controller.signal);
  await until(() => frame);
  const page = manager.browserViews.views.get(tab.id).record.page;
  const input = value => manager.manualInput('test', { actor, tabId: tab.id, frameId: frame.id, controlEpoch: epoch, dialogId: dialog?.id, ...value });
  const position = async locator => {
    await locator.scrollIntoViewIfNeeded();
    await until(async () => Math.abs((await page.evaluate(() => scrollY)) - frame.scrollY) <= 1);
    const rect = await locator.boundingBox(); assert.ok(rect);
    return { x: (rect.x + rect.width / 2) / frame.width, y: (rect.y + rect.height / 2) / frame.height };
  };
  const click = async locator => { await input({ type: 'pointerdown', ...await position(locator) }); await input({ type: 'pointerup' }); };
  return { manager, fixture, tab, page, input, position, click, close, controller, frame: () => frame, dialog: () => dialog, navigation: () => navigation, actor: () => actor, epoch: () => epoch };
}

test('live browser: real frames, takeover, Unicode typing, dialogs and observer lifetime', { timeout: 30000 }, async t => {
  const s = await setup(t);
  const bytes = Buffer.from(s.frame().data, 'base64');
  assert.equal(bytes.subarray(0, 2).toString('hex'), s.frame().mediaType === 'image/png' ? '8950' : 'ffd8');
  assert.ok(bytes.length > 10000); assert.ok(s.frame().width > 600);
  const model = s.manager.execute('test', 'await new Promise(r=>setTimeout(r,5000)); nodeRepl.write("late");');
  await s.click(s.page.getByLabel('姓名', { exact: true }));
  assert.match((await model).error.message, /Stopped by user/);
  await s.input({ type: 'text', text: '接管输入 中文 🧭' });
  await s.click(s.page.getByRole('button', { name: '保存', exact: true }));
  assert.equal(await s.page.locator('#name').inputValue(), '接管输入 中文 🧭');
  assert.equal((await s.page.evaluate(() => fixtureEvents.at(-1))).value.name, '接管输入 中文 🧭');
  assert.equal(s.manager.status('test').status, 'stopped');
  await s.manager.endTurn('test');
  await assert.rejects(s.manager.browser.target('other', s.tab.id), /another conversation/, 'a turn ending cannot give away a tab while its user is operating');
  // Dialog opens on mouseUp. CDP can still answer without executing page JS.
  await s.click(s.page.getByRole('button', { name: '打开对话框', exact: true }));
  await until(() => s.dialog());
  await s.input({ type: 'dialog', accept: true, text: '接管对话框' });
  assert.equal((await s.page.evaluate(() => fixtureEvents.at(-1))).value, '接管对话框');
  await s.close(); await delay(40);
  assert.equal(s.manager.browser.owners.get(s.tab.id)?.sessionId, 'test', 'closing an observer cannot release another connection’s ownership');
  assert.ok((await s.manager.browser.list('test')).some(t => t.id === s.tab.id), 'closing the pane preserves the page');
  await s.manager.endTurn('test');
  assert.ok((await s.manager.browser.list('test')).some(t => t.id === s.tab.id), 'a user-taken page survives turn cleanup');
});

test('live browser: stale documents, expired releases and queued input after resume', { timeout: 30000 }, async t => {
  const s = await setup(t);
  await s.page.evaluate(() => { window.buttonsHeld = false; addEventListener('mousedown', () => buttonsHeld = true); addEventListener('mouseup', () => buttonsHeld = false); });
  await s.input({ type: 'pointerdown', ...await s.position(s.page.getByLabel('姓名', { exact: true })) });
  assert.equal(await s.page.evaluate(() => buttonsHeld), true);
  await s.input({ type: 'pointerup', frameId: 'expired' });
  assert.equal(await s.page.evaluate(() => buttonsHeld), false, 'release does not depend on a retained image');
  const oldFrame = s.frame();
  await s.page.reload();
  await until(() => s.frame().loaderId !== oldFrame.loaderId);
  await assert.rejects(s.input({ type: 'pointerdown', x: 0.5, y: 0.5, frameId: oldFrame.id }), /页面已经跳转/);
  await s.click(s.page.getByLabel('姓名', { exact: true }));
  await s.input({ type: 'keydown', key: 'Shift' });
  const epoch = s.epoch();
  const resume = s.manager.resume('test');
  await assert.rejects(s.input({ type: 'text', text: 'must not type', controlEpoch: epoch }), /控制权已经改变/);
  await resume;
  assert.equal(await s.page.locator('#name').inputValue(), '');
  const record = await s.manager.browser.target('test', s.tab.id);
  assert.equal(record.heldKeys.size, 0);
  assert.equal(s.manager.status('test').status, 'idle');
});

test('live browser: closing a stream releases an actual held mouse button', { timeout: 30000 }, async t => {
  const s = await setup(t);
  await s.page.evaluate(() => { window.buttonsHeld = false; addEventListener('mousedown', () => buttonsHeld = true); addEventListener('mouseup', () => buttonsHeld = false); });
  await s.input({ type: 'pointerdown', ...await s.position(s.page.getByLabel('姓名', { exact: true })) });
  assert.equal(await s.page.evaluate(() => buttonsHeld), true);
  s.controller.abort();
  await s.close();
  const record = await s.manager.browser.target('test', s.tab.id);
  assert.equal(await record.page.evaluate(() => buttonsHeld), false);
  assert.equal(s.manager.session('test').viewers.size, 0);
});

test('live browser: a failed input release stays visible until stop succeeds', { timeout: 30000 }, async t => {
  const s = await setup(t);
  await s.page.evaluate(() => { window.buttonsHeld = false; addEventListener('mousedown', () => buttonsHeld = true); addEventListener('mouseup', () => buttonsHeld = false); });
  await s.input({ type: 'pointerdown', ...await s.position(s.page.getByLabel('姓名', { exact: true })) });
  const release = s.manager.browser.releaseInput.bind(s.manager.browser);
  s.manager.browser.releaseInput = async record => { if (record.heldButtons.size) throw new Error('release acknowledgement lost'); return release(record); };
  t.after(() => { s.manager.browser.releaseInput = release; });
  await assert.rejects(s.close(), /acknowledgement lost/);
  assert.equal(s.manager.status('test').status, 'error');
  await assert.rejects(s.manager.resume('test'), /not been confirmed/);
  s.manager.browser.releaseInput = release;
  await s.manager.stop('test');
  const record = await s.manager.browser.target('test', s.tab.id);
  assert.equal(await record.page.evaluate(() => buttonsHeld), false);
  await s.manager.resume('test');
  assert.equal(s.manager.status('test').status, 'idle');
});

test('navigation cancels a pending resize screenshot without disconnecting the preview', { timeout: 20000 }, async t => {
  const s = await setup(t), browser = s.manager.browser, original = browser.observeScreenshot.bind(browser);
  await s.page.addStyleTag({content:'html{overflow:scroll}::-webkit-scrollbar{width:15px;height:15px}'});
  const baseline=await until(async()=>{
    const size=await viewportSize(s.page),view=s.manager.browserViews.views.get(s.tab.id);
    return !view.flushing&&!view.pending&&s.frame().geometry.layoutWidth===size.width&&s.frame().geometry.layoutHeight===size.height?size:null;
  });
  let stage = 'resize',afterResize;
  const debug = setTimeout(() => { const view = s.manager.browserViews.views.get(s.tab.id); console.log('Pending preview diagnostic', { stage, baseline, requested:{width,height}, afterResize, first, pending: !!view?.pending, flushing: !!view?.flushing, cancelled, latest: view?.latest?.geometry }); }, 2000); debug.unref();
  t.after(() => clearTimeout(debug));
  let entered, cancelled = false, first = true;
  const ready = new Promise(resolve => { entered = resolve; });
  const width = baseline.windowWidth + 200, height = baseline.windowHeight + 80;
  browser.observeScreenshot = (record, options, signal) => {
    if (!first) return original(record, options, signal); first = false;
    entered();
    return new Promise((_, reject) => {
      const abort = () => { cancelled = true; reject(signal.reason); };
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
  };
  t.after(() => { browser.observeScreenshot = original; });
  await s.page.setViewportSize({ width, height });
  afterResize=await viewportSize(s.page);
  assert.equal(afterResize.windowWidth,width);assert.equal(afterResize.windowHeight,height);
  stage = 'waiting for screenshot';
  await ready;
  stage = 'navigating';
  const old = s.frame();
  await s.page.goto(s.fixture.url + '/second');
  stage = 'waiting for new frame';
  await until(async () => s.frame().loaderId !== old.loaderId && s.frame().geometry.layoutWidth === (await viewportSize(s.page)).width);
  assert.equal(cancelled, true, 'the old document must abort its outstanding capture');
  assert.equal(s.manager.browserViews.views.get(s.tab.id).closed, false);
  await s.click(s.page.getByLabel('姓名', { exact: true }));
  await s.input({ type: 'text', text: '新页面继续操作' });
  assert.equal(await s.page.getByLabel('姓名').inputValue(), '新页面继续操作');
});

test('browser navigation follows history, revokes old input and reports current addresses', { timeout: 30000 }, async t => {
  const s = await setup(t);
  const navigate = value => s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: s.manager.status('test').controlEpoch, ...value });
  await navigate({ url: s.fixture.url + '/second' });
  await until(() => s.navigation()?.url.endsWith('/second'));
  assert.equal(s.navigation().canGoBack, true);
  assert.equal(s.manager.status('test').target.url, s.fixture.url + '/second');
  await navigate({ action: 'back' });
  await until(() => s.navigation()?.url === s.fixture.url + '/');
  assert.equal(s.navigation().canGoForward, true);
  await navigate({ action: 'forward' });
  await until(() => s.navigation()?.url.endsWith('/second'));
  const old = s.frame(); await navigate({ action: 'reload' });
  await until(() => s.frame().loaderId !== old.loaderId);
  await assert.rejects(s.input({ type: 'text', text: 'old command', controlEpoch: old.controlEpoch }), /控制权已经改变/);
});

test('a real viewport resize refreshes the preview even without a new screencast image', {timeout:15000},async t=>{
  const s=await setup(t),views=s.manager.browserViews,view=views.views.get(s.tab.id),queue=views.queueFrame;
  await s.page.addStyleTag({content:'html{overflow:scroll}::-webkit-scrollbar{width:15px;height:15px}'});
  const baseline=await until(async()=>{const size=await viewportSize(s.page);return !view.flushing&&!view.pending&&s.frame().geometry.layoutWidth===size.width?size:null;});
  // Keep the real CDP resize event and screenshot path. Only suppress JPEG
  // deliveries, as can happen when the visible compositor surface is unchanged.
  views.queueFrame=function(target,pending){if(!pending.event)return queue.call(this,target,pending);};
  t.after(()=>{views.queueFrame=queue;});
  const width=baseline.windowWidth+150,height=baseline.windowHeight+70;
  await s.page.setViewportSize({width,height});
  const current=await viewportSize(s.page);assert.equal(current.windowWidth,width);assert.equal(current.windowHeight,height);
  await until(()=>s.frame().geometry.layoutWidth===current.width&&s.frame().geometry.layoutHeight===current.height);
  assert.equal(s.frame().mediaType,'image/png');assert.equal(view.closed,false);
  views.queueFrame=queue;
  await s.click(s.page.getByLabel('姓名',{exact:true}));await s.input({type:'text',text:'尺寸改变后仍能接管'});
  assert.equal(await s.page.getByLabel('姓名').inputValue(),'尺寸改变后仍能接管');
});

test('new address submissions supersede a pending load and explicit Stop wins over queued replacements', { timeout: 15000 }, async t => {
  const s = await setup(t), manager = s.manager;
  const start = manager.status('test');
  const request = (sequence, url, state = start) => ({ action: 'goto', tabId: s.tab.id, url, controlEpoch: state.controlEpoch, navigationRevision: state.navigationRevision, navigationClient: 'navigation-test', navigationSequence: sequence });
  const first = manager.navigate('test', request(1, s.fixture.url + '/slow-navigation?replace'));
  const firstRejected = assert.rejects(first, /closed|cancel|取消|aborted/i);
  await until(() => s.fixture.navigationRequests[0]?.state === 'started');
  const intermediate = manager.navigate('test', request(2, s.fixture.url + '/superseded-before-start'));
  const intermediateRejected = assert.rejects(intermediate, /取消/);
  await manager.navigate('test', request(3, s.fixture.url + '/replacement'));
  await Promise.all([firstRejected, intermediateRejected]);
  assert.equal(s.page.url(), s.fixture.url + '/replacement');
  assert.equal(s.fixture.navigationRequests[0].state, 'cancelled');
  await assert.rejects(manager.navigate('test', request(1, s.fixture.url + '/older')), /取消/);
  const state = manager.status('test');
  const loading = manager.navigate('test', request(4, s.fixture.url + '/slow-navigation?replace', state));
  const loadingRejected = assert.rejects(loading, /closed|cancel|取消|aborted/i);
  await until(() => s.fixture.navigationRequests[1]?.state === 'started');
  const replacing = manager.navigate('test', request(5, s.fixture.url + '/must-not-open', state));
  const replacingRejected = assert.rejects(replacing, /取消/);
  await manager.stop('test');
  await Promise.all([loadingRejected, replacingRejected]);
  assert.equal(s.page.url(), s.fixture.url + '/replacement');
  assert.equal(manager.status('test').status, 'stopped');
  await manager.navigate('test', request(6, s.fixture.url + '/after-stop', manager.status('test')));
  assert.equal(s.page.url(), s.fixture.url + '/after-stop');
});

test('stopping a pending address-bar navigation prevents a later commit', { timeout: 30000 }, async t => {
  const s = await setup(t);
  const requested = s.page.waitForRequest(s.fixture.url + '/slow-navigation');
  const navigate = s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: 0, url: s.fixture.url + '/slow-navigation' });
  const result = assert.rejects(navigate);
  await requested; const started = performance.now();
  await s.manager.stop('test'); await result;
  assert.ok(performance.now() - started < 1000);
  await delay(1600);
  assert.equal(s.page.url(), s.fixture.url + '/');
  assert.equal(s.manager.status('test').transitioning, false);
});

test('user tabs retain their pages, reject conflicting claims and clear closed targets', { timeout: 30000 }, async t => {
  const s = await setup(t);
  const change = value => s.manager.changeUserTab('test', { controlEpoch: s.manager.status('test').controlEpoch, ...value });
  await change({ action: 'new', url: s.fixture.url + '/new' });
  const created = s.manager.status('test').target;
  assert.notEqual(created.id, s.tab.id);
  await s.manager.endTurn('test');
  assert.ok((await s.manager.listUserTabs('test')).some(t => t.id === created.id));
  await change({ action: 'select', tabId: s.tab.id, expected: { url: s.fixture.url + '/', title: s.tab.title } });
  assert.equal(s.manager.status('test').target.id, s.tab.id);
  const other = await s.manager.browser.create('other', s.fixture.url);
  await assert.rejects(change({ action: 'select', tabId: other.id }), /another conversation/);
  assert.equal(s.manager.status('test').target.id, s.tab.id);
  await change({ action: 'close', tabId: s.tab.id });
  await until(() => s.manager.status('test').target?.id === created.id);
  assert.equal((await s.manager.listUserTabs('test')).some(t => t.id === s.tab.id), false);
});

test('closing an unsaved tab waits for the real beforeunload decision', { timeout: 30000 }, async t => {
  const s = await setup(t);
  await s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: 0, url: s.fixture.url + '/unsaved' });
  await until(() => s.navigation()?.url.endsWith('/unsaved'));
  await s.click(s.page.getByLabel('姓名', { exact: true }));
  const close = () => s.manager.changeUserTab('test', { action: 'close', tabId: s.tab.id, controlEpoch: s.manager.status('test').controlEpoch });
  await close(); await until(() => s.dialog()?.type === 'beforeunload');
  await s.input({ type: 'dialog', accept: false });
  assert.equal(s.page.isClosed(), false);
  assert.equal(s.manager.status('test').target.id, s.tab.id);
  await close(); await until(() => s.dialog()?.type === 'beforeunload');
  await s.input({ type: 'dialog', accept: true });
  await until(() => s.manager.status('test').target === null);
});

test('reopening a pane preserves an already-open webpage dialog', { timeout: 30000 }, async t => {
  const s = await setup(t);
  await s.manager.dispatch('test', 'target', [s.tab, 'locator', [[{ method: 'getByRole', args: ['button', { name: '打开对话框', exact: true }] }], 'click', []]]);
  await until(() => s.dialog()?.type === 'prompt');
 await s.close();
  let actor, dialog;
 const close = await s.manager.watchBrowser('test', s.tab.id, (type, value) => {
    if (type === 'ready') actor = value.actor;
    if (type === 'dialog') dialog = value;
  });
 await until(() => dialog?.type === 'prompt');
  await s.manager.manualInput('test', { actor, tabId: s.tab.id, controlEpoch: s.manager.status('test').controlEpoch, type: 'dialog', dialogId: dialog.id, accept: true, text: '重新打开后回答' });
  const record = await s.manager.browser.target('test', s.tab.id);
  assert.equal((await record.page.evaluate(() => fixtureEvents.at(-1))).value, '重新打开后回答');
  await close();
});

test('chained dialogs remain answerable during resume and a later stop wins', { timeout: 30000 }, async t => {
  const s = await setup(t);
  for (const stopAgain of [false, true]) {
    await s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: s.manager.status('test').controlEpoch, url: s.fixture.url + '/chained-dialog' });
    await s.click(s.page.getByRole('button', { name: '打开对话框', exact: true }));
    await until(() => s.dialog()?.message === 'First');
    const oldId = s.dialog().id;
    await s.input({ type: 'dialog', accept: true, text: '一' });
    await until(() => s.dialog()?.message === 'Second');
    await assert.rejects(s.input({ type: 'dialog', dialogId: oldId, accept: true, text: 'wrong' }), /对话框已经改变/);
    const resume = s.manager.resume('test');
    await until(() => s.manager.status('test').resuming);
    const stop = stopAgain ? s.manager.stop('test') : Promise.resolve();
    await s.input({ type: 'dialog', accept: true, text: '二' });
    await Promise.all([resume, stop]);
    assert.deepEqual((await s.page.evaluate(() => fixtureEvents.at(-1))).value, ['一', '二']);
    assert.equal(s.manager.status('test').status, stopAgain ? 'stopped' : 'idle');
    const record = await s.manager.browser.target('test', s.tab.id);
    assert.equal(record.heldButtons.size, 0);
  }
});

test('plugin unload terminates an owned browser with a held mouse and open dialog', { timeout: 10000 }, async t => {
  const s = await setup(t);
  await s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: 0, url: s.fixture.url + '/mousedown-dialog' });
  await s.input({ type: 'pointerdown', ...await s.position(s.page.getByRole('button', { name: '打开对话框', exact: true })) });
  await until(() => s.dialog()?.message === 'On down');
  const start = performance.now(); await s.manager.close();
  assert.ok(performance.now() - start < 3000);
  assert.ok(s.manager.browser.child.exitCode !== null || s.manager.browser.child.signalCode !== null);
});

test('disabling control still lets the user answer a dialog needed to release input', { timeout: 15000 }, async t => {
  const s = await setup(t);
  await s.manager.navigate('test', { tabId: s.tab.id, controlEpoch: 0, url: s.fixture.url + '/mousedown-dialog' });
  await s.input({ type: 'pointerdown', ...await s.position(s.page.getByRole('button', { name: '打开对话框', exact: true })) });
  await until(() => s.dialog()?.message === 'On down');
  const disabled = s.manager.setEnabled(false);
  await assert.rejects(s.manager.execute('test', 'nodeRepl.write(42)'), /disabled/);
  await s.input({ type: 'dialog', accept: true, text: '关闭控制后回答' });
  await disabled;
  assert.equal(s.manager.status('test').enabled, false);
  await s.manager.setEnabled(true); await s.manager.resume('test');
  assert.equal((await s.manager.execute('test', 'nodeRepl.write(42)')).blocks[0].text, '42');
});

test('a dropped observation reply cannot block cleanup or a fresh preview', { timeout: 15000 }, async t => {
  const s = await setup(t), view = s.manager.browserViews.views.get(s.tab.id);
  const send = view.cdp.send.bind(view.cdp);
  view.cdp.send = (method, ...args) => method === 'Page.getLayoutMetrics' ? new Promise(() => {}) : send(method, ...args);
  s.manager.browserViews.observationTimeoutMs = 100;
  await s.page.evaluate(() => { document.body.style.background = '#cde'; });
  await until(() => !s.manager.browserViews.views.has(s.tab.id));
  s.manager.browserViews.observationTimeoutMs = 5000;
  let next;
  const close = await s.manager.watchBrowser('test', s.tab.id, (type, value) => { if (type === 'frame') next = value; });
  await until(() => next);
  assert.equal(next.tabId, s.tab.id);
  await close();
});
