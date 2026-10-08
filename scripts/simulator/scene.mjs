export class ScenarioDeviationError extends Error {
  constructor(message, { code = 'scenario_deviation', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ScenarioDeviationError';
    this.code = code;
  }
}

const describeError = (error) => error instanceof Error ? error.message : String(error);

/** A strict request script. Optional affects completion, never request matching. */
export class ScriptedModel {
  constructor({ lanes, maxRequests = 200, trace = () => {} } = {}) {
    if (!Array.isArray(lanes) || !lanes.length) throw new TypeError('lanes must be a nonempty array');
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) throw new TypeError('maxRequests must be a positive safe integer');
    if (typeof trace !== 'function') throw new TypeError('trace must be a function');
    this._maxRequests = maxRequests;
    this._trace = trace;
    this._requests = [];
    this._errors = [];
    const ids = new Set();
    this._lanes = lanes.map((lane) => {
      if (typeof lane.id !== 'string' || !lane.id || ids.has(lane.id)) throw new TypeError('lane IDs must be unique nonempty strings');
      ids.add(lane.id);
      if (typeof lane.match !== 'function' || !Array.isArray(lane.steps)) throw new TypeError(`Invalid lane ${lane.id}`);
      const stepIds = new Set();
      const steps = lane.steps.flatMap((step) => {
        if (typeof step.id !== 'string' || !step.id || stepIds.has(step.id)) throw new TypeError(`Step IDs must be unique in lane ${lane.id}`);
        stepIds.add(step.id);
        if (typeof step.reply !== 'function' || (step.expect !== undefined && typeof step.expect !== 'function')) {
          throw new TypeError(`Invalid functions for step ${lane.id}/${step.id}`);
        }
        if (step.optional !== undefined && typeof step.optional !== 'boolean') throw new TypeError('optional must be boolean');
        const repeat = step.repeat ?? 1;
        if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > maxRequests) throw new TypeError('repeat must be a finite positive integer within maxRequests');
        return Array.from({ length: repeat }, (_, index) => ({ ...step, repeatIndex: index, status: 'pending', requestId: null }));
      });
      return { id: lane.id, match: lane.match, steps, next: 0 };
    });
  }

  _fail(request, code, message, cause) {
    const error = new ScenarioDeviationError(message, { code, cause });
    request.status = 'failed';
    const detail = { requestId: request.id, laneId: request.laneId, stepId: request.stepId, code, message };
    this._errors.push(detail);
    return error;
  }

  async respond(payload, context = {}) {
    const request = { id: this._requests.length + 1, laneId: null, stepId: null, repeatIndex: null, status: 'matching' };
    this._requests.push(request);
    if (request.id > this._maxRequests) throw this._fail(request, 'request_limit', `Scenario request limit exceeded (${this._maxRequests})`);
    try {
      // Trace unknown and ambiguous requests too; the expected event supplies the
      // resolved lane/step when matching succeeds.
      this._trace({ type: 'request', requestId: request.id, ...request, payload });
    } catch (error) {
      throw this._fail(request, 'trace_failed', `Scenario request trace failed: ${describeError(error)}`, error);
    }
    let matches;
    try {
      matches = this._lanes.filter((lane) => {
        const result = lane.match(payload);
        if (typeof result !== 'boolean') throw new TypeError(`Lane ${lane.id} match must synchronously return boolean`);
        return result;
      });
    } catch (error) {
      throw this._fail(request, 'lane_match_failed', `Scenario lane matching failed: ${describeError(error)}`, error);
    }
    if (matches.length !== 1) {
      throw this._fail(request, matches.length ? 'ambiguous_lane' : 'unknown_lane',
        matches.length ? `Request matched multiple lanes: ${matches.map((lane) => lane.id).join(', ')}` : 'Request matched no scenario lane');
    }
    const lane = matches[0];
    request.laneId = lane.id;
    const step = lane.steps[lane.next];
    if (!step) throw this._fail(request, 'extra_request', `Unexpected extra request in lane ${lane.id}`);
    // Reserve synchronously before any await: concurrent calls cannot reuse a step.
    lane.next++;
    step.status = 'inflight';
    step.requestId = request.id;
    Object.assign(request, { stepId: step.id, repeatIndex: step.repeatIndex, status: 'inflight' });
    try {
      this._trace({ type: 'expected', requestId: request.id, laneId: lane.id, stepId: step.id, repeatIndex: step.repeatIndex });
    } catch (error) {
      step.status = 'failed';
      throw this._fail(request, 'trace_failed', `Scenario trace failed at ${lane.id}/${step.id}: ${describeError(error)}`, error);
    }
    try {
      if (step.expect) await step.expect(payload, context);
    } catch (error) {
      step.status = 'failed';
      throw this._fail(request, 'expectation_failed', `Scenario expectation failed at ${lane.id}/${step.id}: ${describeError(error)}`, error);
    }
    try {
      const result = await step.reply(payload, context);
      step.status = 'succeeded';
      request.status = 'succeeded';
      return result;
    } catch (error) {
      step.status = 'failed';
      throw this._fail(request, 'reply_failed', `Scenario reply failed at ${lane.id}/${step.id}: ${describeError(error)}`, error);
    }
  }

  snapshot() {
    return {
      requests: this._requests.map((request) => ({ ...request })),
      errors: this._errors.map((error) => ({ ...error })),
      lanes: this._lanes.map((lane) => ({
        id: lane.id, consumed: lane.next,
        steps: lane.steps.map(({ id, repeatIndex, optional, status, requestId }) => ({ id, repeatIndex, optional: optional === true, status, requestId })),
      })),
    };
  }

  assertComplete() {
    const incomplete = this._lanes.flatMap((lane) => lane.steps
      .filter((step) => !step.optional && step.status !== 'succeeded')
      .map((step) => `${lane.id}/${step.id}[${step.repeatIndex}]:${step.status}`));
    if (this._errors.length || incomplete.length) {
      throw new ScenarioDeviationError(`Scenario incomplete: ${incomplete.join(', ') || 'recorded request failures'}; errors=${this._errors.length}`, { code: 'incomplete' });
    }
    return this.snapshot();
  }
}

