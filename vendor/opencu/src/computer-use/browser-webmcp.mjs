import { randomUUID } from 'node:crypto';

const stale = () => Object.assign(new Error('WebMCP tools changed or the page navigated. Fetch the tools again.'), { code: 'STALE_WEBMCP_TOOLS' });
const keyOf = tool => JSON.stringify([tool.frameId, tool.name]);

async function enable(record) {
  if (record.webmcp?.ready) return record.webmcp.ready;
  const state = { tools: new Map(), revision: 0, active: new Set() };
  record.webmcp = state;
  const added = ({ tools }) => { for (const tool of tools) state.tools.set(keyOf(tool), tool); state.revision++; };
  const removed = ({ tools }) => { for (const tool of tools) state.tools.delete(keyOf(tool)); state.revision++; };
  const navigated = ({ frame }) => {
    for (const [key, tool] of state.tools) if (!frame.parentId || tool.frameId === frame.id) state.tools.delete(key);
    state.revision++;
  };
  record.cdp.on('WebMCP.toolsAdded', added); record.cdp.on('WebMCP.toolsRemoved', removed); record.cdp.on('Page.frameNavigated', navigated);
  state.ready = (async () => {
    const version = await record.cdp.send('Browser.getVersion');
    const major = Number(version.product?.match(/\/(\d+)/)?.[1]);
    // Chrome 152 exposes invoke/cancel but does not pass the cancellation
    // signal to tool callbacks. The native cancellation contract is verified
    // on Chromium 153; older connections keep their normal browser features.
    if (!(major >= 153)) throw new Error('WebMCP requires Chromium 153 or newer for cancellable tool execution; connected: ' + version.product);
    await record.cdp.send('WebMCP.enable');
    return state;
  })().catch(error => {
    record.cdp.off('WebMCP.toolsAdded', added); record.cdp.off('WebMCP.toolsRemoved', removed); record.cdp.off('Page.frameNavigated', navigated);
    if (record.webmcp === state) record.webmcp = null;
    throw Object.assign(new Error('This browser does not expose the WebMCP protocol: ' + error.message), { code: 'WEBMCP_UNAVAILABLE' });
  });
  return state.ready;
}

export async function webMcpAvailable(record, signal) {
  try { await enable(record); signal?.throwIfAborted(); return true; }
  catch (error) { signal?.throwIfAborted(); if (error.code === 'WEBMCP_UNAVAILABLE') return false; throw error; }
}

export async function fetchWebMcpTools(record, signal) {
  const state = await enable(record); signal?.throwIfAborted();
  const registered = [...state.tools.values()], counts = new Map();
  for (const tool of registered) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  const tools = registered.map(tool => ({ name: counts.get(tool.name) === 1 ? tool.name : JSON.stringify([tool.frameId, tool.name]), description: tool.description, inputSchema: tool.inputSchema ?? { type: 'object' }, annotations: tool.annotations, frameId: tool.frameId }));
  const handle = randomUUID();
  state.snapshot = { handle, generation: record.generation, revision: state.revision, tools: new Map(tools.map((tool, index) => [tool.name, registered[index]])) };
  return { handle, description: JSON.stringify({ pageUrl: record.page.url(), tools }, null, 2) };
}

export async function callWebMcpTool(record, handle, name, input = {}, signal) {
  const state = await enable(record), snapshot = state.snapshot;
  signal?.throwIfAborted();
  if (!snapshot || snapshot.handle !== handle || snapshot.generation !== record.generation || snapshot.revision !== state.revision) throw stale();
  const tool = snapshot.tools.get(name);
  if (!tool) throw new Error('Unknown WebMCP tool. Call only a name listed in tools.description().');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('WebMCP tool input must be an object matching its inputSchema.');
  let invocationId, resolve, reject, cancelled, settled = false;
  const early = new Map();
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Cancellation and protocol errors may arrive while the invoke acknowledgement
  // is still in flight; retain the rejection until this function awaits it.
  void response.catch(() => {});
  const responded = event => {
    if (!invocationId) { if (early.size < 32) early.set(event.invocationId, event); return; }
    if (event.invocationId !== invocationId) return;
    settled = true;
    if (event.status === 'Completed') resolve(event.output);
    else reject(Object.assign(new Error(event.errorText || event.exception?.description || 'WebMCP invocation ' + event.status), { code: event.status === 'Canceled' ? 'COMPUTER_USE_STOPPED' : 'WEBMCP_TOOL_ERROR' }));
  };
  record.cdp.on('WebMCP.toolResponded', responded);
  const requested = record.cdp.send('WebMCP.invokeTool', { frameId: tool.frameId, toolName: tool.name, input });
  const active = {
    cancel: () => cancelled ??= (async () => {
      if (settled) return;
      const result = await requested;
      if (settled) return;
      await record.cdp.send('WebMCP.cancelInvocation', { invocationId: result.invocationId });
      settled = true; reject(signal?.reason ?? Object.assign(new Error('WebMCP invocation stopped'), { code: 'COMPUTER_USE_STOPPED' }));
    })().catch(error => { reject(error); cancelled = null; throw error; }),
  };
  state.active.add(active);
  const abort = () => { void active.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const closed = () => { settled = true; reject(new Error('The WebMCP page or control connection closed.')); };
  record.page.on('close', closed);
  try {
    try { ({ invocationId } = await requested); } catch (error) { settled = true; throw error; }
    if (early.has(invocationId)) responded(early.get(invocationId));
    if (signal?.aborted) await active.cancel();
    return await response;
  } finally {
    signal?.removeEventListener('abort', abort); record.cdp.off('WebMCP.toolResponded', responded); record.page.off('close', closed);
    // Failed cancellation stays reachable for stop's cleanup retry.
    if (settled) state.active.delete(active);
  }
}

export async function cancelWebMcp(record) {
  if (!record.webmcp) return;
  const active = [...record.webmcp.active];
  const results = await Promise.allSettled(active.map(async call => { await call.cancel(); record.webmcp.active.delete(call); }));
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'WebMCP cancellation was not confirmed: ' + errors.map(error => error.message).join('; '));
}
