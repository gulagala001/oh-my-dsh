import { sourceName } from '../src/message-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, createMessage, createUserMessage, createSystemMessage, createToolResultMessage, markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { newRecord } from '../src/context/core.mjs';
import { withoutMovedReasoning, installTraceCleanup } from '../src/context/trace.mjs';

function setup(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'trace-context-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('trace-test', undefined, { version: 4, id: 'trace-test', createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('System', 'test') }, { surfaceOp: 'append' });
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Complete the task.' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const hub = { store: { dir }, config: () => ({ flushIdleMs: 0, ...config }), scope: () => ({ mode: 'session', project: dir }), action() {},
    ctx: { sessions: { async flush() {} } }, call() { throw Error('No model call expected'); } };
  const pipeline = new ContextPipeline(hub, createHostAdapter(hub)); t.after(() => pipeline.dispose());
  const state = pipeline.state(session);
  const assistant = (content, extraSource = {}) => session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test', ...extraSource }, content }) }, { surfaceOp: 'append' });
  const record = () => {
    const event = assistant([{ type: 'text', text: 'Old completed work. '.repeat(800) }]);
    const r = newRecord(session, [event], { summary: 'Old work done.', documents: [] }, state.binding);
    state.records.push(r); return r;
  };
  const apply = r => pipeline.applyReady({ session }, { manual: true, ids: [r.id], mode: 'brief' });
  const wire = () => withoutMovedReasoning(session.deriveMessages(), session, state.traceSlot);
  return { session, pipeline, state, assistant, record, apply, wire };
}

test('native Trace move removes source reasoning only; tool pair, text and immutable log survive', async t => {
  const f = setup(t), r = f.record();
  const content = [{ type: 'reasoning', text: 'Move this trace.' }, { type: 'text', text: 'Running a tool.' }, { type: 'tool-call', id: 'call-1', name: 'write', arguments: '{"path":"x"}' }];
  const source = f.assistant(content, { replayState: { oldReasoning: 'Move this trace.' } });
  const result = f.session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: 'call-1', content: [{ type: 'text', text: 'Write succeeded.' }], isError: false }) }, { surfaceOp: 'append' });
  const original = JSON.stringify(f.session.snapshotEvents());
  await f.apply(r);
  const messages = f.wire();
  assert.deepEqual(messages.find(m => m.id === source.data.message.id).content, content.slice(1));
  assert.equal(messages.find(m => m.id === source.data.message.id).source.replayState, undefined);
  assert.deepEqual(messages.find(m => m.id === result.data.message.id), result.data.message);
  assert.equal(JSON.stringify(messages).split('Move this trace.').length - 1, 1);
  assert.equal(JSON.stringify(f.session.snapshotEvents().slice(0, JSON.parse(original).length)), original);
  assert.deepEqual(f.session.eventAt(source.seq).data.message.content, content);
  assert.ok(f.pipeline.adapter.pairing.after(f.session, result.seq));
  const replay = Session.create(f.session.id, JSON.parse(JSON.stringify(f.session.snapshotEvents())), f.session.header);
  const restored = new ContextPipeline(f.pipeline.hub, createHostAdapter(f.pipeline.hub)); t.after(() => restored.dispose());
  assert.deepEqual(withoutMovedReasoning(replay.deriveMessages(), replay, restored.state(replay).traceSlot), messages);
});

test('successive moves keep prior originals removed, omit reasoning-only messages, and preserve fresh reasoning', async t => {
  const f = setup(t, { traceMaxChars: 4 }), r = f.record();
  const first = f.assistant([{ type: 'reasoning', text: 'first-TAIL' }]); await f.apply(r);
  assert.ok(!f.wire().some(m => m.id === first.data.message.id));
  assert.match(JSON.stringify(f.wire()), /TAIL/); assert.doesNotMatch(JSON.stringify(f.wire()), /first-/);
  const r2 = f.record(), second = f.assistant([{ type: 'reasoning', text: 'second-NEXT' }, { type: 'text', text: 'Visible answer' }]);
  await f.apply(r2);
  const fresh = f.assistant([{ type: 'reasoning', text: 'New reasoning stays.' }]);
  const messages = f.wire();
  assert.ok(!messages.some(m => m.id === first.data.message.id));
  assert.deepEqual(messages.find(m => m.id === second.data.message.id).content, [{ type: 'text', text: 'Visible answer' }]);
  assert.deepEqual(messages.find(m => m.id === fresh.data.message.id), fresh.data.message);
  assert.deepEqual(f.state.traceSlot.movedSourceSeqs, [first.seq, second.seq]);
});