function abortError(reason) {
  if (reason !== undefined) return reason;
  const error = new Error('Gate wait aborted');
  error.name = 'AbortError';
  return error;
}

/** Explicit rendezvous without timers. A real runner watchdog bounds waiting. */
export class Gate {
  constructor() {
    this._state = 'waiting';
    this._waiters = new Set();
    this._arrivals = 0;
    this.entered = new Promise((resolve) => { this._enter = resolve; });
  }

  wait(signal) {
    if (signal !== undefined && (typeof signal?.addEventListener !== 'function'
      || typeof signal?.removeEventListener !== 'function' || typeof signal?.aborted !== 'boolean')) {
      throw new TypeError('Gate.wait requires an AbortSignal or no argument');
    }
    this._arrivals++;
    this._enter();
    if (signal?.aborted) return Promise.reject(abortError(signal.reason));
    if (this._state === 'released') return Promise.resolve(this._value);
    if (this._state === 'aborted') return Promise.reject(this._value);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null };
      waiter.onAbort = () => {
        this._remove(waiter);
        reject(abortError(signal.reason));
      };
      this._waiters.add(waiter);
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
    });
  }

  _remove(waiter) {
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    this._waiters.delete(waiter);
  }

  _finish(state, value) {
    if (this._state !== 'waiting') return false;
    this._state = state;
    this._value = value;
    for (const waiter of [...this._waiters]) {
      this._remove(waiter);
      waiter[state === 'released' ? 'resolve' : 'reject'](value);
    }
    return true;
  }

  release(value) { return this._finish('released', value); }
  abort(reason) { return this._finish('aborted', abortError(reason)); }
  snapshot() { return { state: this._state, arrivals: this._arrivals, waiting: this._waiters.size }; }
}
