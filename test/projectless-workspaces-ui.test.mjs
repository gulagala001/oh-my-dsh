import test from 'node:test';
import assert from 'node:assert/strict';
import { realpath, stat, readdir } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

async function fixture(t, options = {}) {
  const omdConfig = {};
  let projectlessRoot;
  const f = await frontendFixture(t, {
    ...options, omdConfig,
    async setupWorkspace({ root }) {
      projectlessRoot = join(await realpath(root), 'projectless-chats');
      omdConfig.projectlessWorkspaceRoot = projectlessRoot;
    },
  });
  return { ...f, projectlessRoot };
}

async function exists(path) {
  return stat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
}

async function chatDirectories(root) {
  const result = [];
  for (const date of await readdir(root, { withFileTypes: true })) {
    if (!date.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(date.name)) continue;
    for (const chat of await readdir(join(root, date.name), { withFileTypes: true })) {
      if (chat.isDirectory()) result.push(join(date.name, chat.name));
    }
  }
  return result.sort();
}

async function currentSession(page) {
  return page.locator('[data-omd-sidebar-browser] [data-row-key^="session:"][aria-selected="true"]').getAttribute('data-row-key').then(key => key.slice('session:'.length));
}

async function newChat(page) {
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click();
  await until(async () => await page.locator('[data-composer-input]').innerText() === '');
  await page.locator('[data-slot="conversation.hero.agentPreset"]').waitFor();
}

async function clearWorkspace(page) {
  const clear = page.getByRole('button', { name: '取消工作区', exact: true });
  await clear.waitFor({ state: 'attached' });
  await clear.locator('xpath=../..').locator('button[aria-haspopup="menu"]').first().hover();
  await until(async () => await clear.evaluate(el => Number(getComputedStyle(el).opacity) === 1));
  await clear.click();
  await page.getByRole('button', { name: '选择工作区', exact: true }).waitFor();
}

async function summary(f, id) {
  const method = 'session/list';
  const response = await f.page.request.post(new URL('api/' + method, f.page.url()).href, {
    data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: { _request: {} } } },
  });
  const value = await response.json();
  assert.equal(value.result?.ok, true, JSON.stringify(value));
  return value.result.value.items.find(item => item.sessionId === id);
}

async function idle(f, id) {
  await until(async () => (await f.page.request.get(new URL('trisoul-x/api/state?session=' + id, f.page.url()).href).then(response => response.json())).running === 'idle');
}

function assertInside(root, cwd) {
  const suffix = relative(root, cwd);
  assert.ok(suffix && !suffix.startsWith('..') && !isAbsolute(suffix), `cwd must be inside isolated root: ${cwd}`);
  assert.match(suffix.split(/[\\/]/)[0], /^\d{4}-\d{2}-\d{2}$/);
}

test('cancelled workspace sends into a physical ungrouped directory and keeps it across continuation and reload', { timeout: 120000 }, async t => {
  const f = await fixture(t), { page } = f;
  const editor = page.locator('[data-composer-input]');
  await newChat(page);
  const source = await currentSession(page);
  // Preserve a stricter native permission choice instead of inheriting OMD's
  // default full access when the first message moves to its isolated Session.
  const method = 'commands/execute';
  const permission = await page.request.post(new URL('api/' + method, page.url()).href, {
    data: { type: 'client-request', rpcId: crypto.randomUUID(), method,
      payload: { args: { agentId: source, line: '/permission workspace-write', submittedAttachments: [] } } },
  }).then(response => response.json());
  assert.equal(permission.result?.ok, true);
  await until(async () => (await f.rpc('session/projections', { sessionId: source })).values.permissions.currentValue === 'workspace-write');
  await editor.fill('独立聊天首发回归');
  await page.mouse.move(1400, 900);
  assert.equal(await page.locator('.omd-workspace-clear').evaluate(el => getComputedStyle(el).opacity), '0', 'clear is revealed by hovering the workspace chip');
  await clearWorkspace(page);
  assert.equal(await editor.innerText(), '独立聊天首发回归');
  assert.equal(await editor.getAttribute('contenteditable'), 'true');
  assert.equal(await exists(f.projectlessRoot), false, 'cancelling and editing never creates the managed root');
  const prepared = [], sent = [];
  await page.route('**/trisoul-x/api/projectless-workspace', route => {
    if (route.request().method() === 'POST') prepared.push(route.request().postDataJSON());
    return route.continue();
  });
  await page.route('**/api/session/prompt', route => { sent.push(route.request().postDataJSON()); return route.continue(); });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await until(() => sent.length === 1);
  const target = sent[0].payload.args.request.sessionId;
  assert.notEqual(target, source, 'the first message must leave the draft carrier');
  assert.equal(prepared.length, 1);
  await idle(f, target);
  const created = await summary(f, target);
  assert.equal((await f.rpc('session/projections', { sessionId: target })).values.permissions.currentValue, 'workspace-write');
  assertInside(f.projectlessRoot, created.cwd);
  assert.equal((await stat(created.cwd)).isDirectory(), true);
  assert.equal((await summary(f, source)).blank, true, 'the source never receives the first message');
  const row = page.locator(`[data-row-key="session:${target}"]`);
  await row.waitFor();
  assert.match(await row.evaluate(el => el.closest('[class*="_groupSection"]').innerText), /未分组/);
  assert.equal(await page.locator('[data-omd-sidebar-browser] [data-row-key^="workspace:"]:not([data-row-key="workspace:"])').count(), 1, 'no managed folder is registered as a Workspace');
  await editor.fill('继续同一个独立聊天');
  await editor.press('Enter');
  await until(() => sent.length === 2);
  assert.equal(sent[1].payload.args.request.sessionId, target);
  assert.equal(prepared.length, 1, 'continuation never allocates another directory');
  await idle(f, target);
  await page.reload();
  await editor.waitFor();
  await until(async () => await currentSession(page) === target);
  assert.equal((await summary(f, target)).cwd, created.cwd);
  assert.match(await row.evaluate(el => el.closest('[class*="_groupSection"]').innerText), /未分组/);
  await newChat(page);
  await page.locator('.omd-projectless-trigger').waitFor();
  assert.equal(await editor.getAttribute('contenteditable'), 'true');
  const before = await chatDirectories(f.projectlessRoot);
  await editor.fill('独立聊天首发回归');
  assert.deepEqual(await chatDirectories(f.projectlessRoot), before, 'new unsent chat allocates no directory');
  await editor.press('Enter');
  await until(() => sent.length === 3);
  const second = sent[2].payload.args.request.sessionId;
  await idle(f, second);
  const secondSummary = await summary(f, second);
  assert.equal((await f.rpc('session/projections', { sessionId: second })).values.permissions.currentValue, 'workspace-write');
  assertInside(f.projectlessRoot, secondSummary.cwd);
  assert.notEqual(secondSummary.cwd, created.cwd, 'equal first prompts still receive independent directories');
  assert.equal((await stat(secondSummary.cwd)).isDirectory(), true);
  assert.deepEqual(f.errors, []);
});

