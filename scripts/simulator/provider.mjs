import http from 'node:http';
import { setTimeout as realSetTimeout, clearTimeout as realClearTimeout } from 'node:timers';

class ProtocolError extends Error {
  constructor(message, code = 'provider_error', status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function cancelled(signal) {
  return signal.reason ?? new DOMException('Request aborted', 'AbortError');
}

// A scripted responder or iterator may ignore cancellation; never wait on it
// after a client disconnects or the provider closes.
function abortable(value, signal) {
  if (signal.aborted) return Promise.reject(cancelled(signal));
  return new Promise((resolve, reject) => {
    const finish = (settle, value) => {
      signal.removeEventListener('abort', abort);
      settle(value);
    };
    const abort = () => finish(reject, cancelled(signal));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then((result) => finish(resolve, result), (cause) => finish(reject, cause));
  });
}

function delay(milliseconds, signal) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new ProtocolError('delayMs must be a finite nonnegative number', 'invalid_chunk');
  }
  if (!milliseconds) return abortable(undefined, signal);
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelled(signal));
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function readBody(req, signal, maxBodyBytes) {
  req.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    const cleanup = () => {
      req.off('data', data);
      req.off('end', end);
      req.off('error', error);
      signal.removeEventListener('abort', abort);
    };
    const fail = (cause) => { cleanup(); reject(cause); };
    const data = (part) => {
      bytes += Buffer.byteLength(part, 'utf8');
      if (bytes > maxBodyBytes) {
        req.resume();
        fail(new ProtocolError(`Request body exceeds ${maxBodyBytes} bytes`, 'body_too_large', 413));
      } else body += part;
    };
    const end = () => { cleanup(); resolve(body); };
    const error = (cause) => fail(cause);
    const abort = () => fail(cancelled(signal));
    req.on('data', data);
    req.on('end', end);
    req.on('error', error);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function iteratorFor(chunks) {
  if (!chunks || typeof chunks === 'string') {
    throw new ProtocolError('Responder must return an array or iterable of choice chunks', 'invalid_response');
  }
  if (typeof chunks[Symbol.asyncIterator] === 'function') return chunks[Symbol.asyncIterator]();
  if (Array.isArray(chunks)) return chunks[Symbol.iterator]();
  throw new ProtocolError('Responder must return an array or async iterable of choice chunks', 'invalid_response');
}

export function validateSimulationChunk(chunk) {
  if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) {
    throw new ProtocolError('Stream chunk must be a choice object', 'invalid_chunk');
  }
  if (chunk.delta !== undefined && (!chunk.delta || typeof chunk.delta !== 'object' || Array.isArray(chunk.delta))) {
    throw new ProtocolError('Choice delta must be an object', 'invalid_chunk');
  }
  if (chunk.finish_reason != null && (typeof chunk.finish_reason !== 'string' || !chunk.finish_reason)) {
    throw new ProtocolError('finish_reason must be a nonempty string or null', 'invalid_chunk');
  }
  if (chunk.finish_reason != null && !['stop', 'length', 'tool_calls', 'content_filter', 'function_call'].includes(chunk.finish_reason)) {
    throw new ProtocolError('Unsupported finish_reason', 'invalid_chunk');
  }
  if (chunk.delta === undefined && chunk.finish_reason === undefined && chunk.usage === undefined) {
    throw new ProtocolError('Chunk contains neither a choice nor usage', 'invalid_chunk');
  }
  if (chunk.usage !== undefined && (!chunk.usage || typeof chunk.usage !== 'object' || Array.isArray(chunk.usage))) {
    throw new ProtocolError('Chunk usage must be an object', 'invalid_chunk');
  }
  for (const [field, value] of Object.entries(chunk.usage ?? {})) {
    if (field.endsWith('_tokens') && (!Number.isSafeInteger(value) || value < 0)) throw new ProtocolError(`Usage ${field} must be a nonnegative integer`, 'invalid_chunk');
  }
  if (chunk.index !== undefined && (!Number.isSafeInteger(chunk.index) || chunk.index < 0)) {
    throw new ProtocolError('Choice index must be a nonnegative integer', 'invalid_chunk');
  }
  if (chunk.delayMs !== undefined && (!Number.isFinite(chunk.delayMs) || chunk.delayMs < 0 || chunk.delayMs > 2_147_483_647)) {
    throw new ProtocolError('Invalid chunk delayMs', 'invalid_chunk');
  }
  for (const field of ['content', 'reasoning_content', 'refusal', 'role']) {
    if (chunk.delta?.[field] !== undefined && chunk.delta[field] !== null && typeof chunk.delta[field] !== 'string') {
      throw new ProtocolError(`Choice delta.${field} must be a string or null`, 'invalid_chunk');
    }
  }
  if (chunk.delta?.tool_calls !== undefined) {
    if (!Array.isArray(chunk.delta.tool_calls)) throw new ProtocolError('tool_calls must be an array', 'invalid_chunk');
    for (const call of chunk.delta.tool_calls) {
      if (!call || typeof call !== 'object' || Array.isArray(call)) throw new ProtocolError('Invalid tool call fragment', 'invalid_chunk');
      if (call.index !== undefined && (!Number.isSafeInteger(call.index) || call.index < 0)) throw new ProtocolError('Invalid tool call index', 'invalid_chunk');
      if (call.id !== undefined && typeof call.id !== 'string') throw new ProtocolError('Tool call id must be a string', 'invalid_chunk');
      if (call.type !== undefined && call.type !== 'function') throw new ProtocolError('Unsupported tool call type', 'invalid_chunk');
      if (call.function !== undefined) {
        if (!call.function || typeof call.function !== 'object' || Array.isArray(call.function)) throw new ProtocolError('Invalid tool function fragment', 'invalid_chunk');
        for (const field of ['name', 'arguments']) {
          if (call.function[field] !== undefined && typeof call.function[field] !== 'string') throw new ProtocolError(`Tool function ${field} must be a string`, 'invalid_chunk');
        }
      }
    }
  }
  return chunk;
}