test('no removal without the actual prefix; disabled Trace and already compressed sources remain valid', async t => {
  const f = setup(t, { traceEnabled: false }), r = f.record();
  const source = f.assistant([{ type: 'reasoning', text: 'Must stay.' }]); await f.apply(r);
  assert.deepEqual(f.wire().find(m => m.id === source.data.message.id), source.data.message);
  const g = setup(t), gRecord = g.record();
  g.assistant([{ type: 'reasoning', text: 'Move me.' }, { type: 'text', text: 'Answer' }]); await g.apply(gRecord);
  const withoutPrefix = g.session.deriveMessages().filter(m => sourceName(m.source) !== 'trisoul-x:trace');
  assert.equal(withoutMovedReasoning(withoutPrefix, g.session, g.state.traceSlot), withoutPrefix);
  const h = setup(t), event = h.assistant([{ type: 'reasoning', text: 'Covered trace.' }, { type: 'text', text: 'Data '.repeat(3000) }]);
  const covered = newRecord(h.session, [event], { summary: 'Done.', documents: [] }, h.state.binding); h.state.records.push(covered);
  await h.apply(covered);
  assert.equal(JSON.stringify(h.wire()).split('Covered trace.').length - 1, 1);
  assert.deepEqual(h.state.traceSlot.movedSourceSeqs, []);
});

test('native runtime accepts frozen requests through direct/prepared streams and restores on disposal', async t => {
  const f = setup(t), r = f.record(), source = f.assistant([{ type: 'reasoning', text: 'Old reasoning' }, { type: 'text', text: 'Answer' }]); await f.apply(r);
  delete f.state.traceSlot.movedSourceSeqs;
  const ctx = new Context(), runtime = new LlmRuntime(ctx);
  let managed = true, dispose, received, observed;
  const registration = runtime.registerAdapter(['test'], {
    providerInfo: id => ({ id, name: id }), providerRetryPolicy: () => undefined,
    async prepareCall() { return { model: { provider: 'test', id: 'test', name: 'Test' }, async *stream(options) { received = options; yield { type: 'finish', reason: { kind: 'stop' } }; } }; },
  });
  t.after(registration);
  ctx.on('llm/stream', async function* (options, next) { observed = options; yield* next(); });
  const originalStream = runtime.stream, originalPrepare = runtime.prepareCall;
  installTraceCleanup({ llm: runtime, effect(fn) { dispose = fn(); }, sessions: { get: () => f.session } }, () => managed, f.pipeline);
  t.after(() => dispose());
  const send = async (marked = true, prepared = false) => {
    const options = Object.freeze({ provider: 'test', model: 'test', sessionId: f.session.id, messages: Object.freeze(f.session.deriveMessages()) });
    if (marked) markAgentLoopRequest(options);
    const call = prepared ? await runtime.prepareCall({ provider: 'test', model: 'test' }) : runtime;
    for await (const chunk of call.stream(options)) assert.equal(chunk.reason.kind, 'stop');
    assert.equal(isAgentLoopRequest(observed), marked);
    assert.ok(Object.isFrozen(observed));
    assert.deepEqual(options.messages.find(m => m.id === source.data.message.id).content, source.data.message.content);
    return received.messages.find(m => m.id === source.data.message.id).content;
  };
  assert.deepEqual(await send(), [{ type: 'text', text: 'Answer' }]);
  assert.deepEqual(await send(true, true), [{ type: 'text', text: 'Answer' }]);
  assert.deepEqual(await send(false), source.data.message.content);
  managed = false; assert.deepEqual(await send(), source.data.message.content);
  managed = true; dispose();
  assert.equal(runtime.stream, originalStream); assert.equal(runtime.prepareCall, originalPrepare);
  assert.deepEqual(await send(), source.data.message.content);
});
