import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, LlmAdapter, createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import { createPromptOptimizer, handlePromptOptimizerApi } from '../src/prompt-optimizer.mjs';
import { sendJson } from '../src/http.mjs';
import { DraftOptimizer, createOptimizerPreferences, requestOptimization } from '../src/client/prompt-optimizer-state.mjs';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../vendor/dsh/ui-conversation/lib/client.js', import.meta.url), 'utf8');
// Exercise the shipped editor, submit machine and failure restoration. Only
// the observable store and unused view services are supplied by this harness.
let native;
new Function('window', source.replace('return module.exports;', 'return { SessionInputShell };'))({
  __ModuleLoader__: { load({ factory }) {
    native = factory(name => {
      if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore(value) {
        const listeners = new Set();
        return { getSnapshot: () => value, set(next) { value = next; listeners.forEach(fn => fn()); },
          subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
      } };
      if (name === '@deepseek-ai/dsh-client-ui-primitives' || name === '@deepseek-ai/dsh-client-ui-slots') return {};
      return require(name);
    });
  } },
});

function fixture(t, draft = 'Original draft') {
  const replies = [], sends = [];
  const shell = new native.SessionInputShell({ actx: {}, defaultSink(text, attachmentIds, mode) {
    const result = Promise.withResolvers(); sends.push({ text, attachmentIds, mode, ...result }); return result.promise;
  }, commandAttachments: { serialize: async () => [], release() {}, unsupportedNotice: () => 'unsupported' } });
  const storage = new Map(), preferences = createOptimizerPreferences({
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
  }, null);
  const optimizer = new DraftOptimizer({ shell, sessionId: 'draft-test', preferences, request(_id, input, signal) {
    const result = Promise.withResolvers(); replies.push({ input, signal, ...result }); return result.promise;
  } });
  shell.setDraft(draft); optimizer.activate();
  t.after(() => { optimizer.dispose(); shell.dispose(); preferences.dispose(); });
  async function optimize(text) {
    const running = optimizer.run(); replies.at(-1).resolve({ text }); await running;
  }
  async function failSend({ newerDraft } = {}) {
    shell.submit('steer');
    if (newerDraft !== undefined) shell.setDraft(newerDraft);
    sends.at(-1).resolve({ kind: 'error', text: 'Synthetic admission failure' });
    await new Promise(setImmediate);
  }
  return { shell, optimizer, replies, sends, preferences, optimize, failSend };
}

test('clearing the composer during optimization retains the original beside the pending result', async t => {
  const f = fixture(t), running = f.optimizer.run();
  f.shell.setDraft('');
  f.replies[0].resolve({ text: 'Optimized draft' }); await running;
  assert.equal(f.shell.state.getSnapshot().draft, '');
  assert.equal(f.optimizer.state.candidate.draft, 'Optimized draft');
  f.shell.addAttachments(['new-attachment']);
  assert.equal(f.optimizer.state.candidate?.draft, 'Optimized draft');
  f.optimizer.selectVersion(0);
  assert.equal(f.shell.state.getSnapshot().draft, 'Original draft');
});

test('navigation with a different draft keeps the unaccepted result in its recovery', async t => {
  const f = fixture(t), running = f.optimizer.run();
  f.shell.setDraft('Edited during optimization');
  f.replies[0].resolve({ text: 'Unaccepted result' }); await running;
  const saved = f.optimizer.navigationState(), next = fixture(t, 'Newer draft after navigation');
  next.optimizer.restoreNavigation(saved);
  next.optimizer.inspectRecovery(next.optimizer.state.recoveries[0].id);
  assert.equal(next.shell.state.getSnapshot().draft, 'Newer draft after navigation');
  assert.equal(next.optimizer.state.candidate?.draft, 'Unaccepted result');
  next.optimizer.applyCandidate();
  assert.equal(next.shell.state.getSnapshot().draft, 'Unaccepted result');
});

test('failed admission restores the unaccepted candidate with the draft versions', async t => {
  const f = fixture(t), running = f.optimizer.run();
  f.shell.setDraft('User revision');
  f.replies[0].resolve({ text: 'Unaccepted result' }); await running;
  await f.failSend();
  assert.equal(f.shell.state.getSnapshot().draft, 'User revision');
  assert.equal(f.optimizer.state.candidate?.draft, 'Unaccepted result');
  f.optimizer.selectVersion(0);
  assert.equal(f.shell.state.getSnapshot().draft, 'Original draft');
});

