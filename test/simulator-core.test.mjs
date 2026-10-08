import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualClock } from '../scripts/simulator/clock.mjs';
import { Gate, ScriptedModel, ScenarioDeviationError } from '../scripts/simulator/scene.mjs';

test('clock fires only due timers in (due,id) order and exposes bound methods', async () => {
  const clock = new VirtualClock({ now: 100 });
  const { now, setTimeout, clearTimeout } = clock;
  const events = [];
  setTimeout((arg) => events.push([arg, now()]), 10, 'first');
  setTimeout(() => events.push(['second', now()]), 10);
  setTimeout(() => events.push(['early', now()]), 5);
  const canceled = setTimeout(() => assert.fail('canceled timer executed'), 3);
  clearTimeout(canceled);
  assert.equal(clock.pending().length, 3);
  await clock.advance(4);
  assert.deepEqual(events, []);
  await clock.advance(6);
  assert.deepEqual(events, [['early', 105], ['first', 110], ['second', 110]]);
  assert.equal(now(), 110);
  assert.deepEqual(clock.pending(), []);
});

test('clock drains deep microtask chains and newly registered due timers', async () => {
  const clock = new VirtualClock({ now: 0 });
  const events = [];
  clock.setTimeout(async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve();
    events.push('microtasks');
    clock.setTimeout(() => events.push('nested'), 0);
  }, 1);
  clock.setTimeout(() => events.push('same-time'), 1);
  await clock.advance(1);
  assert.deepEqual(events, ['microtasks', 'same-time', 'nested']);
});

test('clock does not await a callback promise that depends on a later timer', async () => {
  const clock = new VirtualClock({ now: 0 });
  const events = [];
  clock.setTimeout(async () => {
    await new Promise((resolve) => clock.setTimeout(resolve, 2));
    events.push(clock.now());
  }, 1);
  await clock.advance(3);
  assert.deepEqual(events, [3]);
});

test('interval repeats at scheduled deadlines and can cancel itself or another timer', async () => {
  const clock = new VirtualClock({ now: 0 });
  const events = [];
  const handle = clock.setInterval(function (value) {
    assert.equal(this, handle);
    events.push([value, clock.now()]);
    if (events.length === 3) clock.clearInterval(handle);
  }, 2, 'tick');
  assert.equal(handle.unref(), handle);
  assert.equal(handle.hasRef(), false);
  assert.equal(clock.pending()[0].refed, false);
  assert.equal(handle.ref(), handle);
  assert.equal(handle.hasRef(), true);
  await clock.advance(10);
  assert.deepEqual(events, [['tick', 2], ['tick', 4], ['tick', 6]]);
  assert.deepEqual(clock.pending(), []);
  const late = clock.setTimeout(() => assert.fail('cross-canceled timer'), 1);
  clock.clearInterval(+late);
  await clock.advance(1);
});

test('clock validates advancement and rejects concurrent or reentrant advance', async () => {
  const clock = new VirtualClock({ now: 10 });
  for (const value of [-1, NaN, Infinity, '1']) await assert.rejects(clock.advance(value), /finite nonnegative/);
  assert.equal(clock.now(), 10);
  const advancing = clock.advance(1);
  await assert.rejects(clock.advance(1), /Concurrent or reentrant/);
  await advancing;
  clock.setTimeout(() => clock.advance(1), 0);
  await assert.rejects(clock.advance(0), /Concurrent or reentrant/);
  assert.throws(() => new VirtualClock({ now: NaN }), /finite/);
  assert.throws(() => new VirtualClock({ maxCallbacks: 0 }), /positive/);
  assert.throws(() => clock.setTimeout(null, 0), /function/);
  assert.throws(() => clock.setTimeout(() => {}, Infinity), /finite/);
});

test('clock detects zero intervals and recursively scheduled timeout runaway', async () => {
  for (const useInterval of [true, false]) {
    const clock = new VirtualClock({ now: 0, maxCallbacks: 4 });
    let count = 0;
    const callback = () => {
      count++;
      if (!useInterval) clock.setTimeout(callback, 0);
    };
    if (useInterval) clock.setInterval(callback, 0);
    else clock.setTimeout(callback, 0);
    await assert.rejects(clock.advance(1), /callback limit exceeded/);
    assert.equal(count, 4);
    assert.equal(clock.now(), 0);
    clock.dispose();
    assert.deepEqual(clock.pending(), []);
  }
});

