import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createMessage, createToolResultMessage, createSystemMessage } from '@deepseek-ai/dsh-llm';
import { Hub, SCRIBE, message, eventText } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { Canvas, selectRegion } from '../src/canvas.mjs';
import { Config } from '../src/config.mjs';
import { registerTasks, currentTasks } from '../src/tasks.mjs';
import { MAIN_PERSONA, MEMORY_CONSTITUTION, SURGEON_SYSTEM, OPS_DESC, TASK_GUIDE, TASK_VERIFY_GUIDE } from '../src/prompts.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-core-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new HubStore(dir), config = Config({ minRegionTokens: 100, keepTailEvents: 4 });
  const hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => config, jobs: new Map(), controllers: new Map(), pending: new Set(), ctx: { logger: { warn() {} } } });
  const session = Session.create('test', undefined, { version: 3, id: 'test', createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  const agent = { session, options: { provider: 'test', model: 'test' } };
  const ctx = { tokenMeter: { measure(s) { const nodes = s.surface.nodes.map(seq => ({ seq, heuristicTokens: Math.ceil(eventText(s, s.eventAt(seq)).length / 4) })); return { nodes, totalTokens: nodes.reduce((n, e) => n + e.heuristicTokens, 0) }; } } };
  const canvas = Object.assign(Object.create(Canvas.prototype), { ctx, hub, busy: new Set() });
  return { store, hub, session, agent, canvas, config, dir };
}
function addTurns(session, count = 8, splitUsers = true) {
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('System identity.', 'test') }, { surfaceOp: 'append' });
  for (let i = 1; i <= count; i++) {
    session.append('turn/start', { turn: i });
    if (i === 1 || splitUsers) session.append('user/message', createUserMessage({ content: [{ type: 'text', text: `Constraint ${i}` }], source: { kind: 'user' } }), { surfaceOp: 'append' });
    session.append('assistant/message', { turn: i, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'tool-call', id: `c${i}`, name: 'read', arguments: '{}' }] }) }, { surfaceOp: 'append' });
    session.append('tool/result', { turn: i, step: 1, message: createToolResultMessage({ callId: `c${i}`, content: [{ type: 'text', text: `ORIGINAL_${i} ${'material '.repeat(500)}` }], isError: false }) }, { surfaceOp: 'append' });
    session.append('step/end', { turn: i, step: 1 });
    session.append('turn/end', { turn: i, reason: { kind: 'completed' } });
  }
}
const condensed = { blocks: [{ type: 'text', text: 'Done: read source material. Not yet done: finish the task.' }], provider: 'test', model: 'test' };

test('original persona passages, memory constitution and surgeon remain intact', () => {
  const original = JSON.parse(readFileSync(new URL('./fixtures/prompt-origin.json', import.meta.url), 'utf8'));
  const a = original.personas.align.split('\n\n'), b = original.personas.erudite.split('\n\n'), c = original.personas.empiric.split('\n\n');
  const autonomy = b[2].replace("The user is not watching in real time and cannot answer questions mid-task, so asking 'Want me to…?' or 'Shall I…?' will block the work. ", '');
  for (const passage of [a[0], a[3], a[4], b[0], b[1], autonomy, b[5], c[5]]) assert.ok(MAIN_PERSONA.includes(passage));
  assert.equal(MEMORY_CONSTITUTION, original.constitution); assert.equal(SURGEON_SYSTEM, original.surgeon);
  assert.deepEqual(OPS_DESC, { ...original.ops, ops: original.ops.ops.replace(' (the curation job cleans it up)', '') });
  assert.ok(!SCRIBE.includes('Output JSON (JSON only)'));
  assert.ok(TASK_GUIDE.includes(original.todo.replace("The todo list's completion marker. ", '').replace(' (remove:[ids])', '').replace('your draft.', 'your reply.')));
  for (const paragraph of original.verify.split('\n\n').slice(2, 4)) assert.ok(TASK_VERIFY_GUIDE.includes(paragraph));
});

test('one task snapshot holds requirement, progress and verification across turns and replay', async t => {
  const { session, agent, hub } = setup(t); let tool, projection;
  registerTasks({ tools: { register(value) { tool = value; } }, sessionProjections: { register(value) { projection = value; } } });
  session.append('turn/start', { turn: 1 });
  const todos = [{ content: 'Complete the fixture.', status: 'in_progress', source: 'My original requirement.', verification: { method: 'Read actual fixture.txt.' } }];
  await tool.execute({ todos }, { agent }); hub.observe(session, session.snapshotEvents().at(-1));
  todos[0] = { ...todos[0], status: 'completed', verification: { ...todos[0].verification, result: 'Read fixture.txt: 42.' } };
  await tool.execute({ todos }, { agent }); hub.observe(session, session.snapshotEvents().at(-1));
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } }); session.append('turn/start', { turn: 2 });
  assert.deepEqual(projection.apply(todos, { type: 'turn/start' }), todos);
  const replay = Session.create(session.id, session.snapshotEvents(), session.header);
  assert.deepEqual(currentTasks(replay), todos);
  hub.publish(agent); assert.ok(session.deriveMessages().some(m => JSON.stringify(m).includes('Read fixture.txt: 42.')));
  // A missing verification record remains visible as missing; it is not a programmatic completion gate.
  await tool.execute({ todos: [{ content: 'A completed task without a recorded check.', status: 'completed' }] }, { agent });
  assert.equal(currentTasks(session)[0].status, 'completed');
});

