import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from '../scripts/simulator/scenarios.mjs';

const marker = '[OMD independent asynchronous context check]';
const longId = 'ADAPTIVE_ORIGINAL_900719925474099312345678901234567890';
const quote = '工具材料保留原文供明确回查';
const definition = SCENARIOS.find(scene => scene.id === 'context-enhancement');
const replyText = reply => reply.chunks[0].delta.content;
const nativePayload = () => ({
  model: 'simulation', stream: true, temperature: 0.4, max_tokens: 16384,
  messages: [
    { role: 'system', content: 'native system remains at the head' },
    { role: 'user', content: '用户决定：' + quote + '。' },
    { role: 'assistant', tool_calls: [{ id: 'native-read', type: 'function', function: { name: 'read', arguments: '{"file_path":"adaptive.txt"}' } }] },
    { role: 'tool', tool_call_id: 'native-read', content: longId + ' 原文搜索可以找到被摘要省略的中文材料' },
  ],
  tools: ['todo_write', 'write', 'read', 'recall'].map(name => ({ type: 'function', function: { name, parameters: { type: 'object', properties: { marker: { type: 'string' } } } } })),
});
const appendTask = payload => ({ ...structuredClone(payload), messages: [...structuredClone(payload.messages), { role: 'user', content: marker + '\n\n' + JSON.stringify({ pressure_ratio: 0.2,
  candidates: [{ id: 'new-window', type: 'original', messages: [{ seq: 31, index: 3 }], summary_scope: [31], decision_sources: [{ seq: 23, index: 1 }], target_characters: 1200 }] }) }] });

// These tests verify strict scene mapping and its independent request oracle.
// Actual product, persistence and side-effect evidence comes from the native run.
async function fixture() {
  const scene = definition.create({ trace() {} }), main = nativePayload();
  for (let i = 0; i < 3; i++) await scene.model.respond(main, { signal: new AbortController().signal });
  return { scene, main, background: appendTask(main), context: { signal: new AbortController().signal } };
}

test('context enhancement is a separate strict scene with finite background interleavings', async () => {
  assert.ok(definition);
  const { scene, background, context } = await fixture();
  const response = await scene.model.respond(background, context);
  assert.deepEqual(JSON.parse(replyText(response)), { action: 'skip', reason: '本次保留原文。' });
  assert.equal(scene.model.snapshot().requests.at(-1).laneId, 'adaptive');
  assert.equal(scene.gates.length, 2);
  assert.equal(scene.omd.automaticReplace, true);
  assert.equal(scene.omd.backgroundMaxRetries, 0);
});

test('old baseline main lanes cannot accidentally accept adaptive requests with main tools', async () => {
  for (const id of ['full-lifecycle', 'stream-cancel', 'background-timeout', 'todo-reminder', 'restart-checkpoint', 'storage-failure']) {
    const scene = SCENARIOS.find(scene => scene.id === id).create({ trace() {} });
    await assert.rejects(scene.model.respond(appendTask(nativePayload())), { code: 'unknown_lane' }, id);
    for (const gate of scene.gates ?? []) gate.abort();
  }
});

test('wire oracle detects changes to history, tool schema, model and request parameters', async () => {
  const mutations = [
    payload => { payload.messages[0].content += ' system drift'; },
    payload => { payload.messages[1].content += ' user drift'; },
    payload => { payload.messages[3].content += ' tool result drift'; },
    payload => { payload.tools[1].function.parameters.properties.marker.type = 'number'; },
    payload => { payload.model = 'wrong-model'; },
    payload => { payload.temperature = 0.9; },
    payload => { payload.max_tokens--; },
    payload => { payload.messages.splice(-1, 0, { role: 'user', content: 'extra prefix message' }); },
  ];
  for (const mutate of mutations) {
    const { scene, background, context } = await fixture();
    mutate(background);
    await assert.rejects(scene.model.respond(background, context), { code: 'expectation_failed' });
    assert.equal(scene.model.snapshot().lanes.find(lane => lane.id === 'adaptive').steps[0].status, 'failed');
  }
});