test('inspecting an earlier failed draft does not erase versions ahead of its cursor', async t => {
  const f = fixture(t);
  await f.optimize('Version one'); await f.optimize('Version two');
  f.optimizer.selectVersion(0);
  await f.failSend({ newerDraft: 'Another draft' });
  const current = f.shell.state.getSnapshot().draft;
  f.optimizer.inspectRecovery(f.optimizer.state.recoveries[0].id);
  assert.equal(f.shell.state.getSnapshot().draft, current);
  assert.equal(f.optimizer.state.versions.length, 4);
  f.optimizer.selectVersion(2);
  assert.equal(f.shell.state.getSnapshot().draft, 'Version two');
});

test('switching recovered drafts retains each pending candidate separately', async t => {
  const first = fixture(t), running = first.optimizer.run();
  first.shell.setDraft('First revision');
  first.replies[0].resolve({ text: 'First candidate' }); await running;
  const saved = first.optimizer.navigationState(), next = fixture(t, 'Second original');
  next.optimizer.restoreNavigation(saved);
  const secondRun = next.optimizer.run(); next.shell.setDraft('Second revision');
  next.replies[0].resolve({ text: 'Second candidate' }); await secondRun;
  next.optimizer.inspectRecovery(next.optimizer.state.recoveries[0].id);
  next.optimizer.inspectRecovery(next.optimizer.state.recoveries[0].id);
  assert.equal(next.shell.state.getSnapshot().draft, 'Second revision');
  assert.equal(next.optimizer.state.candidate?.draft, 'Second candidate');
});

test('ordinary optimized sending preserves native steer intent and attachments', async t => {
  const f = fixture(t);
  f.shell.addAttachments(['attachment']); f.preferences.set({ automatic: true });
  f.shell.submit('steer', 'enter');
  f.replies[0].resolve({ text: 'Ready to send' });
  await new Promise(setImmediate);
  assert.deepEqual(f.sends.map(({ text, attachmentIds, mode }) => ({ text, attachmentIds, mode })), [
    { text: 'Ready to send', attachmentIds: ['attachment'], mode: 'steer' },
  ]);
  f.sends[0].resolve({ kind: 'success' }); await new Promise(setImmediate);
  assert.equal(f.optimizer.state.versions.length, 0);
  assert.equal(f.optimizer.state.candidate, null);
});

test('navigation restores the same editing record without replaying a cancelled request', async t => {
  const f = fixture(t), running = f.optimizer.run();
  f.shell.setDraft('');
  const saved = f.optimizer.navigationState(), next = fixture(t, '');
  next.optimizer.restoreNavigation(saved);
  f.replies[0].resolve({ text: 'Late result' }); await running;
  assert.equal(f.replies[0].signal.aborted, true);
  assert.equal(next.replies.length, 0); assert.equal(f.sends.length, 0);
  next.optimizer.selectVersion(0);
  assert.equal(next.shell.state.getSnapshot().draft, 'Original draft');
  assert.equal(next.optimizer.state.candidate, null);
});

test('a recovered result retains reference chips and leaves current attachments with their owner', async t => {
  const f = fixture(t);
  f.shell.restoreDraft({ draft: 'Read @file', attachmentIds: ['first-attachment'], occurrences: [
    { source: 'file', ref: '/synthetic/file.txt', label: 'file', clipboardText: '@file', offset: 5, length: 5 },
  ] });
  const running = f.optimizer.run();
  const token = f.replies[0].input.text.match(/OMDREF_\w+_END/)[0];
  f.shell.setDraft('New draft');
  f.replies[0].resolve({ text: `Please read ${token}` }); await running;
  const saved = f.optimizer.navigationState(), next = fixture(t, 'Current text');
  next.shell.addAttachments(['current-attachment']);
  next.optimizer.restoreNavigation(saved);
  next.optimizer.inspectRecovery(next.optimizer.state.recoveries[0].id);
  next.optimizer.applyCandidate();
  const state = next.shell.state.getSnapshot();
  assert.equal(state.draft, 'Please read @file');
  assert.equal(state.occurrences[0].ref, '/synthetic/file.txt');
  assert.deepEqual(state.attachmentIds, ['current-attachment']);
  next.optimizer.selectVersion(0);
  assert.equal(next.shell.state.getSnapshot().draft, 'Read @file');
  assert.deepEqual(next.shell.state.getSnapshot().attachmentIds, ['current-attachment']);
});

