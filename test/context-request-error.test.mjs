import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installContextErrorRecovery } from '../src/context/host.mjs';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { newRecord, normalizeChoices, userRevision } from '../src/context/core.mjs';
import { FixtureSession, user, system, exchange, adapter } from './context-fixture.mjs';

const overflow = "The input is longer than the model's context length.";
const failures = [
  { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'Context capacity exceeded' },
  { code: 'INVALID_REQUEST', message: `400 ${overflow}` },
  { code: 'INVALID_REQUEST', message: `400 ${JSON.stringify({ error: { message: overflow } })}` },
  { code: 'INVALID_REQUEST', message: '400 {"type":"invalid_request_error","code":"","message":"The input is longer than the model\'s context length trace_id: [redacted-id]"}' },
];

function hook(applyReady) {
  let handler;
  const warnings = [], ctx = {
    on(name, callback, options) {
      assert.equal(name, 'agent/request-error'); assert.deepEqual(options, { global: true }); handler = callback;
    },
    logger: { warn: message => warnings.push(message) },
  };
  installContextErrorRecovery(ctx, { context: { applyReady } }, session => ['trisoul-x', 'omd-ptc'].includes(session.header.agentPreset));
  return { handler, warnings };
}
const request = (failure, { preset = 'trisoul-x', signal = new AbortController().signal } = {}) => ({
  agent: { session: new FixtureSession('request', [], [], { agentPreset: preset }) }, failure, signal,
});

for (const failure of failures) {
  test(`context overflow retries only after applying ready context: ${failure.code} ${failure.message}`, async () => {
    const input = request(failure), calls = [], f = hook(async (...args) => { calls.push(args); return { changed: true }; });
    assert.deepEqual(await f.handler(input, () => assert.fail('must not fall through after a change')), { kind: 'retry' });
    assert.deepEqual(calls, [[input.agent, { ignoreCooldown: true }]]); assert.deepEqual(f.warnings, []);
  });

  test(`no ready change falls through with the original failure: ${failure.code} ${failure.message}`, async () => {
    const input = request(failure), original = structuredClone(input.failure), result = { kind: 'fail', failure };
    let applied = 0, continued = 0;
    const f = hook(async () => { applied++; return null; });
    assert.equal(await f.handler(input, () => { continued++; return result; }), result);
    assert.equal(applied, 1); assert.equal(continued, 1); assert.equal(f.warnings.length, 1);
    assert.deepEqual(input.failure, original);
  });

  test(`aborted and unmanaged requests never attempt recovery: ${failure.code} ${failure.message}`, async () => {
    const f = hook(() => assert.fail('must not apply context'));
    for (const input of [request(failure, { signal: AbortSignal.abort() }), request(failure, { preset: 'stock' })]) {
      const result = { kind: 'fail', failure };
      assert.equal(await f.handler(input, () => result), result);
    }
    assert.deepEqual(f.warnings, []);
  });
}

test('other invalid requests and non-request errors never compact or retry', async () => {
  const f = hook(() => assert.fail('must not apply context'));
  for (const failure of [
    { code: 'INVALID_REQUEST', message: "400 Missing required parameter: 'messages[1].reasoning_text'." },
    { code: 'INVALID_REQUEST', message: '413 failed to buffer the request body: length limit exceeded' },
    { code: 'INVALID_REQUEST', message: '400 Request body too large' },
    { code: 'INVALID_REQUEST', message: '400 Invalid parameter: temperature must be between 0 and 2' },
    { code: 'INVALID_REQUEST', message: '400 Bad request' },
    { code: 'AUTH', message: '401 Invalid API key' },
    { code: 'RATE_LIMIT', message: '429 Rate limit exceeded' },
    { code: 'TRANSPORT', message: 'fetch failed: ECONNRESET' },
    ...['AUTH', 'RATE_LIMIT', 'TRANSPORT', 'SERVER', 'ABORTED', 'PI_AI_ERROR'].map(code => ({ code, message: overflow })),
  ]) {
    const input = request(failure), result = { kind: 'fail', failure };
    assert.equal(await f.handler(input, () => result), result, failure.message);
    assert.equal(input.failure, failure);
  }
  assert.deepEqual(f.warnings, []);
});

