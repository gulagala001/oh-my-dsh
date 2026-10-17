import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { newRecord } from '../src/context/core.mjs';

for (const lifecycle of ['released', 'replaced', 'retained']) test('a coordinator waiting for preparation respects the ' + lifecycle + ' agent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-coordinate-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('coordinate-release');
  const user = text => session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' });
  const add = id => session.append('assistant/message', { turn: 1, step: 1,
    message: { id, role: 'assistant', source: { kind: 'model', model: 'isolated' }, content: [{ type: 'text', text: 'Recorded findings. '.repeat(300) }] } }, { surfaceOp: 'append' });
  user('Keep the original user request.');
  const original = add('existing'), ready = Promise.withResolvers(), late = Promise.withResolvers(), calls = [];
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'release-test' }),
    config: () => ({ contextEnabled: true, traceEnabled: false, keepTailEvents: 0, prepareContinueTokens: 1, coordinatorMinGapMs: 0, coordinatorEvery: 1 }),
    action() {}, event() {}, ctx: { sessions: { async flush() {} } },
    async call(_agent, kind) {
      calls.push(kind);
      if (kind === 'prepare') { ready.resolve(); return late.promise; }
      return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] };
    } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle' };
  pipeline.agents.set(session.id, agent);
  const state = pipeline.state(session), record = newRecord(session, [original], { summary: 'Earlier findings.', documents: [] }, state.binding, { state });
  state.records.push(record); state.review.newRecords = 1;
  add('fresh');
  const preparing = pipeline.prepare(agent, true);
  await ready.promise;
  const reviewing = pipeline.coordinate(agent, true);
  user('Keep this new input arriving while preparation is running.');
  const before = structuredClone(session.snapshotEvents());
  let disposed;
  if (lifecycle !== 'retained') {
    disposed = pipeline.dispose(session.id);
    if (lifecycle === 'replaced') pipeline.agents.set(session.id, { session, status: 'idle' });
  }
  late.resolve({ blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Late summary.', documents: [] } }] });
  await Promise.all([preparing, reviewing, disposed]);
  assert.deepEqual(session.snapshotEvents(), before, 'Background preparation never overwrites user input or original events');
  if (lifecycle === 'retained') {
    assert.deepEqual(calls, ['prepare', 'coordinate']);
    assert.ok(state.pending);
  } else {
    assert.deepEqual(calls, ['prepare'], 'A released or superseded agent must not launch a new call after its wait');
    assert.equal(state.records.length, 1, 'A cancelled late preparation must not publish a record');
    assert.equal(state.pending, null);
  }
  assert.deepEqual(state.failures, {});
});
