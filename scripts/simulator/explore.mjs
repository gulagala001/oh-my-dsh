import timers from 'node:timers';
import { performance } from 'node:perf_hooks';

// These are inputs to a real runner, not a model of host state. The seed only
// controls these choices; native I/O, OS scheduling and browser timing are real.
export const EXPLORATION_COVERAGE = Object.freeze({
  scenario: Object.freeze(['prompt', 'read-write', 'stream-cancel-resume', 'restart-checkpoint', 'completion-race']),
  number: Object.freeze([0, 1, -1, 2147483647, 9007199254740991]),
  text: Object.freeze(['中文换行\n原文', '分片😀组合e\u0301', '数字１２３与零0', '来源「原话」\\"保留']),
  cancelOrder: Object.freeze(['before-completion', 'after-completion']),
  restartCheckpoint: Object.freeze(['after-write', 'after-read']),
  lateChunks: Object.freeze([0, 1, 2]),
});

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer in [${minimum}, ${maximum}]`);
  }
  return value;
}

function validateSignal(signal) {
  if (signal !== undefined && (typeof signal?.aborted !== 'boolean'
    || typeof signal?.addEventListener !== 'function' || typeof signal?.removeEventListener !== 'function')) {
    throw new TypeError('signal must be an AbortSignal');
  }
}

export function seededRandom(seed) {
  integer(seed, 'seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateCases({ seed = 1, count = 12, maxSteps = 12 } = {}) {
  const random = seededRandom(seed);
  integer(count, 'count', 0, 10000);
  integer(maxSteps, 'maxSteps', 1, 10000);
  const families = ['prompt'];
  if (maxSteps >= 3) families.push('read-write');
  if (maxSteps >= 5) families.push('stream-cancel-resume', 'restart-checkpoint', 'completion-race');
  const offset = Math.floor(random() * families.length);
  return Array.from({ length: count }, (_, index) => {
    const scenario = families[(index + offset) % families.length];
    const sourceSentinel = `SOURCE_${(seed >>> 0).toString(16)}_${index}`;
    const text = `${EXPLORATION_COVERAGE.text[(index + offset) % EXPLORATION_COVERAGE.text.length]} [${sourceSentinel}]`;
    const parameters = {
      scenario, text, sourceSentinel,
      number: EXPLORATION_COVERAGE.number[index % EXPLORATION_COVERAGE.number.length],
      // UTF-16 split positions deliberately include a possible surrogate split.
      streamSplit: Math.floor(random() * (text.length + 1)),
      cancelOrder: EXPLORATION_COVERAGE.cancelOrder[index % 2],
      lateChunks: index % 3,
      restartCheckpoint: EXPLORATION_COVERAGE.restartCheckpoint[index % 2],
      delayMs: [0, 1, 10, 100][Math.floor(random() * 4)],
    };
    const prompt = { type: 'prompt', text };
    const write = { type: 'write', path: 'exploration.txt', text };
    const read = { type: 'read', path: 'exploration.txt' };
    let actions;
    if (scenario === 'read-write') actions = [prompt, write, read];
    else if (scenario === 'restart-checkpoint') actions = parameters.restartCheckpoint === 'after-write'
      ? [prompt, write, { type: 'restart', checkpoint: 'after-write' }, read]
      : [prompt, write, read, { type: 'restart', checkpoint: 'after-read' }, read];
    else if (scenario === 'stream-cancel-resume' || scenario === 'completion-race') {
      actions = [prompt, { type: 'stream', split: parameters.streamSplit, lateChunks: parameters.lateChunks },
        { type: 'delay', ms: parameters.delayMs, phase: parameters.cancelOrder },
        { type: 'cancel', phase: parameters.cancelOrder }, { type: 'resume' }];
    } else actions = [prompt];
    return { id: `explore-${seed}-${index + 1}`, seed, parameters, actions };
  });
}

/** Finite topological shuffles. Same-sequence actions retain their order. */
export function enumerateInterleavings(sequences, { limit = 100 } = {}) {
  if (!Array.isArray(sequences) || sequences.some(sequence => !Array.isArray(sequence))) {
    throw new TypeError('sequences must be an array of finite arrays');
  }
  integer(limit, 'limit', 1, 10000);
  const length = sequences.reduce((sum, sequence) => sum + sequence.length, 0);
  integer(length, 'total sequence length', 0, 256);
  integer(sequences.length, 'sequence count', 0, 256);
  const interleavings = [], positions = sequences.map(() => 0), path = [];
  let truncated = false;
  function visit() {
    if (path.length === length) {
      if (interleavings.length === limit) { truncated = true; return false; }
      interleavings.push([...path]);
      return true;
    }
    for (let index = 0; index < sequences.length; index++) {
      if (positions[index] === sequences[index].length) continue;
      path.push(sequences[index][positions[index]++]);
      const keepGoing = visit();
      positions[index]--; path.pop();
      if (!keepGoing) return false;
    }
    return true;
  }
  visit();
  return { interleavings, limit, truncated };
}

function errorRecord(error, fallback = 'runner_error') {
  return { name: error?.name ?? 'Error', code: error?.code ?? fallback,
    ...(error?.assertion !== undefined ? { assertion: error.assertion } : {}),
    ...(error?.laneId !== undefined ? { laneId: error.laneId } : {}),
    ...(error?.stepId !== undefined ? { stepId: error.stepId } : {}),
    message: error?.message ?? String(error), ...(error?.stack ? { stack: error.stack } : {}) };
}

function controlError(code, message) { return Object.assign(new Error(message), { code }); }

function validateCase(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.actions)
    || !value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) {
    throw new TypeError('each case must contain parameters object and actions array');
  }
  integer(value.actions.length, 'case action count', 0, 10000);
}

// A watchdog ends waiting even when an asynchronous runner ignores its signal.
// Resource termination belongs to the runner. Synchronous blocking JS must be
// isolated by the runner in another process; no same-thread timer can stop it.
async function boundedRun(caseValue, run, { signal, deadlineMs }) {
  const trace = [], controller = new AbortController();
  const started = performance.now();
  let timeout, onAbort, finishControl;
  const realTimers = globalThis[Symbol.for('omd.simulation.clock')]?.realTimers ?? timers;
  const control = new Promise(resolve => { finishControl = resolve; });
  const stop = (status, reason) => {
    controller.abort(reason);
    finishControl({ status, error: errorRecord(reason) });
  };
  onAbort = () => stop('cancelled', controlError('exploration_cancelled', 'Exploration cancelled'));
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  if (deadlineMs !== undefined) timeout = realTimers.setTimeout(() =>
    stop('timeout', controlError('exploration_timeout', 'Exploration real deadline exceeded')), deadlineMs);
  let outcome;
  try {
    const execution = controller.signal.aborted ? control : Promise.resolve().then(() => run(caseValue, {
      signal: controller.signal, trace: event => trace.push(event),
    })).then(result => {
      if (!result || !['pass', 'fail', 'invalid'].includes(result.status)) {
        return { status: 'fail', result, error: errorRecord(controlError('missing_verdict', 'Runner must return an explicit pass, fail or invalid verdict')) };
      }
      if (result.status === 'pass' && result.error !== undefined) {
        return { status: 'fail', result, error: errorRecord(result.error) };
      }
      return { status: result.status, result, ...(result.error !== undefined ? { error: errorRecord(result.error) } : {}) };
    }, error => ({ status: 'fail', error: errorRecord(error) }));
    outcome = await Promise.race([execution, control]);
  } finally {
    if (timeout !== undefined) realTimers.clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
  if (Array.isArray(outcome.result?.trace)) trace.push(...outcome.result.trace);
  return { caseId: caseValue.id, ...outcome, trace: [...trace], elapsedMs: performance.now() - started };
}

export async function exploreCases(cases, run, { maxCases = cases?.length, deadlineMs = 30000, signal, onResult } = {}) {
  if (!Array.isArray(cases)) throw new TypeError('cases must be an array');
  cases.forEach(validateCase);
  if (typeof run !== 'function') throw new TypeError('run must be a function');
  integer(maxCases, 'maxCases', 0, 10000);
  integer(deadlineMs, 'deadlineMs', 1, 2147483647);
  validateSignal(signal);
  if (onResult !== undefined && typeof onResult !== 'function') throw new TypeError('onResult must be a function');
  const started = performance.now(), results = [];
  let status = 'completed';
  for (const caseValue of cases.slice(0, maxCases)) {
    if (signal?.aborted) { status = 'cancelled'; break; }
    const remaining = Math.ceil(deadlineMs - (performance.now() - started));
    if (remaining <= 0) { status = 'deadline-exceeded'; break; }
    const result = await boundedRun(caseValue, run, { signal, deadlineMs: remaining });
    result.caseValue = caseValue;
    results.push(result);
    // Observer work is bounded too; a broken report callback cannot hang a run.
    if (onResult && result.status !== 'timeout' && result.status !== 'cancelled') {
      const observed = await boundedRun(caseValue, async contextCase => {
        await onResult(result, contextCase); return { status: 'pass' };
      }, { signal, deadlineMs: Math.max(1, Math.ceil(deadlineMs - (performance.now() - started))) });
      if (observed.status !== 'pass') {
        result.status = observed.status;
        result.error = observed.error;
        result.trace.push({ type: 'on-result-error', error: observed.error });
      }
    }
    if (result.status === 'timeout') { status = 'deadline-exceeded'; break; }
    if (result.status === 'cancelled') { status = 'cancelled'; break; }
  }
  if (status === 'completed' && results.length < cases.length) status = 'budget-exhausted';
  return { status, results, executed: results.length, total: cases.length,
    truncated: results.length < cases.length, elapsedMs: performance.now() - started,
    passed: results.filter(result => result.status === 'pass').length,
    failed: results.filter(result => ['fail', 'invalid', 'timeout', 'cancelled'].includes(result.status)).length };
}

function failureSignature(result) {
  if (!result) return null;
  if (result.status !== 'fail') return null;
  const declared = result.result?.signature;
  if (typeof declared === 'string' && declared.length) return declared;
  const error = result.result?.error ?? result.error;
  const code = error?.code;
  if (typeof code !== 'string' || !code.length) return null;
  // Generic assertion codes describe many unrelated defects. Preserve the
  // named check (or its message) so reduction cannot replace the failure.
  if (error.assertion || /ASSERT/i.test(code) || code === 'expectation_failed' || code === 'runner_error') {
    return JSON.stringify([code, error.assertion ?? null, error.name ?? null,
      error.assertion ? null : error.message ?? null, error.laneId ?? null, error.stepId ?? null]);
  }
  return code;
}

/** Reduction uses only observed equal signatures, never a copy of host rules. */
export async function minimizeFailure(caseValue, run, { maxRuns = 40, signal, deadlineMs = 30000 } = {}) {
  validateCase(caseValue);
  if (typeof run !== 'function') throw new TypeError('run must be a function');
  integer(maxRuns, 'maxRuns', 2, 10000);
  integer(deadlineMs, 'deadlineMs', 1, 2147483647);
  validateSignal(signal);
  const started = performance.now(), results = [];
  let current = structuredClone(caseValue), exhausted = false, interrupted;
  async function attempt(candidate) {
    if (signal?.aborted) { interrupted = 'cancelled'; return null; }
    if (results.length >= maxRuns) { exhausted = true; return null; }
    const remaining = Math.ceil(deadlineMs - (performance.now() - started));
    if (remaining <= 0) { interrupted = 'timeout'; return null; }
    const input = structuredClone(candidate);
    const result = await boundedRun(structuredClone(input), run, { signal, deadlineMs: remaining });
    result.caseValue = input;
    results.push(result);
    if (['timeout', 'cancelled'].includes(result.status)) interrupted = result.status;
    return result;
  }
  const finish = (status, signature = null) => ({ status, caseValue: current, signature,
    runs: results.length, results, elapsedMs: performance.now() - started });
  const baseline = await attempt(current);
  if (!baseline || interrupted) return finish(interrupted ?? 'budget-exhausted');
  const signature = failureSignature(baseline);
  if (!signature) return finish('no-stable-failure');
  const confirm = await attempt(current);
  if (interrupted) return finish(interrupted, signature);
  if (failureSignature(confirm) !== signature) return finish('unstable-failure', signature);
  async function reproduces(candidate) {
    const first = await attempt(candidate);
    if (!first || interrupted || failureSignature(first) !== signature) return false;
    const second = await attempt(candidate);
    return !!second && !interrupted && failureSignature(second) === signature;
  }
  // Deletion-based ddmin. Runner rejects broken causal prerequisites as invalid.
  let granularity = 2;
  while (current.actions.length > 0 && !exhausted && !interrupted) {
    const size = Math.ceil(current.actions.length / granularity);
    let reduced = false;
    for (let start = 0; start < current.actions.length; start += size) {
      const candidate = { ...current, actions: current.actions.filter((_, index) => index < start || index >= start + size) };
      if (await reproduces(candidate)) {
        current = candidate; granularity = Math.max(2, granularity - 1); reduced = true; break;
      }
      if (exhausted || interrupted) break;
    }
    if (!reduced) {
      if (granularity >= current.actions.length) break;
      granularity = Math.min(current.actions.length, granularity * 2);
    }
  }
  // Generic scalar reductions only. Causal/semantic validity stays with runner.
  for (const [key, value] of Object.entries(current.parameters)) {
    if (exhausted || interrupted) break;
    const simpler = typeof value === 'number' && Number.isFinite(value) && value !== 0 ? 0
      : typeof value === 'string' && value.length > 1 ? value.slice(0, 1)
        : typeof value === 'boolean' && value ? false : undefined;
    if (simpler === undefined) continue;
    const candidate = { ...current, parameters: { ...current.parameters, [key]: simpler } };
    if (await reproduces(candidate)) current = candidate;
  }
  return finish(interrupted ?? (exhausted ? 'budget-exhausted' : 'minimized'), signature);
}
