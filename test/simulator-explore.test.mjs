import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { seededRandom, generateCases, EXPLORATION_COVERAGE, enumerateInterleavings,
  exploreCases, minimizeFailure } from '../scripts/simulator/explore.mjs';

const sample = (actions = [{ type: 'prompt' }], parameters = {}) => ({ id: 'sample', seed: 1, parameters, actions });
const pass = () => ({ status: 'pass' });
const failure = code => ({ status: 'fail', error: { code, message: code } });

test('seed controls finite generated inputs and small action budgets', () => {
  assert.deepEqual(generateCases({ seed: 42 }), generateCases({ seed: 42 }));
  assert.notDeepEqual(generateCases({ seed: 42 }), generateCases({ seed: 43 }));
  const a = seededRandom(0), b = seededRandom(0);
  assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
  assert.ok(Array.from({ length: 100 }, seededRandom(1)).every(value => value >= 0 && value < 1));
  for (const maxSteps of [1, 2, 3, 4, 5, 12]) {
    assert.ok(generateCases({ maxSteps }).every(value => value.actions.length <= maxSteps));
  }
  assert.deepEqual(generateCases({ count: 0 }), []);
});

test('default case set spans declared families, numbers, Unicode and controlled races', () => {
  const cases = generateCases();
  for (const dimension of ['scenario', 'number', 'cancelOrder', 'restartCheckpoint', 'lateChunks']) {
    assert.deepEqual(new Set(cases.map(value => value.parameters[dimension])), new Set(EXPLORATION_COVERAGE[dimension]));
  }
  for (const text of EXPLORATION_COVERAGE.text) assert.ok(cases.some(value => value.parameters.text.includes(text)));
  for (const value of cases) {
    assert.ok(value.parameters.text.includes(value.parameters.sourceSentinel));
    assert.ok(value.parameters.streamSplit >= 0 && value.parameters.streamSplit <= value.parameters.text.length);
    assert.ok(value.actions.every(action => ['prompt', 'write', 'read', 'stream', 'delay', 'cancel', 'resume', 'restart'].includes(action.type)));
  }
});

test('inputs and finite bounds are validated before execution', async () => {
  for (const seed of [NaN, Infinity, 'seed', 0.5]) assert.throws(() => seededRandom(seed), TypeError);
  for (const opts of [{ count: Infinity }, { count: -1 }, { maxSteps: 0 }, { count: 10001 }]) {
    assert.throws(() => generateCases(opts), TypeError);
  }
  assert.throws(() => enumerateInterleavings([null]), TypeError);
  assert.throws(() => enumerateInterleavings([Array(257)]), TypeError);
  assert.throws(() => enumerateInterleavings([], { limit: Infinity }), TypeError);
  await assert.rejects(exploreCases([{}], pass), TypeError);
  await assert.rejects(exploreCases([sample()], pass, { deadlineMs: Infinity }), TypeError);
  await assert.rejects(exploreCases([], pass, { signal: {} }), TypeError);
  await assert.rejects(minimizeFailure(sample(), pass, { maxRuns: 1 }), TypeError);
});

test('interleavings preserve causal order and accurately mark truncation', () => {
  const result = enumerateInterleavings([['a1', 'a2'], ['b1', 'b2']]);
  assert.equal(result.interleavings.length, 6);
  assert.equal(result.truncated, false);
  for (const order of result.interleavings) {
    assert.ok(order.indexOf('a1') < order.indexOf('a2'));
    assert.ok(order.indexOf('b1') < order.indexOf('b2'));
  }
  assert.equal(enumerateInterleavings([['a1', 'a2'], ['b1', 'b2']], { limit: 6 }).truncated, false);
  const bounded = enumerateInterleavings([['a1', 'a2'], ['b1', 'b2']], { limit: 2 });
  assert.equal(bounded.interleavings.length, 2);
  assert.equal(bounded.truncated, true);
  assert.deepEqual(enumerateInterleavings([]).interleavings, [[]]);
});

test('exploration is sequential, budgeted, and keeps callback and returned traces', async () => {
  const cases = generateCases({ count: 4 });
  let active = 0, peak = 0;
  const observed = [];
  const report = await exploreCases(cases, async (value, { trace, signal }) => {
    assert.equal(signal.aborted, false);
    peak = Math.max(peak, ++active);
    trace({ type: 'start', id: value.id });
    await sleep(1);
    active--;
    return { status: 'pass', trace: [{ type: 'done' }] };
  }, { maxCases: 2, onResult: result => observed.push(result.caseId) });
  assert.equal(peak, 1);
  assert.equal(report.status, 'budget-exhausted');
  assert.equal(report.executed, 2);
  assert.equal(report.truncated, true);
  assert.equal(report.passed, 2);
  assert.deepEqual(observed, cases.slice(0, 2).map(value => value.id));
  assert.deepEqual(report.results[0].trace.map(event => event.type), ['start', 'done']);
  assert.equal((await exploreCases(cases, pass, { maxCases: 0 })).status, 'budget-exhausted');
});

