import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setImmediate as immediate, setTimeout as wait } from 'node:timers/promises';
import { createSimulationProvider, validateSimulationChunk } from '../scripts/simulator/provider.mjs';

const complete = [{ delta: { content: '完成' }, finish_reason: null }, { delta: {}, finish_reason: 'stop' }];
const payload = { model: 'local-test', messages: [{ role: 'user', content: '你好🌍' }], stream: true };

async function providerFor(t, options = {}) {
  const provider = await createSimulationProvider({ respond: () => complete, ...options });
  t.after(() => provider.close());
  return provider;
}

async function waitFor(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for request state');
    await immediate();
  }
}

function rawRequest(provider, { path = '/v1/chat/completions', method = 'POST', parts = [Buffer.from(JSON.stringify(payload))] } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${provider.origin}${path}`, { method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { body += part; });
      res.on('end', () => resolve({ status: res.statusCode, body, aborted: false }));
      res.on('aborted', () => resolve({ status: res.statusCode, body, aborted: true }));
      res.on('error', () => resolve({ status: res.statusCode, body, aborted: true }));
    });
    req.on('error', reject);
    (async () => {
      for (const part of parts.slice(0, -1)) { req.write(part); await immediate(); }
      req.end(parts.at(-1));
    })().catch(reject);
  });
}

function packets(body) {
  return body.split('\n\n').filter(Boolean).map((line) => {
    assert.ok(line.startsWith('data: '));
    const data = line.slice(6);
    return data === '[DONE]' ? data : JSON.parse(data);
  });
}

test('shared chunk validator rejects malformed choices, usage and tool fragments', () => {
  for (const chunk of [
    { finish_reason: 'made-up' }, { finish_reason: 'stop', index: -1 },
    { delta: { content: 123 } }, { delta: { tool_calls: [{ index: -1 }] } },
    { delta: { tool_calls: [{ function: { arguments: {} } }] } },
    { usage: { completion_tokens: -1 } }, { usage: { total_tokens: '3' } },
    { delta: {}, delayMs: 2_147_483_648 },
  ]) assert.throws(() => validateSimulationChunk(chunk), (error) => error.code === 'invalid_chunk');
});

test('decodes fragmented UTF-8 input and records a standard successful stream', async (t) => {
  const events = [];
  const provider = await providerFor(t, { trace: (event) => events.push(event) });
  const encoded = Buffer.from(JSON.stringify(payload));
  const split = encoded.indexOf(Buffer.from('🌍')) + 1;
  const result = await rawRequest(provider, { parts: [encoded.subarray(0, split), encoded.subarray(split, split + 1), encoded.subarray(split + 1)] });
  assert.equal(result.status, 200);
  assert.equal(result.aborted, false);
  assert.deepEqual(provider.requests[0].payload, payload);
  assert.equal(provider.requests[0].state, 'completed');
  assert.equal(packets(result.body).at(-1), '[DONE]');
  assert.deepEqual(events.map((event) => event.type), ['request/start', 'stream/chunk', 'stream/chunk', 'request/end']);
  assert.ok(events.every((event) => !('headers' in event)));
  provider.assertHealthy();
});

test('preserves fragmented tool arguments and usage after finish_reason', async (t) => {
  const chunks = [
    { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"城市":' } }] } },
    { delta: { tool_calls: [{ index: 0, function: { arguments: '"上海"}' } }] }, delayMs: 1 },
    { delta: {}, finish_reason: 'tool_calls' },
    { usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } },
  ];
  const provider = await providerFor(t, { respond: async function* () { yield* chunks; } });
  const result = await rawRequest(provider);
  const stream = packets(result.body);
  assert.equal(stream.length, 5);
  assert.equal(stream[0].choices[0].delta.tool_calls[0].function.arguments + stream[1].choices[0].delta.tool_calls[0].function.arguments, '{"城市":"上海"}');
  assert.equal(stream[2].choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(stream[3].choices, []);
  assert.deepEqual(stream[3].usage, chunks[3].usage);
  assert.equal(stream[4], '[DONE]');
  provider.assertHealthy();
});

test('also aggregates nonstream content and tool calls', async (t) => {
  const provider = await providerFor(t, { respond: () => [
    { delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'run', arguments: '{' } }] } },
    { delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' },
    { usage: { total_tokens: 3 } },
  ] });
  const result = await rawRequest(provider, { parts: [Buffer.from(JSON.stringify({ ...payload, stream: false }))] });
  const body = JSON.parse(result.body);
  assert.equal(body.object, 'chat.completion');
  assert.deepEqual(body.choices[0].message.tool_calls[0], { id: 'call_a', type: 'function', function: { name: 'run', arguments: '{}' } });
  assert.deepEqual(body.usage, { total_tokens: 3 });
  provider.assertHealthy();
});

test('unknown route and wrong method fail without calling the responder', async (t) => {
  let calls = 0;
  const provider = await providerFor(t, { respond: () => { calls++; return complete; } });
  assert.equal((await rawRequest(provider, { path: '/v1/models' })).status, 404);
  assert.equal((await rawRequest(provider, { method: 'GET', parts: [] })).status, 405);
  assert.equal(calls, 0);
  assert.deepEqual(provider.requests.map((entry) => entry.state), ['error', 'error']);
  assert.deepEqual(provider.errors.map((entry) => entry.code), ['unknown_path', 'invalid_method']);
  assert.throws(() => provider.assertHealthy(), AggregateError);
});

test('undefined response and thrown responder errors explicitly fail', async (t) => {
  const provider = await providerFor(t, { respond: (body) => { if (body.throw) throw new Error('script broke'); } });
  const missing = await rawRequest(provider);
  assert.equal(missing.status, 500);
  assert.equal(JSON.parse(missing.body).error.code, 'missing_response');
  const thrown = await rawRequest(provider, { parts: [Buffer.from('{"throw":true}')] });
  assert.equal(thrown.status, 500);
  assert.match(thrown.body, /script broke/);
  assert.equal(provider.errors.length, 2);
  assert.throws(() => provider.assertHealthy(), /script broke/);
});

test('non-Error throws and broken trace callbacks are retained without leaking rejections', async (t) => {
  const provider = await providerFor(t, { respond: () => { throw undefined; } });
  const result = await rawRequest(provider);
  assert.equal(result.status, 500);
  assert.equal(provider.errors[0].message, 'undefined');
  assert.equal(provider.requests[0].state, 'error');
  const traceProvider = await providerFor(t, { trace: () => { throw new Error('trace broke'); } });
  assert.equal((await rawRequest(traceProvider)).status, 200);
  assert.ok(traceProvider.errors.every((error) => error.code === 'trace_error'));
  assert.throws(() => traceProvider.assertHealthy(), /trace broke/);
});

test('explicit HTTP failures preserve the scripted body and fail the health check', async (t) => {
  const body = { error: { message: 'fixture overload', type: 'rate_limit_error', code: 'fixture_rate_limit' } };
  const provider = await providerFor(t, { respond: () => ({ status: 429, body }) });
  const result = await rawRequest(provider);
  assert.equal(result.status, 429);
  assert.deepEqual(JSON.parse(result.body), body);
  assert.equal(provider.errors[0].code, 'response_status');
  assert.throws(() => provider.assertHealthy(), /fixture overload/);
});

test('invalid JSON and oversized bodies are rejected with bounded input', async (t) => {
  let calls = 0;
  const provider = await providerFor(t, { maxBodyBytes: 32, respond: () => { calls++; return complete; } });
  assert.equal((await rawRequest(provider, { parts: [Buffer.from('{broken')] })).status, 400);
  const oversized = Buffer.from(JSON.stringify({ text: '中'.repeat(15) }));
  assert.equal((await rawRequest(provider, { parts: [oversized] })).status, 413);
  assert.equal(calls, 0);
  assert.deepEqual(provider.errors.map((entry) => entry.code), ['invalid_json', 'body_too_large']);
});

test('client disconnect aborts a pending responder', { timeout: 3000 }, async (t) => {
  let signal;
  const events = [];
  const provider = await providerFor(t, { trace: (event) => events.push(event), respond: (_body, context) => {
    signal = context.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const req = http.request(`${provider.origin}/v1/chat/completions`, { method: 'POST' });
  req.on('error', () => {});
  req.end(JSON.stringify(payload));
  await waitFor(() => signal);
  req.destroy();
  await waitFor(() => provider.requests[0].state === 'aborted');
  assert.equal(signal.aborted, true);
  assert.equal(events.at(-1).type, 'request/aborted');
  provider.assertHealthy();
});

test('close marks an uncooperative responder abandoned and fails health within its deadline', { timeout: 3000 }, async (t) => {
  let signal;
  let finish;
  const provider = await providerFor(t, { cleanupTimeoutMs: 25, respond: (_body, context) => {
    signal = context.signal;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const req = http.request(`${provider.origin}/v1/chat/completions`, { method: 'POST' });
  req.on('error', () => {});
  req.end(JSON.stringify(payload));
  await waitFor(() => signal);
  const closing = provider.close();
  await closing;
  assert.equal(provider.close(), closing);
  assert.equal(signal.aborted, true);
  assert.equal(provider.requests[0].state, 'aborted');
  assert.equal(provider.requests[0].callbacks[0].state, 'abandoned');
  assert.deepEqual(provider.errors.map((error) => error.code), ['responder_abandoned']);
  assert.throws(() => provider.assertHealthy(), /responder did not settle/);
  const snapshot = JSON.stringify(provider.requests);
  const errorCount = provider.errors.length;
  finish(complete);
  await immediate();
  assert.equal(JSON.stringify(provider.requests), snapshot);
  assert.equal(provider.errors.length, errorCount);
});

test('close interrupts a delayed or forever-pending iterator', { timeout: 3000 }, async (t) => {
  for (const mode of ['delay', 'next']) {
    let signal;
    let nextStarted = false;
    const provider = await providerFor(t, { cleanupTimeoutMs: 25, respond: (_body, context) => {
      signal = context.signal;
      return mode === 'delay' ? [{ delta: { content: 'late' }, delayMs: 60_000 }, { finish_reason: 'stop' }] : {
        [Symbol.asyncIterator]() { return this; },
        next() { nextStarted = true; return new Promise(() => {}); },
      };
    } });
    const response = rawRequest(provider);
    await waitFor(() => mode === 'next' ? nextStarted : provider.requests[0]?.callbacks?.some((callback) => callback.kind === 'iterator' && callback.state === 'fulfilled'));
    await provider.close();
    await response.catch(() => {});
    assert.equal(signal.aborted, true);
    assert.equal(provider.requests[0].state, 'aborted');
    if (mode === 'next') {
      assert.equal(provider.requests[0].callbacks.at(-1).state, 'abandoned');
      assert.deepEqual(provider.errors.map((error) => error.code), ['iterator_abandoned']);
      assert.throws(() => provider.assertHealthy(), AggregateError);
    } else provider.assertHealthy();
  }
});

function cleanupIterator(signal, returnCallback, nextStarted) {
  return {
    [Symbol.asyncIterator]() { return this; },
    next() {
      nextStarted();
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
    return: returnCallback,
  };
}

test('close waits for delayed iterator cleanup rejection before reporting health', { timeout: 3000 }, async (t) => {
  let nextStarted = false;
  const provider = await providerFor(t, { cleanupTimeoutMs: 500, respond: (_body, { signal }) => cleanupIterator(signal,
    async () => { await wait(100); throw new Error('delayed return failed'); },
    () => { nextStarted = true; }),
  });
  const response = rawRequest(provider).catch(() => {});
  await waitFor(() => nextStarted);
  const start = performance.now();
  const closing = provider.close();
  await closing;
  await response;
  assert.ok(performance.now() - start >= 80);
  assert.equal(provider.requests[0].cleanup.state, 'error');
  assert.deepEqual(provider.errors.map((error) => error.code), ['iterator_cleanup']);
  assert.throws(() => provider.assertHealthy(), /delayed return failed/);
  const errors = provider.errors.slice();
  await wait(60);
  assert.deepEqual(provider.errors, errors);
  assert.equal(provider.close(), closing);
});

test('uncooperative iterator cleanup explicitly times out and never passes health', { timeout: 3000 }, async (t) => {
  let nextStarted = false;
  const provider = await providerFor(t, { cleanupTimeoutMs: 25, respond: (_body, { signal }) => cleanupIterator(signal,
    () => new Promise(() => {}), () => { nextStarted = true; }),
  });
  const response = rawRequest(provider).catch(() => {});
  await waitFor(() => nextStarted);
  await provider.close();
  await response;
  assert.equal(provider.requests[0].cleanup.state, 'timed_out');
  assert.deepEqual(provider.errors.map((error) => error.code), ['cleanup_timeout']);
  assert.throws(() => provider.assertHealthy(), /cleanup did not settle/);
});

test('a forever-blocked async generator reports both abandoned next and timed-out return', { timeout: 3000 }, async (t) => {
  let nextStarted = false;
  const provider = await providerFor(t, { cleanupTimeoutMs: 25, respond: async function* () {
    nextStarted = true;
    await new Promise(() => {});
    yield { finish_reason: 'stop' };
  } });
  const response = rawRequest(provider).catch(() => {});
  await waitFor(() => nextStarted);
  await provider.close();
  await response;
  assert.equal(provider.requests[0].callbacks.at(-1).state, 'abandoned');
  assert.equal(provider.requests[0].cleanup.state, 'timed_out');
  assert.deepEqual(provider.errors.map((error) => error.code), ['iterator_abandoned', 'cleanup_timeout']);
  assert.throws(() => provider.assertHealthy(), AggregateError);
});

test('a non-cancellation responder rejection during close is recorded before sealing', { timeout: 3000 }, async (t) => {
  let started = false;
  const provider = await providerFor(t, { cleanupTimeoutMs: 200, respond: async () => {
    started = true;
    await wait(50);
    throw new Error('late responder failure');
  } });
  const response = rawRequest(provider).catch(() => {});
  await waitFor(() => started);
  await provider.close();
  await response;
  assert.equal(provider.requests[0].callbacks[0].state, 'rejected');
  assert.deepEqual(provider.errors.map((error) => error.code), ['responder_late_error']);
  assert.throws(() => provider.assertHealthy(), /late responder failure/);
});

test('late cleanup rejection after a close timeout cannot mutate the sealed ledger', { timeout: 3000 }, async (t) => {
  let nextStarted = false;
  const provider = await providerFor(t, { cleanupTimeoutMs: 25, respond: (_body, { signal }) => cleanupIterator(signal,
    async () => { await wait(100); throw new Error('too late return rejection'); }, () => { nextStarted = true; }),
  });
  const response = rawRequest(provider).catch(() => {});
  await waitFor(() => nextStarted);
  const closing = provider.close();
  await closing;
  await response;
  const errors = provider.errors.slice();
  const ledger = JSON.stringify(provider.requests);
  assert.equal(errors[0].code, 'cleanup_timeout');
  await wait(150);
  assert.deepEqual(provider.errors, errors);
  assert.equal(JSON.stringify(provider.requests), ledger);
  assert.equal(provider.close(), closing);
  assert.throws(() => provider.assertHealthy(), AggregateError);
});

test('a pending iterator cleanup cannot pass health before close completes', { timeout: 3000 }, async (t) => {
  let nextStarted = false;
  let finishCleanup;
  const provider = await providerFor(t, { respond: (_body, { signal }) => cleanupIterator(signal,
    () => new Promise((resolve) => { finishCleanup = resolve; }), () => { nextStarted = true; }),
  });
  const req = http.request(`${provider.origin}/v1/chat/completions`, { method: 'POST' });
  req.on('error', () => {});
  req.end(JSON.stringify(payload));
  await waitFor(() => nextStarted);
  req.destroy();
  await waitFor(() => finishCleanup);
  assert.throws(() => provider.assertHealthy(), /cleanup is pending/);
  finishCleanup({ done: true });
  await provider.close();
  assert.equal(provider.requests[0].cleanup.state, 'completed');
  provider.assertHealthy();
});

test('cleanup deadlines reject illegal or unbounded options before opening a socket', async () => {
  for (const cleanupTimeoutMs of [0, -1, 60_001, Infinity, NaN, 1.5]) {
    await assert.rejects(createSimulationProvider({ respond: () => complete, cleanupTimeoutMs }), /cleanupTimeoutMs/);
  }
});

test('iterator errors and incomplete streams never emit fake completion', async (t) => {
  for (const mode of ['throw', 'incomplete']) {
    const events = [];
    const provider = await providerFor(t, { trace: (event) => events.push(event), respond: async function* () {
      yield { delta: { content: 'partial' } };
      // Ensure the first data packet has reached the client before failure.
      await immediate();
      if (mode === 'throw') throw new Error('stream failed');
    } });
    const result = await rawRequest(provider);
    assert.equal(result.aborted, true);
    assert.match(result.body, /partial/);
    assert.ok(!result.body.includes('[DONE]'));
    assert.ok(!result.body.includes('"finish_reason":"stop"'));
    assert.equal(provider.requests[0].state, 'error');
    assert.equal(events.at(-1).type, 'request/error');
    assert.throws(() => provider.assertHealthy(), AggregateError);
  }
});
