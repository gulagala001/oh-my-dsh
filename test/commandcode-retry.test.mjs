import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import { retryCommandCodeRejection, installCommandCodeRetry } from '../src/commandcode-retry.mjs';
const error = () => ({ type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_REQUEST', message: "The input is longer than the model's context length" } } });
const zero = { type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
const done = { type: 'finish', reason: { kind: 'stop' } };

test('retries only empty rejected attempts; failed usage and finish do not pollute the accepted stream', async () => {
  let calls = 0, closed = 0; const retries = [];
  const output = await Array.fromAsync(retryCommandCodeRejection(async function* () {
    try { calls++; yield zero; yield calls < 3 ? error() : done; } finally { closed++; }
  }, { waitMs: 0, onRetry: count => retries.push(count) }));
  assert.deepEqual(output, [zero, done]); assert.equal(calls, 3); assert.equal(closed, 3); assert.deepEqual(retries, [1, 2]);
});

test('real overflow remains an unchanged error after exactly three attempts', async () => {
  let calls = 0; const failure = error();
  const output = await Array.fromAsync(retryCommandCodeRejection(async function* () { calls++; yield zero; yield failure; }, { waitMs: 0 }));
  assert.equal(calls, 3); assert.deepEqual(output, [zero, failure]); assert.equal(output.at(-1), failure);
});

test('any output, charged usage, unrelated failure or thrown error prevents replay', async () => {
  for (const first of [{ type: 'block-start', index: 0, blockType: 'reasoning' }, { type: 'text-delta', index: 0, text: 'x' }, { type: 'tool-call-delta', index: 0, name: 'write', argumentsDelta: '{}' }, { type: 'usage', usage: { inputTokens: 1 } }]) {
    let calls = 0; const failure = error();
    assert.deepEqual(await Array.fromAsync(retryCommandCodeRejection(async function* () { calls++; yield first; yield failure; }, { waitMs: 0 })), [first, failure]);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const other = { type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_REQUEST', message: 'reasoning_text must be passed back' } } };
  assert.deepEqual(await Array.fromAsync(retryCommandCodeRejection(async function* () { calls++; yield other; }, { waitMs: 0 })), [other]);
  assert.equal(calls, 1);
  await assert.rejects(Array.fromAsync(retryCommandCodeRejection(async function* () { throw Error('network'); })), /network/);
});

test('cancellation stops before dispatch and during retry backoff', async () => {
  for (const initial of [true, false]) {
    const abort = new AbortController(); let calls = 0;
    if (initial) abort.abort();
    const output = await Array.fromAsync(retryCommandCodeRejection(async function* () { calls++; yield error(); }, { signal: abort.signal, onRetry: () => abort.abort() }));
    assert.equal(calls, initial ? 0 : 1); assert.equal(output.at(-1).reason.kind, 'aborted');
  }
});

test('prepared retries preserve dispatch ownership, one-shot handles, complete middleware and unload', async t => {
  const ctx = new Context(), runtime = new LlmRuntime(ctx); let calls = 0, middleware = 0, prepare = 0; const observed = [];
  const provider = 'goat', model = 'deepseek/deepseek-v4.1-flash';
  const registration = runtime.registerAdapter([provider], { providerInfo: id => ({ id, name: id }), providerRetryPolicy() {}, async prepareCall() {
    prepare++; return { model: { provider, id: model, name: model }, async *stream(options) { calls++; observed.push(options); yield zero; yield calls < 3 ? error() : done; } };
  } }); t.after(registration);
  ctx.on('llm/stream', async function* (_options, next) { middleware++; yield* next(); });
  const before = runtime.streamWithRegistration; let dispose;
  let profile = { api: 'openai-responses', baseURL: 'https://api.commandcode.ai/provider/v1' };
  installCommandCodeRetry({ llm: runtime, settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { [provider]: profile } } }] }, effect(fn) { dispose = fn(); } }); t.after(() => dispose());
  const options = Object.freeze({ provider, model, messages: Object.freeze([]) }), prepared = await runtime.prepareCall(options);
  assert.deepEqual(await Array.fromAsync(prepared.stream(options)), [zero, done]);
  assert.equal(prepare, 1); assert.equal(calls, 3); assert.equal(middleware, 3);
  assert.ok(observed.every(o => o === observed[0]));
  assert.throws(() => prepared.stream(options), /only be dispatched once/);
  calls = 0; await Array.fromAsync(runtime.stream(options)); assert.equal(calls, 1, 'unprepared direct streams remain host-owned');
  profile = { ...profile, baseURL: 'https://api.commandcode.ai.other.invalid' }; calls = 0;
  await Array.fromAsync((await runtime.prepareCall(options)).stream(options)); assert.equal(calls, 1, 'other gateways never retry');
  dispose(); assert.equal(runtime.streamWithRegistration, before);
});
