import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCases } from '../scripts/simulator/explore.mjs';
import { createGeneratedDefinition } from '../scripts/simulator/generated-scenario.mjs';
import { Checks } from '../scripts/simulator/assertions.mjs';
import { createSimulationProvider } from '../scripts/simulator/provider.mjs';

// This exercises only generated-plan mapping and call order. It is deliberately
// a stub, never evidence of native DSH, persistence or provider coverage.
async function stubRun(value, { clock = 'virtual', corruptRead = false, realProvider = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'generated-mapping-test-'));
  const log = [], events = [], messages = [{ role: 'system', content: 'host system' }];
  const trace = [];
  const record = entry => trace.push({ observedAt: performance.now(), ...entry });
  const spec = createGeneratedDefinition(value).create({ trace: record });
  const provider = realProvider ? await createSimulationProvider({ respond: spec.model.respond.bind(spec.model), trace: record }) : { requests: [] };
  async function* transport(payload, signal) {
    if (realProvider) {
      const response = await fetch(provider.baseURL + '/chat/completions', { method: 'POST', signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'generated-test', stream: true, ...payload }) });
      assert.equal(response.status, 200);
      let buffer = ''; const decoder = new TextDecoder();
      for await (const data of response.body) {
        buffer += decoder.decode(data, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const packet = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (packet === 'data: [DONE]') return;
          const parsed = JSON.parse(packet.slice('data: '.length)), choice = parsed.choices[0];
          yield { delta: choice.delta, finish_reason: choice.finish_reason, ...(parsed.usage ? { usage: parsed.usage } : {}) };
        }
      }
      return;
    }
    const request = { id: `stub-${provider.requests.length + 1}`, state: 'streaming', chunks: [], callbacks: [] };
    provider.requests.push(request);
    const response = await spec.model.respond(payload, { signal, requestId: request.id });
    const iterator = response.chunks[Symbol.asyncIterator]();
    try {
      while (true) {
        const callback = { state: 'pending' }; request.callbacks.push(callback);
        const pending = iterator.next().then(next => { callback.state = 'fulfilled'; return next; }, error => { callback.state = 'rejected'; throw error; });
        let onAbort;
        const aborted = new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); if (signal.aborted) onAbort(); });
        let next;
        try { next = await Promise.race([pending, aborted]); } finally { signal.removeEventListener('abort', onAbort); }
        if (next.done) { request.state = 'completed'; return; }
        request.chunks.push(next.value); yield next.value;
      }
    } catch (error) {
      request.state = signal.aborted ? 'aborted' : 'error';
      request.cleanup = { state: 'pending' };
      iterator.return().then(() => { request.cleanup.state = 'completed'; }, () => { request.cleanup.state = 'error'; });
      throw error;
    }
  }
  let sessionId = 'stub-session', operation, active;
  const host = {
    workspace: root, clockMode: clock,
    async createSession(options = {}) { log.push(['createSession', options]); assert.ok(!options.id || options.id === sessionId); return sessionId; },
    async prompt(id, text) {
      assert.equal(id, sessionId); log.push(['prompt', text]);
      messages.push({ role: 'user', content: text });
      operation = new AbortController();
      const requestSignal = operation.signal;
      active = (async () => {
        while (true) {
          let content = '', tool, finish;
          try {
            for await (const chunk of transport({ tools: [{ function: { name: 'todo_write' } }, { function: { name: 'write' } }, { function: { name: 'read' } }], messages: structuredClone(messages) }, requestSignal)) {
              if (chunk.delta?.content) content += chunk.delta.content;
              if (chunk.delta?.tool_calls) {
                for (const call of chunk.delta.tool_calls) {
                  if (call.function.name) tool = { id: call.id, name: call.function.name, args: '' };
                  tool.args += call.function.arguments ?? '';
                }
              }
              finish = chunk.finish_reason ?? finish;
            }
          } catch (error) {
            if (requestSignal.aborted) { if (content) events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: content }] } } }); return; }
            throw error;
          }
          if (!tool) { events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: content }] } } }); return; }
          assert.equal(finish, 'tool_calls');
          const args = JSON.parse(tool.args);
          log.push([tool.name, args]);
          events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'tool-call', id: tool.id, name: tool.name }] } } });
          let result;
          if (tool.name === 'write') { await writeFile(join(root, args.file_path), args.content); result = 'file written'; }
          else result = corruptRead ? 'corrupted tool output' : await readFile(join(root, args.file_path), 'utf8');
          const message = { role: 'tool', toolCallId: tool.id, content: result };
          messages.push(message); events.push({ type: 'tool/result', data: { message } });
        }
      })();
      active.catch(() => {});
    },
    async idle(id) { assert.equal(id, sessionId); log.push(['idle']); await active; return { running: 'idle' }; },
    async rpc(method, args) { log.push([method, args]); assert.equal(method, 'session/cancel'); operation.abort(); await active; },
    async restart(options) { log.push(['restart', options]); operation.abort(); await active; },
    async control(path, body) {
      log.push(['control', path, body]);
      if (path === '/clock') return { now: body?.advance ?? 0 };
      assert.ok(path.startsWith('/snapshot?session=')); return { events: structuredClone(events) };
    },
    async durable(id) { assert.equal(id, sessionId); log.push(['durable']); return { events: structuredClone(events) }; },
  };
  try {
    const result = await spec.run({ host, checks: new Checks(), provider, trace: record });
    spec.model.assertComplete();
    if (realProvider) provider.assertHealthy();
    return { result, log, events, trace, requests: provider.requests, snapshot: spec.model.snapshot(),
      file: value.actions.some(action => action.type === 'write') ? await readFile(join(root, 'exploration.txt'), 'utf8') : null };
  } finally { operation?.abort(); for (const gate of spec.gates) gate.abort(); await active?.catch(() => {}); if (realProvider) await provider.close(); await rm(root, { recursive: true, force: true }); }
}

