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
import { MemoryContext } from '../src/memory-context.mjs';
import { StateZone } from '../src/state-zone.mjs';
import { ensureSystemHead } from '../src/system-head.mjs';
import { Config } from '../src/config.mjs';
import { TASK_DESCRIPTION, VERIFICATION_DESCRIPTION } from '../src/tasks.mjs';
import { MAIN_PERSONA, MEMORY_CONSTITUTION, SURGEON_SYSTEM, OPS_DESC, CURATE_RULES, DIGEST_DESC } from '../src/prompts.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-core-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new HubStore(dir), config = Config({ minRegionTokens: 100, keepTailEvents: 4, minRegionEvents: 2, flushIdleMs: 0, probeEnabled: false });
  const hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => config, jobs: new Map(), controllers: new Map(), pending: new Set(), ctx: { logger: { warn() {} } } });
  hub.memoryContext = new MemoryContext(hub); hub.stateZone = new StateZone(hub); hub.resumed = new Set(); hub.idleTimers = new Map(); hub.agents = new Map();
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

test('system slot precedes startup context and old sessions are repaired once without changing text', t => {
  const { session } = setup(t);
  assert.equal(ensureSystemHead(session, { turn: 1, step: 1 }), true);
  const slot = session.surface.nodes[0];
  session.append('user/message', message('Opening memory', 'memory'), { surfaceOp: 'append' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Original system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: { op: 'replace', startSeq: slot, endSeq: slot }, sourceEventSeqs: [slot] });
  assert.equal(session.deriveMessages()[0].role, 'system');
  const before = session.seq;
  assert.equal(ensureSystemHead(session, { turn: 1, step: 2 }), false);
  assert.equal(session.seq, before);

  const old = Session.create('old', undefined, { ...session.header, id: 'old' });
  for (const text of ['Todo reminder', 'Opening memory', 'Task memory']) old.append('user/message', message(text), { surfaceOp: 'append' });
  old.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Original system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: 'append' });
  old.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'User request' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const original = old.deriveMessages();
  ensureSystemHead(old, { turn: 2, step: 1 });
  assert.deepEqual(old.deriveMessages(), [original[3], ...original.slice(0, 3), original[4]]);
  const repaired = old.seq;
  ensureSystemHead(old, { turn: 2, step: 2 });
  assert.equal(old.seq, repaired);
  assert.deepEqual(Session.create(old.id, old.snapshotEvents(), old.header).deriveMessages(), old.deriveMessages());
  old.append('system/message', { turn: 2, step: 2, message: createSystemMessage('Updated system text.', '@deepseek-ai/dsh-system-prompt') }, { surfaceOp: 'append' });
  const inHistory = [...old.surface.nodes];
  ensureSystemHead(old, { turn: 2, step: 3 });
  assert.deepEqual(old.surface.nodes, inHistory, 'later in-history system updates are not moved');
});

test('original persona passages, memory constitution and surgeon remain intact', () => {
  const original = JSON.parse(readFileSync(new URL('./fixtures/prompt-origin.json', import.meta.url), 'utf8'));
  const a = original.personas.align.split('\n\n'), b = original.personas.erudite.split('\n\n'), c = original.personas.empiric.split('\n\n');
  for (const passage of [a[0], a[3], a[4], a[5], b[0], b[1], b[2], c[5]]) assert.ok(MAIN_PERSONA.includes(passage));
  assert.equal(MEMORY_CONSTITUTION, original.constitution); assert.equal(SURGEON_SYSTEM, original.surgeon);
  assert.deepEqual(OPS_DESC, original.ops);
  assert.equal(CURATE_RULES, original.curate);
  assert.equal(DIGEST_DESC.overlap, original.overlap); assert.equal(DIGEST_DESC.conflict, original.conflict);
  assert.ok(!SCRIBE.includes('Output JSON (JSON only)'));
  // Task definition and completion remain merged; verification keeps its complete original prompt.
  const taskText = TASK_DESCRIPTION.replace(/\s+/g, ' ');
  for (const passage of [
    original.taskMap.slice(0, original.taskMap.indexOf(' Keep the list honest')),
    original.taskMap.slice(original.taskMap.indexOf('Each task'), original.taskMap.indexOf(' op:transcript')),
    original.taskMap.slice(original.taskMap.indexOf('op:transcript'), original.taskMap.indexOf(' op:view')),
    original.todo.slice(original.todo.indexOf('Decide'), original.todo.indexOf(' Remove a task')),
  ]) assert.ok(taskText.includes(passage.replace(/\s+/g, ' ')), passage);
  assert.equal(VERIFICATION_DESCRIPTION, original.verify);
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
  hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'save_context', arguments: JSON.stringify({ digest: 'Read source', workdoc: '', phaseClosed: false, compactable: true, nowCompactable: [], signals: { overlap: false, conflict: false }, ops: [{ op: 'add', scope: 'project', key: 'file', text: 'a.txt', target: '' }] }) }] });
  await hub.schedule(agent, true); const state = store.state(session.id);
  assert.equal(state.digests.length, 1); assert.deepEqual(state.pins, []);
  hub.call = async () => ({ blocks: [{ type: 'tool-call', name: 'save_state', arguments: { pin: ['Constraint 1'], status: 'Working' } }] });
  await hub.stateZone.distill(agent, session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source.kind === 'user'), new AbortController().signal);
  assert.deepEqual(state.pins, ['Constraint 1']);
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

test('tool-shaped compaction output preserves the original surface; quoted failure evidence remains usable', async t => {
  const { canvas, hub, session, agent, store, config } = setup(t); addTurns(session);
  const range = selectRegion(session, store.state(session.id), config, true), before = [...session.surface.nodes];
  const xml = '<tool_call><function=todo_write><parameter=op>view</parameter></function></tool_call>';
  for (const blocks of [
    [{ type: 'text', text: xml }],
    [{ type: 'text', text: 'I will continue the task. ' + xml }],
    [{ type: 'text', text: '```xml\n' + xml + '\n```' }],
    [{ type: 'text', text: 'Done: read the source.' }, { type: 'tool-call', name: 'todo_write', id: 'bad-summary-call', arguments: '{"op":"view"}' }],
  ]) {
    hub.call = async () => ({ ...condensed, blocks });
    await assert.rejects(canvas.compactRegion(range.start, range.end, agent, new AbortController().signal), /工具调用/);
    assert.deepEqual(session.surface.nodes, before);
    assert.equal(store.state(session.id).checkpoint, undefined);
  }
  assert.equal(session.snapshotEvents().filter(e => e.type === 'compaction/summary').length, 0);
  const evidence = 'Errors: the provider emitted this as text and the call failed:\n```xml\n' + xml + '\n```\nNot yet done: retry the task.';
  hub.call = async () => ({ ...condensed, blocks: [{ type: 'text', text: evidence }] });
  await canvas.compactRegion(range.start, range.end, agent, new AbortController().signal);
  assert.equal(store.state(session.id).checkpoint.text, evidence);
  Session.create(session.id, session.snapshotEvents(), session.header);
});
