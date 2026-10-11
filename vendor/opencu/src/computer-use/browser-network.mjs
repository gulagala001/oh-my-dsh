import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const maximumEntries = 200, maximumBody = 1024 * 1024;
const consoleLevels = new Set(['debug', 'info', 'log', 'warn', 'error']);
const diagnosticScopes = new WeakMap(), diagnosticStates = new WeakMap();

function diagnosticsState(record) {
  const scope = diagnosticScopes.get(record) ?? record.capabilityAdapter?.browserAuthDiagnosticsScope ?? record;
  let state = diagnosticStates.get(scope);
  if (!state) { state = { leases: 0, protected: false, generation: 0, records: new Set() }; diagnosticStates.set(scope, state); }
  state.records.add(record);
  return state;
}
function clearDiagnostics(state) {
  for (const record of state.records) {
    record.network?.entries.clear();
    record.network?.resetRequests?.();
    if (record.network) { record.network.dropped = 0; record.network.observedSince = Date.now(); }
    if (Array.isArray(record.logs)) record.logs.length = 0;
  }
}
function diagnosticsBlocked(record) {
  const state = diagnosticsState(record);
  if (state.leases || state.protected) { clearDiagnostics(state); return true; }
  return false;
}
function assertDiagnosticsReadable(record, generation) {
  const state = diagnosticsState(record);
  if (state.leases || state.protected || generation !== undefined && state.generation !== generation) {
    clearDiagnostics(state);
    throw Object.assign(new Error('Browser diagnostics are unavailable while credential data is protected.'), { code: 'BROWSER_AUTH_DIAGNOSTICS_RESTRICTED' });
  }
  return state.generation;
}
export function registerBrowserAuthDiagnosticsScope(record, scope) {
  if (!record || typeof record !== 'object' || !scope || typeof scope !== 'object') throw new TypeError('An owned record and private diagnostics scope are required.');
  const previous = diagnosticsState(record);
  diagnosticScopes.set(record, scope);
  const state = diagnosticsState(record);
  if (state !== previous) { previous.records.delete(record); state.generation++; }
  if (state.leases || state.protected) clearDiagnostics(state);
}
export function suppressBrowserAuthDiagnostics(record, scope) {
  if (scope) registerBrowserAuthDiagnosticsScope(record, scope);
  const state = diagnosticsState(record);
  state.leases++; state.generation++; clearDiagnostics(state);
  let active = true;
  return () => {
    if (!active) return;
    active = false; clearDiagnostics(state); state.leases--; state.generation++;
  };
}
export function protectBrowserAuthCredentialDiagnostics(record, scope) {
  if (scope) registerBrowserAuthDiagnosticsScope(record, scope);
  const state = diagnosticsState(record);
  state.protected = true; state.generation++; clearDiagnostics(state);
  return true;
}

function consoleLevel(value) {
  if (value === 'warning') return 'warn';
  return consoleLevels.has(value) ? value : 'log';
}
function consoleArgument(value) {
  if (!value || typeof value !== 'object') return '[object]';
  if (value.type === 'string') return String(value.value ?? '');
  if (value.value !== undefined) return String(value.value);
  return typeof value.description === 'string' ? value.description : '[object]';
}
function consoleUrl(value) {
  return typeof value === 'string' && value ? { url: value } : {};
}