test('recovery keeps the existing 20-version limit and a later explicit clear retires the record', async t => {
  const f = fixture(t);
  for (let i = 1; i <= 22; i++) await f.optimize(`Version ${i}`);
  assert.equal(f.optimizer.state.versions.length, 20);
  f.optimizer.selectVersion(0);
  await f.failSend({ newerDraft: 'Another draft' });
  f.optimizer.inspectRecovery(f.optimizer.state.recoveries[0].id);
  assert.equal(f.optimizer.state.versions.length, 20);
  f.optimizer.selectVersion(0);
  assert.equal(f.shell.state.getSnapshot().draft, 'Original draft');
  f.shell.setDraft('');
  assert.equal(f.optimizer.state.versions.length, 0);
  assert.equal(f.optimizer.state.candidate, null);
});

test('HTTP and native model completion survive navigation recovery without another model call', { timeout: 5000 }, async t => {
  const ctx = new Context(), session = Session.create('draft-test');
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Existing main task' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const originalEvents = structuredClone(session.snapshotEvents()), records = [], requests = [];
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  await ctx.plugin(LlmRuntime);
  class Adapter extends LlmAdapter {
    async *stream(options) {
      requests.push(options); entered.resolve(); await release.promise;
      yield { type: 'text-delta', text: 'HTTP optimized result' };
      yield { type: 'usage', usage: { inputTokens: 12, outputTokens: 4 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['fixture'], new Adapter());
  ctx.provide('sessionProjections', { stateOf: () => ({ pending: { provider: 'fixture', model: 'fixture' } }) });
  ctx.provide('connection', { requestRejection: () => undefined });
  const hub = { live: new Map(), context: { releaseState() {} }, record(_session, _kind, value) { records.push(value); } };
  const service = createPromptOptimizer(ctx, hub);
  const server = createServer((req, res) => {
    void handlePromptOptimizerApi({ ctx, service, req, res, url: new URL(req.url, 'http://localhost'), getSession: () => session, send: sendJson })
      .catch(error => sendJson(res, 500, { error: error.message }));
  });
  t.after(async () => {
    release.resolve(); await service.dispose(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve)); await ctx.fiber.dispose();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (url, init) => originalFetch(new URL(url, `http://127.0.0.1:${server.address().port}/`), init));
  const f = fixture(t); f.optimizer.request = requestOptimization;
  const running = f.optimizer.run({ automatic: true, deliveryMode: 'steer' });
  await entered.promise; f.shell.setDraft('Edited while waiting for HTTP'); release.resolve(); await running;
  assert.equal(f.sends.length, 0);
  const saved = f.optimizer.navigationState(), next = fixture(t, 'Another visible draft');
  next.optimizer.restoreNavigation(saved);
  next.optimizer.inspectRecovery(next.optimizer.state.recoveries[0].id);
  assert.equal(next.optimizer.state.candidate.draft, 'HTTP optimized result');
  next.optimizer.applyCandidate(); next.shell.submit('steer');
  assert.equal(next.sends[0].text, 'HTTP optimized result');
  next.sends[0].resolve({ kind: 'error', text: 'Synthetic admission failure' }); await new Promise(setImmediate);
  next.optimizer.selectVersion(0);
  assert.equal(next.shell.state.getSnapshot().draft, 'Original draft');
  assert.equal(requests.length, 1); assert.equal(isAgentLoopRequest(requests[0]), false);
  assert.deepEqual(requests[0].tools, []); assert.equal(requests[0].messages.length, 1);
  assert.deepEqual(session.snapshotEvents(), originalEvents);
  assert.equal(records.length, 1); assert.equal(records[0].status, 'success'); assert.equal(hub.live.size, 0);
});
