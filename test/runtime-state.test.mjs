import { sourceName } from '../src/message-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { collectRuntimeStatus, runtimeContext, runtimeStateKey, renderRuntimeState } from '../src/runtime-state.mjs';
import { createTodoStore } from '../src/todolist.mjs';
import { setRuntimeContext, latestTodo, summaryMessageReader } from '../src/task-context.mjs';
function fixture() {
  const session = Session.create('runtime', undefined, { version: 4, id: 'runtime', createdAt: 1, cwd: '/tmp', isSeeded: false, agentPreset: 'trisoul-x' });
  const config = { stateHintsEnabled: true }; const jobs = [];
  const agent = { session }, hub = { config: () => config, context: { state: () => ({ records: [] }) }, ctx: { get: () => ({ list: () => jobs }), tokenMeter: { measure: () => ({ totalTokens: 123 }) } } };
  return { session, config, jobs, agent, hub, store: createTodoStore() };
}
test('runtime coordinates use the host step before its start event, never the event sequence', () => {
  const f = fixture();
  f.session.append('turn/start', { turn: 1 });
  for (let i = 0; i < 6; i++) f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'setup' }], source: { kind: 'plugin', plugin: 'fixture' } }), { surfaceOp: 'append' });
  const first = collectRuntimeStatus(f.agent, f.hub, { turn: 1, step: 1 });
  assert.equal(first.asOfSeq, 6);
  assert.match(renderRuntimeState(first), /turn 1 · step 1\]/);
  assert.doesNotMatch(renderRuntimeState(first), /event 6/);
  f.session.append('step/start', { turn: 1, step: 1 });
  f.session.append('step/end', { turn: 1, step: 1 });
  const next = collectRuntimeStatus(f.agent, f.hub, { turn: 1, step: 2 });
  assert.equal(next.step, 2, 'pre-step must not display the previous ended step');
  assert.equal(runtimeStateKey(first), runtimeStateKey(next), 'step changes do not increase injection frequency');
  f.session.append('step/start', { turn: 1, step: 2 });
  assert.equal(collectRuntimeStatus(f.agent, f.hub).step, 2, 'tool queries read the active host step');
  f.session.append('turn/end', { turn: 1 });
  f.session.append('turn/start', { turn: 2 });
  assert.equal(collectRuntimeStatus(f.agent, f.hub).step, null, 'a new turn must not inherit the previous turn step');
  assert.match(renderRuntimeState(collectRuntimeStatus(f.agent, f.hub, { turn: 2, step: 1 })), /turn 2 · step 1\]/);
});
test('state sampling distinguishes estimates and job delivery from actual results', () => {
  const f = fixture(), start = f.session.append('turn/start', { turn: 1 });
  const status = collectRuntimeStatus(f.agent, f.hub, { now: start.time + 42000 });
  assert.equal(status.turnWallElapsedMs, 42000); assert.equal(status.context.retainedTokensEstimate, 123);
  assert.equal(status.context.lastRequest, null); assert.equal(status.jobsAvailable, true);
  f.jobs.push({ id: 'old', kind: 'bash', label: 'probe', status: 'completed', reported: true, startedAt: 1 });
  const fresh = collectRuntimeStatus(f.agent, f.hub);
  assert.equal(fresh.jobs[0].resultDelivery, 'unknown');
  assert.equal(runtimeStateKey(fresh), runtimeStateKey({ ...fresh, sampledAt: 'later', asOfSeq: 999, turnWallElapsedMs: 9999, context: { ...fresh.context, retainedTokensEstimate: 567 } }));
  const withRequest = seq => ({ ...fresh, context: { ...fresh.context, lastRequest: { provider: 'fixture', model: 'fixture', window: 128000, seq } } });
  assert.equal(runtimeStateKey(withRequest(1)), runtimeStateKey(withRequest(2)), 'an unchanged route does not repost state each model step');
  assert.equal(runtimeStateKey(withRequest(1)), runtimeStateKey({ ...withRequest(2), context: { ...withRequest(2).context, lastRequest: { provider: 'fixture', model: 'changed', window: 128000, seq: 2 } } }));
  assert.ok(Buffer.byteLength(renderRuntimeState({ ...fresh, jobs: Array.from({ length: 30 }, (_, i) => ({ ...fresh.jobs[0], id: '汉字'.repeat(1000) + i })) })) <= 2048);
});
test('without Todo, state injects once without creating tasks and disabling clears only its own carrier', () => {
  const f = fixture();
  setRuntimeContext(f.session, () => runtimeContext(f.agent, f.hub));
  const original = createUserMessage({ content: [{ type: 'text', text: 'REAL_USER_TEXT' }], source: { kind: 'user' } });
  f.session.append('user/message', original, { surfaceOp: 'append' });
  assert.ok(f.store.maintainInjection(f.session));
  assert.equal(f.store.maintainInjection(f.session), undefined);
  assert.equal(latestTodo(f.session), null);
  assert.equal(f.session.snapshotEvents().filter(e => e.type === 'todo/write').length, 0);
  const reader = summaryMessageReader(f.session);
  assert.equal(f.session.surface.nodes.map(s => reader(f.session.eventAt(s))).filter(Boolean).length, 1);
  f.config.stateHintsEnabled = false;
  f.store.maintainInjection(f.session);
  assert.deepEqual(f.session.deriveMessages().filter(m => m.content.length), [original]);
  assert.equal(f.store.maintainInjection(f.session), undefined);
});
test('only actual new input changes the runtime delivery key', () => {
  const f = fixture();
  const initial = collectRuntimeStatus(f.agent, f.hub);
  const changed = { ...initial, jobsAvailable: false, jobs: [{ id: 'new', status: 'completed', detail: 'changed', resultDelivery: 'full' }],
    context: { ...initial.context, automaticReplace: false, records: { raw: 5, detail: 3, brief: 1 } },
    changeKey: { ...initial.changeKey, turn: 44, preset: 'trisoul-x-ptc', records: [['record', 7, 'brief', 99]] } };
  assert.equal(runtimeStateKey(initial), runtimeStateKey(changed));
  const input = createUserMessage({ content: [{ type: 'text', text: 'Continue.' }], source: { kind: 'user' } });
  const pending = collectRuntimeStatus(f.agent, f.hub, { messages: [input] });
  assert.notEqual(runtimeStateKey(initial), runtimeStateKey(pending));
  const original = f.session.append('user/message', input, { surfaceOp: 'append' });
  assert.equal(runtimeStateKey(pending), runtimeStateKey(collectRuntimeStatus(f.agent, f.hub)));
  f.session.append('user/message', { ...input, id: 'rewritten' }, { surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq }, sourceEventSeqs: [original.seq] });
  assert.equal(runtimeStateKey(pending), runtimeStateKey(collectRuntimeStatus(f.agent, f.hub)));
});
test('enabling, new input and a missing carrier refresh once; turns, jobs and replay do not', () => {
  const f = fixture(); let messages = [];
  setRuntimeContext(f.session, () => runtimeContext(f.agent, f.hub, { messages }));
  f.config.stateHintsEnabled = false;
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.config.stateHintsEnabled = true;
  assert.ok(f.store.maintainInjection(f.session));
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.session.append('turn/start', { turn: 2 });
  f.jobs.push({ id: 'job', status: 'running', kind: 'bash', startedAt: 1 });
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.jobs[0].status = 'completed'; f.jobs[0].resultDelivery = 'full'; f.jobs[0].detail = 'new output';
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.jobs.length = 0;
  assert.equal(f.store.maintainInjection(f.session), undefined);
  messages = [createUserMessage({ content: [{ type: 'text', text: 'A new request.' }], source: { kind: 'user' } })];
  const update = f.store.maintainInjection(f.session); assert.ok(update);
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.session.append('user/message', messages[0], { surfaceOp: 'append' }); messages = [];
  assert.equal(f.store.maintainInjection(f.session), undefined);
  const replay = Session.create(f.session.id, structuredClone(f.session.snapshotEvents()), f.session.header);
  setRuntimeContext(replay, () => runtimeContext({ session: replay }, f.hub));
  assert.equal(createTodoStore().maintainInjection(replay), undefined);
  for (const e of f.session.snapshotEvents().filter(e => sourceName(e.data?.source) === 'trisoul-x:tasks')) {
    f.session.append('user/message', createUserMessage({ content: [], source: { kind: 'plugin', plugin: 'fixture:removed' } }),
      { surfaceOp: { op: 'replace', startSeq: e.seq, endSeq: e.seq }, sourceEventSeqs: [e.seq] });
  }
  assert.ok(f.store.maintainInjection(f.session));
  assert.equal(f.store.maintainInjection(f.session), undefined);
});
test('state changes do not repost Todo, preserve pause, and survive restart', () => {
  const f = fixture(); f.session.append('turn/start', { turn: 1 });
  f.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Build the widget.' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  assert.ok(!f.store.execTaskMap(f.session, { op: 'excerpt', from: 'Build the widget', to: 'Build the widget', tasks: [{ title: 'Implement', anchor: { from: 'Build the widget', to: 'Build the widget' } }] }).isError);
  setRuntimeContext(f.session, () => runtimeContext(f.agent, f.hub)); f.store.maintainInjection(f.session);
  f.store.execTaskMap(f.session, { op: 'pause_turn', reason: 'Server unavailable; start server.' });
  const saved = f.store.snapshot(f.session);
  f.jobs.push({ id: 'j1', kind: 'bash', label: 'test', status: 'running', startedAt: 1 });
  const before = f.session.snapshotEvents().length;
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.jobs[0].status = 'completed'; f.jobs[0].resultDelivery = 'delivered';
  assert.equal(f.store.maintainInjection(f.session), undefined);
  assert.equal(f.session.snapshotEvents().length, before);
  assert.deepEqual(f.store.snapshot(f.session), saved); assert.equal(f.store.turnControl(f.session).paused, true);
  assert.ok(!f.store.execTaskMap(f.session, { op: 'edit', tasks: [{ id: 'T1', title: 'Implement updated widget' }] }).isError);
  const updated = f.store.maintainInjection(f.session);
  assert.ok(updated);
  assert.match(JSON.stringify(updated.data), /completed/);
  assert.equal(f.store.maintainInjection(f.session), undefined);
  f.config.stateHintsEnabled = false; f.store.maintainInjection(f.session);
  assert.doesNotMatch(JSON.stringify(f.session.deriveMessages()), /runtime state/);
  assert.match(JSON.stringify(f.session.deriveMessages()), /\[ \] T1 Implement/);
  const replay = Session.create('runtime', structuredClone(f.session.snapshotEvents()), f.session.header);
  const revived = createTodoStore(); assert.equal(revived.maintainInjection(replay), undefined);
  assert.deepEqual(replay.deriveMessages(), f.session.deriveMessages());
});
