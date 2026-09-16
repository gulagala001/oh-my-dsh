import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { newRecord, normalizeChoices, userRevision, coordinatorInput, liveSpan } from '../src/context/core.mjs';
import { registerContextCommands } from '../src/context/commands.mjs';
import { FixtureSession, user, plugin, system, exchange, adapter } from './context-fixture.mjs';

function setup(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'compact-modes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = new FixtureSession(); system(session); user(session, 'Keep exact ID 9007199254740993.');
  const calls = [], cfg = { keepTailEvents: 30, digestEvery: 9999, flushIdleMs: 0, contextEnabled: false, ...config };
  const hub = { store: { dir }, config: () => cfg, scope: () => ({ mode: 'session', project: '/p' }),
    ctx: { logger: { warn() {} } }, action() {}, async call(_a, kind, request) {
      calls.push({ kind, request });
      return { blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'Keep ID 9007199254740993. Read completed; inspect the remaining issue.' } }] };
    } };
  const pipeline = new ContextPipeline(hub, adapter), state = pipeline.state(session);
  t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle', options: {}, runMaintenance: fn => fn(new AbortController().signal) };
  const add = name => {
    const r = newRecord(session, exchange(session), { summary: name + ' completed.', documents: [{ title: 'Detail', text: name + ' PRIVATE_DETAIL '.repeat(50) }] }, state.binding);
    state.records.push(r); pipeline.store.save(state); return r;
  };
  return { session, hub, pipeline, agent, state, calls, add, cfg,
    run: (operation, options) => pipeline.requestCompaction(session, agent, operation, options) };
}
const text = f => JSON.stringify(f.session.deriveMessages());

test('compact-p converts every prepared raw/detail record, ignores pending keep, leaves unprepared and user content', async t => {
  const f = setup(t); const a = f.add('A'), b = f.add('B');
  await f.pipeline.applyReady(f.agent, { manual: true, ids: [a.id], retainTrace: false });
  const tail = exchange(f.session, 'UNPREPARED_TAIL '.repeat(50));
  f.state.pending = { id: 'old', userRevision: userRevision(f.session), choices: normalizeChoices({ choices: [{ action: 'keep', ids: [b.id], summary: '', documents: [] }] }, f.state, f.session) };
  const out = await f.run('processed');
  assert.equal(out.changed, true); assert.equal(out.result.operations.length, 2);
  assert.ok(f.state.records.every(r => r.mode === 'brief'));
  assert.doesNotMatch(text(f), /PRIVATE_DETAIL/); assert.match(text(f), /UNPREPARED_TAIL|9007199254740993/);
  assert.ok(tail.every(e => f.session.surface.nodes.includes(e.seq)));
  assert.match(f.pipeline.recall(f.session, { id: a.id }), /PRIVATE_DETAIL/);
  assert.equal(f.calls.length, 0); assert.equal((await f.run('processed')).changed, false);
});

test('compact-f needs no prepared records, covers users/tools/catalog/trace and ignores keepTailEvents', async t => {
  const f = setup(t); const original = exchange(f.session, undefined, 'OLD_EXPOSED_REASONING');
  plugin(f.session, 'OLD_PROJECT_CATALOG', 'project-catalog');
  const fixed = plugin(f.session, 'USER_WRITTEN_BACKGROUND', 'manual-global');
  system(f.session); user(f.session, 'Latest correction: ID must remain a string.'); exchange(f.session);
  const nodes = [...f.session.surface.nodes];
  const out = await f.run('full');
  assert.equal(out.changed, true); assert.deepEqual(f.calls.map(c => c.kind), ['compactFull']);
  const input = JSON.parse(f.calls[0].request.messages[0].content[0].text);
  assert.ok(input.conversation.some(e => e.role === 'user' && e.text.includes('Latest correction')));
  assert.match(JSON.stringify(input), /OLD_EXPOSED_REASONING|OLD_PROJECT_CATALOG/);
  assert.doesNotMatch(JSON.stringify(input), /USER_WRITTEN_BACKGROUND/);
  assert.ok(f.session.surface.nodes.includes(fixed.seq));
  assert.equal(f.session.deriveMessages().filter(m => m.role === 'system').length, 2);
  assert.doesNotMatch(text(f), /OLD_EXPOSED_REASONING|OLD_PROJECT_CATALOG|Original source material/);
  assert.equal(f.state.traceSlot, null); assert.equal(f.state.records[0].kind, 'full'); assert.deepEqual(f.state.records[0].documents, []);
  assert.ok(liveSpan(f.session, f.state.records[0]));
  assert.ok(nodes.every(seq => f.session.eventAt(seq)), 'the archive is never deleted');
  assert.match(f.pipeline.recall(f.session, { from: original[1].seq, to: original[1].seq }), /Original source material/);
  const coordinator = coordinatorInput(f.session, f.state, f.pipeline.config());
  assert.deepEqual(coordinator.user_messages, []); assert.match(coordinator.compacted_conversation, /9007199254740993/);
});

