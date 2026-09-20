import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import sharp from 'sharp';

const response = text => ({ delta: { role: 'assistant', content: text }, finish_reason: 'stop' });

test('optimizer stays usable across four themes, light/dark modes and narrow composers', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true, optimizerReply: async () => response('请继续检查升级流程。') });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const hit = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
  for (const skin of ['codex-desktop', 'ios-liquid-glass', 'claude-cli-terminal', 'google-material-expressive']) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('皮肤', { exact: true }).selectOption(skin);
    await page.getByLabel('明暗模式', { exact: true }).selectOption(mode);
    await until(async () => await page.locator('html').getAttribute('data-appearance') === mode);
    await page.keyboard.press('Escape');
    await editor.fill('继续检查升级流程');
    const star = page.locator('.omd-opt-star');
    await until(async () => await hit(star));
    await star.click();
    assert.equal(await star.getAttribute('aria-pressed'), 'true');
    await star.click();
    const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
    // A deliberate hover opens the preview before the explicit expand click.
    // Clicking expand must pin it, including after the pointer leaves on resize.
    await star.hover();
    await drawer.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    assert.equal(await drawer.isVisible(), true, `${skin}/${mode}: expand pins an already hovered preview`);
    const action = drawer.getByRole('button', { name: '开始优化', exact: true });
    if (skin === 'codex-desktop') {
      await until(async () => await action.evaluate(el => getComputedStyle(el).backgroundColor) === (mode === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)'));
      assert.equal(await action.evaluate(el => getComputedStyle(el).color), mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await until(async () => { const b = await drawer.boundingBox(); return b && b.x >= 0 && b.x + b.width <= 390 && b.y >= 0; });
    await action.scrollIntoViewIfNeeded();
    await until(async () => await hit(action));
    await action.click();
    await until(async () => await editor.innerText() === '请继续检查升级流程。');
    await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  }
  assert.deepEqual(f.errors, []);
});

test('native optimizer: default entry, real provider, manual revisions, settings persistence and automatic sends', { timeout: 180000 }, async t => {
  const requests = [], main = []; let reply = async () => '优化后的提示词', release;
  const f = await frontendFixture(t, { optimizerReply: async payload => { requests.push(payload); return response(await reply(payload)); } });
  const { page, errors, root } = f;
  t.after(() => { release?.(); if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Optimizer UI artifacts:', root); });
  f.replyWith(payload => { main.push(payload); return response('已收到优化后的要求。'); });
  const editor = page.locator('[contenteditable="true"][role="textbox"]').first();
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  const expand = async () => { if (!(await drawer.isVisible())) await page.getByRole('button', { name: '展开提示词优化', exact: true }).click(); };
  await page.getByRole('button', { name: '启用自动润色', exact: true }).waitFor();
  await editor.fill('帮我优化这句话'); await expand();
  await drawer.getByRole('button', { name: '结构化', exact: true }).click();
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => await editor.innerText() === '优化后的提示词');
  assert.equal(requests.length, 1); assert.ok(!requests[0].tools?.length);
  assert.match(JSON.stringify(requests[0].messages), /改写策略：结构化/);
  assert.match(JSON.stringify(requests[0].messages), /帮我优化这句话/);
  reply = async () => '更简短的提示词';
  await drawer.getByLabel('继续优化要求', { exact: true }).fill('更短一点');
  await drawer.getByRole('button', { name: '继续优化', exact: true }).click();
  await until(async () => await editor.innerText() === '更简短的提示词');
  assert.match(JSON.stringify(requests[1].messages), /帮我优化这句话/); assert.match(JSON.stringify(requests[1].messages), /更短一点/);
  await drawer.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await editor.innerText(), '优化后的提示词');
  await drawer.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await editor.innerText(), '更简短的提示词');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click(); assert.equal(await editor.innerText(), '帮我优化这句话');
  await drawer.getByRole('switch', { name: '每次发送前自动润色', exact: true }).check();
  assert.equal(await page.getByRole('button', { name: '关闭自动润色', exact: true }).getAttribute('aria-pressed'), 'true');
  reply = async () => '自动润色的第一条';
  await editor.press('Enter'); await until(() => main.length === 1);
  assert.match(JSON.stringify(requests.at(-1).messages), /改写策略：轻润色/);
  assert.match(JSON.stringify(main[0].messages), /自动润色的第一条/);
  assert.doesNotMatch(JSON.stringify(main[0].messages), /你正在 Oh My DSH 中改写/);
  await until(async () => await editor.innerText() === '');
  reply = async () => '自动润色的第二条'; await editor.fill('第二条原文');
  await page.locator('[data-composer-card]').getByRole('button', { name: /^发送|立即发送|加入队列/ }).last().click();
  await until(() => main.length === 2); assert.match(JSON.stringify(main[1].messages), /自动润色的第二条/);
  assert.equal(requests.length, 4, 'automatic sends optimize exactly once');
  await page.reload(); await page.getByRole('button', { name: '关闭自动润色', exact: true }).waitFor();
  await editor.fill('优化过程中编辑'); reply = () => new Promise(resolve => { release = resolve; });
  await editor.press('Enter'); await until(() => !!release); await editor.fill('用户后来输入的新条件'); release('过期的优化结果'); release = null;
  await drawer.getByRole('button', { name: '应用此结果', exact: true }).waitFor();
  assert.equal(await editor.innerText(), '用户后来输入的新条件'); assert.equal(main.length, 2);
  // A failed HTTP/model request preserves the draft and does not fall through to the host send.
  await page.route('**/trisoul-x/api/prompt-optimizer?*', route => route.fulfill({ status: 502, json: { error: '测试模型暂不可用' } }));
  await editor.press('Enter'); await drawer.getByRole('alert').waitFor(); assert.match(await drawer.getByRole('alert').innerText(), /暂不可用/);
  assert.equal(await editor.innerText(), '用户后来输入的新条件'); assert.equal(main.length, 2);
  await page.unroute('**/trisoul-x/api/prompt-optimizer?*');
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog').filter({ has: page.locator('.omd-opt-settings') });
  await page.getByRole('dialog').getByRole('button', { name: '提示词优化', exact: true }).click();
  await settings.getByRole('switch', { name: '显示提示词优化入口', exact: true }).uncheck();
  assert.equal(await page.locator('.omd-opt-entry').count(), 0);
  await settings.getByRole('switch', { name: '显示提示词优化入口', exact: true }).check();
  assert.equal(await page.locator('.omd-opt-entry').count(), 1);
  await page.keyboard.press('Escape'); await expand();
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'optimizer-light.png') });
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
  await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
  await page.keyboard.press('Escape'); await expand();
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'optimizer-dark.png') });
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await page.locator('.hHd-Xa_toggle').first().click();
  await page.setViewportSize({ width: 390, height: 844 }); await expand();
  const bounds = await drawer.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  if (process.env.TRISOUL_UI_ARTIFACTS) await page.screenshot({ path: join(root, 'optimizer-narrow.png') });
  assert.deepEqual(errors, []);
});