function mergeDelta(message, delta) {
  for (const [key, value] of Object.entries(delta)) {
    if (key === 'tool_calls') {
      if (!Array.isArray(value)) throw new ProtocolError('tool_calls must be an array', 'invalid_chunk');
      message.tool_calls ??= [];
      for (const part of value) {
        const index = part.index ?? 0;
        if (!Number.isInteger(index) || index < 0) throw new ProtocolError('Invalid tool call index', 'invalid_chunk');
        const tool = message.tool_calls[index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (part.id) tool.id += part.id;
        if (part.type) tool.type = part.type;
        if (part.function?.name) tool.function.name += part.function.name;
        if (part.function?.arguments) tool.function.arguments += part.function.arguments;
      }
    } else if (key === 'role') message.role = value;
    else if (typeof value === 'string') message[key] = (message[key] ?? '') + value;
    else if (value !== undefined && value !== null) message[key] = value;
  }
}

/** Strict, loopback-only OpenAI completions fixture. No remote API is used. */
export async function createSimulationProvider({ respond, trace = () => {}, maxBodyBytes = 8 * 1024 * 1024, cleanupTimeoutMs = 1000 } = {}) {
  if (typeof respond !== 'function') throw new TypeError('respond must be a function');
  if (typeof trace !== 'function') throw new TypeError('trace must be a function');
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) throw new TypeError('maxBodyBytes must be a positive integer');
  if (!Number.isSafeInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1 || cleanupTimeoutMs > 60_000) throw new TypeError('cleanupTimeoutMs must be an integer in 1..60000');
  const requests = [];
  const errors = [];
  const controllers = new Set();
  const sockets = new Set();
  const socketRequests = new WeakMap();
  const tasks = new Set();
  const callbacks = new Set();
  const cleanups = new Set();
  let closing;
  let sealed = false;
  let sequence = 0;

  const recordError = (request, cause, code = cause?.code ?? 'provider_error') => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const entry = { requestId: request?.id ?? null, code, message: error.message, error };
    if (!sealed) {
      errors.push(entry);
      if (request) request.error = entry;
    }
    return entry;
  };
  const emit = (event) => {
    if (sealed) return;
    try { trace(event); } catch (cause) { recordError(null, cause, 'trace_error'); }
  };
  const report = (request, cause, code) => {
    const error = recordError(request, cause, code);
    emit({ type: 'request/error', requestId: request.id, code: error.code, message: error.message });
  };
  const trackCallback = (request, signal, kind, invoke) => {
    const state = { kind, state: 'pending' };
    request.callbacks ??= [];
    request.callbacks.push(state);
    const callback = { request, state };
    callbacks.add(callback);
    const promise = Promise.resolve().then(() => {
      if (signal.aborted) throw cancelled(signal);
      return invoke();
    });
    callback.settled = promise.then(() => {
      if (sealed || state.state !== 'pending') return;
      state.state = 'fulfilled';
      callbacks.delete(callback);
    }, (cause) => {
      if (sealed || state.state !== 'pending') return;
      const cancelledNormally = signal.aborted && (cause === signal.reason || cause?.name === 'AbortError');
      state.state = cancelledNormally ? 'cancelled' : 'rejected';
      callbacks.delete(callback);
      if (signal.aborted && !cancelledNormally) report(request, cause, `${kind}_late_error`);
    });
    return promise;
  };
  const startCleanup = (request, iterator) => {
    const state = { state: 'pending' };
    request.cleanup = state;
    const cleanup = { request, state };
    cleanups.add(cleanup);
    cleanup.settled = Promise.resolve().then(() => iterator.return()).then(() => {
      if (sealed || state.state !== 'pending') return;
      state.state = 'completed';
      cleanups.delete(cleanup);
    }, (cause) => {
      if (sealed || state.state !== 'pending') return;
      state.state = 'error';
      cleanups.delete(cleanup);
      report(request, cause, 'iterator_cleanup');
    });
  };

  const handle = async (req, res) => {
    const request = { id: `sim-${++sequence}`, method: req.method, path: req.url, payload: null, state: 'receiving', chunks: [], status: null };
    requests.push(request);
    const controller = new AbortController();
    const { signal } = controller;
    socketRequests.set(req.socket, { request, controller });
    controllers.add(controller);
    const abort = () => {
      if (!res.writableFinished && !signal.aborted) controller.abort(new DOMException('Client disconnected', 'AbortError'));
    };
    req.on('aborted', abort);
    res.on('close', abort);
    emit({ type: 'request/start', requestId: request.id, method: request.method, path: request.path });
    let iterator;
    let exhausted = false;
    let failureBody;
    try {
      if (closing) throw new ProtocolError('Provider is closing', 'provider_closed', 503);
      if (req.url !== '/v1/chat/completions') throw new ProtocolError(`Unknown request path: ${req.url}`, 'unknown_path', 404);
      if (req.method !== 'POST') throw new ProtocolError('Only POST is supported', 'invalid_method', 405);
      const body = await readBody(req, signal, maxBodyBytes);
      try { request.payload = JSON.parse(body); } catch { throw new ProtocolError('Invalid JSON request body', 'invalid_json', 400); }
      if (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
        throw new ProtocolError('Request body must be a JSON object', 'invalid_payload', 400);
      }
      request.state = 'responding';
      const response = await abortable(trackCallback(request, signal, 'responder', () => respond(request.payload, { signal, requestId: request.id })), signal);
      if (response === undefined || response === null) throw new ProtocolError('Responder returned no response', 'missing_response');
      const spec = Array.isArray(response) || typeof response[Symbol.asyncIterator] === 'function' ? { chunks: response } : response;
      const status = spec.status ?? 200;
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new ProtocolError('Invalid response status', 'invalid_response');
      request.status = status;
      if (status >= 300) {
        failureBody = spec.body;
        throw new ProtocolError(typeof spec.body?.error?.message === 'string' ? spec.body.error.message : `Scripted response failed with HTTP ${status}`, 'response_status', status);
      }
      const metadata = { id: `chatcmpl-${request.id}`, created: Math.floor(Date.now() / 1000), model: request.payload.model ?? 'simulator' };
      if (request.payload.stream === false && spec.body !== undefined) {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(spec.body));
      } else {
        iterator = iteratorFor(spec.chunks);
        const stream = request.payload.stream !== false;
        const message = { role: 'assistant', content: '' };
        let usage;
        let finishReason;
        if (stream) {
          // A simulated host clock freezes HTTP client idle timers too. Closing
          // each completed local stream prevents transport keep-alive expiry
          // from becoming an accidental real six-second wait between steps.
          res.writeHead(status, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'close' });
          res.flushHeaders();
        }
        request.state = 'streaming';
        while (true) {
          const next = await abortable(trackCallback(request, signal, 'iterator', () => iterator.next()), signal);
          if (next.done) { exhausted = true; break; }
          const chunk = next.value;
          validateSimulationChunk(chunk);
          await delay(chunk.delayMs ?? 0, signal);
          request.chunks.push(chunk);
          emit({ type: 'stream/chunk', requestId: request.id, chunk });
          if (chunk.finish_reason != null) finishReason = chunk.finish_reason;
          if (chunk.usage !== undefined) usage = chunk.usage;
          if (stream) {
            const usageOnly = chunk.delta === undefined && chunk.finish_reason === undefined;
            const packet = { ...metadata, object: 'chat.completion.chunk', choices: usageOnly ? [] : [{ index: chunk.index ?? 0, delta: chunk.delta ?? {}, finish_reason: chunk.finish_reason ?? null }], ...(chunk.usage === undefined ? {} : { usage: chunk.usage }) };
            if (!res.write(`data: ${JSON.stringify(packet)}\n\n`)) {
              await new Promise((resolve, reject) => {
                const cleanup = () => { res.off('drain', drain); signal.removeEventListener('abort', abort); };
                const drain = () => { cleanup(); resolve(); };
                const abort = () => { cleanup(); reject(cancelled(signal)); };
                res.once('drain', drain);
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) abort();
              });
            }
          } else mergeDelta(message, chunk.delta ?? {});
        }
        if (!finishReason) throw new ProtocolError('Stream ended without a finish_reason', 'incomplete_stream');
        if (stream) res.end('data: [DONE]\n\n');
        else {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ...metadata, object: 'chat.completion', choices: [{ index: 0, message, finish_reason: finishReason }], ...(usage === undefined ? {} : { usage }) }));
        }
      }
      request.state = 'completed';
      emit({ type: 'request/end', requestId: request.id, status: request.status, chunkCount: request.chunks.length });
    } catch (cause) {
      if (signal.aborted) {
        request.state = 'aborted';
        request.abortReason = cancelled(signal).message;
        emit({ type: 'request/aborted', requestId: request.id, reason: request.abortReason });
        if (!res.destroyed) res.destroy();
      } else {
        request.state = 'error';
        const error = recordError(request, cause);
        emit({ type: 'request/error', requestId: request.id, code: error.code, message: error.message });
        if (!res.headersSent) {
          request.status = Number.isInteger(cause?.status) && cause.status >= 300 && cause.status <= 599 ? cause.status : 500;
          res.writeHead(request.status, { 'content-type': 'application/json', connection: 'close' });
          res.end(JSON.stringify(failureBody === undefined ? { error: { message: error.message, type: 'simulation_error', code: error.code } } : failureBody));
          req.resume();
        } else res.destroy(cause instanceof Error ? cause : new Error(String(cause)));
      }
    } finally {
      req.off('aborted', abort);
      res.off('close', abort);
      controllers.delete(controller);
      if (iterator && !exhausted && typeof iterator.return === 'function') {
        // Track the original return() independently of request cancellation.
        // close() waits for it within one real deadline, then explicitly fails
        // and seals the ledger if the callback does not cooperate.
        startCleanup(request, iterator);
      }
    }
  };

  const server = http.createServer((req, res) => {
    const task = handle(req, res);
    tasks.add(task);
    task.finally(() => tasks.delete(task));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('clientError', (cause, socket) => {
    const active = socketRequests.get(socket);
    if (cause.code === 'ECONNRESET' && active) {
      // Resetting a stream is a normal client cancellation, including when the
      // reset arrives before ServerResponse emits close.
      if (!active.controller.signal.aborted) active.controller.abort(new DOMException('Client disconnected', 'AbortError'));
    } else recordError(null, cause, 'http_parse_error');
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  server.on('error', (cause) => recordError(null, cause, 'server_error'));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    baseURL: `${origin}/v1`,
    requests,
    errors,
    assertHealthy() {
      const failures = errors.map((entry) => entry.error);
      for (const cleanup of cleanups) failures.push(new ProtocolError(`Iterator cleanup is pending for ${cleanup.request.id}`, 'cleanup_pending'));
      for (const callback of callbacks) if (callback.request.state === 'aborted') failures.push(new ProtocolError(`Cancelled ${callback.state.kind} is still pending for ${callback.request.id}`, 'callback_pending'));
      if (failures.length) throw new AggregateError(failures, `Simulation provider has ${failures.length} error(s): ${failures.map((error) => error.message).join('; ')}`);
    },
    close() {
      if (closing) return closing;
      closing = (async () => {
        let timer;
        const deadline = new Promise((resolve) => { timer = realSetTimeout(() => resolve('timeout'), cleanupTimeoutMs); });
        for (const controller of controllers) controller.abort(new DOMException('Provider closed', 'AbortError'));
        const closed = new Promise((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
        for (const socket of sockets) socket.destroy();
        try {
          await Promise.all([closed, Promise.all([...tasks])]);
          await Promise.race([
            Promise.all([...callbacks, ...cleanups].map((operation) => operation.settled)),
            deadline,
          ]);
          for (const callback of callbacks) {
            callback.state.state = 'abandoned';
            report(callback.request, new ProtocolError(`${callback.state.kind} did not settle within the ${cleanupTimeoutMs}ms close deadline`, `${callback.state.kind}_abandoned`), `${callback.state.kind}_abandoned`);
          }
          for (const cleanup of cleanups) {
            cleanup.state.state = 'timed_out';
            report(cleanup.request, new ProtocolError(`Iterator cleanup did not settle within the ${cleanupTimeoutMs}ms close deadline`, 'cleanup_timeout'), 'cleanup_timeout');
          }
        } finally {
          realClearTimeout(timer);
          callbacks.clear();
          cleanups.clear();
          sealed = true;
        }
      })();
      return closing;
    },
  };
}
