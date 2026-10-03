import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import sharp from 'sharp';

const response = text => ({ delta: { role: 'assistant', content: text }, finish_reason: 'stop' });

test('optimizer originals and follow-up editing survive sidebar navigation without replaying a request', { timeout: 120000 }, async t => {
  let requests = 0;
  const f = await frontendFixture(t, {
    setupWorkspace: ({ workspace }) => writeFile(join(workspace, 'navigation-reference.md'), '# Keep this reference\n'),
    optimizerReply: async payload => { requests++; return response('请保留所有限制，完成指定任务。 ' + JSON.stringify(payload.messages).match(/OMDREF_[a-zA-Z0-9]+_0_END/)[0]); },
  });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const { workspace } = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId: secondId } = await f.rpc('session/create', { workspaceId: workspace.workspaceId, agentPreset: 'trisoul-x' });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: secondId, mode: 'queue', content: [{ type: 'text', text: '另一个草稿会话' }] });
  await until(async () => (await page.request.get(new URL('/trisoul-x/api/state?session=' + secondId, page.url()).href).then(r => r.json())).running === 'idle');
  await f.rpc('session/rename', { sessionId: secondId, title: '润色草稿 B' });
  await f.rpc('session/rename', { sessionId: f.sessionId, title: '润色草稿 A' });
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  const expand = async () => { if (!(await drawer.isVisible())) await page.getByRole('button', { name: '展开提示词优化', exact: true }).click(); };
  await editor.fill('原始要求：做完任务，不能丢限制 @navigation');
  await page.getByRole('option', { name: /navigation-reference.md/ }).click();
  const readDraft = () => editor.evaluate(el => el.__lexicalEditor.getEditorState().toJSON().root.children.map(p => p.children.map(n => n.type === 'reference-chip' ? n.clipboardText : n.text || '').join('')).join('\n'));
  const original = await readDraft();
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3978e7' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'navigation.png', mimeType: 'image/png', buffer });
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  await expand();
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => (await readDraft()).startsWith('请保留所有限制，完成指定任务。'));
  await drawer.getByLabel('继续优化要求', { exact: true }).fill('更简短，保留限制');
  await page.getByText('润色草稿 B', { exact: true }).first().click();
  await until(async () => await editor.innerText() === '');
  await editor.fill('B 的独立原始要求');
  await page.getByText('润色草稿 A', { exact: true }).first().click();
  await until(async () => (await readDraft()).startsWith('请保留所有限制，完成指定任务。'));
  await expand();
  assert.equal(await drawer.getByRole('button', { name: '恢复原稿', exact: true }).count(), 1, 'session switching must not discard the original');
  assert.equal(await drawer.getByLabel('继续优化要求', { exact: true }).inputValue(), '更简短，保留限制');
  assert.equal(requests, 1, 'navigation never replays optimization');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await readDraft(), original);
  assert.equal(await page.locator('[data-composer-chip="reference"]').count(), 1);
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  if (process.env.TRISOUL_UI_ARTIFACTS) { await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true }); await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'optimizer-navigation-restored.png') }); }
  await page.getByText('润色草稿 B', { exact: true }).first().click();
  await until(async () => await editor.innerText() === 'B 的独立原始要求');
  await expand();
  assert.equal(await drawer.getByLabel('提示词版本', { exact: true }).count(), 0, 'versions belong only to their session');
  assert.deepEqual(f.errors, []);
});

