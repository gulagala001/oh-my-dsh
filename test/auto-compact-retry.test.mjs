import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';

for (const failure of ['provider', 'cancel']) test(`Auto Compact retries unchanged material after ${failure} failure`, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-auto-retry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const session = Session.create('auto-compact-retry');
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '保留用户要求。' }] }), { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, message: { id: 'source', role: 'assistant', source: { kind: 'model', model: 'fixture' }, content: [{ type: 'text', text: 'Recorded observations. '.repeat(600) }] } }, { surfaceOp: 'append' });
  const original = structuredClone(session.snapshotEvents()), abort = new AbortController();
  let calls = 0;
  const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'auto-retry' }),
    config: () => ({ contextEnabled: false, traceEnabled: false, autoCompactEnabled: true, autoCompactThreshold: 1000 }),
    action() {}, event() {},
    ctx: { sessions: { async flush() {} }, tokenMeter: { measure(value) { return { totalTokens: 2000 + Math.ceil(JSON.stringify(value.deriveMessages()).length / 4), nodes: [] }; } } },
    async call(_agent, _kind, _request, signal) {
      calls++;
      if (calls === 1) {
        if (failure === 'cancel') { abort.abort(Error('cancelled request')); signal.throwIfAborted(); }
        throw Error('temporarily unavailable');
      }
      return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Recorded observations retained.', documents: [] } }] };
    },
  };
  const pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
  const agent = { session, status: 'idle', async runMaintenance(run) { return run(new AbortController().signal); } };
  pipeline.agents.set(session.id, agent);
  t.after(() => pipeline.dispose());
  const first = pipeline.autoCompact.check(agent, abort.signal);
  if (failure === 'cancel') await assert.rejects(first, /cancelled request/); else assert.equal(await first, null);
  assert.equal(calls, 1);
  assert.deepEqual(session.snapshotEvents(), original, 'A failed preparation must leave the entire conversation unchanged');
  await pipeline.autoCompact.check(agent, new AbortController().signal);
  assert.equal(calls, 2, 'Failure or cancellation must not be recorded as a completed no-progress fingerprint');
  assert.ok(pipeline.state(session).records.some(record => record.mode === 'detail'));
  assert.deepEqual(session.snapshotEvents().slice(0, original.length), original);
  const before = session.snapshotEvents().length;
  await pipeline.autoCompact.check(agent, new AbortController().signal);
  assert.equal(calls, 2, 'A completed unchanged pass must not request another summary');
  assert.equal(session.snapshotEvents().length, before);
});