test('watchdog ends an uncooperative promise and aborts runner cleanup signal', async () => {
  let runnerSignal;
  const report = await exploreCases([sample()], (_value, { signal, trace }) => {
    runnerSignal = signal;
    trace({ type: 'waiting' });
    return new Promise(() => {});
  }, { deadlineMs: 20 });
  assert.equal(report.status, 'deadline-exceeded');
  assert.equal(report.results[0].status, 'timeout');
  assert.equal(report.results[0].error.code, 'exploration_timeout');
  assert.equal(report.passed, 0);
  assert.equal(runnerSignal.aborted, true);
  assert.deepEqual(report.results[0].trace, [{ type: 'waiting' }]);
});

test('cancellation bounds an uncooperative runner and prevents subsequent cases', async () => {
  const controller = new AbortController();
  let calls = 0, runnerSignal;
  const pending = exploreCases([sample(), sample()], (_value, { signal }) => {
    calls++; runnerSignal = signal; return new Promise(() => {});
  }, { signal: controller.signal });
  await sleep(5); controller.abort();
  const report = await pending;
  assert.equal(calls, 1);
  assert.equal(report.status, 'cancelled');
  assert.equal(report.results[0].status, 'cancelled');
  assert.equal(runnerSignal.aborted, true);
  assert.equal(report.passed, 0);
  assert.equal((await exploreCases([sample()], pass, { signal: controller.signal })).executed, 0);
});

test('errors, invalid scenarios and missing verdicts are never labeled pass', async () => {
  const values = [sample(), sample(), sample(), sample(), sample()];
  let calls = 0;
  const report = await exploreCases(values, () => {
    if (++calls === 1) throw Object.assign(new Error('host failed'), { code: 'host_failure' });
    if (calls === 2) return { status: 'invalid', error: { code: 'invalid_scenario' } };
    if (calls === 3) return undefined;
    if (calls === 4) return { status: 'pass', error: new Error('ignored failure') };
    return failure('assertion_failed');
  });
  assert.equal(report.passed, 0);
  assert.equal(report.failed, 5);
  assert.deepEqual(report.results.map(result => result.status), ['fail', 'invalid', 'fail', 'fail', 'fail']);
  assert.deepEqual(report.results.map(result => result.error.code), ['host_failure', 'invalid_scenario', 'missing_verdict', 'runner_error', 'assertion_failed']);
});

test('a failing or uncooperative result observer cannot mask or hang an exploration', async () => {
  const failed = await exploreCases([sample()], pass, { onResult: () => { throw new Error('report failure'); } });
  assert.equal(failed.results[0].status, 'fail');
  const timed = await exploreCases([sample()], pass, { deadlineMs: 20, onResult: () => new Promise(() => {}) });
  assert.equal(timed.status, 'deadline-exceeded');
  assert.equal(timed.passed, 0);
});

test('minimization preserves a reproduced failure and ignores invalid or different signatures', async () => {
  const original = sample([{ type: 'setup' }, { type: 'noise' }, { type: 'bug' }, { type: 'extra' }], { number: 100, text: 'many characters' });
  const report = await minimizeFailure(original, value => {
    if (!value.actions.some(action => action.type === 'setup')) return { status: 'invalid', error: { code: 'failure_x' } };
    if (!value.actions.some(action => action.type === 'bug')) return failure('different_failure');
    return failure('failure_x');
  }, { maxRuns: 80 });
  assert.equal(report.status, 'minimized');
  assert.equal(report.signature, 'failure_x');
  assert.deepEqual(report.caseValue.actions.map(action => action.type), ['setup', 'bug']);
  assert.deepEqual(report.caseValue.parameters, { number: 0, text: 'm' });
  assert.deepEqual(report.results.slice(0, 2).map(result => result.caseValue), [original, original]);
  assert.deepEqual(original.parameters, { number: 100, text: 'many characters' });
  assert.ok(report.results.some(result => result.status === 'invalid'));
});

