import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createSystemMessage, createMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { createTodoStore } from '../src/todolist.mjs';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { newRecord, liveSpan, userRevision, normalizeChoices, candidateInput, prepareCandidate } from '../src/context/core.mjs';
import { createTransaction, applyTransaction } from '../src/context/transactions.mjs';
import { TODO_META, isTaskInjection, summaryMessageReader } from '../src/task-context.mjs';
import { setRuntimeContext, taskContextMeta } from '../src/task-context.mjs';
import { runtimeContext } from '../src/runtime-state.mjs';
const prepared = { summary: '创建样式文件，工具确认写入成功。', documents: [] };
function setup(t, config = {}, withTodo = true) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-context-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = Session.create('todo-context', undefined, { version: 3, id: 'todo-context', createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  const sys = session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Stable system prompt.', 'test') }, { surfaceOp: 'append' });
  const user = text => session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const first = user('实现样式。'); const todoStore = createTodoStore();
  if (withTodo) {
    const added = todoStore.execTaskMap(session, { op: 'excerpt', from: '实现样式', to: '实现样式', tasks: [{ title: 'TASK_PAYLOAD_ONLY_42', anchor: { from: '实现样式', to: '实现样式' } }] });
    assert.equal(added.isError, undefined); todoStore.maintainInjection(session);
  }
  const calls = [], hub = { todoStore, store: { dir }, config: () => ({ keepTailEvents: 0, coordinatorEvery: 999, flushIdleMs: 0, ...config }), scope: () => ({ mode: 'session', project: dir }), action() {},
    ctx: { sessions: { async flush() {} }, tokenMeter: { measure(s) { return { nodes: s.surface.nodes.map(seq => ({ seq, heuristicTokens: 100 })) }; } } },
    async call(_agent, kind, args) { calls.push({ kind, args }); return { blocks: [{ type: 'tool-call', name: kind === 'compactFull' ? 'compact_conversation' : 'prepare_segment', arguments: kind === 'compactFull' ? { summary: prepared.summary } : prepared }] }; } };
  const pipeline = new ContextPipeline(hub, createHostAdapter(hub)); t.after(() => pipeline.dispose());
  return { session, sys, first, user, todoStore, pipeline, hub, calls, agent: { session, status: 'idle' }, state: pipeline.state(session) };
}
function exchange(f, { name = 'write', value = 'Source body. '.repeat(1200), reasoning = 'Earlier analysis.', args = '{}' } = {}) {
  const id = crypto.randomUUID();
  const a = f.session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [...(reasoning ? [{ type: 'reasoning', text: reasoning }] : []), { type: 'tool-call', id, name, arguments: args }] }) }, { surfaceOp: 'append' });
  const b = f.session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: id, content: [{ type: 'text', text: value }], isError: false }) }, { surfaceOp: 'append' });
  return [a,b];
}
function liveTodos(f) { return f.session.surface.nodes.map(seq => f.session.eventAt(seq)).filter(e => isTaskInjection(e) || e.data?.[TODO_META]); }
function replay(f) { return Session.create(f.session.id, JSON.parse(JSON.stringify(f.session.snapshotEvents())), f.session.header); }
for (const traceEnabled of [true, false]) for (const withTodo of [true, false]) {
  test(`sampled runtime refresh stays single across compression and replay (Trace=${traceEnabled}, Todo=${withTodo})`, async t => {
    const f = setup(t, { traceEnabled, stateHintsEnabled: true }, withTodo);
    f.hub.context = f.pipeline;
    let messages = [];
    setRuntimeContext(f.session, () => runtimeContext(f.agent, f.hub, { messages }));
    assert.ok(f.todoStore.maintainInjection(f.session));
    exchange(f); await compact(f);
    assert.equal(liveTodos(f).length, 1);
    assert.equal(f.todoStore.maintainInjection(f.session), undefined, 'changed record versions and positions do not append another state');
    messages = [createUserMessage({ content: [{ type: 'text', text: 'Next actual user input.' }], source: { kind: 'user' } })];
    exchange(f); await compact(f);
    assert.equal(liveTodos(f).length, 1);
    assert.equal(taskContextMeta(liveTodos(f)[0].data).runtime.key, runtimeContext(f.agent, f.hub, { messages }).key);
    assert.equal(f.todoStore.maintainInjection(f.session), undefined, 'compaction already delivered the pending input refresh');
    f.session.append('user/message', messages[0], { surfaceOp: 'append' }); messages = [];
    assert.equal(f.todoStore.maintainInjection(f.session), undefined, 'committing pending input is not a second input');
    const restored = replay(f);
    setRuntimeContext(restored, () => runtimeContext({ session: restored }, f.hub));
    assert.equal(createTodoStore().maintainInjection(restored), undefined);
    assert.deepEqual(restored.deriveMessages(), f.session.deriveMessages());
  });
}
async function compact(f, mode = 'brief') {
  await f.pipeline.prepare(f.agent, true);
  return f.pipeline.applyReady(f.agent, { manual: true, ids: f.state.records.filter(r => !r.mergedInto && r.mode === 'raw').map(r => r.id), mode });
}
test('task injections and task tool payloads are absent from preparation without splitting the window', async t => {
  const f = setup(t); exchange(f); exchange(f, { name: 'todo_write', args: '{"tasks":["TASK_ARGUMENT_ONLY_77"]}', value: 'TASK_RESULT_ONLY_88', reasoning: '' }); exchange(f);
  await f.pipeline.prepare(f.agent, true); assert.equal(f.calls.length, 1);
  const input = JSON.stringify(f.calls[0].args);
  assert.doesNotMatch(input, /TASK_PAYLOAD_ONLY_42|TASK_ARGUMENT_ONLY_77|TASK_RESULT_ONLY_88/);
  assert.equal(f.state.records.length, 1); assert.equal(liveTodos(f).length, 1, 'preparation does not rewrite tasks');
});
test('successful compression places one latest task block after Trace; repeat pre-step is stable', async t => {
  const f = setup(t); exchange(f); const originals = f.session.snapshotEvents(), revision = userRevision(f.session);
  await compact(f); const tasks = liveTodos(f); assert.equal(tasks.length, 1);
  assert.equal(tasks[0].seq, f.state.traceSlot.carrierSeq); assert.equal(tasks[0].data[TODO_META].index, 1);
  assert.match(tasks[0].data.content[0].text, /Previous analysis/); assert.match(tasks[0].data.content[1].text, /TASK_PAYLOAD_ONLY_42/);
  assert.ok(f.session.surface.nodes.includes(f.sys.seq)); assert.equal(userRevision(f.session), revision);
  const nodes = [...f.session.surface.nodes]; assert.equal(f.todoStore.maintainInjection(f.session), undefined); assert.deepEqual(f.session.surface.nodes, nodes);
  originals.forEach(e => assert.deepEqual(f.session.eventAt(e.seq), e)); assert.deepEqual(replay(f).deriveMessages(), f.session.deriveMessages());
});
test('without Trace tasks follow the system prefix, with unchanged user text and no transcript duplicates', async t => {
  const f = setup(t, { traceEnabled: false }); exchange(f, { reasoning: '' }); const revision = userRevision(f.session);
  await compact(f); const task = liveTodos(f)[0]; assert.equal(liveTodos(f).length, 1); assert.equal(task.data[TODO_META].index, 0);
  const messages = f.session.deriveMessages(); assert.equal(messages[0].role, 'system'); assert.equal(messages[1].id, task.data.id);
  assert.equal(userRevision(f.session), revision); assert.deepEqual(replay(f).deriveMessages(), messages);
});
test('ordinary task updates append once without rewriting the prefix; the next compression removes older copies', async t => {
  const f = setup(t); exchange(f); await compact(f); const oldNodes = [...f.session.surface.nodes];
  const checked = f.todoStore.execCheck(f.session, [{ id: 'T1', done: true }]); assert.ok(!checked.isError);
  const update = f.todoStore.maintainInjection(f.session); assert.ok(update); assert.equal(f.session.surface.nodes.at(-1), update.seq);
  assert.deepEqual(f.session.surface.nodes.slice(0,-1), oldNodes); assert.equal(f.todoStore.maintainInjection(f.session), undefined);
  exchange(f); await compact(f); assert.equal(liveTodos(f).length, 1); assert.match(liveTodos(f)[0].data.content[1].text, /\[x\] T1/);
  assert.equal(f.todoStore.maintainInjection(f.session), undefined);
  const revived = createTodoStore(); assert.equal(revived.maintainInjection(replay(f)), undefined, 'restart does not inject another unchanged list');
});
test('full compaction and repeated no-op keep the latest todo despite brief mode', async t => {
  const f = setup(t); exchange(f); await compact(f); exchange(f);
  await f.pipeline.requestCompaction(f.session, f.agent, 'full'); assert.equal(liveTodos(f).length, 1);
  const input = JSON.stringify(f.calls.filter(c => c.kind === 'compactFull').at(-1).args); assert.doesNotMatch(input, /TASK_PAYLOAD_ONLY_42/);
  assert.equal(liveTodos(f)[0].seq, f.state.traceSlot.carrierSeq);
  const nodes = [...f.session.surface.nodes], calls = f.calls.length;
  const unchanged = await f.pipeline.requestCompaction(f.session, f.agent, 'full'); assert.equal(unchanged.changed, false);
  assert.deepEqual(f.session.surface.nodes, nodes); assert.equal(f.calls.length, calls);
});
test('a failed plan does not remove tasks; a flush failure keeps old tasks until transaction recovery', async t => {
  const f = setup(t); exchange(f); await f.pipeline.prepare(f.agent,true); const r = f.state.records[0], before = [...f.session.surface.nodes];
  const bad = { ...r, summary: 'x'.repeat(150000) }; Object.assign(r,bad);
  await assert.rejects(f.pipeline.applyReady(f.agent,{manual:true,ids:[r.id],mode:'brief'}), /没有缩短/);
  assert.deepEqual(f.session.surface.nodes,before); assert.equal(liveTodos(f).length,1);
  r.summary = prepared.summary; const normal = f.pipeline.adapter.flush; let flushes=0;
  f.pipeline.adapter.flush = async (...args) => { if (++flushes === 1) throw Error('disk flush failed'); return normal(...args); };
  await assert.rejects(f.pipeline.applyReady(f.agent,{manual:true,ids:[r.id],mode:'brief'}), /disk flush/);
  assert.equal(liveTodos(f).length,1); assert.ok(isTaskInjection(liveTodos(f)[0])); assert.ok(f.state.transaction);
  f.pipeline.adapter.flush = normal; await f.pipeline.applyReady(f.agent);
  assert.equal(f.state.transaction,null); assert.equal(liveTodos(f).length,1); assert.ok(liveTodos(f)[0].data[TODO_META]);
  assert.deepEqual(replay(f).deriveMessages(),f.session.deriveMessages());
});
test('user originals follow the detailed-material tier and remain verbatim after brief and merge', async t => {
  const f=setup(t); exchange(f); const quote='  新要求：不要穿模。\n保留空格  '; const correction=f.user(quote); exchange(f);
  await compact(f,'detail'); const r=f.state.records.find(r=>!r.mergedInto);
  assert.deepEqual(r.userOriginals.find(u=>u.seq===correction.seq).content,correction.data.content);
  assert.match(JSON.stringify(f.session.deriveMessages()),/新要求：不要穿模/);
  await f.pipeline.applyReady(f.agent,{manual:true,ids:[r.id],mode:'brief'});
  assert.doesNotMatch(JSON.stringify(f.session.deriveMessages()),/新要求：不要穿模/);
  assert.ok(f.pipeline.recall(f.session,{id:r.id}).includes(quote)); assert.equal(liveTodos(f).length,1);
});
test('an existing prefix todo survives an interrupted later compaction and is refreshed once on resume', async t => {
  const f=setup(t); exchange(f); await compact(f); exchange(f,{reasoning:'A changed later analysis.'}); await f.pipeline.prepare(f.agent,true);
  const r=f.state.records.find(r=>!r.mergedInto&&r.mode==='raw'), flush=f.pipeline.adapter.flush;
  f.pipeline.adapter.flush=async()=>{throw Error('disk failure');};
  await assert.rejects(f.pipeline.applyReady(f.agent,{manual:true,ids:[r.id],mode:'brief'}),/disk failure/);
  assert.equal(liveTodos(f).length,1); assert.match(liveTodos(f)[0].data.content[1].text,/TASK_PAYLOAD_ONLY_42/);
  f.pipeline.adapter.flush=flush; await f.pipeline.applyReady(f.agent); assert.equal(liveTodos(f).length,1);
  assert.equal(f.todoStore.maintainInjection(f.session),undefined); assert.deepEqual(replay(f).deriveMessages(),f.session.deriveMessages());
});
test('global task cleanup does not invalidate a different prepared raw window', async t => {
  const f=setup(t); const a=exchange(f), todo=f.todoStore.maintainInjection(f.session); assert.equal(todo,undefined);
  f.todoStore.execCheck(f.session,[{id:'T1',done:true}]); const middle=f.todoStore.maintainInjection(f.session), b=exchange(f);
  const left=newRecord(f.session,a,prepared,f.state.binding), events=[middle,...b]; events.wholeWindow=true;
  const right=newRecord(f.session,events,prepared,f.state.binding); f.state.records.push(left,right);
  await f.pipeline.applyReady(f.agent,{manual:true,ids:[left.id],mode:'brief'});
  const preserved=f.state.records.find(r=>r.id===right.id); assert.ok(liveSpan(f.session,preserved));
  await f.pipeline.applyReady(f.agent,{manual:true,ids:[right.id],mode:'brief'}); assert.equal(liveTodos(f).length,1);
});
test('removing all tasks refreshes an empty list once and never resurrects an old task', async t => {
  const f=setup(t); exchange(f); await compact(f);
  const removed=f.todoStore.execTaskMap(f.session,{op:'remove',ids:['T1']}); assert.ok(!removed.isError);
  assert.ok(f.todoStore.maintainInjection(f.session)); assert.equal(f.todoStore.maintainInjection(f.session),undefined);
  exchange(f); await compact(f); const e=liveTodos(f)[0]; assert.equal(liveTodos(f).length,1);
  assert.match(e.data.content[e.data[TODO_META].index].text,/all tasks were removed/); assert.equal(f.todoStore.snapshot(f.session).tasks.length,0);
});
test('interruption after the new prefix is written resumes cleanup without another todo copy', async t => {
  const f=setup(t); exchange(f); await f.pipeline.prepare(f.agent,true); const r=f.state.records[0];
  const append=f.pipeline.adapter.append; let failed=false;
  f.pipeline.adapter.append=(s,op,...args)=>{ if(op.todoCleanup&&!failed){failed=true;throw Error('cleanup interrupted');} return append(s,op,...args); };
  await assert.rejects(f.pipeline.applyReady(f.agent,{manual:true,ids:[r.id],mode:'brief'}),/cleanup interrupted/);
  assert.ok(f.state.transaction); assert.ok(liveTodos(f).some(e=>e.data?.[TODO_META]));
  f.pipeline.adapter.append=append; await f.pipeline.applyReady(f.agent);
  assert.equal(liveTodos(f).length,1); assert.equal(f.todoStore.maintainInjection(f.session),undefined);
  assert.deepEqual(replay(f).deriveMessages(),f.session.deriveMessages());
});
test('a subsequent preprocessing pass never receives the embedded todo, including reference lookback', async t => {
  const f=setup(t); exchange(f); await compact(f); exchange(f); await f.pipeline.prepare(f.agent,true);
  assert.doesNotMatch(JSON.stringify(f.calls.at(-1).args),/TASK_PAYLOAD_ONLY_42/);
  assert.equal(liveTodos(f).length,1);
});
test('full compression without Trace archives original user text while preserving the task ledger', async t => {
  const f=setup(t,{traceEnabled:false}); exchange(f,{reasoning:''}); const revision=userRevision(f.session);
  await compact(f); exchange(f,{reasoning:''}); await f.pipeline.requestCompaction(f.session,f.agent,'full');
  const r=f.state.records.find(r=>!r.mergedInto); assert.ok(f.pipeline.recall(f.session,{id:r.id}).includes('实现样式。'));
  assert.equal(userRevision(f.session),revision); assert.equal(liveTodos(f).length,1);
  assert.equal(liveTodos(f)[0].data[TODO_META].index,0); assert.equal(f.todoStore.maintainInjection(f.session),undefined);
});