// Read protocol descriptions without evaluating objects in the page. Runtime
// enable replays retained messages when logs are first requested.
export function observeConsole(record) {
  if (record.consoleObservation) return;
  record.logs = [];
  const push = entry => {
    if (diagnosticsBlocked(record)) return;
    record.logs.push(entry);
    if (record.logs.length > 500) record.logs.splice(0, record.logs.length - 500);
  };
  const console = value => {
    if (diagnosticsBlocked(record)) return;
    if (!value || typeof value !== 'object') return;
    push({ level: consoleLevel(value.type), message: Array.isArray(value.args) ? value.args.map(consoleArgument).join(' ') : '', timestamp: new Date().toISOString(), ...consoleUrl(value.stackTrace?.callFrames?.[0]?.url) });
  };
  const exception = value => {
    if (diagnosticsBlocked(record)) return;
    const details = value?.exceptionDetails;
    if (!details || typeof details !== 'object') return;
    const exception = details.exception;
    const message = typeof exception?.value === 'string' ? exception.value : exception?.description ?? details.text ?? 'Uncaught exception';
    push({ level: 'error', message: String(message), timestamp: new Date().toISOString(), ...consoleUrl(details.url) });
  };
  record.consoleObservation = { enabled: false, enabling: null };
  record.cdp.on('Runtime.consoleAPICalled', console);
  record.cdp.on('Runtime.exceptionThrown', exception);
  record.page.once('close', () => {
    record.cdp.removeListener('Runtime.consoleAPICalled', console);
    record.cdp.removeListener('Runtime.exceptionThrown', exception);
  });
}

export async function listConsole(record, options = {}) {
  const generation = assertDiagnosticsReadable(record);
  const { filter, levels, limit } = options;
  if (filter != null && typeof filter !== 'string') throw new TypeError('tab.dev.logs received an invalid filter');
  let included;
  if (levels != null) {
    if (!Array.isArray(levels) || !levels.length) throw new TypeError('tab.dev.logs received invalid levels');
    included = new Set(levels.map(level => {
      if (level === 'warning') return 'warn';
      if (!consoleLevels.has(level)) throw new TypeError(`tab.dev.logs received invalid level "${String(level)}"`);
      return level;
    }));
  }
  if (limit != null && (!Number.isInteger(limit) || limit <= 0)) throw new TypeError('tab.dev.logs received an invalid limit');
  observeConsole(record);
  const state = record.consoleObservation;
  if (!state.enabled) {
    if (!state.enabling) state.enabling = record.cdp.send('Runtime.enable').then(() => { state.enabled = true; }).finally(() => { state.enabling = null; });
    try { await state.enabling; }
    catch (error) { assertDiagnosticsReadable(record, generation); throw error; }
  }
  assertDiagnosticsReadable(record, generation);
  return record.logs.filter(entry => (!filter || entry.message.includes(filter)) && (!included || included.has(entry.level))).slice(-(limit ?? 100)).map(entry => ({ ...entry }));
}

function waitOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Browser wait options must be an object.');
  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new TypeError('timeoutMs must be a positive integer.');
  // Codex's browser service bounds public waits to its 3s command budget.
  // Existing direct Playwright callers can still supply their timeout value.
  const timeout = options.timeoutMs === undefined && options.timeout !== undefined ? options.timeout : Math.min(options.timeoutMs ?? 3000, 3000);
  return { ...options, timeout };
}
function urlPattern(value) {
  let source = '^';
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '*') {
      const double = value[index + 1] === '*';
      source += double ? '.*' : '[^/]*';
      if (double) index++;
    } else source += /[\\.^$|()[\]{}+?]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(source + '$');
}
function waitForNetworkIdle(record, timeout, signal) {
  return new Promise((resolve, reject) => {
    let frame, settled = false;
    const buffered = [];
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      record.cdp.removeListener('Page.frameNavigated', navigated);
      record.cdp.removeListener('Page.lifecycleEvent', lifecycle);
      record.page.removeListener('close', closed);
      signal?.removeEventListener('abort', abort);
      if (error !== undefined) reject(error); else resolve();
    };
    const navigated = event => {
      if (event.frame.parentId != null) return;
      if (!frame) { buffered.push(['navigation', event]); return; }
      frame = event.frame;
    };
    const lifecycle = event => {
      if (!frame) { buffered.push(['lifecycle', event]); return; }
      if (event.name === 'networkIdle' && event.frameId === frame.id && event.loaderId === frame.loaderId) finish();
    };
    const closed = () => finish(new Error('Tab detached while waiting for networkidle.'));
    const abort = () => finish(signal.reason ?? new Error('Browser wait aborted'));
    const timer = timeout === 0 ? undefined : setTimeout(() => {
      const error = new Error('Timed out waiting for networkidle.');
      error.name = 'TimeoutError';
      finish(error);
    }, timeout);
    record.cdp.on('Page.frameNavigated', navigated);
    record.cdp.on('Page.lifecycleEvent', lifecycle);
    record.page.once('close', closed);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    void (async () => {
      await record.cdp.send('Page.enable');
      if (settled) return;
      const { frameTree } = await record.cdp.send('Page.getFrameTree');
      if (settled) return;
      frame = frameTree.frame;
      for (const [type, event] of buffered) {
        if (type === 'navigation') navigated(event); else lifecycle(event);
      }
      if (!settled) await record.cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
    })().catch(finish);
  });
}
export async function waitForBrowser(record, method, args = [], signal) {
  signal?.throwIfAborted();
  if (method === 'waitForTimeout') {
    const timeout = args[0];
    if (!Number.isInteger(timeout) || timeout < 0) throw new TypeError('playwright.waitForTimeout requires a non-negative integer');
    await delay(timeout, undefined, { signal });
  } else if (method === 'waitForLoadState') {
    const legacy = typeof args[0] === 'string';
    const options = waitOptions(legacy ? args[1] : args[0]);
    const state = (legacy ? args[0] : options.state) ?? 'load';
    if (!['load', 'domcontentloaded', 'networkidle'].includes(state)) throw new TypeError('Invalid browser load state.');
    if (state === 'networkidle') await waitForNetworkIdle(record, options.timeout, signal);
    else await record.page.waitForLoadState(state, { timeout: options.timeout });
  } else if (method === 'waitForURL') {
    const value = args[0], options = waitOptions(args[1]);
    if (!(value instanceof RegExp) && (typeof value !== 'string' || !value)) throw new TypeError('playwright.waitForURL requires a url');
    const waitUntil = options.waitUntil ?? 'commit';
    if (!['commit', 'load', 'domcontentloaded', 'networkidle'].includes(waitUntil)) throw new TypeError('Invalid browser URL wait state.');
    await record.page.waitForURL(value instanceof RegExp ? value : urlPattern(value), { timeout: options.timeout, waitUntil: waitUntil === 'networkidle' ? 'commit' : waitUntil });
    if (waitUntil === 'networkidle') await waitForNetworkIdle(record, options.timeout, signal);
  } else throw new Error(`Unsupported browser wait: ${method}`);
  signal?.throwIfAborted();
}

// Observe the selected page's existing traffic. Never replay a request to obtain
// its body: authenticated POSTs and downloads may have non-repeatable effects.
export function observeNetwork(record) {
  const entries = new Map(); let requests = new WeakMap();
  record.network = { entries, dropped: 0, observedSince: Date.now(), resetRequests: () => { requests = new WeakMap(); } };
  record.page.once('close', () => {
    diagnosticsState(record).records.delete(record); diagnosticScopes.delete(record);
    entries.clear(); requests = new WeakMap();
    if (Array.isArray(record.logs)) record.logs.length = 0;
  });
  record.page.on('request', request => {
    if (diagnosticsBlocked(record)) return;
    const id = randomUUID(), redirectedFrom = requests.get(request.redirectedFrom());
    requests.set(request, id);
    entries.set(id, { request, summary: { id, url: request.url(), method: request.method(), resourceType: request.resourceType(), startedAt: Date.now(), state: 'pending', ...(redirectedFrom ? { redirectedFrom } : {}) } });
    while (entries.size > maximumEntries) { entries.delete(entries.keys().next().value); record.network.dropped++; }
  });
  record.page.on('response', response => {
    if (diagnosticsBlocked(record)) return;
    const entry = entries.get(requests.get(response.request()));
    if (entry) { entry.response = response; Object.assign(entry.summary, { status: response.status(), statusText: response.statusText() }); }
  });
  record.page.on('requestfinished', request => {
    if (diagnosticsBlocked(record)) return;
    const entry = entries.get(requests.get(request));
    if (entry) Object.assign(entry.summary, { state: 'finished', finishedAt: Date.now() });
  });
  record.page.on('requestfailed', request => {
    if (diagnosticsBlocked(record)) return;
    const entry = entries.get(requests.get(request));
    if (entry) Object.assign(entry.summary, { state: 'failed', finishedAt: Date.now(), failure: request.failure()?.errorText ?? 'Request failed' });
  });
}