test('clock normalizes negative delay, preserves other clock handles, and reports callback failure', async () => {
  const clock = new VirtualClock({ now: 0 });
  const other = new VirtualClock({ now: 0 });
  let called = false;
  const handle = clock.setTimeout(() => { called = true; }, -1);
  const foreign = other.setTimeout(() => {}, 0);
  clock.clearTimeout(foreign);
  assert.equal(clock.pending()[0].id, handle.id);
  await clock.advance(0);
  assert.equal(called, true);
  clock.setTimeout(() => { throw new Error('sync failure'); }, 1);
  await assert.rejects(clock.advance(1), /sync failure/);
  clock.setTimeout(async () => { throw new Error('async failure'); }, 0);
  await assert.rejects(clock.advance(0), /async failure/);
  clock.dispose();
  await assert.rejects(clock.advance(1), /disposed/);
  assert.throws(() => clock.setTimeout(() => {}, 0), /disposed/);
  other.dispose();
});

const lane = (steps, overrides = {}) => ({ id: 'main', match: (payload) => payload.lane === 'main', steps, ...overrides });
const step = (id, overrides = {}) => ({ id, expect: () => {}, reply: () => ({ id }), ...overrides });

test('model rejects unknown, ambiguous, and extra requests without successful fallback', async () => {
  const trace = [];
  const unknown = new ScriptedModel({ lanes: [lane([step('one')])], trace: (event) => trace.push(event) });
  await assert.rejects(unknown.respond({ lane: 'wrong' }), (error) => error instanceof ScenarioDeviationError && error.code === 'unknown_lane');
  assert.equal(unknown.snapshot().errors.length, 1);
  assert.equal(trace[0].type, 'request');
  assert.equal(trace[0].requestId, 1);
  assert.throws(() => unknown.assertComplete(), /Scenario incomplete/);
  const ambiguous = new ScriptedModel({ lanes: [lane([]), lane([], { id: 'also', match: () => true })] });
  await assert.rejects(ambiguous.respond({ lane: 'main' }), { code: 'ambiguous_lane' });
  const exact = new ScriptedModel({ lanes: [lane([step('one')])] });
  assert.deepEqual(await exact.respond({ lane: 'main' }), { id: 'one' });
  exact.assertComplete();
  await assert.rejects(exact.respond({ lane: 'main' }), { code: 'extra_request' });
  assert.throws(() => exact.assertComplete(), /errors=1/);
});

test('model reserves steps atomically for concurrent requests in one lane', async () => {
  const gate = new Gate();
  const model = new ScriptedModel({ lanes: [lane([
    step('first', { expect: (payload) => assert.equal(payload.number, 1), reply: () => gate.wait() }),
    step('second', { expect: (payload) => assert.equal(payload.number, 2) }),
  ])] });
  const first = model.respond({ lane: 'main', number: 1 });
  const second = model.respond({ lane: 'main', number: 2 });
  await gate.entered;
  assert.deepEqual(await second, { id: 'second' });
  assert.equal(model.snapshot().lanes[0].steps[0].status, 'inflight');
  assert.throws(() => model.assertComplete(), /first\[0\]:inflight/);
  gate.release('first response');
  assert.equal(await first, 'first response');
  model.assertComplete();
});

test('model expectations catch unexpected tools and failed replies remain on the ledger', async () => {
  let replyCalls = 0;
  const model = new ScriptedModel({ lanes: [lane([step('tool', {
    expect: (payload) => assert.deepEqual(payload.tools, ['todo_write']),
    reply: () => { replyCalls++; },
  })])] });
  await assert.rejects(model.respond({ lane: 'main', tools: ['unexpected_tool'] }), { code: 'expectation_failed' });
  assert.equal(replyCalls, 0);
  assert.equal(model.snapshot().lanes[0].steps[0].status, 'failed');
  assert.throws(() => model.assertComplete(), /tool\[0\]:failed/);
  const failedReply = new ScriptedModel({ lanes: [lane([step('reply', { reply: () => { throw new Error('provider failed'); } })])] });
  await assert.rejects(failedReply.respond({ lane: 'main' }), /provider failed/);
  assert.equal(failedReply.snapshot().errors[0].code, 'reply_failed');
  assert.throws(() => failedReply.assertComplete(), /Scenario incomplete/);
});

