import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { newRecord, userMessages } from '../src/context/core.mjs';
let deps, missing;
try {
  const [sessions, llm, host] = await Promise.all([import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-llm'), import('../src/context/host.mjs')]);
  deps = { ...sessions, ...llm, ...host };
} catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; missing = error.message; }

test('native DSH 0.1.6: prepared replacement, exposed trace, tool pairing and replay', { skip: missing ? 'Native DSH dependencies unavailable: ' + missing : false }, async t => {
  const { Session, createMessage, createUserMessage, createSystemMessage, createToolResultMessage, createHostAdapter } = deps;
  const dir = mkdtempSync(join(tmpdir(), 'native-context-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('native-context', undefined, { version: 3, id: 'native-context', createdAt: Date.now(), cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('System', 'test') }, { surfaceOp: 'append' });
  const reminder = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Track tasks using the user requirements.' }], source: { kind: 'plugin', plugin: 'trisoul-x:task-reminder' } }), { surfaceOp: 'append' });
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Exact requirement 9007199254740993' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const a = session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'reasoning', text: 'Previous provider-exposed analysis.' }, { type: 'tool-call', id: 'native-call', name: 'read', arguments: '{}' }] }) }, { surfaceOp: 'append' });
  const b = session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: 'native-call', content: [{ type: 'text', text: 'original data '.repeat(1500) }], isError: false }) }, { surfaceOp: 'append' });
  const hub = { store: { dir }, config: () => ({ flushIdleMs: 0, keepTailEvents: 0 }), scope: () => ({ mode: 'session', project: dir }), action() {}, call() { throw Error('No model should be called'); }, ctx: { sessions: { async flush() {} }, tokenMeter: { measure(s) { return { nodes: s.surface.nodes.map(seq => ({ seq, heuristicTokens: 100 })) }; } } } };
  const pipeline = new ContextPipeline(hub, createHostAdapter(hub)); const state = pipeline.state(session); const before = userMessages(session);
  state.records.push(newRecord(session, [reminder], { summary: 'Legacy host reminder', documents: [] }, state.binding));
  state.records.push(newRecord(session, [a, b], { summary: 'Read source.', documents: [{ title: 'Identifier', text: '9007199254740993 is a string.' }] }, state.binding)); pipeline.store.save(state);
  const result = await pipeline.applyReady({ session }, { manual: true, sourceCommandId: 'test-command' });
  assert.ok(session.surface.nodes.includes(reminder.seq));
  assert.ok(result.compactionId); assert.ok(result.shadowedTokenCount > 0);
  assert.deepEqual(userMessages(session), before);
  assert.match(JSON.stringify(session.deriveMessages()), /Previous provider-exposed analysis/);
  const replay = Session.create(session.id, JSON.parse(JSON.stringify(session.snapshotEvents())), session.header);
  assert.deepEqual(replay.deriveMessages(), session.deriveMessages());
  assert.match(pipeline.recall(session, { id: state.records[1].id }), /9007199254740993/);
  pipeline.dispose();
});

test('native whole-window detail carries real image block shapes; brief removes them and replay remains valid', { skip: missing ? missing : false }, async t => {
  const { Session, createMessage, createUserMessage, createSystemMessage, createToolResultMessage, createHostAdapter } = deps;
  const dir = mkdtempSync(join(tmpdir(), 'native-materials-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('native-materials', undefined, { version: 3, id: 'native-materials', createdAt: Date.now(), cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Protected system', 'test') }, { surfaceOp: 'append' });
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Exact requirement 用户原话' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'tool-call', id: 'image-call', name: 'read', arguments: '{}' }] }) }, { surfaceOp: 'append' });
  const image = { type: 'image', attachment: { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', bytes: 100, width: 10, height: 10, name: 'fixture.png' } };
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: 'image-call', content: [{ type: 'text', text: 'Observed result. '.repeat(1000) }, image], isError: false }) }, { surfaceOp: 'append' });
  const hub = { store: { dir }, config: () => ({ flushIdleMs: 0, keepTailEvents: 0, traceEnabled: false, coordinatorEvery: 999 }), scope: () => ({ mode: 'session', project: dir }), action() {},
    async call() { return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Requirement 用户原话 retained; read completed.', documents: [] } }] }; },
    ctx: { sessions: { async flush() {} }, tokenMeter: { measure(s) { return { nodes: s.surface.nodes.map(seq => ({ seq, heuristicTokens: 100 })) }; } } } };
  const pipeline = new ContextPipeline(hub, createHostAdapter(hub)); t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle' }; await pipeline.prepare(agent, true);
  const state = pipeline.state(session), id = state.records[0].id;
  await pipeline.applyReady(agent, { manual: true, ids: [id], mode: 'detail' });
  assert.ok(session.deriveMessages().some(m => m.content.some(b => b.type === 'image')));
  await pipeline.applyReady(agent, { manual: true, ids: [id], mode: 'brief' });
  assert.ok(!session.deriveMessages().some(m => m.content.some(b => b.type === 'image')));
  assert.deepEqual(pipeline.recallContent(session, { id, asset: 1 })[1].attachment, image.attachment);
  const replay = Session.create(session.id, JSON.parse(JSON.stringify(session.snapshotEvents())), session.header);
  assert.deepEqual(replay.deriveMessages(), session.deriveMessages());
});
