import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { newRecord, userMessages, prepareCandidate } from '../src/context/core.mjs';
let deps, missing;
try {
  const [sessions, llm, host] = await Promise.all([import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-llm'), import('../src/context/host.mjs')]);
  deps = { ...sessions, ...llm, ...host };
} catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; missing = error.message; }

test('native DSH V4: prepared replacement, exposed trace, tool pairing and replay', { skip: missing ? 'Native DSH dependencies unavailable: ' + missing : false }, async t => {
  const { Session, createMessage, createUserMessage, createSystemMessage, createToolResultMessage, createHostAdapter } = deps;
  const dir = mkdtempSync(join(tmpdir(), 'native-context-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('native-context', undefined, { version: 4, id: 'native-context', createdAt: Date.now(), cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('System') }, { surfaceOp: 'append' });
  const reminder = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Track tasks using the user requirements.' }], source: { kind: 'plugin:trisoul-x:task-reminder' } }), { surfaceOp: 'append' });
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
  for (const e of replay.snapshotEvents().filter(e => e.type.startsWith('compaction/') || e.type === 'user/message' && e.data.source?.compactionId)) {
    assert.equal(e.data.omdBatchId, result.id, 'one durable batch identity survives native event replay');
  }
  assert.match(pipeline.recall(session, { id: state.records[1].id }), /9007199254740993/);
  pipeline.dispose();
});

test('native whole-window detail carries real image block shapes; brief removes them and replay remains valid', { skip: missing ? missing : false }, async t => {
  const { Session, createMessage, createUserMessage, createSystemMessage, createToolResultMessage, createHostAdapter } = deps;
  const dir = mkdtempSync(join(tmpdir(), 'native-materials-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('native-materials', undefined, { version: 4, id: 'native-materials', createdAt: Date.now(), cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Protected system') }, { surfaceOp: 'append' });
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

test('pressure reserves the selected model output and scales headroom for small windows', async () => {
  const hub = { ctx: { llm: { resolveModelInfo: async () => ({ contextWindow: 8192, defaultMaxTokens: 2048 }) }, tokenMeter: { measure: () => ({ totalTokens: 4000 }) } } };
  const adapter = deps.createHostAdapter(hub), session = {};
  await adapter.prepareRoute(session, { provider: 'fixture', model: 'small' });
  assert.equal(adapter.pressure(session), 4000 / (8192 - 2048 - Math.floor((8192 - 2048) / 10)));
  await adapter.prepareRoute(session, { provider: 'fixture', model: 'small', maxTokens: 1024 });
  assert.equal(adapter.pressure(session), 4000 / (8192 - 1024 - Math.floor((8192 - 1024) / 10)));
});

test('in-turn compaction and later todo edits satisfy the released V4 lifecycle', async () => {
  const {createRequire} = await import('node:module');
  const {pathToFileURL} = await import('node:url');
  const hostRequire=createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const {sessionFormatCatalog:catalog}=await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-session-format-catalog')).href);
  const {Session,createSystemMessage,createUserMessage,createHostAdapter}=deps;
  const session=Session.create('compaction-owner',undefined,{version:4,id:'compaction-owner',delegationDepth:0,createdAt:100,cwd:'/fixture',isSeeded:false,agentPreset:'trisoul-x'});
  session.append('turn/start',{turn:1});
  session.append('step/start',{turn:1,step:1});
  session.append('system/message',{turn:1,step:1,message:createSystemMessage('System')},{surfaceOp:'append'});
  const source=session.append('user/message',createUserMessage({content:[{type:'text',text:'Material'}],source:{kind:'user'}}),{surfaceOp:'append'});
  session.append('step/end',{turn:1,step:1});
  const adapter=createHostAdapter({ctx:{}});
  const checkpoint=adapter.append(session,{id:'summary',kind:'record',text:'Summary'},{op:'replace',startSeq:source.seq,endSeq:source.seq},[source.seq]);
  session.append('turn/end',{turn:1,reason:{kind:'completed'}});
  adapter.append(session,{id:'todo-update',kind:'todo-restore',message:{...checkpoint.data,id:'todo-update'}},{op:'replace',startSeq:checkpoint.seq,endSeq:checkpoint.seq},[checkpoint.seq]);
  const restore=catalog.createRestore(catalog.encodeCurrentHeader(session.header,0),{recovery:'strict',validation:'current'});
  for(const event of session.snapshotEvents())restore.decodeRow(catalog.encodeCurrentEvent(event));
  assert.doesNotThrow(()=>restore.finish());
  assert.equal(session.deriveMessages().at(-1).content[0].text,'Summary');
});

test('rc.2 dynamic tool declarations survive context replacement, full compaction and replay', async t => {
  const { Session, createMessage, createUserMessage, createSystemMessage, createDeveloperMessage, createHostAdapter } = deps;
  const dir = mkdtempSync(join(tmpdir(), 'native-tool-updates-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('tool-updates', undefined, { version: 4, id: 'tool-updates', createdAt: Date.now(), cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Keep host instructions') }, { surfaceOp: 'append' });
  session.append('request/header', { reason: 'initial', header: { config: { provider: 'test', model: 'test' }, tools: [{ name: 'old_tool', description: 'Old', parameters: {} }] } });
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Keep this request' }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const assistant = () => session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: 'Observed work result. '.repeat(1000) }] }) }, { surfaceOp: 'append' });
  assistant();
  const headerSeq = session.append('request/header', { reason: 'change', header: { config: { provider: 'test', model: 'test' }, tools: [{ name: 'new_tool', description: 'New', parameters: {} }] } }).seq;
  const update = session.append('developer/message', { turn: 1, step: 2, headerSeq, message: createDeveloperMessage({ source: { kind: 'tool-registry' }, content: [{ type: 'tool-addition', toolName: 'new_tool' }, { type: 'tool-removal', toolName: 'old_tool' }] }) }, { surfaceOp: 'append' });
  assistant();
  const history = session.toolHistory();
  const hub = { store: { dir }, config: () => ({ flushIdleMs: 0, keepTailEvents: 0, traceEnabled: false, coordinatorEvery: 999 }), scope: () => ({ mode: 'session', project: dir }), action() {},
    async call(_agent, kind, request) {
      assert.ok(!JSON.stringify(request.messages).includes('tool-addition'), 'tool control data is never sent to the summarizer');
      return { blocks: [{ type: 'tool-call', name: kind === 'compactFull' ? 'compact_conversation' : 'prepare_segment', arguments: kind === 'compactFull' ? { summary: 'Request retained; observed work completed.' } : { summary: 'Work completed.', documents: [] } }] };
    }, ctx: { sessions: { async flush() {} }, tokenMeter: { measure(s) { return { nodes: s.surface.nodes.map(seq => ({ seq, heuristicTokens: 100 })) }; } } } };
  const pipeline = new ContextPipeline(hub, createHostAdapter(hub)); t.after(() => pipeline.dispose());
  const agent = { session, status: 'idle' };
  const candidate = prepareCandidate(session, pipeline.state(session), pipeline.config(), pipeline.adapter.pairing);
  assert.ok(candidate && !candidate.some(event => event.seq === update.seq), 'tool declarations must stay outside summary candidates');
  await pipeline.prepare(agent, true);
  const state = pipeline.state(session);
  assert.ok(state.records.length);
  assert.ok(state.records.every(record => !record.sourceSeqs.includes(update.seq)), 'prepared records exclude live tool declarations');
  await pipeline.applyReady(agent, { manual: true, ids: state.records.map(record => record.id), mode: 'brief' });
  assistant();
  await pipeline.requestCompaction(session, agent, 'full');
  assert.ok(session.surface.nodes.includes(update.seq), 'tool update stays at its original surface position');
  assert.deepEqual(session.eventAt(update.seq), update);
  const replay = Session.create(session.id, JSON.parse(JSON.stringify(session.snapshotEvents())), session.header);
  assert.deepEqual(replay.deriveMessages(), session.deriveMessages());
  assert.deepEqual(replay.toolHistory(), history);
});