test('failed native admission keeps optimizer originals and image attachments available for recovery', { timeout: 90000 }, async t => {
  const optimized = '请核对附件内容，保留所有限制。 @recovery.md', original = '核对附件，不删任何条件 @recovery.md';
  const f = await frontendFixture(t, {
    setupWorkspace: ({ workspace }) => writeFile(join(workspace, 'recovery.md'), '# Keep every requirement\n'),
    optimizerReply: async payload => response('请核对附件内容，保留所有限制。 ' + JSON.stringify(payload.messages).match(/OMDREF_[a-zA-Z0-9]+_0_END/)[0]),
  });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  await editor.fill('核对附件，不删任何条件 ');
  await editor.evaluate(el => {
    const lexical = el.__lexicalEditor, doc = lexical.getEditorState().toJSON();
    doc.root.children[0].children.push({ type: 'reference-chip', version: 1, source: 'reference', ref: '@recovery.md', appearance: 'file', label: 'recovery.md', clipboardText: '@recovery.md', invalid: false });
    lexical.setEditorState(lexical.parseEditorState(doc));
  });
  const readDraft = () => editor.evaluate(el => el.__lexicalEditor.getEditorState().toJSON().root.children.map(p => p.children.map(n => n.type === 'reference-chip' ? n.clipboardText : n.text || '').join('')).join('\n'));
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3978e7' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'recovery.png', mimeType: 'image/png', buffer });
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  await page.getByRole('button', { name: '启用自动润色', exact: true }).click();
  let attempts = 0;
  await page.route('**/api/session/prompt', route => { attempts++; return route.abort('failed'); });
  await editor.press('Enter'); await until(() => attempts === 1);
  await until(async () => await readDraft() === optimized && await page.locator('[data-composer-card] img').count() === 1);
  if (!(await drawer.isVisible())) await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
  assert.equal(await drawer.getByRole('button', { name: '恢复原稿', exact: true }).count(), 1, 'failed admission must retain the original version');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await readDraft(), original);
  assert.equal(await page.locator('[data-composer-chip="reference"]').count(), 1);
  const reference = await editor.evaluate(el => el.__lexicalEditor.getEditorState().toJSON().root.children[0].children.find(node => node.type === 'reference-chip'));
  assert.equal(reference.ref, '@recovery.md'); assert.equal(reference.appearance, 'file');
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  await page.unroute('**/api/session/prompt');
  await drawer.getByRole('switch', { name: '每次发送前自动润色', exact: true }).uncheck();
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await editor.press('Enter');
  await until(async () => await editor.innerText() === '' && await page.locator('[data-composer-card] img').count() === 0);
  await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
  assert.equal(await drawer.getByLabel('提示词版本', { exact: true }).count(), 0, 'successful submission begins a new draft');
  assert.deepEqual(f.errors, []);
});

test('late failed admission never replaces newer editing and exposes the earlier original separately', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { optimizerReply: async () => response('优化后的要求') });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  let pending;
  t.after(() => pending?.abort().catch(() => {}));
  await page.route('**/api/session/prompt', route => { pending = route; });
  await editor.fill('发送失败前的原稿');
  await page.getByRole('button', { name: '启用自动润色', exact: true }).click();
  await editor.press('Enter'); await until(() => pending);
  await until(async () => await editor.innerText() === '');
  await editor.fill('后来输入的新要求');
  if (!(await drawer.isVisible())) await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => await editor.innerText() === '优化后的要求');
  const failed = pending; pending = null; await failed.abort('failed');
  await drawer.getByText('发送失败，原稿和优化版本已保留。', { exact: true }).waitFor();
  assert.equal(await editor.innerText(), '优化后的要求');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await editor.innerText(), '后来输入的新要求');
  await drawer.getByRole('button', { name: '查看这份原稿与版本', exact: true }).click();
  assert.equal(await editor.innerText(), '后来输入的新要求', 'inspecting the earlier versions leaves newer text untouched');
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await editor.innerText(), '发送失败前的原稿');
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
    await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, 'optimizer-failure-recovery.png') });
  }
  await drawer.getByRole('button', { name: '查看这份原稿与版本', exact: true }).click();
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await editor.innerText(), '后来输入的新要求', 'both originals remain recoverable');
  assert.deepEqual(f.errors, []);
});

