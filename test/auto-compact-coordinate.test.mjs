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

for (const scenario of ['accumulating', 'due', 'interrupted', 'pending']) test('Auto Compact preserves the coordinator turn: ' + scenario, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-auto-coordinate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('auto-coordinate');
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep this user request.' }] }), { surfaceOp: 'append' });
  const original = session.append('assistant/message', { turn: 1, step: 1,
    message: { id: 'source', role: 'assistant', source: { kind: 'model', model: 'fixture' }, content: [{ type: 'text', text: 'Recorded observations. '.repeat(600) }] } }, { surfaceOp: 'append' });
  const before = structuredClone(session.snapshotEvents()), ready = Promise.withResolvers(), calls = [];
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'auto-coordinate' }),
    config: () => ({ contextEnabled: true, traceEnabled: false, autoCompactEnabled: true, autoCompactThreshold: 1000, coordinatorEvery: 4, coordinatorMinGapMs: 0 }),
    action() {}, event() {},
    ctx: { sessions: { async flush() {} }, tokenMeter: { measure(value) { return { totalTokens: Math.ceil(JSON.stringify(value.deriveMessages()).length / 4), nodes: [] }; } } },
    async call(_agent, kind, request, signal) {
      calls.push(kind);
      if (kind === 'prepare') return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Recorded observations retained.', documents: [] } }] };
      assert.equal(pipeline.manualSessions.has(session.id), false, 'Review starts only after Auto Compact releases its exclusion');
      if (scenario === 'interrupted' && calls.filter(kind => kind === 'coordinate').length === 1) {
        ready.resolve();
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      }
      const input = JSON.parse(request.messages[0].content[0].text);
      assert.ok(input.records.every(record => record.representation === 'detail'), 'Review reads the replaced surface, not the cancelled raw input');
      return { blocks: [{ type: 'tool-call', name: 'submit_context_choices', arguments: { choices: [] } }] };
    } };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle' };
  pipeline.agents.set(session.id, agent);
  const state = pipeline.state(session);
  state.review.newRecords = scenario === 'accumulating' ? 2 : scenario === 'due' ? 3 : 0;
  state.review.needed = true;
  let interrupted;
  if (scenario === 'interrupted' || scenario === 'pending') {
    state.records.push(newRecord(session, [original], { summary: 'Prepared observations.', documents: [] }, state.binding, { state, wholeWindow: true }));
    if (scenario === 'pending') state.pending = { source: 'coordinator', choices: [] };
    else { interrupted = pipeline.coordinate(agent, true); await ready.promise; }
  }
  await pipeline.autoCompact.check(agent);
  await interrupted;
  await pipeline.jobs.get(session.id + ':coordinate');
  assert.deepEqual(session.snapshotEvents().slice(0, before.length), before, 'Original events and user input stay archived');
  assert.ok(state.records.filter(record => !record.mergedInto).every(record => record.mode === 'detail'), JSON.stringify({ autoCompact: state.autoCompact, failures: state.failures, records: state.records.map(({ mode, sourceSeqs, mergedInto }) => ({ mode, sourceSeqs, mergedInto })) }));
  if (scenario === 'accumulating') {
    assert.deepEqual(calls, ['prepare']);
    assert.equal(state.review.newRecords, 3, 'Threshold maintenance must not reset ordinary review progress');
    assert.equal(state.review.needed, true);
  } else {
    assert.equal(calls.filter(kind => kind === 'coordinate').length, scenario === 'interrupted' ? 2 : 1);
    assert.ok(state.pending, 'A due or interrupted review is resubmitted without another preparation batch');
    assert.equal(state.review.newRecords, 0);
  }
  const settled = [...calls];
  await pipeline.autoCompact.check(agent);
  assert.deepEqual(calls, settled, 'An unchanged successful pass must not repeat preparation or review');
});
