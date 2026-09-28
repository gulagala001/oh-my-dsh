import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';

test('Infinite Gen 4 checked source installs in packaged OMD, scopes globally, disables and removes cleanly', {
  timeout: 180000,
  skip: process.env.OMD_LIVE_PLUGIN_TESTS !== '1' ? 'Online source smoke; set OMD_LIVE_PLUGIN_TESTS=1' : false,
}, async t => {
  const plugin = recommendedPlugins.find(item => item.id === 'dsh-infinite-gen-4'), requests = [];
  let metadata = false, called = false;
  const f = await frontendFixture(t, { installedPackage: true, omdConfig: { contextEnabled: false, codegraphEnabled: false }, reply: payload => {
    requests.push(payload);
    if (metadata && !called) {
      called = true;
      assert.ok(payload.tools.some(tool => tool.function.name === 'infinite_gen4_profile'));
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'submission19-profile', type: 'function', function: { name: 'infinite_gen4_profile', arguments: '{}' } }] }, finish_reason: 'tool_calls' };
    }
    return { delta: { role: 'assistant', content: '投稿 19 核验完成。' }, finish_reason: 'stop' };
  } });
  const { page } = f, origin = new URL(page.url()).origin;
  const status = async () => (await page.request.get(origin + '/trisoul-x/recommended-plugins')).json();
  const current = async () => (await status()).plugins.find(item => item.id === plugin.id);
  const call = async (method, args) => {
    const response = await page.request.post(origin + '/api/' + method, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } } });
    const result = await response.json(); assert.equal(result.result?.ok, true, JSON.stringify(result)); return result.result.value;
  };
  const systems = payload => payload.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const kernels = payload => systems(payload).split('[MODE: SANDBOX]').length - 1;
  const prompt = async sessionId => {
    const start = requests.length;
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '读取插件状态，使用测试数据。' }] });
    await until(async () => requests.length > start && (await (await page.request.get(origin + '/trisoul-x/api/state?session=' + sessionId)).json()).running === 'idle');
    return requests.slice(start);
  };
  const openRecommendations = async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '推荐插件', exact: true }).click();
    return page.locator('.tx-recommended-card').filter({ has: page.getByRole('heading', { name: '无限四代', exact: true }) });
  };
  assert.equal((await current()).installed, false); assert.equal((await status()).autoUpdate, false);
  assert.equal(kernels(requests[0]), 0); assert.equal(await page.locator('[data-armor]').count(), 0);
  let card = await openRecommendations();
  assert.match(await card.innerText(), /已核验源码 v0\.4\.0 · 5e37739/);
  assert.match(await card.innerText(), /向所有会话|所有会话/);
  await until(() => card.getByRole('button', { name: '安装', exact: true }).isEnabled());
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await until(async () => { const state = await status(), item = await current(); if (item.error) throw Error(item.error); return !state.busy && item.installed && item.enabled; }, 120000);
  assert.equal((await current()).version, plugin.review.version);
  const archive = await readFile(join(f.home, 'trisoul-x', 'recommended-packages', plugin.review.sha256 + '.tgz'));
  assert.equal(createHash('sha256').update(archive).digest('hex'), plugin.review.sha256);
  await page.reload(); await page.locator('[data-armor]').waitFor();
  metadata = true;
  const used = await prompt(f.sessionId); metadata = false;
  assert.equal(kernels(used[0]), 2);
  assert.equal(used[0].messages[0].role, 'system');
  assert.ok(used[0].tools.some(tool => tool.function.name === 'bash'), 'upstream leaves the native tool surface intact');
  assert.match(JSON.stringify(used.at(-1).messages.filter(message => message.role === 'tool')), /pluginVersion.*0\.4\.0/);
  await until(async () => (await page.locator('[data-armor]').innerText()).includes('通过'));
  await page.reload(); await page.locator('[data-armor]').waitFor();
  assert.match(await page.locator('[data-armor]').innerText(), /通过/, 'projection replays the saved messages after reload');
  const standard = await f.rpc('session/create', { cwd: f.workspace, agentPreset: 'standard' });
  const native = await prompt(standard.sessionId);
  assert.equal(kernels(native[0]), 2, 'the global injection also reaches stock presets');
  if (process.env.OMD_PLUGIN_ARTIFACTS) await mkdir(process.env.OMD_PLUGIN_ARTIFACTS, { recursive: true });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    card = await openRecommendations();
    if (process.env.OMD_PLUGIN_ARTIFACTS) await card.screenshot({ path: join(process.env.OMD_PLUGIN_ARTIFACTS, 'infinite-gen4-' + colorScheme + '.png') });
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 900 });
    const badge = await page.locator('[data-armor]').boundingBox(); assert.ok(badge.x >= 0 && badge.x + badge.width <= 390);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  for (const enabled of [false, true]) {
    assert.equal((await call('pluginManager/setBundleEnabled', { name: plugin.packageName, enabled })).application, 'applied');
    await page.reload();
    await page.locator('[data-armor]').waitFor({ state: enabled ? 'visible' : 'hidden' });
    const changed = await prompt(f.sessionId);
    assert.equal(kernels(changed[0]), enabled ? 2 : 0);
    assert.equal(changed[0].tools.some(tool => tool.function.name === 'infinite_gen4_profile'), enabled);
  }
  card = await openRecommendations();
  await until(() => card.getByRole('button', { name: '更新', exact: true }).isEnabled());
  await card.getByRole('button', { name: '更新', exact: true }).click();
  await until(async () => { const state = await status(), item = await current(); if (item.error) throw Error(JSON.stringify({ item, bundles: await call('pluginManager/listBundles', {}), log: f.log() })); return !state.busy && item.message.startsWith('更新已完成'); }, 120000);
  await page.reload(); card = await openRecommendations();
  await until(() => card.getByRole('button', { name: '卸载', exact: true }).isEnabled());
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await until(async () => { const state = await status(), item = await current(); if (item.error) throw Error(item.error); return !state.busy && !item.installed; }, 60000);
  await page.reload(); await page.locator('[data-armor]').waitFor({ state: 'hidden' });
  const removed = await prompt(f.sessionId);
  assert.equal(kernels(removed[0]), 0);
  assert.equal(removed[0].tools.some(tool => tool.function.name === 'infinite_gen4_profile'), false);
  assert.deepEqual(f.errors, []);
});
