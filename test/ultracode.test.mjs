import test from 'node:test';
import assert from 'node:assert/strict';
import { UltracodeControl, ULTRACODE_ON, ULTRACODE_SPARSE, ULTRACODE_OFF, ULTRACODE_KEYWORD, PRO_ON, PRO_SPARSE, PRO_OFF, hasUltracodeKeyword } from '../src/ultracode.mjs';
import { proWorkflowGuide } from '../src/cc-adaptation/workflow-guide.mjs';
import { promptText } from '../src/cc-adaptation/texts.mjs';
import { highestEffort } from '../src/model-efforts.mjs';

function fixture(efforts = ['off', 'high', 'xhigh']) {
  const events = [], messages = [];
  const session = { id: 'root', header: {}, get seq() { return events.length; }, eventAt: i => events[i], deriveMessages: () => messages, requestHeader: () => ({ config: { provider: 'fixture', model: 'model' } }),
    append(type, data) { const event = { type, data, seq: events.length }; events.push(event); return event; },
  };
  const tools = { schemas: scope => scope === agent ? [{ name: 'workflow', parameters: { properties: { resumeFromRunId: {} } } }] : [] };
  const agent = { session, ctx: { get: name => name === 'tools' ? tools : undefined } };
  let eligible = true, fail = false;
  const controller = { async selectModel(request) {
    if (fail) throw Error('provider unavailable');
    const {sessionId, ...selected} = request; session.append('model/selection', selected); return {selected};
  } };
  const ctx = { agents: { get: id => id === 'root' ? agent : undefined }, sessions: { flush: async () => {} },
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: efforts.map(id => ({ id })) } }) },
    get: name => name === 'sessionController' ? controller : undefined };
  const data={id:'root'}, deliveries=[];
  const store={peek:()=>data,state:()=>data,save(value){if(value.ultracode?.delivery&&value.ultracode.delivery!==data.ultracode?.delivery)deliveries.push(value.ultracode.delivery);}};
  const control = new UltracodeControl(ctx, () => eligible, store);
  let turn = 0;
  const request = async (text, source = 'user', options = {}) => {
    if (!options.continue) session.append('turn/start', { turn: ++turn });
    const input = text === undefined ? [] : [{ id: 'message-' + events.length, source: { kind: source }, content: [{type:'text',text}] }];
    for (const message of input) control.claimed(agent, message);
    const assembly = await control.assemble(agent, async () => ({ sections: [{name:'base', text:'base prompt'}], tools: [] }));
    const prompt = assembly.sections.map(s=>s.text).join('\n\n');
    messages.splice(0, messages.length, { role: 'system', content: [{type:'text',text:prompt}] });
    for (const message of input) session.append('user/message', message);
    const header = session.append('request/header', {}); control.committed(session, header);
    return prompt;
  };
  return { ctx, events, messages, session, agent, control, store, deliveries, request, eligible(value) { eligible=value; }, fail(value) { fail=value; } };
}

test('ordinary forks can inspect and change models and enable Ultracode', async () => {
  const f = fixture();
  f.session.header = { parentSession: 'source', isSeeded: true };
  assert.equal((await f.control.inspect('root')).eligible, true);
  const selected = await f.control.select('root', { provider: 'fixture', model: 'second', ultracode: false });
  assert.equal(selected.selected.model, 'second');
  assert.equal((await f.control.select('root', { provider: 'fixture', model: 'second', ultracode: true })).enabled, true);
});

test('subagents remain protected with or without inherited history', async () => {
  for (const isSeeded of [false, true]) {
    const f = fixture();
    f.session.header = { parentSession: 'source', origin: 'subagent', isSeeded };
    assert.equal(f.control.eligible(f.agent), false);
    await assert.rejects(f.control.inspect('root'), /不能通过模型面板接管子代理会话/);
    await assert.rejects(f.control.select('root', { provider: 'fixture', model: 'second', ultracode: false }), /不能通过模型面板接管子代理会话/);
    assert.equal(f.events.length, 0);
  }
});

test('Ultracode persists separately from native effort and a regular highest selection clears it', async () => {
  const f = fixture();
  const on = await f.control.select('root', {provider:'fixture',model:'model',ultracode:true});
  assert.equal(on.enabled, true); assert.equal(on.selected.reasoningEffort, 'xhigh');
  const off = await f.control.select('root', {provider:'fixture',model:'model',reasoningEffort:'xhigh',ultracode:false,expectedRevision:on.revision});
  assert.equal(off.enabled, false); assert.equal(off.selected.reasoningEffort, 'xhigh');
  f.fail(true); await assert.rejects(f.control.select('root', {provider:'fixture',model:'bad',ultracode:true}), /unavailable/);
  assert.deepEqual(f.control.view(f.session), off);
});