export function listNetwork(record, { limit = 50, url } = {}) {
  assertDiagnosticsReadable(record);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumEntries) throw new TypeError('limit must be an integer from 1 to 200.');
  if (url !== undefined && typeof url !== 'string') throw new TypeError('url must be a substring filter.');
  const state = record.network;
  const matches = [...state.entries.values()].map(entry => entry.summary).filter(entry => !url || entry.url.includes(url));
  return { requests: matches.slice(-limit).map(entry => ({ ...entry })), observedSince: state.observedSince, dropped: state.dropped, hasMore: matches.length > limit };
}

function entryFor(record, id) {
  assertDiagnosticsReadable(record);
  const entry = record.network.entries.get(id);
  if (!entry) throw new Error('Unknown or expired request ID. Read the current network request list.');
  return entry;
}
function bodyContent(bytes, contentType = '') {
  const truncated = bytes.length > maximumBody, shown = bytes.subarray(0, maximumBody);
  const mime = contentType.split(';')[0].trim().toLowerCase();
  let binary = !(mime.startsWith('text/') || ['application/json','application/xml','application/javascript','application/x-javascript','application/x-www-form-urlencoded'].includes(mime) || mime.endsWith('+json') || mime.endsWith('+xml'));
  let decoded;
  if (!binary) try { decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(shown); } catch { binary = true; }
  return { encoding: binary ? 'base64' : 'utf8', content: binary ? shown.toString('base64') : decoded, bytes: bytes.length, truncated, contentType };
}
export async function networkRequest(record, id, signal) {
  const generation = assertDiagnosticsReadable(record);
  const entry = entryFor(record, id); signal?.throwIfAborted();
  const [requestHeaders, responseHeaders] = await Promise.all([entry.request.allHeaders(), entry.response?.allHeaders() ?? null])
    .catch(error => { assertDiagnosticsReadable(record, generation); throw error; });
  signal?.throwIfAborted();
  assertDiagnosticsReadable(record, generation);
  const body = entry.request.postDataBuffer();
  return { ...entry.summary, requestHeaders, responseHeaders, requestBody: body ? bodyContent(body, requestHeaders['content-type']) : null };
}
export async function networkResponseBody(record, id, signal) {
  const generation = assertDiagnosticsReadable(record);
  const entry = entryFor(record, id); signal?.throwIfAborted();
  if (!entry.response || entry.summary.state !== 'finished') throw new Error('The response has not completed successfully; inspect its request state first.');
  const headers = await entry.response.allHeaders().catch(error => { assertDiagnosticsReadable(record, generation); throw error; });
  const sizes = await entry.response.request().sizes().catch(error => { assertDiagnosticsReadable(record, generation); throw error; });
  assertDiagnosticsReadable(record, generation);
  if (sizes.responseBodySize > maximumBody) throw new Error('Response exceeds the 1 MiB diagnostic body limit. Metadata remains available.');
  signal?.throwIfAborted();
  const bytes = await entry.response.body().catch(error => { assertDiagnosticsReadable(record, generation); throw error; });
  assertDiagnosticsReadable(record, generation);
  signal?.throwIfAborted();
  if (bytes.length > maximumBody) throw new Error('Decoded response exceeds the 1 MiB diagnostic body limit. Metadata remains available.');
  return { id, ...bodyContent(bytes, headers['content-type']) };
}
