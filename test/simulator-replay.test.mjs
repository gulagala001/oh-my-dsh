import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayModel, validateReplay, recordReplay } from '../scripts/simulator/replay.mjs';
import { createSimulationProvider } from '../scripts/simulator/provider.mjs';

const copy = (value) => structuredClone(value);
const request = (model = 'main', content = '你好🌍') => ({ model, messages: [{ role: 'user', content }], stream: true, temperature: 0.2 });
const response = (content = '完成') => ({ chunks: [{ delta: { content } }, { delta: {}, finish_reason: 'stop' }, { usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }] });
const entry = (model = 'main', content = '你好🌍', output = '完成', lane) => ({ ...(lane ? { lane } : {}), request: request(model, content), response: response(output) });
const fixture = (...entries) => ({ version: 1, entries: entries.length ? entries : [entry()] });

test('validates and replays the exact request, reports remaining entries, and returns copies', async () => {
  const value = fixture();
  const validated = validateReplay(value);
  validated.entries[0].request.messages[0].content = 'changed copy';
  assert.equal(value.entries[0].request.messages[0].content, '你好🌍');
  const events = [];
  const model = createReplayModel(value, { trace: (event) => events.push(event) });
  value.entries[0].response.chunks[0].delta.content = 'changed original';
  assert.throws(() => model.assertComplete(), (error) => error.code === 'unconsumed_entries');
  const result = await model.respond(request(), { requestId: 'req-1' });
  assert.equal(result.chunks[0].delta.content, '完成');
  result.chunks[0].delta.content = 'caller change';
  assert.deepEqual(model.snapshot(), { version: 1, total: 1, consumed: 1, remaining: 0, lanes: [{ lane: 'main', total: 1, consumed: 1, remaining: 0 }], errors: [] });
  assert.deepEqual(events, [{ type: 'replay/matched', requestId: 'req-1', lane: 'main', entryIndex: 0 }]);
  model.assertComplete();
});

test('different model lanes interleave independently instead of consuming a global phase', async () => {
  const model = createReplayModel(fixture(entry('main', 'm1', 'M1'), entry('background', 'b1', 'B1'), entry('main', 'm2', 'M2'), entry('background', 'b2', 'B2')));
  for (const [modelName, content, output] of [['background', 'b1', 'B1'], ['background', 'b2', 'B2'], ['main', 'm1', 'M1'], ['main', 'm2', 'M2']]) {
    assert.equal((await model.respond(request(modelName, content))).chunks[0].delta.content, output);
  }
  model.assertComplete();
});

test('explicit lanes disambiguate identical requests and ambiguity is a permanent failure', async () => {
  const value = fixture(entry('same', 'question', 'A', 'lane-a'), entry('same', 'question', 'B', 'lane-b'));
  const model = createReplayModel(value);
  assert.equal((await model.respond(request('same', 'question'), { lane: 'lane-b' })).chunks[0].delta.content, 'B');
  assert.equal((await model.respond(request('same', 'question'), { lane: 'lane-a' })).chunks[0].delta.content, 'A');
  model.assertComplete();
  const ambiguous = createReplayModel(value);
  await assert.rejects(ambiguous.respond(request('same', 'question')), (error) => error.code === 'ambiguous_request');
  assert.equal(ambiguous.snapshot().consumed, 0);
  assert.throws(() => ambiguous.assertComplete(), AggregateError);
  await assert.rejects(ambiguous.respond(request('same', 'question'), { lane: 'missing' }), (error) => error.code === 'unknown_lane');
});

test('modelMap is explicit and maps recorded names to actual names', async () => {
  const model = createReplayModel(fixture(entry('recorded-model')), { modelMap: { 'recorded-model': 'installed-model' } });
  await model.respond(request('installed-model'));
  model.assertComplete();
  const wrong = createReplayModel(fixture(entry('recorded-model')));
  await assert.rejects(wrong.respond(request('installed-model')), (error) => error.code === 'request_mismatch');
  assert.throws(() => createReplayModel(fixture(), { modelMap: { main: 42 } }), (error) => error.code === 'invalid_model_map');
});