test('the OMD PTC preset retains the same recovery path', async () => {
  const f = hook(async () => ({ changed: true }));
  assert.deepEqual(await f.handler(request(failures.at(-1), { preset: 'omd-ptc' }), () => assert.fail('managed preset must recover')), { kind: 'retry' });
});

function pipelineFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'context-request-error-'));
  const session = new FixtureSession(); system(session); const prompt = user(session, 'Keep this request and image.');
  prompt.data.content.push({ type: 'image', data: 'test-image', mimeType: 'image/png' });
  const hub = { store: { dir }, config: () => contextConfig({ surgeryCooldownSteps: 100, keepTailEvents: 0 }),
    scope: () => ({ mode: 'session', project: '/project' }), ctx: {}, action() {},
    call() { assert.fail('request error recovery must not call a model'); } };
  const pipeline = new ContextPipeline(hub, adapter);
  t.after(async () => { await pipeline.dispose(); rmSync(dir, { recursive: true, force: true }); });
  const state = pipeline.state(session), agent = { session, status: 'running' };
  const record = newRecord(session, exchange(session), { summary: 'Read the file.', documents: [] }, state.binding);
  state.records.push(record);
  const f = hook(pipeline.applyReady.bind(pipeline));
  return { ...f, pipeline, session, state, record, agent, prompt };
}

test('confirmed overflow applies a pending summary despite cooldown, then stops retrying without another change', async t => {
  const f = pipelineFixture(t), originals = structuredClone(f.session.snapshotEvents());
  f.state.lastReplacementStep = f.state.steps;
  f.state.pending = { id: 'ready', userRevision: userRevision(f.session), choices: normalizeChoices({
    choices: [{ action: 'brief', ids: [f.record.id] }],
  }, f.state, f.session) };
  assert.equal(await f.pipeline.applyReady(f.agent), null, 'ordinary application still observes cooldown');
  const input = { agent: f.agent, failure: failures.at(-1), signal: new AbortController().signal };
  assert.deepEqual(await f.handler(input, () => assert.fail('ready plan must recover')), { kind: 'retry' });
  assert.equal(f.state.records[0].mode, 'brief'); assert.equal(f.state.pending, null);
  assert.deepEqual(f.session.snapshotEvents().slice(0, originals.length), originals, 'original archive remains intact');
  assert.deepEqual(f.session.deriveMessages().find(m => m.id === f.prompt.data.id), f.prompt.data, 'user text and image stay exact');
  const after = structuredClone(f.session.snapshotEvents()), result = { kind: 'fail', failure: input.failure };
  assert.equal(await f.handler(input, () => result), result);
  assert.deepEqual(f.session.snapshotEvents(), after);
  assert.equal(f.pipeline.jobs.size, 0); assert.equal(f.pipeline.timers.size, 0);
});

test('prepared records without a pending plan preserve the entire original context', async t => {
  const f = pipelineFixture(t), events = structuredClone(f.session.snapshotEvents()), messages = structuredClone(f.session.deriveMessages());
  const input = { agent: f.agent, failure: failures.at(-1), signal: new AbortController().signal }, result = { kind: 'fail', failure: input.failure };
  assert.equal(await f.handler(input, () => result), result);
  assert.equal(f.state.records[0].mode, 'raw'); assert.deepEqual(f.session.snapshotEvents(), events);
  assert.deepEqual(f.session.deriveMessages(), messages); assert.equal(f.warnings.length, 1);
  assert.equal(f.pipeline.jobs.size, 0); assert.equal(f.pipeline.timers.size, 0);
});

test('application errors remain errors rather than becoming a retry', async () => {
  const error = new Error('flush failed'), f = hook(async () => { throw error; });
  await assert.rejects(f.handler(request(failures[0]), () => assert.fail('must propagate application error')), value => value === error);
});

