import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { browserExecutablePath } from '#opencu/src/computer-use/browser.mjs';

// OpenCU owns navigation, input, preview geometry and native platform scenarios.
// These checks cover the actual OMD presets, tool transport and host UI boundary.
for (const [backend, preset] of [['managed', 'trisoul-x'], ['managed', 'omd-ptc'], ['extension', 'trisoul-x']]) {
  test(`OMD ${preset} integrates ${backend} Computer Use, results and settings`, {
    timeout: 90000, skip: backend === 'extension' && process.platform === 'win32',
  }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'omd-cu-integration-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const executable = await testBrowserExecutable(root, browserExecutablePath());
    const f = await frontendFixture(t, { agentPreset: preset, omdConfig: { computerUseBrowserExecutable: executable, codegraphEnabled: false } });
    const { page, sessionId } = f, origin = new URL(page.url()).origin;
    const endpoint = path => `${origin}/trisoul-x/computer-use/${path}?session=${sessionId}`;
    const state = async () => (await page.request.get(endpoint('state'))).json();
    const fixture = await startFixture(); t.after(() => fixture.close());
    let browserId = 'browser';
    if (backend === 'extension') {
      const prepared = await (await page.request.post(endpoint('setup'), { data: { action: 'install-extension' } })).json();
      assert.equal(prepared.extension?.installation?.prepared, true);
      const external = await extensionFixture(t, { profile: join(f.root, 'chrome-profile'), extensionPath: prepared.extension.installation.extensionPath });
      browserId = external.browser.id;
    }
    let sent = false; const requests = [];
    f.replyWith(payload => {
      requests.push(payload);
      if (sent) return { delta: { role: 'assistant', content: 'OMD 电脑接入验证完成。' }, finish_reason: 'stop' };
      sent = true;
      const args = { title: '读取集成测试页面', code: `var tab = await cua.createBrowserTab(${JSON.stringify(browserId)}, ${JSON.stringify(fixture.url)}); await tab.markDeliverable(); await tab.getAXStateAndScreenshot();` };
      const name = preset === 'omd-ptc' ? 'run_code' : 'computer_use';
      assert.ok(payload.tools.some(tool => tool.function.name === name));
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'omd-cu-integration', type: 'function', function: { name,
        arguments: JSON.stringify(preset === 'omd-ptc' ? { code: `return await tools.computer_use(${JSON.stringify(args)})`, description: args.title } : args) } }] }, finish_reason: 'tool_calls' };
    });
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '验证电脑工具的真实宿主接入' }] });
    await page.getByText('OMD 电脑接入验证完成。', { exact: true }).waitFor();
    assert.ok((await state()).target, JSON.stringify(await state()));
    const ready = await until(async () => { const value = await state(); return value.previewAt && value.target?.kind === 'tab' && value; });
    assert.ok(requests.length >= 2);
    assert.match(JSON.stringify(requests.at(-1).messages), /image_url/);
    await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
    const image = page.locator('.tx-cu-pane .tx-cu-live img').first(); await image.waitFor();
    await until(() => image.evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal((await state()).target.id, ready.target.id);
    await page.request.post(endpoint('stop'), { data: {} }); assert.equal((await state()).status, 'stopped');
    await page.request.post(endpoint('resume'), { data: {} }); assert.equal((await state()).status, 'idle');
    for (const enabled of [false, true]) {
      const response = await page.request.post(origin + '/trisoul-x/components', { data: { action: 'settings', patch: { componentAutoSetup: false, computerUseEnabled: enabled } } });
      assert.equal(response.status(), 200, await response.text());
      assert.equal((await state()).enabled, enabled, 'component save waits for the runtime owner');
    }
    await page.reload(); await page.getByText('OMD 电脑接入验证完成。', { exact: true }).waitFor();
    assert.equal((await state()).target.id, ready.target.id, 'reload preserves the actual target');
    if (backend === 'extension') assert.equal((await page.request.post(endpoint('setup'), { data: { action: 'remove-extension' } })).status(), 200);
    assert.deepEqual(f.errors, []);
  });
}