test('messages, tools and every generation parameter participate in the contract', async () => {
  const expected = request();
  Object.assign(expected, {
    tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
    top_p: 0.9, max_tokens: 100, seed: 8, stop: ['done'], tool_choice: 'auto', response_format: { type: 'json_object' }, stream_options: { include_usage: true },
  });
  const mutations = [
    (value) => { value.messages[0].content = 'different materials'; },
    (value) => { value.tools[0].function.name = 'other'; },
    (value) => { value.tools[0].function.parameters.properties.city.type = 'number'; },
    ...['temperature', 'top_p', 'max_tokens', 'seed', 'stop', 'tool_choice', 'response_format', 'stream_options'].map((key) => (value) => { delete value[key]; }),
    (value) => { value.unrecorded = true; },
  ];
  for (const mutate of mutations) {
    const model = createReplayModel(fixture({ request: expected, response: response() }));
    const changed = copy(expected);
    mutate(changed);
    await assert.rejects(model.respond(changed), (error) => error.code === 'request_mismatch');
    assert.equal(model.snapshot().consumed, 0);
    assert.throws(() => model.assertComplete(), AggregateError);
  }
  const orderedDifferently = { seed: expected.seed, ...copy(expected) };
  const exact = createReplayModel(fixture({ request: expected, response: response() }));
  await exact.respond(orderedDifferently);
  exact.assertComplete();
});

test('out-of-order, extra and previously failed requests never silently pass', async () => {
  const model = createReplayModel(fixture(entry('main', 'first'), entry('main', 'second')));
  await assert.rejects(model.respond(request('main', 'second')), (error) => error.code === 'request_mismatch');
  assert.equal(model.snapshot().remaining, 2);
  await model.respond(request('main', 'first'));
  await model.respond(request('main', 'second'));
  await assert.rejects(model.respond(request('main', 'extra')), (error) => error.code === 'extra_request');
  assert.throws(() => model.assertComplete(), AggregateError);
});

test('declared volatile ID leaves use consistent bijections, preserving user content and ID relationships', async () => {
  const req = request();
  req.metadata = { request_id: 'recorded-request' };
  req.messages = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'recorded-call', type: 'function', function: { name: 'lookup', arguments: '{"city":"上海"}' } }] },
    { role: 'tool', tool_call_id: 'recorded-call', content: 'result' },
  ];
  const value = { ...fixture({ request: req, response: response() }), volatileFields: ['/metadata/request_id', '/messages/0/tool_calls/0/id', '/messages/1/tool_call_id'] };
  const actual = copy(req);
  actual.metadata.request_id = 'runtime-request';
  actual.messages[0].tool_calls[0].id = 'runtime-call';
  actual.messages[1].tool_call_id = 'runtime-call';
  const model = createReplayModel(value);
  await model.respond(actual);
  model.assertComplete();
  const mismatch = copy(actual);
  mismatch.messages[1].tool_call_id = 'unrelated-call';
  await assert.rejects(createReplayModel(value).respond(mismatch), (error) => error.code === 'request_mismatch');
  const changedText = copy(actual);
  changedText.messages[1].content = 'new result';
  await assert.rejects(createReplayModel(value).respond(changedText), (error) => error.code === 'request_mismatch');
  for (const path of ['/messages', '/messages/0/content', '/tools', '/temperature', '/metadata']) {
    assert.throws(() => validateReplay({ ...value, volatileFields: [path] }), (error) => error.code === 'invalid_volatile');
  }
  assert.throws(() => validateReplay({ ...value, volatileFields: ['/metadata/trace_id'] }), (error) => error.code === 'invalid_volatile');
});

test('volatile bindings persist across a lane and mismatch candidates do not mutate bindings', async () => {
  const req = request();
  req.metadata = { session_id: 'recorded-session' };
  const req2 = copy(req);
  req2.messages[0].content = 'follow up';
  const model = createReplayModel({ ...fixture({ request: req, response: response() }, { request: req2, response: response() }), volatileFields: ['/metadata/session_id'] });
  await model.respond({ ...req, metadata: { session_id: 'live-session' } });
  await assert.rejects(model.respond({ ...req2, metadata: { session_id: 'other-session' } }), (error) => error.code === 'request_mismatch');
  assert.equal(model.snapshot().consumed, 1);
  await model.respond({ ...req2, metadata: { session_id: 'live-session' } });
  assert.equal(model.snapshot().remaining, 0);
  assert.throws(() => model.assertComplete(), AggregateError);
});

test('unsupported formats, empty entries, incomplete streams and bad tool fragments fail validation', () => {
  const invalid = [
    {}, { version: 2, entries: [entry()] }, { version: 1, entries: [] }, fixture({}),
    { ...fixture(), ignored: true }, fixture({ ...entry(), ignored: true }),
    fixture({ request: request(), response: { chunks: [] } }),
    fixture({ request: request(), response: { chunks: [{ delta: { content: 'cut off' } }] } }),
    fixture({ request: request(), response: { chunks: [{ delta: { content: 'done' }, finish_reason: 'stop' }, { delta: { content: 'late' } }] } }),
    fixture({ request: request(), response: { chunks: [{ delta: {}, index: 0, finish_reason: 'stop' }, { index: 1, delta: { content: 'missing finish' } }] } }),
    fixture({ request: request(), response: { chunks: [{ delta: { tool_calls: [{ function: { arguments: 5 } }] }, finish_reason: 'tool_calls' }] } }),
    fixture({ request: request(), response: { chunks: [{ finish_reason: 'stop', ignored: true }] } }),
  ];
  for (const value of invalid) assert.throws(() => validateReplay(value));
});

