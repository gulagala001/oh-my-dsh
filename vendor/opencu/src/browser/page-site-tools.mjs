import { siteToolsAllowed } from '../site-tools-policy.mjs';

// Runs in the current browser document. The native API controls tool exposure
// and cancellation. Tool text and results are untrusted page data.
async function siteToolOperation(key, request) {
  if (location.href !== request.url) return { stale: true };
  const context = document.modelContext ?? navigator.modelContext;
  if (typeof context?.getTools !== 'function' || typeof context?.executeTool !== 'function') return { available: false, tools: [] };
  const previous = globalThis[key];
  if (request.operation !== 'list' && (!previous || previous.document !== request.document)) return { stale: true };
  const state = previous ?? (globalThis[key] = { document: crypto.randomUUID(), revision: 0, calls: new Map(), cancelled: new Set(), context });
  if (state.context !== context) return { stale: true };
  if (!state.listening) {
    state.listening = true;
    context.addEventListener('toolchange', () => { state.revision++; });
  }
  if (request.operation === 'cancel') {
    const call = state.calls.get(request.requestId);
    if (!call) {
      // Cancellation can arrive while native discovery is still pending.
      state.cancelled.add(request.requestId);
      if (state.cancelled.size > 128) state.cancelled.delete(state.cancelled.values().next().value);
      return { cancelled: true };
    }
    call.abort.abort();
    await call.done.catch(() => {});
    return { cancelled: true };
  }
  const revision = state.revision;
  const tools = (await context.getTools()).filter(tool => tool.window === window && tool.origin === location.origin);
  if (location.href !== request.url || revision !== state.revision) return { stale: true };
  if (request.operation === 'list') return { available: true, document: state.document, revision, tools: tools.slice(0, 128).map(tool => ({
    name: tool.name, title: tool.title, description: tool.description, origin: tool.origin,
    inputSchema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema ?? null,
    annotations: tool.annotations,
  })) };
  const matches = tools.filter(tool => tool.name === request.name);
  if (matches.length !== 1 || revision !== request.revision) return { stale: true };
  if (state.cancelled.delete(request.requestId)) return { cancelled: true, dispatched: false };
  const abort = new AbortController(), signal = AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]);
  const tool = matches[0];
  // Chromium versions returning a descriptor dictionary accept serialized JSON.
  const input = Object.getPrototypeOf(tool) === Object.prototype ? JSON.stringify(request.input) : request.input;
  const done = Promise.resolve().then(() => context.executeTool(tool, input, { signal }));
  state.calls.set(request.requestId, { abort, done });
  try { return { output: await done, dispatched: true }; }
  catch (error) {
    return { failure: {
      code: signal.aborted ? 'SITE_TOOL_CANCELLED' : 'SITE_TOOL_ERROR',
      message: String(error?.message ?? error),
    }, dispatched: true };
  }
  finally { state.calls.delete(request.requestId); }
}

export function createPageSiteTools(element, occurrence, documentIdentity, readPolicy = () => undefined) {
  const key = '__opencuSiteTools_' + crypto.randomUUID();
  let registrations = new Map();
  const active = new Map();
  const run = request => element.executeJavaScript(`(${siteToolOperation.toString()})(${JSON.stringify(key)},${JSON.stringify(request)})`);
  const stale = () => Object.assign(new Error('The site tool changed. Discover the current tools again.'), {
    code: 'STALE_SITE_TOOL', details: { inputDispatched: false },
  });
  async function list() {
    const url = element.getURL(), current = occurrence();
    if (!siteToolsAllowed(await readPolicy(), url)) return { available: false, tools: [] };
    const result = await run({ operation: 'list', url });
    if (result?.stale || current !== occurrence() || url !== element.getURL()) throw stale();
    if (result?.available !== true || !Array.isArray(result.tools)) return { available: false, tools: [] };
    const next = new Map(), origin = new URL(url).origin;
    for (const tool of result.tools) {
      if (tool?.origin !== origin || typeof tool.name !== 'string' || !tool.name || next.has(tool.name)) continue;
      const signature = JSON.stringify([current, result.document, result.revision, tool]), previous = registrations.get(tool.name);
      const descriptor = { ...tool, registrationId: previous?.signature === signature ? previous.descriptor.registrationId : crypto.randomUUID() };
      next.set(tool.name, { descriptor, signature, document: result.document, revision: result.revision });
    }
    registrations = next;
    return { available: true, tools: [...next.values()].map(item => item.descriptor) };
  }
  return {
    list,
    async invoke({ requestId, registrationId, input, signal }) {
      if (typeof requestId !== 'string' || active.has(requestId) || input === null || typeof input !== 'object' || Array.isArray(input))
        throw Object.assign(new Error('A unique request and an input object are required'), { code: 'INVALID_ARGUMENT', details: { inputDispatched: false } });
      const url = element.getURL(), current = occurrence(), call = { document: documentIdentity(), cancelled: false };
      active.set(requestId, call);
      let stopping;
      const stop = () => { stopping = cancel(requestId); stopping.catch(() => {}); };
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop();
      try {
        const { tools } = await list();
        const selected = tools.find(tool => tool.registrationId === registrationId);
        if (!selected || current !== occurrence() || url !== element.getURL()) throw stale();
        if (call.cancelled) throw Object.assign(new Error('Site tool invocation cancelled'), { code: 'CONTROL_STOPPED', details: { inputDispatched: false } });
        const { document, revision } = registrations.get(selected.name);
        call.pageDocument = document;
        const result = await run({ operation: 'invoke', url, requestId, input, name: selected.name, document, revision });
        if (result?.stale || result?.available === false) throw stale();
        if (result?.cancelled) throw Object.assign(new Error('Site tool invocation cancelled'), { code: 'CONTROL_STOPPED', details: { inputDispatched: false } });
        if (result?.dispatched !== true) throw new Error('The site tool returned no execution receipt. Inspect this page before retrying.');
        if (result.failure) throw Object.assign(new Error(result.failure.message), { code: result.failure.code,
          details: { siteToolResponded: true, inputDispatched: true } });
        return { ...result, tool: selected };
      } finally {
        signal?.removeEventListener('abort', stop);
        active.delete(requestId);
        if (stopping) await stopping.catch(() => {});
      }
    },
    cancel,
  };
  async function cancel(requestId) {
    const calls = [...active].filter(([id]) => !requestId || requestId === id);
    for (const [id, call] of calls) {
      call.cancelled = true;
      if (call.pageDocument && call.document === documentIdentity()) {
        const result = await run({ operation: 'cancel', requestId: id, url: element.getURL(), document: call.pageDocument });
        if (result?.cancelled !== true && !result?.stale && call.document === documentIdentity()) throw new Error('The site tool did not acknowledge cancellation');
      }
    }
    return { cancelled: calls.length > 0 };
  }
}