test('full reminder, ten ordinary inputs, then sparse; synthetic input never advances cadence', async () => {
  const f = fixture(); await f.control.select('root', {provider:'fixture',model:'model',ultracode:true});
  assert.ok((await f.request('first')).includes(ULTRACODE_ON));
  assert.ok(f.messages[0].content[0].text.includes('Completeness critic'));
  for (let i=0;i<10;i++) { await f.request('background', 'plugin:jobs'); assert.ok((await f.request('followup '+i)).includes(ULTRACODE_ON)); }
  assert.ok((await f.request('eleventh')).includes(ULTRACODE_SPARSE));
  assert.deepEqual(f.deliveries.map(e=>e.kind), ['on','sparse']);
});

test('keyword is human-only and lasts one turn, while mode-off removes the authoring reference', async () => {
  const f = fixture();
  assert.equal(hasUltracodeKeyword({source:{kind:'plugin:attachment'},content:[{type:'text',text:'ultracode'}]}), false);
  assert.ok(!(await f.request('ultracode', 'plugin:attachment')).includes(ULTRACODE_KEYWORD));
  assert.ok((await f.request('Use ultracode on this task')).includes(ULTRACODE_KEYWORD));
  assert.ok((await f.request(undefined, 'user', {continue:true})).includes(ULTRACODE_KEYWORD));
  assert.ok(!(await f.request('next task')).includes('Workflow authoring reference'));
  await f.control.select('root', {provider:'fixture',model:'model',ultracode:true}); await f.request('on');
  await f.control.select('root', {provider:'fixture',model:'model',ultracode:false});
  const off = await f.request('off'); assert.ok(off.includes(ULTRACODE_OFF)); assert.ok(!off.includes('Workflow authoring reference'));
});

test('clear/compact reinject, restart reconstructs intent, and ordinary host selection cannot leave mode stuck', async () => {
  const f = fixture(); await f.control.select('root', {provider:'fixture',model:'model',ultracode:true}); await f.request('on');
  f.control.lifecycle(f.agent, 'compact'); await f.request('after compact');
  assert.deepEqual(f.deliveries.map(e=>e.kind), ['on','on']);
  const restored = new UltracodeControl(f.ctx, () => true, f.store); assert.equal(restored.view(f.session).enabled, true);
  f.eligible(false); assert.ok(!(await f.request('stock')).includes('Workflow authoring reference'));
  f.eligible(true); f.session.append('model/selection', {provider:'fixture',model:'model',reasoningEffort:'xhigh'});
  assert.equal(restored.view(f.session).enabled, false); assert.ok((await f.request('regular')).includes(ULTRACODE_OFF));
});

test('concurrent mode changes serialize and reject a stale revision rather than mixing flags and effort', async () => {
  const f = fixture(), revision = f.control.view(f.session).revision;
  const values = await Promise.allSettled([
    f.control.select('root', {provider:'fixture',model:'model',ultracode:true,expectedRevision:revision}),
    f.control.select('root', {provider:'fixture',model:'model',reasoningEffort:'off',ultracode:false,expectedRevision:revision}),
  ]);
  assert.equal(values[0].status, 'fulfilled'); assert.equal(values[1].status, 'rejected');
  assert.equal(f.control.view(f.session).enabled, true);
  assert.equal(f.events.filter(e=>e.type==='model/selection').length, 1);
  assert.equal(highestEffort({efforts:[{id:'xhigh'},{id:'low'},{id:'max'}]}), 'max');
  assert.equal(highestEffort(undefined), undefined);
});

test('Pro keeps its effort and implementation guidance while replacing the Ultracode reference', async () => {
  const f = fixture();
  f.store.peek().betterTodo = { todo: true, verification: true };
  await f.control.select('root', { provider:'fixture', model:'model', ultracode:true });
  assert.match(await f.request('Build'), /Adversarial verify/);
  const pro = await f.control.select('root', { provider:'fixture', model:'model', mode:'pro' });
  assert.equal(pro.mode, 'pro'); assert.equal(pro.enabled, true); assert.equal(pro.selected.reasoningEffort, 'xhigh');
  const text = await f.request('Continue implementation');
  assert.ok(text.includes(PRO_ON));
  assert.match(text, /including implementation and iterative refinement/);
  assert.match(text, /token cost is not a constraint/);
  assert.match(text, /Candidate comparison/);
  assert.match(text, /Multi-modal sweep/);
  assert.match(text, /resumeFromRunId/);
  assert.doesNotMatch(text, /Ultracode|Adversarial verify|Perspective-diverse verify|Completeness critic|Judge panel|Loop-until-dry/);
  assert.deepEqual(f.store.peek().betterTodo, { todo: true, verification: true }, 'the mode does not override BT');
  assert.equal(f.store.peek().ultracode.enabled, false, 'old versions cannot interpret Pro as Ultracode');
  await f.control.select('root', { provider:'fixture', model:'second', mode:'pro' });
  assert.equal(f.control.view(f.session).mode, 'pro');
  const restored = new UltracodeControl(f.ctx, () => true, f.store);
  assert.equal(restored.view(f.session).mode, 'pro');
  f.control.lifecycle(f.agent, 'compact');
  assert.ok((await f.request('After compact')).includes(PRO_ON));
  await f.control.select('root', { provider:'fixture', model:'second', mode:'off', reasoningEffort:'high' });
  const off = await f.request('Continue normally');
  assert.ok(off.includes(PRO_OFF)); assert.doesNotMatch(off, /Workflow authoring reference/);
});