test('minimization distinguishes same-code assertions, keeps thrown names and honors explicit signatures', async () => {
  const original = sample([{ type: 'setup' }, { type: 'noise' }, { type: 'bug' }, { type: 'extra' }]);
  const namedFailure = candidate => Object.assign(new Error('dynamic detail for ' + candidate.actions.length + ' actions'), {
    name: 'AssertionError', code: 'ERR_ASSERTION',
    assertion: candidate.actions.some(action => action.type === 'bug') ? 'physical file evidence' : 'unrelated prompt invariant',
  });
  const valid = candidate => candidate.actions.some(action => action.type === 'setup');
  let returnedSignature;
  for (const throws of [false, true]) {
    const report = await minimizeFailure(original, candidate => {
      if (!valid(candidate)) return { status: 'invalid' };
      const error = namedFailure(candidate);
      if (throws) throw error;
      return { status: 'fail', error };
    }, { maxRuns: 80 });
    assert.equal(report.status, 'minimized');
    assert.deepEqual(report.caseValue.actions.map(action => action.type), ['setup', 'bug'], 'same named assertion may shrink, a different one must not replace it');
    assert.notEqual(report.signature, 'ERR_ASSERTION');
    assert.ok(report.results.some(result => (result.result?.error ?? result.error)?.assertion === 'unrelated prompt invariant'), 'the different same-code assertion must actually be attempted');
    if (!throws) returnedSignature = report.signature;
    else assert.equal(report.signature, returnedSignature, 'throwing must preserve the same named assertion identity');
  }
  const unnamed = await minimizeFailure(original, candidate => {
    if (!valid(candidate)) return { status: 'invalid' };
    return { status: 'fail', error: { name: 'AssertionError', code: 'ERR_ASSERTION',
      message: candidate.actions.some(action => action.type === 'bug') ? 'physical file evidence failed' : 'a different unnamed assertion failed' } };
  }, { maxRuns: 80 });
  assert.deepEqual(unnamed.caseValue.actions.map(action => action.type), ['setup', 'bug'], 'unnamed assertions must retain their distinct details');
  const explicit = await minimizeFailure(original, candidate => valid(candidate)
    ? { status: 'fail', signature: 'declared-same-cause', error: namedFailure(candidate) }
    : { status: 'invalid' }, { maxRuns: 80 });
  assert.equal(explicit.signature, 'declared-same-cause');
  assert.deepEqual(explicit.caseValue.actions.map(action => action.type), ['setup'], 'an explicit caller signature takes precedence over inferred assertion names');
  assert.deepEqual(original.actions.map(action => action.type), ['setup', 'noise', 'bug', 'extra']);
});

test('minimization detects unstable baseline and does not swallow baseline errors', async () => {
  let calls = 0;
  const unstable = await minimizeFailure(sample(), () => ++calls === 1 ? failure('flaky') : pass());
  assert.equal(unstable.status, 'unstable-failure');
  assert.equal(unstable.runs, 2);
  const failed = await minimizeFailure(sample(), () => { throw Object.assign(new Error('host exploded'), { code: 'host_crash' }); });
  assert.equal(failed.signature, 'host_crash');
  assert.equal(failed.results[0].error.message, 'host exploded');
  const notFailed = await minimizeFailure(sample(), pass);
  assert.equal(notFailed.status, 'no-stable-failure');
  const invalid = await minimizeFailure(sample(), () => ({ status: 'invalid', error: { code: 'input' } }));
  assert.equal(invalid.status, 'no-stable-failure');
});

test('minimization budgets, deadline and cancellation retain baseline results', async () => {
  const value = sample([{ type: 'setup' }, { type: 'bug' }]);
  const budget = await minimizeFailure(value, () => failure('bug'), { maxRuns: 2 });
  assert.equal(budget.status, 'budget-exhausted');
  assert.equal(budget.runs, 2);
  assert.deepEqual(budget.caseValue, value);
  const timeout = await minimizeFailure(value, () => new Promise(() => {}), { deadlineMs: 20 });
  assert.equal(timeout.status, 'timeout');
  assert.equal(timeout.results[0].status, 'timeout');
  const controller = new AbortController();
  controller.abort();
  const cancelled = await minimizeFailure(value, pass, { signal: controller.signal });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.runs, 0);
});

test('flaky reductions and mutating runners do not replace reproduced inputs', async () => {
  const value = sample([{ type: 'setup' }, { type: 'bug' }]);
  let baselineCalls = 0, candidateCalls = 0;
  const report = await minimizeFailure(value, candidate => {
    const baseline = candidate.actions.length === 2;
    candidate.parameters.runnerMutation = true;
    if (baseline) { baselineCalls++; return failure('bug'); }
    return ++candidateCalls % 2 === 1 ? failure('bug') : pass();
  });
  assert.equal(report.status, 'minimized');
  assert.equal(baselineCalls, 2);
  assert.deepEqual(report.caseValue, value);
  assert.ok(report.results.every(result => result.caseValue.parameters.runnerMutation === undefined));
});

test('watchdog selects native timers even when the active timers API is virtual', async () => {
  const symbol = Symbol.for('omd.simulation.clock');
  const previous = globalThis[symbol];
  let timersStarted = 0, timersCleared = 0;
  globalThis[symbol] = { realTimers: {
    setTimeout(fn, ms) { timersStarted++; return setTimeout(fn, ms); },
    clearTimeout(handle) { timersCleared++; clearTimeout(handle); },
  } };
  try {
    const result = await exploreCases([sample()], () => new Promise(() => {}), { deadlineMs: 10 });
    assert.equal(result.results[0].status, 'timeout');
    assert.equal(timersStarted, 1);
    assert.equal(timersCleared, 1);
  } finally {
    if (previous === undefined) delete globalThis[symbol]; else globalThis[symbol] = previous;
  }
});
