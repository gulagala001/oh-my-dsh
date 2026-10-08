import { validateSimulationChunk } from './provider.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_NODES = 300_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const VOLATILE_PATH = /^\/metadata\/(?:request_id|session_id|conversation_id|trace_id|timestamp|created_at)$|^\/messages\/\d+\/(?:tool_call_id|tool_calls\/\d+\/id)$/;
const AUTH_KEY = /^(?:auth|authentication|authorization|proxy[-_]authorization|(?:x[-_])?api[-_]?(?:key|token)|token|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|credentials|(?:secret|private)[-_]?key)$/i;
const SIMULATED_SECRET = /^(?:simulator|simulation|local[-_]test)(?:[-_:][\w.-]+)?$/i;

export class ReplayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReplayError';
    this.code = code;
  }
}

function fail(code, message) { throw new ReplayError(code, message); }
function own(object, key) { return Object.hasOwn(object, key); }
function object(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_format', `${where} must be an object`);
}
function keysOnly(value, keys, where) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('unknown_format', `${where} has unknown field ${key}`);
}

// Accept JSON data only, without invoking accessors/toJSON or copying inherited
// keys. Limits apply before JSON serialization, including on untrusted JS input.
function cloneJSON(value) {
  const ancestors = new WeakSet();
  let nodes = 0;
  let bytes = 0;
  const visit = (input, depth, path) => {
    if (++nodes > MAX_NODES || depth > 64) fail('replay_too_large', 'Replay exceeds JSON structure limits');
    if (typeof input === 'string') {
      bytes += Buffer.byteLength(input);
      if (bytes > MAX_BYTES) fail('replay_too_large', 'Replay exceeds 16 MiB');
      return input;
    }
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (!input || typeof input !== 'object') fail('invalid_json', `Non-JSON value at ${path || '/'}`);
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null && proto !== Array.prototype) fail('invalid_json', `Non-JSON object at ${path || '/'}`);
    if (ancestors.has(input)) fail('invalid_json', 'Circular JSON input');
    ancestors.add(input);
    const array = Array.isArray(input);
    if (!array && proto === Array.prototype) fail('invalid_json', 'Invalid array prototype');
    if (Object.getOwnPropertySymbols(input).length) fail('invalid_json', 'Symbol properties are not JSON');
    if (array && input.length > MAX_NODES) fail('replay_too_large', 'Replay array exceeds structure limits');
    const result = array ? [] : {};
    for (const key of Object.getOwnPropertyNames(input)) {
      if (array && key === 'length') continue;
      if (FORBIDDEN_KEYS.has(key)) fail('unsafe_key', `Forbidden key at ${path}/${key}`);
      if (array && !/^(0|[1-9]\d*)$/.test(key)) fail('invalid_json', 'Extra array properties are not JSON');
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor.enumerable || !own(descriptor, 'value')) fail('invalid_json', `Accessor or hidden property at ${path}/${key}`);
      bytes += Buffer.byteLength(key) + 3;
      if (bytes > MAX_BYTES) fail('replay_too_large', 'Replay exceeds 16 MiB');
      result[key] = visit(descriptor.value, depth + 1, `${path}/${key}`);
    }
    if (array && result.length !== input.length) fail('invalid_json', 'Sparse arrays are not JSON');
    if (array) for (let index = 0; index < result.length; index++) if (!own(result, index)) fail('invalid_json', 'Sparse arrays are not JSON');
    ancestors.delete(input);
    return result;
  };
  const result = visit(value, 0, '');
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) fail('replay_too_large', 'Replay exceeds 16 MiB');
  return result;
}

function noCredentials(value, path = '') {
  if (typeof value === 'string') {
    if (/\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value)) fail('unsafe_credentials', `Credential-looking text at ${path}`);
    for (const bearer of value.matchAll(/\bBearer\s+(\S+)/gi)) {
      if (!SIMULATED_SECRET.test(bearer[1])) fail('unsafe_credentials', `Bearer credential at ${path}`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:headers|request_headers|http_headers)$/i.test(key)) fail('unsafe_credentials', `Headers cannot be recorded at ${path}/${key}`);
      if (AUTH_KEY.test(key) && !(typeof child === 'string' && SIMULATED_SECRET.test(child))) fail('unsafe_credentials', `Non-simulation credential at ${path}/${key}`);
      noCredentials(child, `${path}/${key}`);
    }
  }
}

function pointerGet(value, pointer) {
  let current = value;
  for (const part of pointer.slice(1).split('/')) {
    if (!current || typeof current !== 'object' || !own(current, part)) return { exists: false };
    current = current[part];
  }
  return { exists: true, value: current };
}