test('optimizer stays usable across four themes, light/dark modes and narrow composers', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true, optimizerReply: async () => response('请继续检查升级流程。') });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const hit = locator => locator.evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
  for (const skin of ['codex-desktop', 'ios-liquid-glass', 'claude-cli-terminal', 'google-material-expressive']) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('主题', { exact: true }).selectOption(skin);
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
  const f = await frontendFixture(t, { basePath: '/dsh/', optimizerReply: async payload => { requests.push(payload); return response(await reply(payload)); } });
  const { page, errors, root } = f;
  t.after(()=>assert.deepEqual(f.escapedPaths, [], 'all browser routes stay inside the deployment prefix'));
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
  const f = await frontendFixture(t, { setupWorkspace: ({ workspace }) => writeFile(join(workspace, 'reference.md'), '# Reference\n'), optimizerReply: async payload => {
    requests.push(payload);
    const token = JSON.stringify(payload.messages).match(/OMDREF_[a-zA-Z0-9]+_0_END/)?.[0];
    return response(refMode ? '请分析 ' + token : '请分析附图');
  } });
  const { page, errors } = f, editor = page.locator('[data-composer-input]');
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  await editor.fill('分析 @reference');
  await page.getByRole('option', { name: /reference.md/ }).click();
  await page.locator('[data-composer-chip="reference"]').waitFor();
  const readRef = () => editor.evaluate(el => el.__lexicalEditor.getEditorState().toJSON().root.children[0].children.find(node => node.type === 'reference-chip').ref);
  const originalReference = await readRef();
  assert.equal(originalReference, '@reference.md');
  await page.getByRole('button', { name: '展开提示词优化', exact: true }).click();
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => (await editor.innerText()).startsWith('请分析'));
  assert.equal(await page.locator('[data-composer-chip="reference"]').count(), 1);
  assert.equal(await readRef(), originalReference);
  await drawer.getByRole('button', { name: '恢复原稿', exact: true }).click();
  assert.equal(await readRef(), originalReference);
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  await editor.click(); await editor.press('ControlOrMeta+A'); await editor.press('Backspace');
  await until(async () => await page.locator('[data-composer-chip="reference"]').count() === 0);
  // fill() sends CDP insertText without the next real keydown that normally
  // clears Lexical's Backspace guard. Wait for its native timer, not just DOM.
  await until(() => editor.evaluate(el => !el.__lexicalEditor._inputState.isInsertTextAfterHandledSelectionCommand));
  await editor.fill('分析这张图'); refMode = false;
  const readDraft = () => editor.evaluate(el => {
    const tree = el.__lexicalEditor.getEditorState().toJSON();
    const text = node => node.type === 'text' ? node.text : (node.children || []).map(text).join('');
    return { dom: el.innerText, text: text(tree.root), tree };
  });
  // fill() dispatches the edit; wait for Lexical's actual commit before the
  // separate attachment action causes another render or blur.
  await until(async () => (await readDraft()).text === '分析这张图');
  assert.equal((await readDraft()).dom, '分析这张图');
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3978e7' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'optimizer-reference.png', mimeType: 'image/png', buffer });
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  assert.equal((await readDraft()).text, '分析这张图', JSON.stringify(await readDraft()));
  f.replyWith(payload => { main.push(payload); return response('图片和优化后的文本均已收到。'); });
  await page.getByRole('button', { name: '启用自动润色', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '关闭自动润色', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await editor.innerText(), '分析这张图', JSON.stringify(await readDraft()));
  await editor.press('Enter');
  await until(() => main.length === 1);
  assert.equal(requests.length, 2, 'automatic send calls the optimizer after the earlier manual rewrite');
  const sent = main[0].messages.findLast(message => message.role === 'user');
  assert.match(JSON.stringify(sent), /请分析附图/);
  assert.match(JSON.stringify(sent), /image_url/);
  assert.doesNotMatch(JSON.stringify(requests.at(-1).messages), /data:image/);
  assert.deepEqual(errors, []);
});


