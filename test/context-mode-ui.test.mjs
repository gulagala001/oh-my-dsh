import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createContextUI } from '../src/client/context-client.mjs';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function panelFor(props = { sessionId: 'current', visible: true }) {
  const { PipelinePanel } = createContextUI(React);
  const Component = PipelinePanel({ useTabInfo: () => ({ tab: { visible: props.visible } }) }).type;
  const panel = new Component(props);
  panel.setState = (update, callback) => {
    panel.state = { ...panel.state, ...(typeof update === 'function' ? update(panel.state) : update) };
    callback?.();
  };
  return panel;
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : React.isValidElement(node) ? textOf(node.props.children) : typeof node === 'string' ? node : '';
function modeButtons(panel) {
  const group = elements(panel.render()).find(node => node.props['aria-label'] === '本会话异步压缩模式');
  return elements(group.props.children).filter(node => node.type === 'button');
}

test('old context snapshots default to original async and mode selection keeps the existing operations', async () => {
  const panel = panelFor(); panel.state.data = { records: [] };
  const buttons = modeButtons(panel);
  assert.deepEqual(buttons.map(node => [textOf(node), node.props['aria-pressed']]), [['原版异步', true], ['主动异步', false]]);
  const calls = []; panel.run = async (path, body) => { calls.push({ path, body }); };
  await buttons[0].props.onClick();
  assert.deepEqual(calls, [], 'reselecting the current mode does not issue a mutation');
  await buttons[1].props.onClick();
  assert.deepEqual(calls, [{ path: '/context/mode', body: { mode: 'adaptive' } }]);
  const oldText = textOf(panel.render());
  assert.match(oldText, /准备摘要/); assert.match(oldText, /运行中枢/); assert.match(oldText, /中枢最近的选择/);
  panel.state.data = { records: [], compressionMode: 'adaptive', adaptive: { running: true, cacheReadTokens: 8123 } };
  assert.deepEqual(modeButtons(panel).map(node => node.props['aria-pressed']), [false, true]);
  const activeText = textOf(panel.render());
  assert.match(activeText, /检查是否整理/); assert.match(activeText, /正在判断/); assert.match(activeText, /缓存读取：8,123 tokens/);
  assert.doesNotMatch(activeText, /运行中枢|中枢最近的选择/);
  assert.match(activeText, /缓存以提供方实际返回为准/);
  panel.state.data.adaptive = { lastDecision: 'skip', reason: '当前内容仍需继续使用。', cacheReadTokens: null };
  assert.match(textOf(panel.render()), /暂不需要整理.*当前内容仍需继续使用/s);
  assert.doesNotMatch(textOf(panel.render()), /最近后台请求缓存读取/);
  const check = elements(panel.render()).find(node => node.type === 'button' && textOf(node) === '检查是否整理');
  await check.props.onClick();
  assert.deepEqual(calls.at(-1), { path: '/context/prepare', body: {} });
  assert.match(textOf(panel.render()), /应用已准备结果.*已处理片段仅摘要.*全量压缩/s);
});

test('mode mutations remain disabled while saving and recover the saved mode after failure and retry', async t => {
  const previousFetch = globalThis.fetch, calls = [], first = deferred();
  globalThis.fetch = (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return calls.length === 1 ? first.promise : Promise.resolve(Response.json({ compressionMode: 'adaptive' }));
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const panel = panelFor({ sessionId: 'mode a/1', visible: true }); panel.alive = true;
  panel.state.data = { records: [], compressionMode: 'pipeline' };
  let reads = 0; panel.load = async () => { reads++; };
  const saving = panel.changeMode('adaptive');
  assert.ok(modeButtons(panel).every(node => node.props.disabled));
  assert.deepEqual(modeButtons(panel).map(node => node.props['aria-pressed']), [true, false], 'the current selection remains until the server accepts the change');
  await panel.changeMode('pipeline');
  assert.equal(calls.length, 1);
  first.resolve(Response.json({ error: '模式暂时无法保存' }, { status: 503 })); await saving;
  assert.equal(panel.state.error, '模式暂时无法保存');
  assert.equal(panel.state.data.compressionMode, 'pipeline');
  assert.equal(panel.state.busy, false); assert.ok(modeButtons(panel).every(node => !node.props.disabled));
  await panel.state.retryAction();
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ url: 'trisoul-x/api/context/mode?session=mode%20a%2F1', body: { mode: 'adaptive' } })));
  assert.equal(panel.state.data.compressionMode, 'adaptive');
  assert.equal(panel.state.error, ''); assert.equal(panel.state.busy, false); assert.equal(reads, 1);
  assert.equal(panel.state.notice, '已切换为主动异步，本会话已保存。');
});