test('prototype keys, accessors, cycles, excessive depth and size are rejected before use', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const dangerous = JSON.parse(`{"version":1,"entries":[],"${key}":{"polluted":true}}`);
    assert.throws(() => validateReplay(dangerous), (error) => error.code === 'unsafe_key');
  }
  assert.equal({}.polluted, undefined);
  let invoked = false;
  const accessor = fixture();
  Object.defineProperty(accessor, 'bad', { enumerable: true, get() { invoked = true; return 'bad'; } });
  assert.throws(() => validateReplay(accessor), (error) => error.code === 'invalid_json');
  assert.equal(invoked, false);
  const cyclic = fixture();
  cyclic.circular = cyclic;
  assert.throws(() => validateReplay(cyclic), (error) => error.code === 'invalid_json');
  let deep = {};
  for (let index = 0; index < 70; index++) deep = { child: deep };
  assert.throws(() => validateReplay(deep), (error) => error.code === 'replay_too_large');
  assert.throws(() => validateReplay({ huge: 'a'.repeat(17 * 1024 * 1024) }), (error) => error.code === 'replay_too_large');
});

test('recordReplay exports completed requests only, never headers and refuses credentials', () => {
  const ledger = [{ id: 'sim-1', state: 'completed', payload: request(), chunks: response().chunks, headers: { authorization: 'Bearer real-secret' } }];
  const recorded = recordReplay(ledger);
  assert.deepEqual(recorded, fixture());
  assert.ok(!JSON.stringify(recorded).includes('headers'));
  assert.ok(!JSON.stringify(recorded).includes('real-secret'));
  for (const state of ['aborted', 'error', 'responding']) assert.throws(() => recordReplay([{ ...ledger[0], state }]), (error) => error.code === 'incomplete_ledger');
  for (const value of [
    { api_key: 'real-key' }, { authorization: 'Bearer real-key' }, { headers: { authorization: 'Bearer simulator-only' } },
    { metadata: { password: 'real-password' } }, { messages: [{ role: 'user', content: 'sk-super-secret-key-value' }] },
    { messages: [{ role: 'user', content: 'Bearer simulator-only followed by Bearer real-secret' }] },
  ]) {
    assert.throws(() => recordReplay([{ ...ledger[0], payload: { ...request(), ...value } }]), (error) => error.code === 'unsafe_credentials');
  }
  const simulated = recordReplay([{ ...ledger[0], payload: { ...request(), api_key: 'simulator-only' } }]);
  assert.equal(simulated.entries[0].request.api_key, 'simulator-only');
});

test('round-trips real local provider requests and preserves UTF-8 tools and usage', async (t) => {
  const toolResponse = { chunks: [
    { delta: { tool_calls: [{ index: 0, id: 'call-a', type: 'function', function: { name: 'lookup', arguments: '{"城市":' } }] } },
    { delta: { tool_calls: [{ index: 0, function: { arguments: '"上海"}' } }] } },
    { delta: {}, finish_reason: 'tool_calls' }, { usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 } },
  ] };
  const original = await createSimulationProvider({ respond: () => toolResponse });
  t.after(() => original.close());
  const first = await fetch(`${original.baseURL}/chat/completions`, { method: 'POST', body: JSON.stringify(request()) });
  const expectedBody = await first.text();
  original.assertHealthy();
  const model = createReplayModel(recordReplay(original.requests));
  const replayed = await createSimulationProvider({ respond: model.respond });
  t.after(() => replayed.close());
  const second = await fetch(`${replayed.baseURL}/chat/completions`, { method: 'POST', body: JSON.stringify(request()) });
  const replayBody = await second.text();
  const normalizeCreated = (body) => body.replaceAll(/"created":\d+/g, '"created":0');
  assert.equal(normalizeCreated(replayBody), normalizeCreated(expectedBody));
  replayed.assertHealthy();
  model.assertComplete();
});

test('cancelled requests and trace failures cannot be claimed as complete', async () => {
  const cancelled = createReplayModel(fixture());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(cancelled.respond(request(), { signal: controller.signal }), (error) => error.code === 'replay_aborted');
  assert.equal(cancelled.snapshot().consumed, 0);
  assert.throws(() => cancelled.assertComplete(), AggregateError);
  const tracing = createReplayModel(fixture(), { trace: () => { throw new Error('trace failed'); } });
  await assert.rejects(tracing.respond(request()), /trace failed/);
  assert.throws(() => tracing.assertComplete(), AggregateError);
});