test('first-round extra requirements and named presets persist and reach the existing optimizer model', { timeout: 120000 }, async t => {
  const requests = []; let release;
  t.after(() => release?.(response('清理测试请求')));
  const f = await frontendFixture(t, { optimizerReply: async payload => {
    requests.push(payload);
    if (requests.length === 3) return new Promise(resolve => { release = resolve; });
    return response('优化结果 ' + requests.length);
  } });
  const { page } = f, editor = page.locator('[data-composer-input]');
  const drawer = page.getByRole('dialog', { name: '提示词优化', exact: true });
  const open = async () => { if (!(await drawer.isVisible())) await page.getByRole('button', { name: '展开提示词优化', exact: true }).click(); };
  await page.evaluate(() => { localStorage.setItem('omd.promptOptimizer.v1', JSON.stringify({ enabled: true, automatic: false, mode: 'structured' })); window.dispatchEvent(new StorageEvent('storage', { key: 'omd.promptOptimizer.v1' })); });
  await editor.waitFor(); await editor.fill('第一次优化前的草稿'); await open();
  const requirements = drawer.getByLabel('额外优化要求', { exact: true }), name = drawer.getByLabel('要求预设名称', { exact: true }), presets = drawer.getByLabel('额外要求预设', { exact: true });
  await name.fill('空预设'); await drawer.getByRole('button', { name: '保存预设', exact: true }).click();
  await drawer.getByRole('alert').filter({ hasText: '不能保存空预设' }).waitFor();
  await requirements.fill('保留所有路径与技术细节'); await name.fill('技术要求');
  await drawer.getByRole('button', { name: '保存预设', exact: true }).click();
  const technical = await presets.inputValue(); assert.ok(technical);
  await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => await editor.innerText() === '优化结果 1');
  assert.equal(requests.length, 1); assert.equal(requests[0].tools?.length ?? 0, 0);
  assert.match(JSON.stringify(requests[0].messages), /第一次优化前的草稿/);
  assert.match(JSON.stringify(requests[0].messages), /额外要求（仅用于本次草稿改写）/);
  assert.match(JSON.stringify(requests[0].messages), /保留所有路径与技术细节/);
  assert.match(JSON.stringify(requests[0].messages), /本次改写策略：结构化/);
  await drawer.getByLabel('继续优化要求', { exact: true }).fill('改成更简短的表达');
  await drawer.getByRole('button', { name: '继续优化', exact: true }).click();
  await until(async () => await editor.innerText() === '优化结果 2');
  assert.match(JSON.stringify(requests[1].messages), /改成更简短的表达/);
  assert.match(JSON.stringify(requests[1].messages), /第一次优化前的草稿/);
  assert.match(JSON.stringify(requests[1].messages), /保留所有路径与技术细节/);
  await requirements.fill('技术预设的暂存编辑'); await presets.selectOption('');
  assert.equal(await requirements.inputValue(), '保留所有路径与技术细节');
  await requirements.fill('使用简体中文'); await name.fill('中文'); await drawer.getByRole('button', { name: '保存预设', exact: true }).click();
  const chinese = await presets.inputValue();
  await page.evaluate(id => {
    const select = document.querySelector('select[aria-label="额外要求预设"]');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const field = document.querySelector('input[aria-label="要求预设名称"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '中文');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, technical);
  assert.equal(await requirements.inputValue(), '技术预设的暂存编辑');
  assert.equal(await name.inputValue(), '中文', 'selecting a preset cannot overwrite editing started in the same browser turn');
  await drawer.getByRole('button', { name: '保存修改', exact: true }).click();
  await drawer.getByRole('alert').filter({ hasText: '已有同名预设' }).waitFor();
  await name.fill('技术改名'); await drawer.getByRole('button', { name: '保存修改', exact: true }).click();
  await requirements.fill('刷新前的未保存要求'); await page.reload();
  await page.getByText('workspace', { exact: true }).first().click();
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  await editor.waitFor(); await open();
  assert.equal(await presets.inputValue(), technical); assert.equal(await name.inputValue(), '技术改名');
  assert.equal(await requirements.inputValue(), '刷新前的未保存要求');
  await presets.selectOption(chinese); assert.equal(await requirements.inputValue(), '使用简体中文');
  await presets.selectOption(technical); assert.equal(await requirements.inputValue(), '刷新前的未保存要求');
  await name.fill('技术副本'); await drawer.getByRole('button', { name: '另存为预设', exact: true }).click();
  assert.notEqual(await presets.inputValue(), technical);
  await drawer.getByRole('button', { name: '删除预设', exact: true }).click();
  assert.equal(await presets.inputValue(), ''); assert.equal(await requirements.inputValue(), '刷新前的未保存要求');
  await f.rpc('session/rename', { sessionId: f.sessionId, title: '要求预设 A' });
  const { workspace } = await f.rpc('workspace/create', { path: f.workspace });
  const { sessionId: secondId } = await f.rpc('session/create', { workspaceId: workspace.workspaceId, agentPreset: 'trisoul-x' });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: secondId, mode: 'queue', content: [{ type: 'text', text: '另一个会话' }] });
  await until(async () => (await page.request.get(new URL('/trisoul-x/api/state?session=' + secondId, page.url()).href).then(r => r.json())).running === 'idle');
  await f.rpc('session/rename', { sessionId: secondId, title: '要求预设 B' });
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  if (!(await page.getByText('要求预设 B', { exact: true }).count())) await page.getByText('workspace', { exact: true }).first().click();
  await page.getByText('要求预设 B', { exact: true }).first().click(); await open();
  assert.equal(await requirements.inputValue(), '刷新前的未保存要求');
  await presets.selectOption(chinese); assert.equal(await requirements.inputValue(), '使用简体中文');
  await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
  if (!(await page.getByText('要求预设 A', { exact: true }).count())) await page.getByText('workspace', { exact: true }).first().click();
  await page.getByText('要求预设 A', { exact: true }).first().click(); await open();
  assert.equal(await presets.inputValue(), chinese);
  await presets.selectOption('');
  await editor.fill('取消不能覆盖的草稿'); await drawer.getByRole('button', { name: '开始优化', exact: true }).click(); await until(() => !!release);
  await drawer.getByRole('button', { name: '停止优化', exact: true }).click();
  await editor.fill('用户取消后编辑的正文'); release(response('迟到结果')); release = null;
  await drawer.getByRole('status').filter({ hasText: '已停止' }).waitFor();
  assert.equal(await editor.innerText(), '用户取消后编辑的正文');
  await requirements.fill(''); await drawer.getByRole('button', { name: '开始优化', exact: true }).click();
  await until(async () => await editor.innerText() === '优化结果 4');
  assert.doesNotMatch(JSON.stringify(requests[3].messages), /额外要求（仅用于本次草稿改写）/);
  await presets.selectOption(chinese); await drawer.getByRole('switch', { name: '每次发送前自动润色', exact: true }).check();
  await editor.fill('自动润色的草稿'); await editor.press('Enter'); await until(() => requests.length === 5);
  assert.match(JSON.stringify(requests[4].messages), /使用简体中文/); assert.match(JSON.stringify(requests[4].messages), /本次改写策略：轻润色/);
  await until(async () => await editor.innerText() === ''); await open();
  assert.equal(await presets.inputValue(), chinese); assert.equal(await requirements.inputValue(), '使用简体中文');
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.screenshot({ path: join(f.root, 'requirements-light.png') });
    await drawer.getByRole('button', { name: '关闭提示词优化抽屉', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
    await page.keyboard.press('Escape'); await open();
    await page.screenshot({ path: join(f.root, 'requirements-dark.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await drawer.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.screenshot({ path: join(f.root, 'requirements-narrow.png') });
    await writeFile(join(f.root, 'requirements-requests.json'), JSON.stringify(requests, null, 2));
    console.log('Requirements UI artifacts:', f.root);
  }
  assert.deepEqual(f.errors, []);
});