test('optimizer API: authenticated requests, first-turn default model and input validation', { timeout: 90000 }, async t => {
  const calls = [];
  const f = await frontendFixture(t, { headless: true, optimizerReply: async payload => { calls.push(payload); return response('首次发送前也可优化'); } });
  const { sessionId } = await f.rpc('session/create', { cwd: f.workspace, agentPreset: 'trisoul-x' });
  const path = '/prompt-optimizer?session=' + sessionId;
  const output = await f.api(path, { text: '尚未发送的新草稿', mode: 'basic' });
  assert.equal(output.text, '首次发送前也可优化'); assert.equal(output.provider, 'fixture'); assert.equal(calls.length, 1);
  assert.match(JSON.stringify(calls[0].messages), /尚未发送的新草稿/);
  await assert.rejects(f.api(path, { text: '', mode: 'basic' }), /请输入/);
  await assert.rejects(f.api(path, { text: '草稿', mode: 'unknown' }), /未知/);
  const denied = await fetch(f.origin + '/trisoul-x/api' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '不能调用' }) });
  assert.equal(denied.status, 401); assert.equal(calls.length, 1);
  for (const preset of ['standard', 'omd-ptc', 'trisoul-x']) {
    const selected = await f.call('agentPresets/select', { agentId: sessionId, agentPreset: preset });
    assert.equal(selected.result?.ok, true, JSON.stringify(selected));
    assert.equal((await f.api(path, { text: '切换模式后的草稿', mode: 'basic' })).text, '首次发送前也可优化');
  }
});

test('native Lexical references survive rewrite/restore; automatic sends preserve real image attachments', { timeout: 90000 }, async t => {
  const requests = [], main = []; let refMode = true;
  const f = await frontendFixture(t, { optimizerReply: async payload => {
    requests.push(payload);
    const token = JSON.stringify(payload.messages).match(/OMDREF_[a-zA-Z0-9]+_0_END/)?.[0];
    return response(refMode ? '请分析 ' + token : '请分析附图');
  } });
  const { page, errors } = f, editor = page.locator('[contenteditable="true"][role="textbox"]').first();
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  await editor.fill('分析 ');
  // Exercise the same serialized chip node that the native reference picker creates.
  await editor.evaluate(el => {
    const editor = el.__lexicalEditor, document = editor.getEditorState().toJSON();
    document.root.children[0].children.push({ type: 'reference-chip', version: 1, source: 'file', ref: '/fixture/reference.md', label: 'reference.md', clipboardText: '@reference.md', invalid: false });
    editor.setEditorState(editor.parseEditorState(document));
  });
  await page.locator('[data-composer-chip="file"]').waitFor();
  await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => (await editor.innerText()).startsWith('请分析'));
  assert.equal(await page.locator('[data-composer-chip="file"]').count(), 1);
  const readRef = () => editor.evaluate(el => el.__lexicalEditor.getEditorState().toJSON().root.children[0].children.find(node => node.type === 'reference-chip').ref);
  assert.equal(await readRef(), '/fixture/reference.md');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await readRef(), '/fixture/reference.md');
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await editor.click(); await editor.press('ControlOrMeta+A'); await editor.press('Backspace');
  await until(async () => await page.locator('[data-composer-chip="file"]').count() === 0);
  await editor.fill('分析这张图'); refMode = false;
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3978e7' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'optimizer-reference.png', mimeType: 'image/png', buffer });
  f.replyWith(payload => { main.push(payload); return response('图片和优化后的文本均已收到。'); });
  await page.getByRole('button', { name: '启用自动润色', exact: true }).click(); await editor.press('Enter');
  await until(() => main.length === 1);
  assert.match(JSON.stringify(main[0].messages), /请分析附图/);
  assert.match(JSON.stringify(main[0].messages), /image_url/);
  assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /data:image/);
  assert.deepEqual(errors, []);
});
