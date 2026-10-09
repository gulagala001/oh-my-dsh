import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { downloadDeliveryFixture } from './fixtures/computer-use/download-delivery.mjs';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';

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

for (const preset of ['trisoul-x', 'omd-ptc']) {
  test(`OMD ${preset} delivers real saved downloads through the native host`, { timeout: 120000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'omd-cu-download-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const executable = await testBrowserExecutable(root);
    const evidence = process.env.OMD_CU_DELIVERY_ARTIFACTS && join(process.env.OMD_CU_DELIVERY_ARTIFACTS, preset);
    let f;
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      // Register before frontendFixture's disposal so failed runs also retain
      // their live host/UI evidence without retaining disposable profiles.
      t.after(async () => {
        if (!f) return;
        await writeFile(join(evidence, 'host.log'), f.log());
        await writeFile(join(evidence, 'final-events.json'), JSON.stringify((await restoreFixtureLog(f.home, f.sessionId)).events, null, 2));
        await writeFile(join(evidence, 'state.json'), JSON.stringify(await (await f.page.request.get(new URL(f.page.url()).origin + `/trisoul-x/computer-use/state?session=${f.sessionId}`)).json(), null, 2));
        await writeFile(join(evidence, 'page.txt'), await f.page.locator('body').innerText());
        await f.page.screenshot({ path: join(evidence, 'final.png'), animations: 'disabled' });
      });
    }
    f = await frontendFixture(t, { agentPreset: preset, omdConfig: { computerUseBrowserExecutable: executable, codegraphEnabled: false } });
    t.after(async () => {
      const preserved = Boolean(process.env.TRISOUL_UI_ARTIFACTS);
      if (!preserved) await assert.rejects(access(f.root), { code: 'ENOENT' });
      if (evidence) await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({ fixtureRoot: f.root, fixtureRootRemoved: !preserved, explicitlyPreservedForDebugging: preserved }, null, 2));
    });
    const fixture = await downloadDeliveryFixture(); t.after(() => fixture.close());
    const { page, sessionId, workspace } = f, origin = new URL(page.url()).origin;
    const endpoint = path => `${origin}/trisoul-x/computer-use/${path}?session=${sessionId}`;
    const state = async () => (await page.request.get(endpoint('state'))).json();
    const savedPath = join(workspace, '下载交付.txt'), cancelledPath = join(workspace, '取消交付.txt');
    const requests = [];
    let serial = 0;
    const runTool = async (title, code, { beforeFinish } = {}) => {
      const id = `omd-download-${preset}-${++serial}`, done = `下载交付阶段 ${id} 完成`;
      let sent = false;
      f.replyWith(payload => {
        requests.push(payload);
        if (sent) return { delta: { role: 'assistant', content: done }, finish_reason: 'stop' };
        sent = true;
        const args = { title, code };
        const name = preset === 'omd-ptc' ? 'run_code' : 'computer_use';
        assert.ok(payload.tools.some(tool => tool.function.name === name));
        return { delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name,
          arguments: JSON.stringify(preset === 'omd-ptc' ? { code: `return await tools.computer_use(${JSON.stringify(args)})`, description: title } : args) } }] }, finish_reason: 'tool_calls' };
      });
      await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: title }] });
      await beforeFinish?.();
      await page.getByText(done, { exact: true }).waitFor({ timeout: 45000 });
      const log = await restoreFixtureLog(f.home, sessionId);
      if (evidence) await writeFile(join(evidence, `stage-${serial}.json`), JSON.stringify({ id, events: log.events }, null, 2));
      return { id, log, request: requests.at(-1) };
    };
    await runTool('打开真实下载页面', `var deliveryTab = await cua.createBrowserTab('browser', ${JSON.stringify(fixture.url)}); await deliveryTab.markHandoff();`);
    const observedDownload = (binding, url) => `var ${binding}; for (var downloadAttempt = 0; downloadAttempt < 50 && !${binding}; downloadAttempt++) { ${binding} = (await deliveryTab.downloads.list()).find(item => item.url === ${JSON.stringify(url)}); if (!${binding}) await new Promise(resolve => setTimeout(resolve, 40)); } if (!${binding}) throw new Error('Real download was not observed');`;
    const delivered = await runTool('保存下载并交付文件', `await deliveryTab.playwright.getByRole('link', {name:'下载交付样本'}).click(); ${observedDownload('deliveryDownload', fixture.url + '/download')} await deliveryTab.downloads.save(deliveryDownload.id, ${JSON.stringify(savedPath)}); await deliveryTab.downloads.save(deliveryDownload.id, ${JSON.stringify(savedPath)}); nodeRepl.write('真实下载保存完成');`);
    assert.deepEqual(await readFile(savedPath), fixture.bytes, 'workspace save preserves the server bytes');
    // Inspect the actual host log and rendered tool result, including PTC child
    // calls. The file must originate in downloads.save, never seeded metadata.
    const computerResult = stage => stage.log.events.find(event => preset === 'omd-ptc'
      ? event.type === 'tool/ptc-dispatch' && event.data.rootCallId === stage.id && event.data.name === 'computer_use'
      : event.type === 'tool/result' && event.data.message.toolCallId === stage.id)?.data;
    const contentOf = result => result?.message?.content ?? result?.content ?? [];
    const presentationOf = async stage => {
      const result = computerResult(stage); assert.ok(result, 'real native Computer Use result is settled');
      const records = stage.log.events.filter(event => event.type === 'computer-use/presentation');
      assert.equal(records.length, 0, 'Computer Use presentation does not add an unknown event to the native session log');
      if (preset !== 'omd-ptc') {
        return result.meta;
      }
      assert.equal(result.rootCallId, stage.id);
      assert.match(result.subCallId, new RegExp('^' + stage.id + ':ptc:'));
      // This fixture returns the actual child result through run_code. Compare
      // the UI endpoint against that independently durable canonical output.
      const rootResult = stage.log.events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === stage.id).data.message;
      const canonical = JSON.parse(rootResult.content.find(block => block.type === 'text').text);
      const response = await page.request.get(endpoint('presentation') + '&call=' + encodeURIComponent(result.subCallId));
      assert.equal(response.status(), 200);
      const body = await response.json(); assert.deepEqual(body.meta, { computerUseFiles: canonical.files, computerUseError: canonical.error });
      return body.meta;
    };
    const output = computerResult(delivered), blocks = contentOf(output).filter(block => block.type === 'file');
    assert.equal(blocks.length, 1, 'repeated save attaches one real file in the host result');
    assert.equal(blocks[0].attachment.attachmentId, 'sha256:' + createHash('sha256').update(fixture.bytes).digest('hex'));
    assert.equal(blocks[0].attachment.name, '下载交付.txt');
    const files = (await presentationOf(delivered))?.computerUseFiles;
    assert.ok(Array.isArray(files), 'native and PTC Computer Use results retain file presentation metadata');
    assert.equal(files.length, 1, 'metadata has one file for one distinct saved path');
    const attached = files[0];
    assert.equal(attached.bytes, fixture.bytes.length);
    assert.deepEqual(await readFile(attached.path), fixture.bytes, 'host attachment preserves every byte');
    const source = await page.request.get(origin + '/api/file?path=' + encodeURIComponent(attached.path));
    assert.equal(source.status(), 200); assert.deepEqual(await source.body(), fixture.bytes);
    if (preset === 'omd-ptc') {
      const missing = await page.request.get(endpoint('presentation') + '&call=unsettled-computer-use-call');
      assert.equal(missing.status(), 200); assert.deepEqual(await missing.json(), { meta: null });
      const registered = await f.rpc('workspace/create', { path: workspace });
      const foreign = await f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: preset });
      const denied = await page.request.get(`${origin}/trisoul-x/computer-use/presentation?session=${foreign.sessionId}&call=${encodeURIComponent(output.subCallId)}`);
      assert.equal(denied.status(), 200); assert.deepEqual(await denied.json(), { meta: null }, 'another session cannot resolve this call presentation');
    }
    const completed = (await state()).history.filter(item => item.operation === 'downloads.save');
    assert.equal(completed.length, 2, 'one history record per explicit save, without observer duplicates');
    assert.ok(completed.every(item => item.ok && item.artifactPath === savedPath));

    const closeFloating = async () => {
      if (await page.getByLabel('悬浮操控预览').isVisible()) {
        await page.getByLabel('悬浮操控预览').hover();
        await page.getByRole('button', { name: '关闭操控预览', exact: true }).click();
      }
    };
    const turnOf = stage => stage.log.events.find(event => event.type === 'tool/call' && event.data.callId === stage.id).data.turn;
    const outcomesOf = stage => page.locator('.tx-cu-turn-outcomes').filter({ has: page.locator(`[data-turn-process="${turnOf(stage)}"]`) });
    const revealToolCard = async (title, stage) => {
      await closeFloating();
      const turn = turnOf(stage);
      const turnProcess = page.locator(`[data-turn-process="${turn}"]`);
      if (await turnProcess.getAttribute('aria-expanded') === 'false') await turnProcess.click();
      const group = page.locator(`[data-cu-group][data-chat-turn="${turn}"] .tx-cu-group-toggle`);
      if (await group.getAttribute('aria-expanded') === 'false') await group.click();
      const card = page.locator('.tx-cu-card').filter({ hasText: title });
      const heading = card.locator('.tx-cu-card-heading');
      if (await heading.getAttribute('aria-expanded') === 'false') await heading.click();
      return card;
    };
    const card = await revealToolCard('保存下载并交付文件', delivered);
    const fileButtons = card.locator('.tx-cu-export-files button');
    await fileButtons.first().waitFor();
    assert.equal(await fileButtons.count(), 1, 'saving the same path twice emits one file card');
    assert.equal(await fileButtons.first().isEnabled(), true);
    assert.equal(await fileButtons.first().getAttribute('title'), attached.path);
    await fileButtons.first().click();
    await page.getByText('OMD_DOWNLOAD_DELIVERY', { exact: false }).waitFor();
    await closeFloating();
    if (evidence) await page.screenshot({ path: join(evidence, 'file-preview.png'), animations: 'disabled' });

    const failed = await runTool('失败下载不能交付', `await deliveryTab.downloads.save('unknown-download-id', ${JSON.stringify(join(workspace, '失败交付.txt'))});`);
    const failedHistory = (await state()).history.filter(item => item.operation === 'downloads.save').at(-1);
    assert.equal(failedHistory.ok, false); assert.equal(failedHistory.artifactPath, undefined);
    assert.match(JSON.stringify(failed.request.messages), /Unknown download/);
    assert.equal(contentOf(computerResult(failed)).filter(block => block.type === 'file').length, 0);
    assert.deepEqual((await presentationOf(failed))?.computerUseFiles, []);
    assert.match((await presentationOf(failed))?.computerUseError ?? '', /Unknown download/);
    await assert.rejects(readFile(join(workspace, '失败交付.txt')), { code: 'ENOENT' });
    const failedCard = await revealToolCard('失败下载不能交付', failed);
    await until(async () => await failedCard.getAttribute('data-state') === 'error');
    assert.equal(await failedCard.getAttribute('data-state'), 'error');
    assert.equal(await failedCard.locator('.tx-cu-export-files button').count(), 0);
    await outcomesOf(failed).getByText('1 项失败', { exact: true }).waitFor();

    const brokenPath = join(workspace, '网络失败交付.txt');
    const broken = await runTool('网络中断下载不能交付', `await deliveryTab.playwright.getByRole('link', {name:'下载失败样本'}).click(); ${observedDownload('brokenDownload', fixture.url + '/broken')} await deliveryTab.downloads.save(brokenDownload.id, ${JSON.stringify(brokenPath)});`, { beforeFinish: async () => {
      await until(async () => (await state()).operation === 'downloads.save'); fixture.failBroken();
    } });
    await assert.rejects(readFile(brokenPath), { code: 'ENOENT' });
    const brokenHistory = (await state()).history.filter(item => item.operation === 'downloads.save').at(-1);
    assert.equal(brokenHistory.ok, false); assert.equal(brokenHistory.artifactPath, undefined);
    assert.equal(contentOf(computerResult(broken)).filter(block => block.type === 'file').length, 0);
    const brokenMeta = await presentationOf(broken);
    assert.deepEqual(brokenMeta?.computerUseFiles, []); assert.ok(brokenMeta?.computerUseError);
    assert.doesNotMatch(brokenMeta.computerUseError, /exceeded \d+ ms|timed? ?out/i, 'runtime budget exhaustion is not a passed network-failure test');
    const brokenCard = await revealToolCard('网络中断下载不能交付', broken);
    await until(async () => await brokenCard.getAttribute('data-state') === 'error');
    assert.equal(await brokenCard.getAttribute('data-state'), 'error');
    assert.equal(await brokenCard.locator('.tx-cu-export-files button').count(), 0);
    await outcomesOf(broken).getByText('1 项失败', { exact: true }).waitFor();

    const beforeCancelStats = (await state()).operationStats;
    const cancelledResult = await runTool('取消下载不能交付', `await deliveryTab.playwright.getByRole('link', {name:'下载取消样本'}).click(); ${observedDownload('slowDownload', fixture.url + '/slow')} await deliveryTab.downloads.save(slowDownload.id, ${JSON.stringify(cancelledPath)});`, { beforeFinish: async () => {
      await until(async () => (await state()).operation === 'downloads.save');
      await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
      await page.getByRole('button', { name: '停止并接管', exact: true }).click();
      await until(async () => (await state()).status === 'stopping');
      fixture.releaseSlow();
      await until(async () => (await state()).status === 'stopped');
    } });
    await assert.rejects(readFile(cancelledPath), { code: 'ENOENT' });
    const cancelled = (await state()).history.filter(item => item.operation === 'downloads.save').at(-1);
    assert.equal(cancelled.ok, false); assert.equal(cancelled.cancelled, true); assert.equal(cancelled.artifactPath, undefined);
    assert.match(cancelled.error, /Stopped|stop|cancel/i);
    assert.equal(contentOf(computerResult(cancelledResult)).filter(block => block.type === 'file').length, 0);
    assert.deepEqual((await presentationOf(cancelledResult))?.computerUseFiles, []);
    assert.equal((await state()).status, 'stopped');
    assert.equal((await state()).operationStats.failed, beforeCancelStats.failed, 'user stop does not increment the failed-operation count');
    assert.equal((await state()).operationStats.cancelled, beforeCancelStats.cancelled + 1);
    await page.reload(); await page.getByText('取消下载不能交付', { exact: true }).first().waitFor();
    const restored = await revealToolCard('保存下载并交付文件', delivered);
    await restored.locator('.tx-cu-export-files button').waitFor();
    assert.equal(await restored.locator('.tx-cu-export-files button').count(), 1, 'reload restores one durable file card');
    await restored.locator('.tx-cu-export-files button').click();
    await page.getByText('OMD_DOWNLOAD_DELIVERY', { exact: false }).waitFor();
    const restoredFailure = await revealToolCard('失败下载不能交付', failed);
    await until(async () => await restoredFailure.getAttribute('data-state') === 'error');
    assert.equal(await restoredFailure.getAttribute('data-state'), 'error', 'reload preserves the actual failed result');
    await outcomesOf(failed).getByText('1 项失败', { exact: true }).waitFor();
    const restoredCancellation = await revealToolCard('取消下载不能交付', cancelledResult);
    await until(async () => await restoredCancellation.getAttribute('data-state') === 'stopped');
    assert.equal(await restoredCancellation.getAttribute('data-state'), 'stopped', 'reload preserves the user-stopped download');
    await restoredCancellation.getByText('已停止', { exact: true }).waitFor();
    assert.equal(await restoredCancellation.locator('.tx-cu-export-files button').count(), 0);
    await outcomesOf(cancelledResult).getByText('1 项已停止', { exact: true }).waitFor();
    assert.equal(await outcomesOf(cancelledResult).locator('.tx-cu-error').count(), 0, 'user stop has no failure badge');
    assert.deepEqual(f.errors, []);
    if (evidence) await writeFile(join(evidence, 'verification.json'), JSON.stringify({ passed: true, preset, platform: process.platform, savedBytes: fixture.bytes.length, hostAttachment: attached, history: (await state()).history.filter(item => item.operation === 'downloads.save') }, null, 2));
  });
}
