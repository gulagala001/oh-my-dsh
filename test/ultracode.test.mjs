import test from 'node:test';
import assert from 'node:assert/strict';
import { UltracodeControl, ULTRACODE_ON, ULTRACODE_SPARSE, ULTRACODE_OFF, ULTRACODE_KEYWORD, hasUltracodeKeyword } from '../src/ultracode.mjs';
import { highestEffort } from '../src/model-efforts.mjs';

function fixture() {
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
    llm: { resolveModelInfo: async () => ({ reasoning: { efforts: [{id:'off'},{id:'high'},{id:'xhigh'}] } }) },
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