test('clearing and selecting a workspace preserves native draft files, images, preset, model and effort through first send', { timeout: 120000 }, async t => {
  const f = await fixture(t, {
    modelProfile: { reasoningEfforts: { low: 'low', high: 'high' }, compat: { supportsReasoningEffort: true } },
    additionalModels: [{ id: 'second-model', name: '第二模型', input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high' }, compat: { supportsReasoningEffort: true } }],
  });
  const { page } = f, editor = page.locator('[data-composer-input]');
  await newChat(page);
  const preset = page.locator('[data-slot="conversation.hero.agentPreset"]').getByRole('button');
  await preset.click();
  await page.getByRole('menuitem', { name: /^标准模式/ }).click();
  await until(async () => await preset.innerText() === '标准模式');
  await page.getByRole('button', { name: '模型与思考强度', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '模型与思考强度', exact: true });
  await panel.getByRole('button', { name: '界面预览模型', exact: true }).click();
  await panel.getByRole('option', { name: '第二模型', exact: true }).click();
  const slider = panel.getByRole('slider', { name: '思考强度' });
  await until(() => slider.isEnabled());
  await slider.press('End');
  await until(async () => await slider.getAttribute('aria-valuetext') === '高');
  await slider.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  await editor.fill('保留完整草稿和模型选项');
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#3978e7' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles([
    { name: 'projectless.png', mimeType: 'image/png', buffer: image },
    { name: 'projectless-note.txt', mimeType: 'text/plain', buffer: Buffer.from('Carry this file into the new working directory.\n') },
  ]);
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  await page.locator('[data-composer-card]').getByText('projectless-note.txt', { exact: true }).waitFor();
  const draft = await editor.innerText();
  await clearWorkspace(page);
  assert.equal(await editor.innerText(), draft);
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  await page.locator('.omd-projectless-trigger').click();
  await page.getByRole('menuitem', { name: 'workspace', exact: true }).click();
  await page.locator('.omd-workspace-clear').waitFor({ state: 'attached' });
  assert.equal(await editor.innerText(), draft, 'choosing the project again preserves the complete semantic draft');
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  await clearWorkspace(page);
  const source = await currentSession(page);
  const sourceMode = await page.request.get(new URL('trisoul-x/api/model-mode?session=' + source, page.url()).href).then(response => response.json());
  assert.equal(sourceMode.selected.model, 'second-model');
  assert.equal(sourceMode.selected.reasoningEffort, 'high');
  assert.equal(sourceMode.mode, 'off');
  assert.equal(await exists(f.projectlessRoot), false);
  let sent, targetUpload;
  await page.route('**/api/session/uploadFileBinary?*', route => {
    if (new URL(route.request().url()).searchParams.get('sessionId') === source) return route.continue();
    targetUpload = route;
  });
  t.after(() => targetUpload?.abort().catch(() => {}));
  await page.route('**/api/session/prompt', route => { sent = route.request().postDataJSON(); return route.continue(); });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await until(() => targetUpload);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(sent, undefined, 'first admission waits for file receipts belonging to the target');
  assert.equal(await currentSession(page), source, 'the source stays reachable while the target upload is pending');
  assert.equal(await editor.innerText(), draft);
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  const upload = targetUpload; targetUpload = null;
  await upload.continue();
  await until(() => sent);
  const target = sent.payload.args.request.sessionId;
  assert.notEqual(target, source);
  assert.match(JSON.stringify(sent), /"type":"image"/);
  assert.equal(sent.payload.args.request.content.some(block => block.type === 'file' && typeof block.receiptId === 'string'), true);
  await idle(f, target);
  const projections = await f.rpc('session/projections', { sessionId: target });
  assert.equal(projections.values.agentPreset, 'standard');
  const targetMode = await page.request.get(new URL('trisoul-x/api/model-mode?session=' + target, page.url()).href).then(response => response.json());
  assert.deepEqual(targetMode.selected, sourceMode.selected);
  assert.equal(targetMode.mode, sourceMode.mode);
  await until(async () => await editor.innerText() === '' && await page.locator('[data-composer-card] img').count() === 0);
  assert.equal((await summary(f, source)).blank, true);
  assertInside(f.projectlessRoot, (await summary(f, target)).cwd);
  assert.deepEqual(f.errors, []);
});