test('Pro prefers advertised xhigh while other modes retain native effort ordering and defaults', async () => {
  for (const [efforts, pro, ultra] of [
    [['off', 'high', 'xhigh', 'max', 'ultra'], 'xhigh', 'ultra'],
    [['off', 'high', 'max'], 'max', 'max'],
    [[], undefined, undefined],
  ]) {
    const f = fixture(efforts), route = { provider: 'fixture', model: 'model' };
    assert.equal((await f.control.select('root', { ...route, mode: 'pro' })).selected.reasoningEffort, pro);
    assert.equal((await f.control.select('root', { ...route, mode: 'ultracode' })).selected.reasoningEffort, ultra);
    assert.equal((await f.control.select('root', { ...route, mode: 'off', reasoningEffort: 'high' })).selected.reasoningEffort, 'high');
  }
});

test('Pro reminder cadence survives mode changes and does not add a common-word keyword trigger', async () => {
  const f = fixture();
  assert.doesNotMatch(await f.request('A pro camera'), /Workflow authoring reference/);
  await f.control.select('root', { provider:'fixture', model:'model', mode:'pro' });
  assert.ok((await f.request('first')).includes(PRO_ON));
  for (let i=0;i<10;i++) assert.ok((await f.request('continue '+i)).includes(PRO_ON));
  assert.ok((await f.request('eleventh')).includes(PRO_SPARSE));
  await f.control.select('root', { provider:'fixture', model:'model', mode:'ultracode' });
  const ultra = await f.request('next');
  assert.ok(ultra.includes(ULTRACODE_ON)); assert.match(ultra, /Adversarial verify/); assert.ok(!ultra.includes(PRO_SPARSE));
});

test('legacy stored boolean and reminder migrate without reinterpreting an ordinary native model selection', async () => {
  const f = fixture();
  await f.control.select('root', {provider:'fixture',model:'model',ultracode:true}); await f.request('first');
  delete f.store.peek().ultracode.mode;
  delete f.store.peek().ultracode.delivery.mode;
  const restored = new UltracodeControl(f.ctx, () => true, f.store);
  assert.equal(restored.view(f.session).mode, 'ultracode');
  assert.ok((await f.request('legacy continuation')).includes(ULTRACODE_ON));
  f.session.append('model/selection', {provider:'fixture',model:'model',reasoningEffort:'ultra'});
  assert.equal(restored.view(f.session).mode, 'off', 'the native effort named ultra does not select an OMD mode');
});

test('invalid or conflicting modes cannot mutate model selection, including concurrent Pro writes', async () => {
  const f = fixture(), route = {provider:'fixture',model:'model'};
  for (const value of [{}, {mode:null}, {mode:'Ultra'}, {mode:'pro',ultracode:true}, {mode:'off',ultracode:'false'}]) {
    await assert.rejects(f.control.select('root', {...route,...value}), /无效/);
  }
  assert.equal(f.events.length, 0);
  const results = await Promise.allSettled(['pro','ultracode'].map(mode => f.control.select('root',{...route,mode,expectedRevision:-1})));
  assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].status,'rejected');
  f.fail(true); await assert.rejects(f.control.select('root',{...route,mode:'ultracode'}),/unavailable/);
  assert.equal(f.control.view(f.session).mode,'pro');
});

test('Pro derives only its mode policy and examples; common workflow API and resume contract remain exact', () => {
  const ultra = promptText('runtime/workflow-authoring.md'), pro = proWorkflowGuide(ultra);
  for (const start of ['- pipeline(items,','- parallel(thunks:','- workflow(nameOrRef:','The supported schema keywords','## Resume']) {
    const block = ultra.slice(ultra.indexOf(start)).split('\n\n')[0];
    assert.ok(pro.includes(block), start);
  }
  assert.match(pro, /while \(budget.total && budget.remaining\(\) > 50_000\)/);
  assert.throws(() => proWorkflowGuide(ultra.replace('Subagents carry out the assigned work','Agents carry out the assigned work')), /anchor changed/);
});