test('model requires mandatory steps, allows optional tail, and bounds explicit repeats', async () => {
  const trace = [];
  const context = { token: 'caller context' };
  const model = new ScriptedModel({ lanes: [lane([
    step('required', { repeat: 2, expect: (payload, received) => assert.equal(received, context) }),
    step('tail', { optional: true }),
  ])], trace: (event) => trace.push(event) });
  assert.throws(() => model.assertComplete(), /required/);
  await model.respond({ lane: 'main' }, context);
  assert.throws(() => model.assertComplete(), /required\[1\]:pending/);
  await model.respond({ lane: 'main' }, context);
  const snapshot = model.assertComplete();
  assert.deepEqual(trace.map((event) => event.type), ['request', 'expected', 'request', 'expected']);
  snapshot.lanes[0].steps[0].status = 'corrupted';
  assert.equal(model.snapshot().lanes[0].steps[0].status, 'succeeded');
  await model.respond({ lane: 'main' });
  await assert.rejects(model.respond({ lane: 'main' }), /Unexpected extra request/);
  assert.throws(() => new ScriptedModel({ lanes: [lane([step('infinite', { repeat: Infinity })])] }), /repeat/);
  const bounded = new ScriptedModel({ lanes: [lane([step('one')])], maxRequests: 1 });
  await bounded.respond({ lane: 'main' });
  await assert.rejects(bounded.respond({ lane: 'main' }), { code: 'request_limit' });
});

test('optional step cannot silently absorb an unexpected request or hide failure', async () => {
  const model = new ScriptedModel({ lanes: [lane([step('optional', {
    optional: true, expect: (payload) => assert.equal(payload.phase, 'allowed'),
  })])] });
  model.assertComplete();
  await assert.rejects(model.respond({ lane: 'main', phase: 'wrong' }), { code: 'expectation_failed' });
  assert.throws(() => model.assertComplete(), /errors=1/);
});

test('model records non-Error failures and refuses asynchronous lane predicates', async () => {
  const plainFailure = new ScriptedModel({ lanes: [lane([step('null', { expect: () => { throw null; } })])] });
  await assert.rejects(plainFailure.respond({ lane: 'main' }), { code: 'expectation_failed' });
  assert.match(plainFailure.snapshot().errors[0].message, /null/);
  const asyncMatch = new ScriptedModel({ lanes: [lane([step('one')], { match: async () => true })] });
  await assert.rejects(asyncMatch.respond({ lane: 'main' }), { code: 'lane_match_failed' });
});

test('gate exposes arrival and releases current and future waiters without timers', async () => {
  const gate = new Gate();
  const first = gate.wait();
  const second = gate.wait();
  await gate.entered;
  assert.deepEqual(gate.snapshot(), { state: 'waiting', arrivals: 2, waiting: 2 });
  assert.equal(gate.release('ready'), true);
  assert.equal(gate.release('again'), false);
  assert.equal(gate.abort(), false);
  assert.deepEqual(await Promise.all([first, second, gate.wait()]), ['ready', 'ready', 'ready']);
  assert.equal(gate.snapshot().waiting, 0);
});

test('gate signal cancellation cleans listeners and leaves other waiters intact', async () => {
  const gate = new Gate();
  const controller = new AbortController();
  let add = 0;
  let remove = 0;
  const signal = controller.signal;
  const originalAdd = signal.addEventListener.bind(signal);
  const originalRemove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...args) => { add++; return originalAdd(...args); };
  signal.removeEventListener = (...args) => { remove++; return originalRemove(...args); };
  const canceled = gate.wait(signal);
  const surviving = gate.wait();
  const reason = new Error('turn canceled');
  controller.abort(reason);
  await assert.rejects(canceled, (error) => error === reason);
  assert.equal(add, 1);
  assert.equal(remove, 1);
  assert.equal(gate.snapshot().waiting, 1);
  gate.release('continue');
  assert.equal(await surviving, 'continue');
  await assert.rejects(gate.wait(signal), (error) => error === reason);
});

test('gate abort rejects all waiters and future arrivals with no retained waiters', async () => {
  const gate = new Gate();
  const controller = new AbortController();
  const first = gate.wait(controller.signal);
  const second = gate.wait();
  assert.equal(gate.abort(), true);
  await assert.rejects(first, { name: 'AbortError' });
  await assert.rejects(second, { name: 'AbortError' });
  await assert.rejects(gate.wait(), { name: 'AbortError' });
  assert.equal(gate.snapshot().waiting, 0);
  controller.abort();
  assert.equal(gate.release(), false);
});

test('gate rejects invalid cancellation argument without retaining a waiter', () => {
  const gate = new Gate();
  assert.throws(() => gate.wait({ signal: new AbortController().signal }), /AbortSignal/);
  assert.deepEqual(gate.snapshot(), { state: 'waiting', arrivals: 0, waiting: 0 });
});