test('failed projectless preparation and native admission preserve attachments and reuse allocation on retry', { timeout: 120000 }, async t => {
  const f = await fixture(t), { page } = f, editor = page.locator('[data-composer-input]');
  await newChat(page);
  await clearWorkspace(page);
  const source = await currentSession(page);
  await editor.fill('创建失败后重试');
  const image = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#249657' } }).png().toBuffer();
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: image });
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  let held;
  const attempts = [], sent = [];
  await page.route('**/trisoul-x/api/projectless-workspace', route => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) { held = route; return; }
    return route.continue();
  });
  t.after(() => held?.abort().catch(() => {}));
  await page.route('**/api/session/prompt', route => { sent.push(route.request().postDataJSON()); return route.continue(); });
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await until(() => held);
  await until(async () => await editor.getAttribute('contenteditable') === 'false');
  await page.keyboard.press('Enter');
  assert.equal(attempts.length, 1, 'the pending submission is single flight');
  assert.equal(sent.length, 0);
  const failing = held; held = null;
  await failing.fulfill({ status: 503, json: { error: '测试：独立目录暂不可用，请重试' } });
  await page.getByText('测试：独立目录暂不可用，请重试', { exact: true }).waitFor();
  await until(async () => await editor.getAttribute('contenteditable') === 'true');
  assert.equal(await editor.innerText(), '创建失败后重试');
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  assert.equal(await currentSession(page), source);
  assert.equal(await exists(f.projectlessRoot), false);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await until(() => sent.length === 1);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].requestId, attempts[0].requestId, 'retry addresses the same chat allocation');
  const target = sent[0].payload.args.request.sessionId;
  assert.notEqual(target, source);
  assert.match(JSON.stringify(sent[0]), /"type":"image"/);
  await idle(f, target);
  assertInside(f.projectlessRoot, (await summary(f, target)).cwd);
  await until(async () => await currentSession(page) === target);
  await newChat(page);
  await page.locator('.omd-projectless-trigger').waitFor();
  const secondSource = await currentSession(page);
  await editor.fill('宿主发送失败后保持可恢复');
  await page.locator('[data-composer-card] input[type="file"]').setInputFiles({ name: 'admission-retry.png', mimeType: 'image/png', buffer: image });
  await until(async () => await page.locator('[data-composer-card] img').count() === 1);
  const admissions = [];
  await page.unroute('**/api/session/prompt');
  await page.route('**/api/session/prompt', route => {
    admissions.push(route.request().postDataJSON());
    return admissions.length === 1 ? route.abort('failed') : route.continue();
  });
  await editor.press('Enter');
  await until(() => admissions.length === 1);
  await until(async () => await editor.getAttribute('contenteditable') === 'true');
  assert.equal(await currentSession(page), secondSource, 'a refused native admission keeps the original draft selected');
  assert.equal(await editor.innerText(), '宿主发送失败后保持可恢复');
  assert.equal(await page.locator('[data-composer-card] img').count(), 1);
  const failedTarget = admissions[0].payload.args.request.sessionId;
  assert.equal((await summary(f, failedTarget)).blank, true);
  const foldersAfterFailure = await chatDirectories(f.projectlessRoot);
  await editor.press('Enter');
  await until(() => admissions.length === 2);
  assert.equal(admissions[1].payload.args.request.sessionId, failedTarget, 'native admission retry reuses the preallocated target');
  assert.equal(attempts[3].requestId, attempts[2].requestId);
  await idle(f, failedTarget);
  await until(async () => await currentSession(page) === failedTarget);
  assert.deepEqual(await chatDirectories(f.projectlessRoot), foldersAfterFailure, 'native admission failure allocates no extra directory on retry');
  assert.deepEqual(f.errors, []);
});
