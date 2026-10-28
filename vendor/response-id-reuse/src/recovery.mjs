// Continuation is optional. Keep its latency/health separate from storage support.
export class ContinuationHealth {
  constructor({ now = Date.now, minWaitMs = 15000, defaultWaitMs = 30000,
    maxWaitMs = 60000, cooldownMs = 60000, maxCooldownMs = 900000 } = {}) {
    Object.assign(this, { now, minWaitMs, defaultWaitMs, maxWaitMs, cooldownMs, maxCooldownMs });
    this.routes = new Map();
  }
  route(key, meta) {
    let route = this.routes.get(key);
    if (!route) {
      route = { provider: meta.provider, model: meta.model, samples: [], failures: 0, until: 0, epoch: 0, probe: null };
      this.routes.set(key, route);
      while (this.routes.size > 512) this.routes.delete(this.routes.keys().next().value);
    }
    return route;
  }
  budget(route) {
    const samples = [...route.samples].sort((a, b) => a - b);
    const estimate = samples.length ? samples[Math.ceil(samples.length * .9) - 1] * 4 + 5000 : this.defaultWaitMs;
    return Math.min(this.maxWaitMs, Math.max(this.minWaitMs, estimate));
  }
  enter(route) {
    if (route.until > this.now() || route.probe) return null;
    const lease = { route, epoch: route.epoch };
    if (route.failures) route.probe = lease;
    return lease;
  }
  fail(lease) {
    if (!lease || lease.epoch !== lease.route.epoch) return;
    const route = lease.route;
    route.failures++;
    route.until = this.now() + Math.min(this.maxCooldownMs, this.cooldownMs * 2 ** Math.min(10, route.failures - 1));
    route.epoch++;
    route.probe = null;
  }
  success(lease) {
    if (!lease || lease.epoch !== lease.route.epoch) return;
    Object.assign(lease.route, { failures: 0, until: 0, probe: null });
  }
  release(lease) {
    if (lease?.route.probe === lease) lease.route.probe = null;
  }
  sample(route, ms) {
    if (Number.isFinite(ms) && ms >= 0) {
      route.samples.push(ms);
      if (route.samples.length > 16) route.samples.shift();
    }
  }
  inspect() {
    return [...this.routes.values()].map(route => ({ provider: route.provider, model: route.model,
      state: route.probe ? 'probing' : route.until > this.now() ? 'cooling' : route.failures ? 'retry-ready' : 'healthy',
      retryAfterMs: Math.max(0, route.until - this.now()), firstOutputBudgetMs: this.budget(route) }));
  }
}

export class FirstOutputTimeout extends Error {
  constructor(ms) { super(`Responses continuation produced no output within ${ms}ms`); this.name = 'FirstOutputTimeout'; }
}

export function outputEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (typeof event.type === 'string' && event.type.endsWith('.delta') && typeof event.delta === 'string' && event.delta.length) return true;
  if (event.type === 'response.output_item.added' && event.item) {
    const item = event.item;
    if (item.type === 'function_call') return typeof item.name === 'string' && item.name.length > 0;
    if (['message', 'reasoning'].includes(item.type))
      return [...(Array.isArray(item.content) ? item.content : []), ...(Array.isArray(item.summary) ? item.summary : [])]
        .some(block => typeof block?.text === 'string' && block.text.length);
    return true; // Do not hide an unfamiliar item which could represent server-side work.
  }
  // Terminal events must reach the native adapter even without visible text.
  return ['response.completed', 'response.failed', 'response.incomplete', 'error'].includes(event.type);
}

