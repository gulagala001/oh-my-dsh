import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { setTimeout as delay } from 'node:timers/promises';

async function managerFor(t) {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-manager-'));
  const manager = new ComputerUseManager(directory, { native: { binary: join(directory, 'not-installed') } });
  t.after(async () => { await manager.close(); await rm(directory, { recursive: true, force: true }); });
  return manager;
}

function executionReady(manager) {
  const runtime = manager.session('test').runtime, dispatch = runtime.dispatch;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  runtime.dispatch = (...args) => { entered(); return dispatch(...args); };
  return ready;
}

test('disable stops active execution and prevents late model operations', async t => {
  const manager = await managerFor(t);
  const ready = executionReady(manager);
  const pending = manager.execute('test', "await cua.listApps(); await new Promise(r=>setTimeout(r,1000)); await cua.getState();");
  await ready;
  await manager.setEnabled(false);
  assert.match((await pending).error.message, /disabled in settings/);
  assert.equal(manager.status('test').enabled, false);
  await assert.rejects(manager.dispatch('test', 'listApps'), /disabled/);
  await assert.rejects(manager.execute('test', 'nodeRepl.write(1)'), /disabled/);
  await manager.setEnabled(true);
  assert.equal((await manager.execute('test', 'nodeRepl.write(42)')).blocks[0].text, '42');
});

test('a failed native stop is visible and cannot be resumed as if cleanup succeeded', async t => {
  const manager = await managerFor(t), original = manager.native.release.bind(manager.native);
  let fail = true;
  manager.native.release = async id => { if (fail) throw new Error('native stop acknowledgement lost'); return original(id); };
  t.after(() => { fail = false; });
  const ready = executionReady(manager);
  const pending = manager.execute('test', 'await cua.listApps(); await new Promise(r=>setTimeout(r,1000));');
  await ready;
  await assert.rejects(manager.stop('test'), /acknowledgement lost/);
  assert.match((await pending).error.message, /acknowledgement lost/);
  assert.equal(manager.status('test').status, 'error');
  assert.match(manager.status('test').lastError.message, /acknowledgement lost/);
  await assert.rejects(manager.resume('test'), /not been confirmed/);
  fail = false;
  await manager.stop('test');await manager.resume('test');
  assert.equal((await manager.execute('test', 'nodeRepl.write(42)')).blocks[0].text, '42');
});

test('native runtime removal closes native previews and bindings without changing browser targets', async t => {
  const manager = await managerFor(t), state = manager.session('native-removal'), browser = manager.session('browser-kept');
  state.target = { kind: 'app', id: 'native-app', name: 'Fixture' }; state.nativeTarget = state.target;
  state.previewTargets.set('native-preview', { target: state.target });
  browser.target = { kind: 'tab', id: 'kept-tab', title: 'Kept page' };
  const kept = structuredClone(browser.target), events = [];
  manager.native.targets.set('native-app', { id: 'native-app', sessionId: state.id });
  manager.nativeViews.views.set('native-preview', { id: 'native-preview', sessionId: 'native-preview-removal', closed: false, controller: new AbortController(), listeners: new Set([(event, value) => events.push({ event, ...value })]) });
  manager.native.uninstall = async ({ beforeRemove }) => {
    await beforeRemove();
    assert.equal(manager.nativeViews.views.size, 0);
    assert.equal(state.target, null); assert.equal(state.nativeTarget, null);
    assert.equal(state.previewTargets.size, 0);
    return { removed: true };
  };
  assert.equal((await manager.removeNative()).removed, true);
  assert.ok(events.some(event => event.event === 'closed' && event.reason === 'runtime-remove'));
  assert.deepEqual(browser.target, kept);
});

test('JavaScript callbacks and arguments cross the worker/browser boundary intact', async t => {
  const manager = await managerFor(t), fixture = await startFixture();
  t.after(() => fixture.close());
  const result = await manager.execute('test', `const tab=await cua.createBrowserTab('browser',${JSON.stringify(fixture.url)}); nodeRepl.write(await tab.playwright.evaluate(suffix=>document.title+suffix,' + callback')); nodeRepl.write(await tab.playwright.getByLabel('姓名').evaluate((element,value)=>element.tagName+value,' + argument')); nodeRepl.write(JSON.stringify(await tab.playwright.getByRole('heading').allInnerTexts()));`);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  assert.ok(result.blocks.some(b => b.text?.includes(' + callback')));
  assert.ok(result.blocks.some(b => b.text === 'INPUT + argument'));
  assert.deepEqual(JSON.parse(result.blocks.at(-1).text), ['Computer Use 测试工作台']);
});

test('pane identity follows model navigation and page title changes without opening a preview', async t => {
  const manager = await managerFor(t), fixture = await startFixture();
  t.after(() => fixture.close());
  const created = await manager.execute('test', `const tab=await cua.createBrowserTab('browser',${JSON.stringify(fixture.url)});`);
  assert.equal(created.error, undefined);
  const original = manager.status('test').target;
  assert.equal(original.url, fixture.url + '/');
  assert.equal(original.title, 'Computer Use · 测试工作台');
  const moved = await manager.execute('test', `await tab.goto(${JSON.stringify(fixture.url + '/second')}); await tab.getAXState();`);
  assert.equal(moved.error, undefined);
  assert.equal(manager.status('test').target.url, fixture.url + '/second');
  const record = await manager.browser.target('test', original.id);
  await record.page.evaluate(() => { document.title = '网页自己更新的标题'; history.pushState({}, '', '/same-document'); });
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && manager.status('test').target.title !== '网页自己更新的标题') await delay(20);
  assert.equal(manager.status('test').target.title, '网页自己更新的标题');
  assert.equal(manager.status('test').target.url, fixture.url + '/same-document');
  const readAgain = await manager.execute('test', 'await tab.getAXState();');
  assert.equal(readAgain.error, undefined);
  assert.equal(manager.status('test').target.title, '网页自己更新的标题', 'the persistent worker target must not roll the pane back');
  await assert.rejects(manager.dispatch('other', 'getTab', [original.id, { expected: original }]), /referenced tab changed/);
});