test('full compaction archives old prepared records and subsequent compaction does not resurrect old trace', async t => {
  const f = setup(t); const a = f.add('A'); exchange(f.session, undefined, 'SHOULD_NOT_RESURFACE');
  await f.run('processed'); await f.run('full');
  assert.ok(f.state.records.find(r => r.id === a.id).mergedInto);
  assert.match(f.pipeline.recall(f.session, { id: a.id }), /PRIVATE_DETAIL/);
  const b = f.add('New'); await f.pipeline.applyReady(f.agent, { manual: true, ids: [b.id], mode: 'brief' });
  assert.doesNotMatch(text(f), /SHOULD_NOT_RESURFACE/);
  exchange(f.session); await f.run('full');
  assert.equal(f.state.records.filter(r => !r.mergedInto).length, 1);
  assert.equal(f.calls.length, 2);
});

for (const [label, reply] of [
  ['empty', { blocks: [] }],
  ['oversized', { blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'x'.repeat(50000) } }] }],
  ['documents', { blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'A', documents: [] } }] }],
]) test(`invalid ${label} full summary leaves all source and records unchanged`, async t => {
  const f = setup(t); f.add('Source'); const nodes = [...f.session.surface.nodes], records = structuredClone(f.state.records);
  f.hub.call = async () => reply; await assert.rejects(f.run('full'));
  assert.deepEqual(f.session.surface.nodes, nodes); assert.deepEqual(f.state.records, records); assert.equal(f.state.transaction, null);
});

test('a changed conversation invalidates full summary before any replacement', async t => {
  const f = setup(t); f.add('A'); const good = f.hub.call; let release;
  f.hub.call = (...args) => new Promise(resolve => { release = () => resolve(good(...args)); });
  const work = f.run('full'); user(f.session, 'New incoming requirement.'); const nodes = [...f.session.surface.nodes]; release();
  await assert.rejects(work, /已变化/); assert.deepEqual(f.session.surface.nodes, nodes);
});

test('cancellation and duplicate requests do not write or generate twice', async t => {
  const f = setup(t); f.add('A'); const nodes = [...f.session.surface.nodes]; let release;
  f.hub.call = () => new Promise(resolve => { release = () => resolve({ blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: 'Cancelled' } }] }); });
  const controller = new AbortController(), work = f.run('full', { signal: controller.signal });
  assert.equal(f.pipeline.view(f.session).manualOperation, 'full');
  await assert.rejects(f.run('full'), /正在压缩/);
  controller.abort(); release(); await assert.rejects(work);
  assert.deepEqual(f.session.surface.nodes, nodes); assert.equal(f.pipeline.view(f.session).manualOperation, null);
});

test('full compaction refuses dangling tool pairs before calling a model', async t => {
  const f = setup(t); const events = exchange(f.session); f.session.surface.nodes.pop();
  const nodes = [...f.session.surface.nodes]; await assert.rejects(f.run('full'), /工具调用/);
  assert.equal(f.calls.length, 0); assert.deepEqual(f.session.surface.nodes, nodes); assert.ok(events[1]);
});

test('queued modes remain distinct and execute at the next request boundaries', async t => {
  const f = setup(t); f.add('A'); f.agent.status = 'running';
  assert.equal((await f.run('processed')).queued, true); assert.equal((await f.run('full')).queued, true);
  assert.equal(f.state.manualQueue.length, 2); assert.equal(f.calls.length, 0);
  await f.pipeline.preStep(f.agent); assert.equal(f.state.manualQueue.length, 1); assert.equal(f.calls.length, 0);
  exchange(f.session); await f.pipeline.preStep(f.agent); assert.equal(f.state.manualQueue.length, 0); assert.equal(f.calls.length, 1);
});