test('all generated action families map to finite model scripts and host calls', async () => {
  for (const value of generateCases({ seed: 7, count: 12 })) {
    const output = await stubRun(value);
    assert.deepEqual(output.trace.filter(event => event.type === 'generated/action').map(event => event.action), value.actions);
    assert.equal(output.result.actionCount, value.actions.length);
    assert.deepEqual(output.result.generatedCase, value);
    assert.equal(output.log.filter(call => call[0] === 'write').length, value.actions.filter(action => action.type === 'write').length);
    assert.equal(output.log.filter(call => call[0] === 'read').length, value.actions.filter(action => action.type === 'read').length);
    assert.equal(output.log.filter(call => call[0] === 'restart').length, value.actions.filter(action => action.type === 'restart').length);
    if (output.file) assert.equal(output.file, value.parameters.text + `\nNUMBER=${value.parameters.number}`);
  }
});

test('restart actions select distinct tool checkpoints and recreate the same session', async () => {
  const cases = generateCases({ count: 20 }).filter(value => value.parameters.scenario === 'restart-checkpoint');
  assert.deepEqual(new Set(cases.map(value => value.parameters.restartCheckpoint)), new Set(['after-write', 'after-read']));
  for (const value of cases.slice(0, 2)) {
    const { log } = await stubRun(value);
    const operations = log.filter(call => ['write', 'read', 'restart'].includes(call[0]));
    assert.deepEqual(operations.map(call => call[0]), value.actions.filter(action => ['write', 'read', 'restart'].includes(action.type)).map(action => action.type));
    assert.deepEqual(log.find(call => call[0] === 'restart')[1], { crash: true });
    assert.ok(log.some(call => call[0] === 'createSession' && call[1].id === 'stub-session'));
    assert.equal(log.filter(call => call[0] === 'prompt').length, 2);
  }
});

test('completion order, split, late chunks and clock delay affect actual mapping', async () => {
  const cases = generateCases({ count: 12 }).filter(value => value.actions.some(action => action.type === 'stream'));
  for (const value of cases) {
    const { log, events } = await stubRun(value);
    const serialized = JSON.stringify(events), late = 'GENERATED_LATE_' + value.parameters.sourceSentinel;
    assert.equal(serialized.includes(late), value.parameters.cancelOrder === 'after-completion' && value.parameters.lateChunks > 0);
    assert.ok(log.some(call => call[0] === 'control' && call[1] === '/clock' && call[2].advance === value.parameters.delayMs));
    assert.equal(log.filter(call => call[0] === 'session/cancel').length, 1);
    assert.equal(log.filter(call => call[0] === 'prompt').length, 2);
  }
  const value = cases[0];
  const real = await stubRun(value, { clock: 'real' });
  assert.ok(!real.log.some(call => call[1] === '/clock'));
});

test('parameters alter real tool content and input plan is preserved', async () => {
  const value = generateCases().find(value => value.parameters.scenario === 'read-write');
  const changed = structuredClone(value);
  changed.parameters.number = 123;
  changed.parameters.text = '变更😀e\u0301 [NEW_SOURCE]'; changed.parameters.sourceSentinel = 'NEW_SOURCE';
  changed.actions[0].text = changed.parameters.text; changed.actions[1].text = changed.parameters.text;
  const original = structuredClone(changed), result = await stubRun(changed);
  assert.equal(result.file, '变更😀e\u0301 [NEW_SOURCE]\nNUMBER=123');
  assert.deepEqual(changed, original);
});