test('runtime state shares task compression, survives replay and clears without breaking Trace or future compression', async t => {
  const f = setup(t);
  const { setRuntimeContext } = await import('../src/task-context.mjs');
  let runtime = { key: 'first', sampledAt: 'fixture', text: '[runtime state · as of fixture]\nSTATE_PAYLOAD_ONLY' };
  setRuntimeContext(f.session, () => runtime);
  f.todoStore.maintainInjection(f.session); exchange(f);
  await compact(f); const carrier = liveTodos(f)[0];
  assert.equal(liveTodos(f).length, 1); assert.match(carrier.data.content[1].text, /TASK_PAYLOAD_ONLY_42[\s\S]*STATE_PAYLOAD_ONLY/);
  assert.equal(f.todoStore.maintainInjection(f.session), undefined);
  assert.deepEqual(replay(f).deriveMessages(), f.session.deriveMessages());
  assert.doesNotMatch(JSON.stringify(f.calls), /STATE_PAYLOAD_ONLY/);
  const before = f.todoStore.snapshot(f.session), revision = userRevision(f.session);
  const record = f.state.records.find(r => !r.mergedInto);
  f.state.pending = { id: 'prepared-before-disable', choices: normalizeChoices({ choices: [{ action: 'keep', ids: [record.id] }] }, f.state, f.session) };
  const replacement = structuredClone(f.state.lastReplacement), cadence = f.state.lastReplacementStep;
  runtime = null;
  const stripping = f.pipeline.stripRuntime(f.session);
  assert.equal(f.pipeline.stripRuntime(f.session), stripping, 'concurrent cleanup shares one transaction');
  await stripping;
  const fresh = liveTodos(f)[0];
  assert.equal(f.state.traceSlot.carrierSeq, fresh.seq);
  assert.doesNotMatch(JSON.stringify(f.session.deriveMessages()), /STATE_PAYLOAD_ONLY/);
  assert.match(fresh.data.content[1].text, /TASK_PAYLOAD_ONLY_42/);
  assert.deepEqual(f.todoStore.snapshot(f.session), before); assert.equal(userRevision(f.session), revision);
  assert.equal(f.state.pending.id, 'prepared-before-disable');
  assert.equal(f.state.pending.choices[0].observed[0].version, f.state.records.find(r => r.id === record.id).version);
  assert.deepEqual(f.state.lastReplacement, replacement); assert.equal(f.state.lastReplacementStep, cadence);
  assert.equal(f.todoStore.maintainInjection(f.session), undefined);
  exchange(f); await compact(f); assert.equal(liveTodos(f).length, 1);
  assert.deepEqual(replay(f).deriveMessages(), f.session.deriveMessages());
});