test('rapid session switches ignore late mode success and failure from the previous session', async t => {
  const previousFetch = globalThis.fetch, previousDocument = globalThis.document, calls = [];
  const visibility = new EventTarget(); visibility.visibilityState = 'visible'; globalThis.document = visibility;
  globalThis.fetch = (url, options) => new Promise(resolve => calls.push({ url, options, resolve }));
  const panel = panelFor({ sessionId: 'a', visible: true });
  t.after(() => { panel.componentWillUnmount(); globalThis.fetch = previousFetch; if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  panel.componentDidMount(); calls[0].resolve(Response.json({ session: 'a', records: [] })); await flush();
  const oldSuccess = panel.changeMode('adaptive');
  let previous = panel.props; panel.props = { ...previous, sessionId: 'b' }; panel.componentDidUpdate(previous);
  calls[2].resolve(Response.json({ session: 'b', records: [], compressionMode: 'adaptive' })); await flush();
  calls[1].resolve(Response.json({ compressionMode: 'adaptive' })); await oldSuccess;
  assert.equal(panel.state.data.session, 'b'); assert.equal(panel.state.data.compressionMode, 'adaptive');
  assert.equal(panel.state.notice, ''); assert.equal(panel.state.busy, false);
  const oldFailure = panel.changeMode('pipeline');
  previous = panel.props; panel.props = { ...previous, sessionId: 'a' }; panel.componentDidUpdate(previous);
  calls[4].resolve(Response.json({ session: 'a', records: [], compressionMode: 'adaptive' })); await flush();
  calls[3].resolve(Response.json({ error: '旧会话请求失败' }, { status: 503 })); await oldFailure;
  assert.equal(panel.state.data.session, 'a'); assert.equal(panel.state.data.compressionMode, 'adaptive');
  assert.equal(panel.state.error, ''); assert.equal(panel.state.retryAction, null); assert.equal(panel.state.busy, false);
  assert.equal(calls.length, 5, 'late mutations must not start reads for the newly selected session');
});

test('async mode choices save, retry and remain usable in the actual narrow workbench', { timeout: 60000 }, async t => {
  const { page, sessionId, errors } = await frontendFixture(t);
  const snapshot = await (await page.request.get(new URL('/trisoul-x/api/context?session=' + sessionId, page.url()).href)).json();
  let compressionMode, failed = true, releaseSave;
  const attempts = [];
  await page.route('**/trisoul-x/api/context?*', route => route.fulfill({ json: { ...snapshot, compressionMode, adaptive: { running: false, lastDecision: 'skip', reason: '当前对话暂不需要整理。', cacheReadTokens: 900 } } }));
  await page.route('**/trisoul-x/api/context/mode?*', async route => {
    attempts.push({ session: new URL(route.request().url()).searchParams.get('session'), body: route.request().postDataJSON() });
    if (attempts.length === 1) await new Promise(resolve => { releaseSave = resolve; });
    if (failed) return route.fulfill({ status: 503, json: { error: '本次模式保存失败，请重试' } });
    compressionMode = route.request().postDataJSON().mode;
    return route.fulfill({ json: { compressionMode } });
  });
  await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  await page.locator('.cx-navigation').getByRole('button', { name: '上下文', exact: true }).click();
  const panel = page.locator('.cx-context'), modes = panel.getByRole('group', { name: '本会话异步压缩模式', exact: true });
  const original = modes.getByRole('button', { name: '原版异步', exact: true }), adaptive = modes.getByRole('button', { name: '主动异步', exact: true });
  await modes.waitFor(); assert.equal(await original.getAttribute('aria-pressed'), 'true');
  await adaptive.click(); assert.equal(await original.isDisabled(), true); assert.equal(await adaptive.isDisabled(), true);
  await until(() => typeof releaseSave === 'function'); releaseSave(); await panel.getByRole('alert').filter({ hasText: '本次模式保存失败' }).waitFor();
  assert.equal(await original.getAttribute('aria-pressed'), 'true'); assert.equal(await adaptive.isEnabled(), true);
  failed = false; await panel.getByRole('button', { name: '重试', exact: true }).click();
  await panel.getByText('已切换为主动异步，本会话已保存。', { exact: true }).waitFor();
  assert.equal(await adaptive.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(attempts, Array.from({ length: 2 }, () => ({ session: sessionId, body: { mode: 'adaptive' } })));
  await panel.getByText('当前对话暂不需要整理。', { exact: true }).waitFor();
  await panel.locator('summary').filter({ hasText: '后台操作' }).click();
  assert.equal(await panel.getByRole('button', { name: '检查是否整理', exact: true }).count(), 1);
  assert.equal(await panel.getByRole('button', { name: '运行中枢', exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator(':scope > .cx-body').evaluate(el => { el.scrollTop = 0; });
  if (process.env.TRISOUL_UI_ARTIFACTS) await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const bounds = await modes.evaluate(el => {
      const box = el.getBoundingClientRect(), viewport = el.closest('.cx-body').getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportLeft: viewport.left, viewportRight: viewport.right, viewportTop: viewport.top, viewportBottom: viewport.bottom, fits: [...el.querySelectorAll('button')].every(button => button.scrollWidth <= button.clientWidth) };
    });
    assert.ok(bounds.left >= bounds.viewportLeft && bounds.right <= bounds.viewportRight && bounds.top >= bounds.viewportTop && bounds.bottom <= bounds.viewportBottom && bounds.fits, JSON.stringify(bounds));
    if (process.env.TRISOUL_UI_ARTIFACTS) await panel.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'context-mode-' + colorScheme + '.png') });
  }
  await until(() => original.isEnabled()); await original.focus(); await page.keyboard.press('Enter');
  await panel.getByText('已切换为原版异步，本会话已保存。', { exact: true }).waitFor();
  assert.equal(await original.getAttribute('aria-pressed'), 'true');
  assert.equal(await panel.getByRole('button', { name: '准备摘要', exact: true }).count(), 1);
  assert.equal(await panel.getByRole('button', { name: '运行中枢', exact: true }).count(), 1);
  assert.deepEqual(errors, []);
});