// Hold only pre-output SSE metadata, so a timed-out attempt cannot leak one
// response's identity into a replacement stream. Once output begins, pass through.
export async function sendAttempt(baseFetch, request, body, headers, budgetMs, onOutput) {
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let timer, response, reader, timeoutError;
  const cancel = reason => {
    clearTimeout(timer);
    controller.abort(reason);
    const pending = reader ? reader.cancel(reason) : response?.body?.cancel(reason);
    pending?.catch(() => {});
  };
  const deadline = budgetMs == null ? null : new Promise((_, reject) => {
    timer = setTimeout(() => {
      timeoutError = new FirstOutputTimeout(budgetMs);
      cancel(timeoutError); reject(timeoutError);
    }, budgetMs);
  });
  const wait = promise => deadline ? Promise.race([promise, deadline]) : promise;
  try {
    const pending = baseFetch(new Request(request, { body, headers, signal, redirect: 'error' }));
    pending.then(result => { if (signal.aborted) result.body?.cancel().catch(() => {}); }, () => {});
    response = await wait(pending);
    request.signal.throwIfAborted();
    if (budgetMs != null && response.ok && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
      reader = response.body.getReader();
      const chunks = [], decoder = new TextDecoder();
      let pendingText = '', eventData = [], bytes = 0, ready = false, done = false, output = false;
      while (!ready && !done) {
        const next = await wait(reader.read());
        done = next.done;
        if (done) break;
        chunks.push(next.value); bytes += next.value.byteLength;
        pendingText += decoder.decode(next.value, { stream: true });
        let split;
        while ((split = pendingText.indexOf('\n')) >= 0) {
          const line = pendingText.slice(0, split).replace(/\r$/, ''); pendingText = pendingText.slice(split + 1);
          if (line.startsWith('data:')) eventData.push(line.slice(5).trimStart());
          if (!line && eventData.length) {
            const data = eventData.join('\n'); eventData = [];
            try { output ||= outputEvent(JSON.parse(data)); } catch { output ||= data === '[DONE]'; }
            ready ||= output;
          }
        }
        // An unusual large preamble cannot be safely hidden/replayed indefinitely.
        if (bytes > 128 * 1024) ready = true;
      }
      clearTimeout(timer);
      if (output) onOutput?.();
      const originalReader = reader;
      const stream = new ReadableStream({
        start(target) { for (const chunk of chunks) target.enqueue(chunk); if (done) target.close(); },
        async pull(target) {
          try { const part = await originalReader.read(); if (part.done) target.close(); else target.enqueue(part.value); }
          catch (error) { target.error(error); }
        },
        cancel(reason) { cancel(reason); },
      });
      const outgoing = new Headers(response.headers); outgoing.delete('content-length');
      response = new Response(stream, { status: response.status, statusText: response.statusText, headers: outgoing });
    }
    clearTimeout(timer);
    return { response, cancel };
  } catch (error) {
    cancel(error);
    if (request.signal.aborted) throw request.signal.reason;
    throw timeoutError || error;
  }
}

// Only ambiguous 4xx responses require an error body. Never wait on a 5xx body.
export async function errorDetails(response) {
  if (![400, 404, 409, 422].includes(response.status) || !response.body) return null;
  const reader = response.clone().body.getReader();
  let timer, bytes = 0, text = '';
  const decoder = new TextDecoder();
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({ done: true }), 1000); });
  try {
    while (bytes <= 65536) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes <= 65536) text += decoder.decode(value, { stream: true });
    }
  } catch { /* Unknown errors keep their original response. */ }
  finally { clearTimeout(timer); reader.cancel().catch(() => {}); }
  return null;
}

// A failed replay must not move the unbounded wait into the SDK's error parser.
export function boundedErrorBody(response, cancel, timeoutMs = 1000) {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let timer, settled = false, bytes = 0;
  const stream = new ReadableStream({
    start(target) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error('Responses error body did not finish in time');
        cancel?.(error); reader.cancel(error).catch(() => {}); target.error(error);
      }, timeoutMs);
    },
    async pull(target) {
      try {
        const part = await reader.read();
        if (settled) return;
        if (part.done) { settled = true; clearTimeout(timer); target.close(); return; }
        bytes += part.value.byteLength;
        if (bytes > 65536) throw new Error('Responses error body exceeds 64 KiB');
        target.enqueue(part.value);
      } catch (error) {
        if (settled) return;
        settled = true; clearTimeout(timer); cancel?.(error); reader.cancel(error).catch(() => {}); target.error(error);
      }
    },
    cancel(reason) { settled = true; clearTimeout(timer); cancel?.(reason); reader.cancel(reason).catch(() => {}); },
  });
  const headers = new Headers(response.headers); headers.delete('content-length');
  return new Response(stream, { status: response.status, statusText: response.statusText, headers });
}
