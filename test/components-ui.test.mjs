import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { CODEGRAPH_GUIDE, CODEGRAPH_DISABLED_GUIDE } from '../src/codegraph-agent.mjs';

test('one components page exposes live setup and saves switches without overwriting advanced values', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f, origin = new URL(page.url()).origin;
  const url = origin + '/trisoul-x/components';
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await page.request.post(url, { headers: { origin: 'https://unrelated.example' }, data: { action: 'prepare' } })).status(), 403);
  assert.equal((await page.request.post(url, { data: { action: 'settings', patch: { codegraphEnabled: 'no' } } })).status(), 400);
  await page.route('**/trisoul-x/components', route => route.fulfill({ status: 500, json: { error: 'fixture component status unavailable' } }));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Oh My DSH', exact: true }).click();
  await page.getByRole('button', { name: '基础组件', exact: true }).click();
  await page.getByText('fixture component status unavailable', { exact: true }).waitFor();
  await page.unroute('**/trisoul-x/components');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  const graph = page.getByRole('switch', { name: 'CodeGraph', exact: true });
  await graph.waitFor(); assert.equal(await graph.isChecked(), true);
  await page.getByText('内置浏览器', { exact: true }).waitFor();
  if (['darwin', 'win32'].includes(process.platform)) await page.getByText('桌面控制', { exact: true }).waitFor();
  else await page.getByText('此平台可使用浏览器；原生桌面控制暂不支持。', { exact: true }).waitFor();
  await page.getByText('日常 Chrome', { exact: true }).waitFor();
  const state = async () => (await page.request.get(url)).json();
  const requests = [];
  f.replyWith(payload => {
    if (!payload.tools?.some(t => t.function.name === 'todo_write')) return;
    requests.push(payload); return { delta: { role: 'assistant', content: '收到。' }, finish_reason: 'stop' };
  });
  const before = (await state()).computerUse.paths;
  for (const enabled of [false, true]) {
    await graph.setChecked(enabled); await until(async () => (await state()).codegraph.enabled === enabled);
    await until(async () => await graph.isEnabled());
    const count = requests.length;
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '回复收到即可。' }] });
    await until(() => requests.length > count);
    const system = requests.at(-1).messages.filter(m => m.role === 'system').at(-1).content;
    assert.ok(system.includes(enabled ? CODEGRAPH_GUIDE : CODEGRAPH_DISABLED_GUIDE), 'the next actual request follows the component switch');
  }
  const cu = page.getByRole('switch', { name: 'Computer Use', exact: true });
  for (const enabled of [false, true]) {
    await cu.setChecked(enabled); await until(async () => (await state()).computerUse.enabled === enabled);
    await until(async () => await cu.isEnabled());
  }
  assert.deepEqual((await state()).computerUse.paths, before);
  assert.equal(await page.locator('.cx-components').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  const output = new URL('../.context-upgrade/components-ui/', import.meta.url); await mkdir(output, { recursive: true });
  await page.getByRole('dialog').screenshot({ path: fileURLToPath(new URL('light.png', output)) });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('dialog').screenshot({ path: fileURLToPath(new URL('dark.png', output)) });
  await page.getByText('日常 Chrome', { exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('dialog').screenshot({ path: fileURLToPath(new URL('details.png', output)) });
  await page.getByText('高级配置', { exact: true }).click();
  await page.getByRole('textbox', { name: '浏览器程序路径', exact: true }).fill('/fixture/custom-browser');
  await page.getByRole('button', { name: '保存自定义路径', exact: true }).click();
  await until(async () => (await state()).computerUse.paths.computerUseBrowserExecutable === '/fixture/custom-browser');
  await page.getByText('路径已保存，重启服务后生效。', { exact: true }).waitFor();
  assert.equal((await state()).computerUse.paths.computerUseNativeBinary, before.computerUseNativeBinary);
  assert.deepEqual(f.errors, []);
});

test('startup prepares actual browser integration and indexing without opening a browser or replacing a custom desktop helper', { timeout: 90000, skip: process.platform === 'win32' }, async t => {
  const f = await frontendFixture(t, { componentAutoSetup: true });
  const url = new URL('/trisoul-x/components', f.page.url()).href;
  const state = await until(async () => {
    const d = await (await f.page.request.get(url)).json();
    return d.computerUse.operations.browser?.status === 'ready' && d.computerUse.operations.extension?.status === 'ready'
      && d.codegraph.projects.some(p => p.status === 'ready') && d;
  });
  assert.equal(state.automatic, true);
  assert.equal(state.computerUse.setup.browser.installed, true);
  assert.equal(state.computerUse.setup.browser.running, false);
  assert.equal(state.computerUse.setup.extension.installation.prepared, true);
  assert.ok(state.computerUse.setup.extension.installation.registrationPath.startsWith(f.root));
  if (process.platform === 'darwin') {
    assert.equal(state.computerUse.operations.native.status, 'error');
    assert.match(state.computerUse.operations.native.error, /自定义/);
  } else {
    assert.equal(state.computerUse.setup.native.supported, false);
    assert.equal(state.computerUse.operations.native, undefined);
  }
  assert.deepEqual(f.errors, []);
});
