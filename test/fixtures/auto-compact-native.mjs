import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { Session } from '@deepseek-ai/dsh-session';
import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Real host SDK, compaction adapter, pipeline, transaction and ContextStore.
// Only token estimates, model boundary and outer session-service flush are controlled.
export async function nativeCompactionFixture({ root = repositoryRoot, nodes = 300, records = 30 } = {}) {
  if (![nodes, records].every(Number.isSafeInteger) || records < 1 || nodes < records) throw Error('Invalid fixture size');
  const load = file => import(pathToFileURL(resolve(root, file)).href);
  const [{ ContextPipeline }, { createHostAdapter }, { newRecord }, { ContextStore }] = await Promise.all([
    load('src/context/pipeline.mjs'), load('src/context/host.mjs'), load('src/context/core.mjs'), load('src/context/store.mjs'),
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'omd-native-auto-index-'));
  let pipeline;
  try {
    const session = Session.create('native-auto-index');
    const user = session.append('user/message', createUserMessage({ source: { kind: 'user' },
      content: [{ type: 'text', text: 'Preserve this user constraint and every original event.' }] }), { surfaceOp: 'append' });
    const sources = Array.from({ length: nodes }, (_, i) => session.append('assistant/message', { turn: 1, step: i + 1, stream: [],
      message: createMessage({ id: `source-${i}`, role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'offline-fixture' },
        content: [{ type: 'text', text: `Observation ${i}: ` + 'Recorded evidence remains available. '.repeat(30) }] }) }, { surfaceOp: 'append' }));
    const original = structuredClone(session.snapshotEvents());
    const originalHash = digest(original);
    const estimate = value => Math.ceil(JSON.stringify(value.deriveMessages()).length / 4);
    const threshold = Math.floor(estimate(session) / 2);
    let modelCalls = 0, flushes = 0;
    const hub = { store: { dir: directory }, scope: () => ({ mode: 'session', project: 'native-auto-index' }),
      config: () => ({ contextEnabled: false, traceEnabled: false, autoCompactEnabled: true,
        autoCompactMode: 'brief', autoCompactThreshold: threshold }), action() {}, event() {},
      ctx: { sessions: { async flush() { flushes++; } }, tokenMeter: { measure: value => ({ totalTokens: estimate(value), nodes: [] }) } },
      async call() { modelCalls++; throw Error('Offline fixture must not call a model'); } };
    pipeline = hub.context = new ContextPipeline(hub, createHostAdapter(hub));
    const agent = { session, status: 'idle', async runMaintenance(run) { return run(new AbortController().signal); } };
    pipeline.agents.set(session.id, agent);
    const state = pipeline.state(session);
    for (let i = 0; i < records; i++) {
      const batch = sources.slice(Math.floor(i * nodes / records), Math.floor((i + 1) * nodes / records));
      const record = newRecord(session, batch, { summary: `Summary ${i}: recorded observations retained.`, documents: [] }, state.binding, { state });
      record.id = `record-${i}`; state.records.push(record);
    }
    pipeline.store.save(state);
    const nodesBefore = session.surface.nodes.length;
    return { session, pipeline, agent, state, directory, nodesBefore,
      async run() {
        const start = performance.now();
        const outcome = await pipeline.autoCompact.check(agent);
        const wallMs = performance.now() - start;
        assert.equal(outcome?.source, 'auto-compact', JSON.stringify({ auto: state.autoCompact, failures: state.failures }));
        assert.equal(outcome.operations.filter(op => op.kind === 'record').length, records);
        assert.equal(modelCalls, 0); assert.ok(flushes > 0);
        assert.equal(digest(session.snapshotEvents().slice(0, original.length)), originalHash);
        assert.ok(session.surface.nodes.includes(user.seq));
        assert.equal(state.records.length, records);
        assert.ok(state.records.every(record => record.mode === 'brief'));
        assert.equal(state.transaction, null);
        assert.equal(pipeline.jobs.size, 0); assert.equal(pipeline.controllers.size, 0); assert.equal(pipeline.manualSessions.size, 0);
        const recovered = new ContextStore(directory).state(session.id);
        assert.deepEqual(recovered.records, state.records);
        assert.equal(recovered.transaction, null);
        assert.equal(recovered.autoCompact.lastKey, state.autoCompact.lastKey);
        const replay = Session.create(session.id, structuredClone(session.snapshotEvents()), session.header);
        assert.deepEqual(replay.deriveMessages(), session.deriveMessages());
        assert.deepEqual(replay.surface.nodes, session.surface.nodes);
        const afterEvents = session.snapshotEvents().length;
        assert.equal(await pipeline.autoCompact.check(agent), null);
        assert.equal(session.snapshotEvents().length, afterEvents); assert.equal(modelCalls, 0);
        return { wallMs, nodesBefore, records, nodesAfter: session.surface.nodes.length, originalEvents: original.length,
          originalEventsPreserved: true, coldContextArchiveMatches: true, nativeSessionReplayMatches: true, modelCalls, sessionFlushCalls: flushes,
          completedRecordsHash: digest(recovered.records.map(({ id, mode, summary, documents, sourceSeqs }) => ({ id, mode, summary, documents, sourceSeqs }))) };
      },
      async close() { try { await pipeline.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } },
    };
  } catch (error) {
    try { await pipeline?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
}