test('memory scope, atomic batches, versions, restoration and per-session usage survive reload', t => {
  const { store, dir } = setup(t);
  store.memoryOps(dir, [{ op: 'add', scope: 'global', key: 'language', text: 'Chinese' }, { op: 'add', scope: 'project', key: 'file', text: 'a.txt' }]);
  const old = store.memories(dir).find(m => m.key === 'file');
  store.edit(old.id, { text: 'b.txt' }); store.restore(old.id);
  assert.deepEqual(store.memories(dir, 'project').map(m => m.text), ['a.txt']);
  assert.equal(store.allMemories().filter(m => m.key === 'file').length, 3);
  assert.equal(store.memories('/different', 'project').length, 0);
  assert.equal(store.memories('/different', 'full').length, 1);
  assert.throws(() => store.memoryOps(dir, [{ op: 'add', key: 'pending', text: 'invalid batch' }, { op: 'invalid' }]));
  const active = store.memories(dir, 'project')[0];
  store.touch([active.id], 'injected', 'one'); store.touch([active.id], 'recalled', 'two');
  const reloaded = new HubStore(dir);
  assert.equal(reloaded.memories(dir).length, 2);
  assert.deepEqual(reloaded.memories(dir, 'project')[0].usage.sessions, ['one', 'two']);
  store.memoryOps('session:a', [{ op: 'add', scope: 'global', key: 'private', text: 'session memory' }], 'scribe', 'session');
  assert.equal(store.memories('session:a', 'session').length, 1); assert.equal(store.memories('session:b', 'session').length, 0);
});

test('session scope binding is inherited by nested subagents and does not change with default', t => {
  const { hub, store, session, config } = setup(t); store.state(session.id).memoryScope = 'session';
  store.state('child').parentSession = session.id;
  const child = { id: 'grandchild', header: { parentSession: 'child', cwd: '/other' } };
  config.memoryScope = 'full'; assert.deepEqual(hub.scope(child), { mode: 'session', project: 'session:test' });
});

test('failed or incomplete background commits leave the cursor and memory unchanged', async t => {
  const { hub, store, agent, session } = setup(t); addTurns(session, 1);
  hub.call = async () => ({ blocks: [{ type: 'text', text: 'incomplete' }] });
  await hub.schedule(agent, true); assert.equal(store.state(session.id).cursor, -1);
  hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'save_context', arguments: JSON.stringify({ digest: 'Read source', pin: ['Constraint 1'], status: 'Working', compactable: true, nowCompactable: [], ops: [{ op: 'add', scope: 'project', key: 'file', text: 'a.txt', target: '' }] }) }] });
  await hub.schedule(agent, true); const state = store.state(session.id);
  assert.equal(state.digests.length, 1); assert.deepEqual(state.pins, ['Constraint 1']);
  hub.publish(agent); assert.ok(session.deriveMessages().some(m => JSON.stringify(m).includes('Working state')));
  const seq = session.seq; hub.publish(agent); assert.equal(session.seq, seq);
});

test('V3 compaction keeps users/system/tool pairs and original events after replay', async t => {
  const { canvas, hub, session, agent, store, config } = setup(t); addTurns(session);
  hub.call = async () => condensed;
  const range = selectRegion(session, store.state(session.id), config, true);
  assert.ok(range); const result = await canvas.compactRegion(range.start, range.end, agent, new AbortController().signal);
  const replay = Session.create(session.id, JSON.parse(JSON.stringify(session.snapshotEvents())), session.header);
  assert.ok(result.shadowedTokenCount > 0); assert.ok(replay.surface.replaceGeneration > 0);
  assert.equal(replay.deriveMessages().filter(m => m.source.kind === 'user').length, 8);
  assert.equal(replay.deriveMessages().filter(m => m.role === 'system').length, 1);
  assert.match(eventText(replay, replay.eventAt(range.end)), /ORIGINAL_1/);
  const pending = new Set();
  for (const m of replay.deriveMessages()) for (const b of m.content) {
    if (b.type === 'tool-call') pending.add(b.id);
    if (b.type === 'tool-result') { assert.ok(pending.has(b.toolCallId)); pending.delete(b.toolCallId); }
  }
  assert.equal(pending.size, 0);
});

test('semantic release selects old checkpoints by surface position, not their newer event seq', async t => {
  const { canvas, hub, session, agent, store, config } = setup(t); addTurns(session, 8, false);
  const state = store.state(session.id); state.digests.push({ id: 1, from: 0, to: session.seq - 1, compactable: false, release: [] });
  assert.equal(selectRegion(session, state, config), null);
  state.digests.push({ id: 2, from: session.seq, to: session.seq, compactable: false, release: [1] });
  assert.ok(selectRegion(session, state, config)); hub.call = async () => condensed;
  const firstCall = session.snapshotEvents().find(e => e.type === 'assistant/message');
  const firstResult = session.snapshotEvents().find(e => e.type === 'tool/result');
  await canvas.compactRegion(firstCall.seq, firstResult.seq, agent, new AbortController().signal);
  const cp = session.surface.nodes.find(seq => session.eventAt(seq).data.source?.compactionId);
  const cpPosition = session.surface.nodes.indexOf(cp);
  assert.ok(cp > session.surface.nodes[cpPosition + 1]);
  assert.equal(selectRegion(session, state, config, true).start, cp);
});

test('failed surgery preserves surface and closes the V3 lifecycle once', async t => {
  const { canvas, hub, session, agent, store, config } = setup(t); addTurns(session);
  const before = [...session.surface.nodes], range = selectRegion(session, store.state(session.id), config, true);
  hub.call = async () => { throw Error('provider disconnected'); };
  await assert.rejects(canvas.compactRegion(range.start, range.end, agent, new AbortController().signal), /disconnected/);
  assert.deepEqual(session.surface.nodes, before);
  assert.equal(session.snapshotEvents().filter(e => e.type === 'compaction/end').length, 1);
  Session.create(session.id, session.snapshotEvents(), session.header);
});