test('causal deletion and unsupported actions are invalid rather than product failures', () => {
  const cases = generateCases();
  for (const value of cases) {
    const deletedPrompt = structuredClone(value); deletedPrompt.actions.shift();
    assert.throws(() => createGeneratedDefinition(deletedPrompt), { code: 'INVALID_SCENARIO' });
  }
  const stream = cases.find(value => value.actions.some(action => action.type === 'stream'));
  for (const type of ['stream', 'cancel', 'resume']) {
    const deleted = structuredClone(stream); deleted.actions = deleted.actions.filter(action => action.type !== type);
    assert.throws(() => createGeneratedDefinition(deleted), { code: 'INVALID_SCENARIO' });
  }
  const written = cases.find(value => value.parameters.scenario === 'read-write');
  const deleted = structuredClone(written); deleted.actions.splice(1, 1);
  assert.throws(() => createGeneratedDefinition(deleted), { code: 'INVALID_SCENARIO' });
  const shell = structuredClone(written); shell.actions.push({ type: 'shell', cmd: 'unsafe' });
  assert.throws(() => createGeneratedDefinition(shell), { code: 'INVALID_SCENARIO' });
});

test('actual tool response corruption is caught before final success', async () => {
  const value = generateCases().find(value => value.parameters.scenario === 'read-write');
  await assert.rejects(stubRun(value, { corruptRead: true }), /real read result must retain/);
});

test('real HTTP cancellation precedes actual late production, including zero late chunks', { timeout: 5000 }, async () => {
  const original = generateCases().find(value => value.actions.some(action => action.type === 'stream'));
  for (const lateChunks of [0, 2]) {
    const value = structuredClone(original);
    value.parameters.cancelOrder = 'before-completion'; value.parameters.lateChunks = lateChunks; value.parameters.delayMs = 20;
    value.actions.find(action => action.type === 'stream').lateChunks = lateChunks;
    const delay = value.actions.find(action => action.type === 'delay'); delay.phase = 'before-completion'; delay.ms = 20;
    value.actions.find(action => action.type === 'cancel').phase = 'before-completion';
    const output = await stubRun(value, { realProvider: true, clock: 'real' });
    const produced = output.trace.filter(event => event.type === 'generated/producer-chunk');
    assert.equal(produced.length, lateChunks + 2);
    assert.ok(produced.every(event => event.afterAbort));
    const abortIndex = output.trace.findIndex(event => event.type === 'request/aborted');
    assert.ok(abortIndex >= 0 && abortIndex < output.trace.findIndex(event => event.type === 'generated/producer-chunk'));
    const delayAt = output.trace.find(event => event.type === 'generated/action' && event.action.type === 'delay').observedAt;
    assert.ok(produced[0].observedAt - delayAt >= 18, 'real delay must actually elapse before late production');
    const request = output.requests.find(request => request.id === produced[0].requestId);
    assert.equal(request.state, 'aborted'); assert.equal(request.cleanup.state, 'completed');
    assert.ok(!JSON.stringify(request.chunks).includes('GENERATED_TAIL_'));
    assert.ok(!JSON.stringify(output.events).includes('GENERATED_TAIL_'));
  }
});

test('real HTTP completion commits text and every late chunk before cancellation', { timeout: 5000 }, async () => {
  const value = generateCases().find(value => value.actions.some(action => action.type === 'stream') && value.parameters.cancelOrder === 'after-completion');
  const output = await stubRun(value, { realProvider: true });
  const produced = output.trace.filter(event => event.type === 'generated/producer-chunk');
  assert.equal(produced.length, value.parameters.lateChunks + 2); assert.ok(produced.every(event => !event.afterAbort));
  const request = output.requests.find(request => request.id === produced[0].requestId);
  assert.equal(request.state, 'completed');
  const committed = request.chunks.map(chunk => chunk.delta?.content ?? '').join('');
  assert.ok(committed.includes(value.parameters.text)); assert.ok(committed.includes('GENERATED_TAIL_'));
  assert.ok(JSON.stringify(output.events).includes('GENERATED_TAIL_'));
  assert.ok(output.trace.findIndex(event => event.type === 'request/end' && event.requestId === request.id)
    < output.trace.findIndex(event => event.type === 'generated/action' && event.action.type === 'cancel'));
});

test('definition retains independent generated input and Gate cleanup ends ignoring-abort producer', { timeout: 1000 }, async () => {
  const value = generateCases().find(value => value.actions.some(action => action.type === 'stream'));
  const definition = createGeneratedDefinition(value);
  assert.deepEqual(definition.generatedCase, value);
  definition.generatedCase.parameters.text = 'mutated metadata';
  const spec = definition.create(), controller = new AbortController();
  const response = await spec.model.respond({ tools: [{ function: { name: 'todo_write' } }], messages: [{ role: 'user', content: value.parameters.text }] }, { signal: controller.signal, requestId: 'cleanup-proof' });
  const iterator = response.chunks[Symbol.asyncIterator](), first = iterator.next();
  await Promise.resolve();
  spec.gates.find(gate => gate.snapshot().arrivals > 0).release();
  await first;
  const pending = iterator.next();
  await Promise.resolve(); controller.abort();
  const cleanupReason = new DOMException('test cleanup', 'AbortError');
  for (const gate of spec.gates) gate.abort(cleanupReason);
  await assert.rejects(pending, error => error === cleanupReason);
  await iterator.return();
});