function validateRequest(request, where) {
  object(request, where);
  if (typeof request.model !== 'string' || !request.model) fail('invalid_request', `${where}.model must be a nonempty string`);
  if (!Array.isArray(request.messages) || !request.messages.length) fail('invalid_request', `${where}.messages must be a nonempty array`);
  for (const [index, message] of request.messages.entries()) {
    object(message, `${where}.messages[${index}]`);
    if (typeof message.role !== 'string' || !message.role) fail('invalid_request', `${where}.messages[${index}].role is missing`);
  }
  if (request.tools !== undefined && !Array.isArray(request.tools)) fail('invalid_request', `${where}.tools must be an array`);
  if (request.stream !== undefined && typeof request.stream !== 'boolean') fail('invalid_request', `${where}.stream must be boolean`);
}

function validateResponse(response, where) {
  object(response, where);
  keysOnly(response, ['chunks', 'status'], where);
  if (response.status !== undefined && (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300)) fail('invalid_response', `${where}.status must be a success status`);
  if (!Array.isArray(response.chunks) || !response.chunks.length) fail('invalid_response', `${where}.chunks must be a nonempty array`);
  const seen = new Set();
  const finished = new Set();
  for (const [index, chunk] of response.chunks.entries()) {
    try { validateSimulationChunk(chunk); } catch (cause) { fail('invalid_response', `${where}.chunks[${index}]: ${cause.message}`); }
    keysOnly(chunk, ['delta', 'finish_reason', 'usage', 'index', 'delayMs'], `${where}.chunks[${index}]`);
    const choice = chunk.index ?? 0;
    const hasChoice = chunk.delta !== undefined || chunk.finish_reason !== undefined;
    if (!hasChoice) continue;
    seen.add(choice);
    if (finished.has(choice) && (chunk.finish_reason != null || Object.keys(chunk.delta ?? {}).length)) fail('invalid_response', `${where}: choice ${choice} continues after finish_reason`);
    if (chunk.finish_reason != null) finished.add(choice);
  }
  if (!seen.size || [...seen].some((choice) => !finished.has(choice))) fail('truncated_response', `${where} ends without finish_reason for every choice`);
}

/** Validate version 1 and return an independent JSON copy. This only replays
 * recorded behavior; it does not predict a model's decisions on new requests. */
export function validateReplay(value) {
  const replay = cloneJSON(value);
  object(replay, 'replay');
  keysOnly(replay, ['version', 'entries', 'volatileFields'], 'replay');
  if (replay.version !== 1) fail('unknown_version', 'Only replay version 1 is supported');
  if (!Array.isArray(replay.entries) || !replay.entries.length || replay.entries.length > MAX_ENTRIES) fail('invalid_entries', 'Replay needs 1..10000 entries');
  const volatile = replay.volatileFields ?? [];
  if (!Array.isArray(volatile) || volatile.length > 1000 || new Set(volatile).size !== volatile.length) fail('invalid_volatile', 'volatileFields must contain unique JSON pointers');
  for (const path of volatile) if (typeof path !== 'string' || !VOLATILE_PATH.test(path)) fail('invalid_volatile', 'Only declared metadata IDs/timestamps and tool call ID leaves can be volatile');
  for (const [index, entry] of replay.entries.entries()) {
    object(entry, `entries[${index}]`);
    keysOnly(entry, ['lane', 'request', 'response'], `entries[${index}]`);
    if (entry.lane !== undefined && (typeof entry.lane !== 'string' || !entry.lane || entry.lane.length > 200)) fail('invalid_lane', `entries[${index}].lane must be a nonempty string`);
    validateRequest(entry.request, `entries[${index}].request`);
    validateResponse(entry.response, `entries[${index}].response`);
    noCredentials(entry.request);
    noCredentials(entry.response);
    for (const path of volatile) {
      const field = pointerGet(entry.request, path);
      if (field.exists && (typeof field.value !== 'string' && typeof field.value !== 'number')) fail('invalid_volatile', `Volatile field ${path} must be a string or number`);
    }
  }
  for (const path of volatile) if (!replay.entries.some((entry) => pointerGet(entry.request, path).exists)) fail('invalid_volatile', `Unused volatile field ${path}`);
  return replay;
}

function compare(expected, actual, volatile, bindings, path = '') {
  if (volatile.has(path)) {
    if (typeof expected !== typeof actual || (typeof actual !== 'string' && typeof actual !== 'number')) return path;
    const domain = path.startsWith('/messages/') ? 'tool-call-id' : `metadata:${path.split('/').at(-1)}`;
    const left = JSON.stringify([domain, expected]);
    const right = JSON.stringify([domain, actual]);
    if ((bindings.forward.has(left) && bindings.forward.get(left) !== right) || (bindings.reverse.has(right) && bindings.reverse.get(right) !== left)) return path;
    bindings.forward.set(left, right);
    bindings.reverse.set(right, left);
    return null;
  }
  if (expected === actual) return null;
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object' || Array.isArray(expected) !== Array.isArray(actual)) return path || '/';
  const leftKeys = Object.keys(expected).sort();
  const rightKeys = Object.keys(actual).sort();
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) return path || '/';
  for (const key of leftKeys) {
    const difference = compare(expected[key], actual[key], volatile, bindings, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    if (difference !== null) return difference;
  }
  return null;
}