test('full result survives a flush failure and can resume without another model call', async t => {
  const f = setup(t); f.add('A'); let flushes = 0;
  f.pipeline.adapter = { ...adapter, async flush() { if (++flushes === 1) throw Error('disk unavailable'); } };
  await assert.rejects(f.run('full'), /disk/); assert.ok(f.state.transaction);
  const outcome = await f.run('full'); assert.equal(outcome.changed, true); assert.equal(f.calls.length, 1);
  assert.equal(f.state.transaction, null); assert.equal(f.state.records.filter(r => !r.mergedInto).length, 1);
});

test('opaque attachments are identified, not invented or sent as base64 text', async t => {
  const f = setup(t); const events = exchange(f.session);
  events[1].data.message.content[0].content.push({ type: 'image', data: 'DO_NOT_SERIALIZE_BASE64' });
  await f.run('full'); const request = JSON.stringify(f.calls[0].request);
  assert.match(request, /content not supplied/); assert.doesNotMatch(request, /DO_NOT_SERIALIZE_BASE64/);
  assert.equal(events[1].data.message.content[0].content.at(-1).data, 'DO_NOT_SERIALIZE_BASE64');
});

test('slash registrations validate input and never forward command text to a model', async t => {
  const f = setup(t), registered = new Map(); f.add('A');
  registerContextCommands({ effect: fn => fn(), commands: { register(def) { registered.set(def.name, def); return () => {}; } } }, f.hub);
  f.hub.context = f.pipeline;
  assert.deepEqual([...registered.keys()], ['compact-p', 'compact-f']);
  const args = { agent: f.agent, signal: new AbortController().signal, rawInput: ' extra', commandId: 'test-command' };
  assert.equal((await registered.get('compact-f').handler(args)).kind, 'error'); assert.equal(f.calls.length, 0);
  const out = await registered.get('compact-p').handler({ ...args, rawInput: '' });
  assert.equal(out.kind, 'success'); assert.match(out.text, /1 段/); assert.equal(f.calls.length, 0);
});

test('repeating full compression on its sole checkpoint is a no-op with no new model call', async t => {
  const f = setup(t); f.add('A'); await f.run('full');
  const nodes = [...f.session.surface.nodes]; assert.equal((await f.run('full')).changed, false);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.session.surface.nodes, nodes);
});

test('a queued full transaction recovers at the next boundary without regenerating its summary', async t => {
  const f = setup(t); f.add('A'); f.agent.status = 'running'; let count = 0;
  f.pipeline.adapter = { ...adapter, async flush() { if (++count === 1) throw Error('temporary disk failure'); } };
  await f.run('full'); await assert.rejects(f.pipeline.preStep(f.agent), /disk/);
  assert.equal(f.state.manualQueue.length, 1); assert.ok(f.state.transaction);
  await f.pipeline.preStep(f.agent); assert.equal(f.calls.length, 1); assert.equal(f.state.manualQueue.length, 0);
});

test('manual brief cancels a stale coordinator instead of allowing it to restore documents', async t => {
  const f = setup(t, { contextEnabled: true, coordinatorMinGapMs: 0 }); const a = f.add('A'); let release;
  f.hub.call = () => new Promise(resolve => { release = resolve; });
  const work = f.pipeline.coordinate(f.agent, true); await f.run('processed');
  release({ blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [{ action: 'detail', ids: [a.id], summary: '', documents: [] }] } }] });
  await work; assert.equal(f.state.pending, null); assert.equal(f.state.records[0].mode, 'brief');
  assert.doesNotMatch(text(f), /PRIVATE_DETAIL/);
});


test('a state-save failure always releases the manual maintenance lock', async t => {
  const f = setup(t); f.add('A');
  const save = f.pipeline.store.save.bind(f.pipeline.store);
  f.pipeline.store.save = () => { throw Error('state disk unavailable'); };
  await assert.rejects(f.run('full'), /disk/);
  assert.equal(f.pipeline.manualSessions.has(f.session.id), false);
  assert.equal(f.pipeline.controllers.has(f.session.id + ':manual'), false);
  f.pipeline.store.save = save;
  assert.equal((await f.run('full')).changed, true);
});

test('an attempted tool action is not committed as a full summary', async t => {
  const f = setup(t); f.add('A'); const nodes = [...f.session.surface.nodes];
  f.hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'compact_conversation', arguments: { summary: '<tool_call><function=read>unexecuted</function></tool_call>' } }] });
  await assert.rejects(f.run('full'), /未执行/);
  assert.deepEqual(f.session.surface.nodes, nodes);
});
