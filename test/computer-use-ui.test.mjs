import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

// OpenCU owns navigation, input, preview geometry and native platform scenarios.
// These checks cover the actual OMD presets, tool transport and host UI boundary.
for (const [backend, preset] of [['managed', 'trisoul-x'], ['managed', 'omd-ptc'], ['extension', 'trisoul-x']]) {
  test(`OMD ${preset} integrates ${backend} Computer Use, results and settings`, {
    timeout: 90000, skip: backend === 'extension' && process.platform === 'win32',
  }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'omd-cu-integration-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const executable = await testBrowserExecutable(root);
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
    // The first managed-browser launch may prepare its Windows runtime. Keep
    // the same bounded tool-result wait used by the packaged desktop fixture.
    await page.getByText('OMD 电脑接入验证完成。', { exact: true }).waitFor({ timeout: 45000 });
    assert.ok(requests.length >= 2);
    const toolResults = requests.at(-1).messages.filter(message => message.role === 'tool');
    assert.match(JSON.stringify(requests.at(-1).messages), /image_url/, 'Computer Use did not attach its observation: ' + JSON.stringify(toolResults));
    assert.ok((await state()).target, JSON.stringify(await state()));
    const ready = await until(async () => { const value = await state(); return value.previewAt && value.target?.kind === 'tab' && value; });
    const floating = page.getByLabel('悬浮操控预览'); await floating.waitFor();
    if (backend === 'managed' && preset === 'trisoul-x') {
      const previewImage = floating.locator('img').first();
      await until(() => previewImage.evaluate(img => img.complete && img.naturalWidth > 0));
      await floating.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const before = await floating.boundingBox(), button = floating.getByRole('button', { name: /^打开网页：/ }), box = await button.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 25, { steps: 8 }); await page.mouse.up();
      const after = await floating.boundingBox();
      assert.ok(Math.abs(after.x - before.x + 40) < 2); assert.ok(Math.abs(after.y - before.y + 25) < 2);
      assert.equal(await floating.evaluate(node => getComputedStyle(node).borderTopWidth), '0px');
      if (process.env.OMD_PREVIEW_ARTIFACTS) {
        await mkdir(process.env.OMD_PREVIEW_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: join(process.env.OMD_PREVIEW_ARTIFACTS, 'floating-preview-light.png') });
        await floating.screenshot({ path: join(process.env.OMD_PREVIEW_ARTIFACTS, 'floating-preview-detail.png') });
      }
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.locator('.VOzbGW_nav').getByRole('button', { name: '外观', exact: true }).click();
      await page.getByLabel('明暗模式', { exact: true }).selectOption('dark'); await page.keyboard.press('Escape');
      await until(async () => await page.locator('html').evaluate(node => getComputedStyle(node).colorScheme) === 'dark');
      await floating.hover();
      await until(() => floating.locator('header').evaluate(node => getComputedStyle(node).opacity === '1'));
      if (process.env.OMD_PREVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.OMD_PREVIEW_ARTIFACTS, 'floating-preview-dark.png') });
      await page.setViewportSize({ width: 560, height: 900 });
      await floating.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
      // The viewport command and the current animation snapshot can precede
      // the resize event/React commit. Check the actual settled layout.
      let firstLayout, lastLayout, stableLayouts = 0;
      const narrow = await until(async () => {
        lastLayout = await floating.evaluate(node => {
          const { x, width } = node.getBoundingClientRect();
          return { x, width, viewport: innerWidth, style: node.getAttribute('style'), computedWidth: getComputedStyle(node).width,
            animating: node.getAnimations().some(animation => animation.pending || animation.playState === 'running') };
        });
        firstLayout ??= lastLayout;
        const fits = lastLayout.viewport === 560 && !lastLayout.animating && lastLayout.x >= 11 && lastLayout.x + lastLayout.width <= 549;
        stableLayouts = fits ? stableLayouts + 1 : 0;
        return stableLayouts >= 2 && lastLayout;
      }, 3000).catch(error => { throw new Error('Floating preview did not fit the settled viewport: ' + JSON.stringify(lastLayout), { cause: error }); });
      t.diagnostic(JSON.stringify({ floatingResize: { first: firstLayout, settled: narrow } }));
      if (process.env.OMD_PREVIEW_ARTIFACTS) await page.screenshot({ path: join(process.env.OMD_PREVIEW_ARTIFACTS, 'floating-preview-narrow.png') });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
    const image = page.locator('.tx-cu-pane .tx-cu-live img').first(); await image.waitFor();
    await until(() => image.evaluate(img => img.complete && img.naturalWidth > 0));
    await floating.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '任务', exact: true }).click(); await floating.waitFor();
    await page.getByRole('button', { name: '电脑', exact: true }).click(); await floating.waitFor({ state: 'hidden' });
    await image.waitFor(); await until(() => image.evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal((await state()).target.id, ready.target.id);
    if (process.env.OMD_PREVIEW_ARTIFACTS && backend === 'managed' && preset === 'trisoul-x') await page.screenshot({ path: join(process.env.OMD_PREVIEW_ARTIFACTS, 'computer-pane-exclusive.png') });
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
