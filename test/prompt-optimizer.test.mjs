import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { optimizationRequest, optimizerRoute, createPromptOptimizer, handlePromptOptimizerApi } from '../src/prompt-optimizer.mjs';
import { DraftOptimizer, createOptimizerPreferences, captureDraft, encodeDraft, decodeDraft, requestOptimization } from '../src/client/prompt-optimizer-state.mjs';

function fixture(request = async () => ({ text: '优化后的草稿' })) {
  const listeners = new Set(), values = new Map();
  const preferences = createOptimizerPreferences({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  let document, state = { draft: '', draftRev: 0, phase: 'plain', attachmentIds: ['file-1'], occurrences: [] };
  const sent = [];
  function write(next) {
    document = structuredClone(next); let draft = '', occurrences = [];
    next.root.children.forEach((paragraph, i) => { if (i) draft += '\n'; for (const child of paragraph.children) {
      if (child.type === 'reference-chip') { occurrences.push({ ...child, offset: draft.length, length: child.clipboardText.length, occurrenceId: occurrences.length }); draft += child.clipboardText; }
      else draft += child.text ?? '';
    } });
    state = { ...state, draft, occurrences, draftRev: state.draftRev + 1 }; listeners.forEach(fn => fn());
  }
  const shell = { state: { getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    editor: { getEditorState: () => ({ toJSON: () => structuredClone(document) }), parseEditorState: value => value, setEditorState: write },
    submit(mode = 'queue') { sent.push({ mode, ...structuredClone(state) }); state = { ...state, attachmentIds: [] }; write(decodeDraft('', []).document); },
  };
  const type = text => write(decodeDraft(text, []).document); type('帮我优化提示词');
  const controller = new DraftOptimizer({ shell, sessionId: 'session-1', preferences, request }); controller.activate();
  return { controller, preferences, shell, sent, type, write, state: () => state, change(patch) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

 test('default entry is visible, auto is opt-in, and failed persistence preserves settings', () => {
  const p = createOptimizerPreferences({ getItem: () => null, setItem: () => { throw Error('disk full'); } });
  assert.deepEqual(p.getSnapshot(), { enabled: true, automatic: false, mode: 'basic' });
  assert.throws(() => p.set({ automatic: true }), /disk full/); assert.equal(p.getSnapshot().automatic, false);
});

test('MIT snapshot is pinned and unmodified; templates render user values only once', () => {
  const base = new URL('../vendor/prompt-optimizer/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('manifest.json', base)));
  for (const [file, info] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, base))).digest('hex'), info.sha256);
  const extracted = JSON.parse(readFileSync(new URL('templates.json', base)));
  for (const [key, file] of Object.entries({ basic: 'user-prompt-basic', structured: 'user-prompt-professional', planning: 'user-prompt-planning', iterate: 'iterate' })) {
    const text = readFileSync(new URL(`templates/${file}.ts`, base), 'utf8');
    assert.deepEqual(extracted[key], [...text.matchAll(/role:\s*'(system|user)'\s*,\s*content:\s*`((?:\\.|[^`])*)`/g)].map(([, role, content]) => ({ role, content })));
  }
  assert.match(readFileSync(new URL('LICENSE', base), 'utf8'), /^MIT License/);
  const input = optimizationRequest({ text: '保留 {{iterateInput}} 字面量', instruction: '更简洁', original: '原始要求', mode: 'structured' });
  assert.match(input.messages[0].content[0].text, /保留 \{\{iterateInput\}\} 字面量/);
  assert.match(input.messages[0].content[0].text, /原始要求/);
  assert.match(input.system, /不要编造预算/);
  assert.throws(() => optimizationRequest({ text: '有效', mode: '__proto__' }), /未知/);
});

test('model selection follows pending user choice, previous route, then host default', () => {
  let pending = { provider: 'chosen', model: 'new' }, previous = { provider: 'old', model: 'old' };
  const ctx = { sessionProjections: { stateOf: () => ({ pending }) }, get: () => ({ currentSelection: () => ({ provider: 'default', model: 'default' }) }) }, session = { requestHeader: () => previous && ({ config: previous }) };
  assert.equal(optimizerRoute(ctx, session).provider, 'chosen'); pending = null;
  assert.equal(optimizerRoute(ctx, session).provider, 'old'); previous = null;
  assert.equal(optimizerRoute(ctx, session).provider, 'default');
});

test('automatic submission uses basic once, retaining steer intent and attachments', async () => {
  const call = deferred(); const requests = [];
  const f = fixture(async (_id, request) => { requests.push(request); return call.promise; });
  f.preferences.set({ automatic: true, mode: 'planning' }); f.shell.submit('steer'); f.shell.submit('steer');
  assert.equal(requests.length, 1); assert.equal(requests[0].mode, 'basic'); assert.equal(f.sent.length, 0);
  call.resolve({ text: '请帮我优化提示词' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].mode, 'steer'); assert.equal(f.sent[0].draft, '请帮我优化提示词'); assert.deepEqual(f.sent[0].attachmentIds, ['file-1']);
  assert.equal(f.controller.state.busy, ''); assert.equal(f.controller.history.length, 0);
});

test('late results never overwrite editing, edit-and-revert, changed attachments, cancellation or switched session', async () => {
  for (const action of ['edit', 'edit-revert', 'attachment', 'cancel', 'deactivate', 'disable']) {
    const call = deferred(), f = fixture(() => call.promise); f.preferences.set({ automatic: true }); const original = f.state().draft;
    f.shell.submit();
    if (action === 'edit') f.type('新的输入');
    if (action === 'edit-revert') { f.type('临时修改'); f.type(original); }
    if (action === 'attachment') f.change({ attachmentIds: ['file-2'] });
    if (action === 'cancel') f.controller.cancel();
    if (action === 'deactivate') f.controller.deactivate();
    if (action === 'disable') f.preferences.set({ automatic: false });
    const expected = f.state().draft; call.resolve({ text: '过期结果' }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.sent.length, 0, action); assert.equal(f.state().draft, expected, action);
    assert.equal(Boolean(f.controller.state.candidate), ['edit', 'edit-revert', 'attachment'].includes(action), action);
  }
});

test('errors retain drafts, and native commands/attachment-only/default sends bypass optimization', async () => {
  const f = fixture(async () => { throw Error('provider failed'); }); f.preferences.set({ automatic: true });
  await f.controller.run({ automatic: true }); assert.equal(f.sent.length, 0); assert.match(f.controller.state.error, /provider failed/);
  f.type('/compact-p'); f.shell.submit(); assert.equal(f.sent[0].draft, '/compact-p');
  f.type(''); f.change({ attachmentIds: ['image'] }); f.shell.submit(); assert.deepEqual(f.sent[1].attachmentIds, ['image']);
  f.preferences.set({ enabled: false }); f.type('原文发送'); f.shell.submit(); assert.equal(f.sent[2].draft, '原文发送');
});

test('references survive rewrites and restores; deleted/duplicated/invented reference markers are rejected', async () => {
  const chip = { type: 'reference-chip', version: 1, source: 'file', ref: '/work/spec.md', clipboardText: '@spec.md', label: 'spec.md', invalid: false };
  const f = fixture(async (_id, request) => ({ text: request.text.replace('分析', '请分析') }));
  const document = decodeDraft('分析 ', []).document; document.root.children[0].children.push(chip); f.write(document);
  const before = captureDraft(f.shell), encoded = encodeDraft(before, 'test');
  assert.throws(() => decodeDraft('引用丢失', encoded.references), /完整保留/);
  assert.throws(() => decodeDraft(encoded.text + encoded.references[0].token, encoded.references), /完整保留/);
  assert.throws(() => decodeDraft('OMDREF_unknown_3_END', []), /未知引用/);
  await f.controller.run(); assert.equal(f.state().draft, '请分析 @spec.md'); assert.equal(f.state().occurrences[0].ref, chip.ref);
  f.controller.selectVersion(0); assert.equal(f.state().draft, before.draft); assert.equal(f.state().occurrences[0].ref, chip.ref);
});

test('iteration uses original plus current manual edits and requirements; undo/redo retain unsaved edits', async () => {
  const requests = []; const f = fixture(async (_id, request) => { requests.push(request); return { text: requests.length === 1 ? '第一版' : '第二版' }; });
  await f.controller.run(); f.type('手动调整'); await f.controller.run({ instruction: '更精简' });
  assert.equal(requests[1].original, '帮我优化提示词'); assert.equal(requests[1].text, '手动调整'); assert.equal(requests[1].instruction, '更精简');
  f.controller.selectVersion(0); f.type('另一个手动调整'); f.controller.selectVersion(3);
  assert.equal(f.state().draft, '第二版'); assert.ok(f.controller.history.some(v => v.draft === '另一个手动调整'));
  f.controller.selectVersion(0); assert.equal(f.state().draft, '帮我优化提示词');
});

test('unmount restores native submit and cancels work without disturbing a later wrapper', () => {
  const f = fixture(); f.controller.deactivate(); f.preferences.set({ automatic: true }); f.shell.submit(); assert.equal(f.sent.length, 1);
  f.controller.activate(); const replacement = () => {}; f.shell.submit = replacement; f.controller.dispose(); assert.equal(f.shell.submit, replacement);
});

test('optimizer timeout aborts even an uncooperative provider and releases its active slot', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let returned = false;
  const ctx = { sessionProjections: { stateOf: () => ({ pending: { provider: 'test', model: 'test' } }) }, llm: { resolveModelInfo: async () => ({}), stream: () => ({ [Symbol.asyncIterator]() { return this; }, next: () => new Promise(() => {}), return: async () => { returned = true; return { done: true }; } }) } };
  const records = [], hub = { live: new Map(), record: (...args) => records.push(args) }, service = createPromptOptimizer(ctx, hub, { timeoutMs: 100 });
  const session = { id: 'test' }, work = service.optimize(session, { text: '草稿' }); const failed = assert.rejects(work, /超时/);
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(100); await failed;
  assert.equal(hub.live.size, 0); assert.equal(returned, true); assert.equal(records.length, 1); service.dispose();
});

test('model output cannot turn a normal prompt into an executable slash command', async () => {
  const f = fixture(async () => ({ text: '  /clear' })); f.preferences.set({ automatic: true });
  await f.controller.run({ automatic: true }); assert.equal(f.sent.length, 0); assert.equal(f.state().draft, '帮我优化提示词'); assert.match(f.controller.state.error, /变成了命令/);
});

test('a later plugin wrapper can retain our old submit closure after optimizer disposal', () => {
  const f = fixture(), wrapped = f.shell.submit; f.preferences.set({ automatic: true });
  f.shell.submit = mode => wrapped(mode); f.controller.dispose(); f.shell.submit('queue');
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].draft, '帮我优化提示词');
});

test('request authentication happens before session access or model work', async () => {
  for (const status of [401, 403]) {
    let code, ended = false;
    assert.equal(await handlePromptOptimizerApi({ ctx: { get: () => ({ requestRejection: () => status }) }, req: { method: 'POST' }, res: { writeHead: value => { code = value; }, end: () => { ended = true; } }, url: new URL('http://localhost/trisoul-x/api/prompt-optimizer'), getSession: () => assert.fail('read session before authentication') }), true);
    assert.equal(code, status); assert.equal(ended, true);
  }
});

test('old backend 404 explains required restart while missing-session errors retain their meaning', async t => {
  for (const body of [JSON.stringify({ error: '接口不存在' }), '<html>Not Found</html>']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 404 }));
    await assert.rejects(requestOptimization('s', { text: '草稿' }), /后端尚未加载.*重启当前 DSH 服务/);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: '会话不可用，请先选择工作目录' }, { status: 404 }));
  await assert.rejects(requestOptimization('s', { text: '草稿' }), /会话不可用/);
});