/** modelMap maps recorded model names to the names supplied by the live host.
 * Entries are ordered inside each lane (default: recorded request.model).
 * Explicit ctx.lane selects a lane; otherwise exactly one next entry must match. */
export function createReplayModel(value, { modelMap = {}, trace = () => {} } = {}) {
  const replay = validateReplay(value);
  const map = cloneJSON(modelMap);
  object(map, 'modelMap');
  for (const [from, to] of Object.entries(map)) if (!from || typeof to !== 'string' || !to) fail('invalid_model_map', 'modelMap values must be nonempty model names');
  for (const from of Object.keys(map)) if (!replay.entries.some((entry) => entry.request.model === from)) fail('invalid_model_map', `modelMap has no recorded model named ${from}`);
  if (typeof trace !== 'function') throw new TypeError('trace must be a function');
  const volatile = new Set(replay.volatileFields ?? []);
  const lanes = new Map();
  const errors = [];
  for (const [index, entry] of replay.entries.entries()) {
    const id = entry.lane ?? entry.request.model;
    if (!lanes.has(id)) lanes.set(id, { lane: id, entries: [], position: 0, bindings: { forward: new Map(), reverse: new Map() } });
    lanes.get(id).entries.push({ ...entry, index });
  }
  const record = (cause) => {
    const error = cause instanceof Error ? cause : new ReplayError('replay_error', String(cause));
    errors.push(error);
    return error;
  };
  const snapshot = () => ({
    version: 1,
    total: replay.entries.length,
    consumed: [...lanes.values()].reduce((sum, lane) => sum + lane.position, 0),
    remaining: [...lanes.values()].reduce((sum, lane) => sum + lane.entries.length - lane.position, 0),
    lanes: [...lanes.values()].map((lane) => ({ lane: lane.lane, total: lane.entries.length, consumed: lane.position, remaining: lane.entries.length - lane.position })),
    errors: errors.map((error) => ({ code: error.code ?? 'replay_error', message: error.message })),
  });
  return {
    async respond(payload, context = {}) {
      try {
        if (context.signal?.aborted) fail('replay_aborted', 'Request was aborted before matching');
        const actual = cloneJSON(payload);
        validateRequest(actual, 'request');
        noCredentials(actual);
        if (context.lane !== undefined && (typeof context.lane !== 'string' || !lanes.has(context.lane))) fail('unknown_lane', 'Requested replay lane does not exist');
        const candidates = context.lane === undefined ? [...lanes.values()] : [lanes.get(context.lane)];
        const matches = [];
        const differences = [];
        for (const lane of candidates) {
          const next = lane.entries[lane.position];
          if (!next) continue;
          const expected = { ...next.request, model: map[next.request.model] ?? next.request.model };
          const bindings = { forward: new Map(lane.bindings.forward), reverse: new Map(lane.bindings.reverse) };
          const difference = compare(expected, actual, volatile, bindings);
          if (difference === null) matches.push({ lane, next, bindings });
          else differences.push(`${lane.lane}:${difference}`);
        }
        if (!matches.length) fail(differences.length ? 'request_mismatch' : 'extra_request', differences.length ? `Request does not match next lane contract (${differences.join(', ')})` : 'Replay received an extra request');
        if (matches.length > 1) fail('ambiguous_request', `Request matches multiple lanes: ${matches.map((match) => match.lane.lane).join(', ')}`);
        const { lane, next, bindings } = matches[0];
        lane.position++;
        lane.bindings = bindings;
        trace({ type: 'replay/matched', requestId: context.requestId ?? null, lane: lane.lane, entryIndex: next.index });
        return cloneJSON(next.response);
      } catch (cause) { throw record(cause); }
    },
    assertComplete() {
      if (errors.length) throw new AggregateError([...errors], `Replay failed: ${errors.map((error) => error.message).join('; ')}`);
      const state = snapshot();
      if (state.remaining) fail('unconsumed_entries', `Replay has ${state.remaining} unconsumed entries (${state.lanes.filter((lane) => lane.remaining).map((lane) => `${lane.lane}:${lane.remaining}`).join(', ')})`);
    },
    snapshot,
  };
}

/** Export only already-completed model request/choice data. Never copy ledger
 * headers, error objects, authentication metadata or inspect user files. */
export function recordReplay(requestLedger) {
  if (!Array.isArray(requestLedger) || !requestLedger.length || requestLedger.length > MAX_ENTRIES) fail('invalid_ledger', 'A nonempty request ledger is required');
  const entries = requestLedger.map((entry, index) => {
    if (!entry || entry.state !== 'completed' || entry.error) fail('incomplete_ledger', `Ledger entry ${index} did not complete successfully`);
    const request = cloneJSON(entry.payload);
    const chunks = cloneJSON(entry.chunks);
    noCredentials(request);
    noCredentials(chunks);
    return { ...(entry.lane === undefined ? {} : { lane: entry.lane }), request, response: { chunks } };
  });
  return validateReplay({ version: 1, entries });
}