test('observation retries navigation during AX and screenshot capture without publishing a mixed baseline', async t => {
  const manager = await managerFor(t), fixture = await startFixture();
  t.after(() => fixture.close());
  const tab = await manager.dispatch('test', 'createBrowserTab', ['browser', fixture.url]);
  const record = await manager.browser.target('test', tab.id);
  const call = operation => manager.dispatch('test', 'target', [tab, operation]);
  await call('getAXState');
  const bindings = manager.browser.frameBindings.bind(manager.browser); let navigated = false;
  manager.browser.frameBindings = async current => {
    const result = await bindings(current);
    if (!navigated) { navigated = true; await record.page.goto(fixture.url + '/second', { waitUntil: 'load' }); }
    return result;
  };
  const state = await call('getAXState');
  assert.ok(navigated); assert.ok(state.state.includes('URL: ' + fixture.url + '/second'));
  assert.match(state.state, /textbox "姓名"/);
  manager.browser.frameBindings = bindings;
  const screenshot = manager.browser.capture.bind(manager.browser); let captures = 0;
  manager.browser.capture = async (...args) => {
    if (++captures === 1) await record.page.goto(fixture.url + '/frame', { waitUntil: 'load' });
    return screenshot(...args);
  };
  const observed = await call('getAXStateAndScreenshot');
  assert.ok(captures >= 2, 'a screenshot taken after navigation is discarded and captured with a fresh AX tree');
  assert.ok(observed.state.includes('URL: ' + fixture.url + '/frame'));
  assert.match(observed.state, /textbox "框架输入"/);
  assert.doesNotMatch(observed.state, /textbox "姓名"/);
  assert.equal(Buffer.from(observed.screenshot, 'base64').readUInt32BE(0), 0x89504e47);
  assert.match((await call('getAXState')).state, /No accessibility changes/);
});

test('regular expressions, nested locators and file bytes retain their types across the runtime', async t => {
  const manager = await managerFor(t), fixture = await startFixture();
  t.after(() => fixture.close());
  const result = await manager.execute('test', `
    const tab = await cua.createBrowserTab('browser', ${JSON.stringify(fixture.url)});
    const form = tab.playwright.locator('section').filter({has: tab.playwright.getByRole('button', {name: /^保存$/})});
    await form.getByLabel(/^姓名$/).fill('嵌套定位 🧭');
    await form.getByRole('button', {name: /^保存$/}).click();
    nodeRepl.write(await form.locator('output').innerText());
    nodeRepl.write(await tab.playwright.locator('section', {hasNot: tab.playwright.getByRole('button', {name: /^(?:保存|底部按钮)$/})}).count());
    await tab.playwright.waitForURL(/127\\.0\\.0\\.1/);
    await tab.playwright.getByLabel('上传测试文件').setInputFiles({name:'typed-bytes.txt',mimeType:'text/plain',buffer:Buffer.from('中文 🧭')});
    nodeRepl.write(await tab.playwright.getByLabel('上传测试文件').evaluate(async element => await element.files[0].text()));
  `);
  assert.equal(result.error, undefined, JSON.stringify(result.error));
  const saved = result.blocks.find(block => block.text?.startsWith('{"type":"save"'));
  assert.equal(JSON.parse(saved.text).value.name, '嵌套定位 🧭');
  assert.equal(result.blocks.at(-2).text, '4');
  assert.equal(result.blocks.at(-1).text, '中文 🧭');
  const differentTab = await manager.execute('test', `const other=await cua.createBrowserTab('browser',${JSON.stringify(fixture.url + '/frame')}); await form.filter({has:other.playwright.getByRole('button')}).count();`);
  assert.match(differentTab.error.message, /Nested locators must belong to the same browser tab/);
  const original = await manager.execute('test', "nodeRepl.write(await form.getByLabel('姓名').inputValue());");
  assert.equal(original.error, undefined);
  assert.equal(original.blocks.at(-1).text, '嵌套定位 🧭');
});

test('a late screenshot from another target cannot overwrite the selected pane', { timeout: 15000 }, async t => {
  const manager = await managerFor(t), fixture = await startFixture(); t.after(()=>fixture.close());
  const first = await manager.dispatch('test','createBrowserTab',['browser',fixture.url]);
  const second = await manager.dispatch('test','createBrowserTab',['browser',fixture.url+'/frame']);
  const screenshot = manager.browser.capture.bind(manager.browser);
  let release, entered; const ready = new Promise(resolve=>{entered=resolve;}), finish = new Promise(resolve=>{release=resolve;});
  t.after(()=>release());
  manager.browser.capture = async (...args)=>{const image=await screenshot(...args);if(args[0].id===first.id){entered();await finish;}return image;};
  const slow = manager.dispatch('test','target',[first,'getScreenshot']);
  await ready;
  const current = await manager.dispatch('test','target',[second,'getScreenshot']);
  assert.equal(manager.status('test').target.id,second.id);
  assert.equal(manager.preview.get('test').data,current.screenshot);
  release(); const old = await slow; assert.notEqual(old.screenshot,current.screenshot);
  assert.equal(manager.status('test').target.id,second.id);
  assert.equal(manager.preview.get('test').target.id,second.id,'the pane image must describe its currently selected target');
  assert.equal(manager.preview.get('test').data,current.screenshot);
});