test('compression replies map decision seq from actual candidates and faults remain explicit', async () => {
  const { scene, background, context } = await fixture();
  const replies = [];
  replies.push(await scene.model.respond(background, context));
  const blocking = await scene.model.respond(background, context), producer = blocking.chunks[Symbol.asyncIterator]();
  const waiting = producer.next(); await scene.gates[0].entered;
  assert.equal(scene.gates[0].snapshot().state, 'waiting'); scene.gates[0].release();
  assert.equal(JSON.parse((await waiting).value.delta.content).action, 'skip'); await producer.next();
  const unsafe = await scene.model.respond(background, context);
  assert.equal(unsafe.chunks[0].delta.tool_calls[0].function.name, 'write');
  assert.equal(unsafe.chunks[0].delta.tool_calls[0].id, 'adaptive-background-write');
  const invalid = JSON.parse(replyText(await scene.model.respond(background, context)));
  assert.equal(invalid.prepared.decisions[0].seq, 23);
  assert.equal(invalid.prepared.decisions[0].quote, '并非用户说过的决定');
  const late = await scene.model.respond(background, context), lateProducer = late.chunks[Symbol.asyncIterator]();
  const lateWaiting = lateProducer.next(); await scene.gates[1].entered; scene.gates[1].release();
  assert.equal(JSON.parse((await lateWaiting).value.delta.content).prepared.summary, 'ADAPTIVE_LATE_RESULT_MUST_NOT_PUBLISH'); await lateProducer.next();
  const changed = structuredClone(background);
  const task = JSON.parse(changed.messages.at(-1).content.split('\n\n').at(-1));
  task.candidates[0].decision_sources[0].seq = 123456;
  changed.messages.at(-1).content = marker + '\n\n' + JSON.stringify(task);
  const valid = JSON.parse(replyText(await scene.model.respond(changed, context)));
  assert.equal(valid.prepared.decisions[0].seq, 123456, 'no hard-coded event sequence may enter the scripted model response');
  assert.equal(valid.prepared.decisions[0].quote, quote);
  assert.deepEqual(valid.choices, [{ id: 'new-window', action: 'brief' }]);
});

const autoDefinition = SCENARIOS.find(scene => scene.id === 'context-adaptive-auto');
async function autoFixture(mainRequests = 3) {
  const scene = autoDefinition.create({ trace() {} }), main = nativePayload();
  main.messages[1].content = '用户决定：自动检查保留原文回查。';
  main.messages[3].content = 'AUTO_ORIGINAL_900719925474099312345678901234567890 自动检查中文原文';
  for (let i = 0; i < mainRequests; i++) await scene.model.respond(main);
  return { scene, background: appendTask(main) };
}

test('automatic scene only accepts checks after a complete native main request and returns declared cache usage', async () => {
  const { scene, background } = await autoFixture();
  assert.equal(scene.omd.digestEvery, 6); assert.equal(scene.omd.digestWindow, 6);
  assert.equal(scene.omd.traceEnabled, false); assert.equal(scene.omd.automaticReplace, false);
  const reply = await scene.model.respond(background), result = JSON.parse(replyText(reply));
  assert.equal(result.action, 'compress'); assert.equal(result.prepared.decisions[0].seq, 23);
  assert.equal(result.prepared.decisions[0].quote, '自动检查保留原文回查');
  assert.equal(reply.chunks[0].usage.prompt_tokens_details.cached_tokens, 123);
  await assert.rejects(scene.model.respond(background), { code: 'extra_request' }, 'same scene must not absorb repeated automatic checks');
});

test('automatic scene rejects early checks and candidates that omit the actual read result', async () => {
  const early = await autoFixture(1);
  await assert.rejects(early.scene.model.respond(early.background), { code: 'expectation_failed' });
  const omitted = await autoFixture();
  const task = JSON.parse(omitted.background.messages.at(-1).content.split('\n\n').at(-1));
  task.candidates[0].messages[0].index = 1;
  omitted.background.messages.at(-1).content = marker + '\n\n' + JSON.stringify(task);
  await assert.rejects(omitted.scene.model.respond(omitted.background), { code: 'reply_failed' });
});
