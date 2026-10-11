import { randomUUID } from 'node:crypto';

const stale = () => Object.assign(new Error('WebMCP tool registration is stale. Call fetchTools() again.'), { code: 'STALE_WEBMCP_TOOLS' });
const keyOf = tool => JSON.stringify([tool.frameId, tool.name]);
const limits = { maxTools: 100, maxTotalDescriptorBytes: 65536, maxRegistrationChanges: 10 };
const disabled = () => Object.assign(new Error('WebMCP is disabled for this page because the site\u2019s WebMCP configuration exceeds supported limits. After correcting the configuration, reset NodeREPL and refresh the browser tab to retry.'), { code: 'WEBMCP_LIMIT_EXCEEDED' });

// Runs in a dedicated isolated world; handles retain actual native registrations.
async function nativeTools(operation, args) {
  const context = document.modelContext, stateKey = '__opencuNativeWebMcpState';
  if (operation === 'cancel') {
    const state = globalThis[stateKey];
    state?.cancelled.add(args.invocationId);
    state?.invocations.get(args.invocationId)?.abort();
    return true;
  }
  if (!context || typeof context.getTools !== 'function' || globalThis.origin === 'null') return operation === 'read' ? null : Promise.reject(new Error(args.staleMessage));
  const descriptor = tool => JSON.stringify([tool.name, tool.origin, tool.title, tool.description, typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema ?? null, tool.annotations]);
  let state = globalThis[stateKey];
  if (!state) {
    state = globalThis[stateKey] = { generation: args.generation, handles: new Map(), ids: new Map(), invocations: new Map(), cancelled: new Set() };
    context.addEventListener('toolchange', () => { state.handles.clear(); state.ids = new Map(); });
  }
  if (operation === 'read' && state.generation !== args.generation) {
    if (state.generation > args.generation) throw new Error(args.staleMessage);
    state.handles.clear(); state.ids = new Map(); state.generation = args.generation;
  }
  const ids = state.ids;
  let tools;
  try { tools = await context.getTools(); }
  catch (error) { if (operation === 'read' && ['NotAllowedError', 'SecurityError'].includes(error?.name)) return []; throw error; }
  if (ids !== state.ids) throw new Error(args.staleMessage);
  if (operation === 'read') return tools.filter(tool => tool.window === window && tool.origin !== 'null').map(tool => {
    const metadata = descriptor(tool);
    let id = ids.get(tool.name);
    if (id && state.handles.get(id)?.descriptor !== metadata) { state.handles.delete(id); id = undefined; }
    if (!id) { id = crypto.randomUUID(); ids.set(tool.name, id); }
    state.handles.set(id, { tool, descriptor: metadata });
    return { name: tool.name, call_name: tool.name + '__' + id, registration_id: id, title: tool.title, description: tool.description, input_schema: typeof tool.inputSchema === 'string' ? JSON.parse(tool.inputSchema) : tool.inputSchema ?? null, annotations: tool.annotations, origin: tool.origin, pageUrl: args.pageUrl };
  });
  const handle = state.handles.get(args.registrationId), tool = handle?.tool;
  if (!tool || state.generation !== args.generation || !tools.some(current => current.window === window && current.window === tool.window && current.name === tool.name && current.origin === tool.origin && descriptor(current) === handle.descriptor)) throw new Error(args.staleMessage);
  if (tool.origin === 'null') throw new Error('Opaque-origin WebMCP tools are not allowed.');
  if (![1, 2].includes(context.executeTool.length)) throw new Error('Unsupported native WebMCP executeTool signature.');
  const controller = new AbortController();
  state.invocations.set(args.invocationId, controller);
  if (state.cancelled.delete(args.invocationId)) controller.abort();
  const timer = args.timeoutMs == null ? null : setTimeout(() => controller.abort(new DOMException('WebMCP tool execution timed out.', 'TimeoutError')), args.timeoutMs);
  try { controller.signal.throwIfAborted(); return await context.executeTool(tool, context.executeTool.length === 2 ? args.inputJson : JSON.parse(args.inputJson), { signal: controller.signal }); }
  finally { if (timer != null) clearTimeout(timer); state.invocations.delete(args.invocationId); }
}

async function evaluateNative(binding, operation, args) {
  const timeout = operation === 'read' ? 10000 : args.timeoutMs;
  const response = await binding.cdp.send('Runtime.evaluate', { contextId: binding.contextId, expression: `(${nativeTools.toString()})(${JSON.stringify(operation)},${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, ...(timeout == null ? {} : { timeout }) });
  if (response.exceptionDetails) {
    const message = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
    if (message?.includes(stale().message)) throw stale();
    throw Object.assign(new Error(message), { code: 'WEBMCP_TOOL_ERROR' });
  }
  return response.result.value;
}

function invalidate(state) { state.revision++; state.worlds.clear(); state.snapshots.clear(); }

async function nativeFrames(record, state) {
  const sessions = new Set([record.cdp]);
  for (const frame of record.page.frames()) {
    if (frame === record.page.mainFrame()) continue;
    let cdp = record.frames.get(frame);
    if (!cdp) {
      try { cdp = await record.page.context().newCDPSession(frame); }
      catch (error) { if (error.message.includes('part of the parent frame')) continue; throw error; }
      record.frames.set(frame, cdp);
    }
    sessions.add(cdp);
  }
  const frames = new Map(), snapshot = [];
  let pageUrl;
  for (const cdp of sessions) {
    await state.observe(cdp);
    const { frameTree } = await cdp.send('Page.getFrameTree');
    if (cdp === record.cdp) pageUrl = frameTree.frame.url || undefined;
    const pending = [frameTree];
    for (const { frame, childFrames } of pending) {
      snapshot.push([frame.id, frame.parentId, frame.loaderId, state.sessions.get(cdp).id]);
      const secure = ['Secure', 'SecureLocalhost'].includes(frame.secureContextType);
      const origin = frame.securityOrigin;
      if (secure && (origin === 'file://' && frame.url.startsWith('file://') || origin?.startsWith('https://') || origin?.startsWith('http://') && frame.securityOriginDetails?.isLocalhost === true)) {
        let fileUrl;
        if (origin === 'file://') { const url = new URL(frame.url); url.search = ''; url.hash = ''; fileUrl = url.href; }
        if (!frames.has(frame.id) || frame.id === frameTree.frame.id) frames.set(frame.id, { cdp, frameId: frame.id, origin, fileUrl });
      }
      pending.push(...childFrames ?? []);
    }
  }
  const current = JSON.stringify(snapshot.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (state.frameSnapshot != null && state.frameSnapshot !== current) invalidate(state);
  state.frameSnapshot = current;
  state.frameOwners = frames;
  return { frames: [...frames.values()], pageUrl };
}

async function readNative(record, state) {
  const { frames, pageUrl } = await nativeFrames(record, state), revision = state.revision;
  const registrations = [];
  let available = false;
  for (const frame of frames) {
    let binding = state.worlds.get(frame.frameId);
    if (!binding) {
      const { executionContextId } = await frame.cdp.send('Page.createIsolatedWorld', { frameId: frame.frameId, grantUniveralAccess: false, worldName: state.worldName });
      binding = { ...frame, contextId: executionContextId, generation: revision };
      state.worlds.set(frame.frameId, binding);
    }
    const tools = await evaluateNative(binding, 'read', { generation: revision, pageUrl, staleMessage: stale().message });
    if (state.revision !== revision) throw stale();
    if (tools !== null) available = true;
    for (const tool of tools ?? []) {
      if (typeof tool.registration_id !== 'string' || tool.origin !== frame.origin) throw new Error('Invalid native WebMCP tool owner.');
      registrations.push({ ...tool, ...(frame.fileUrl ? { origin: frame.fileUrl } : {}), binding });
    }
  }
  await nativeFrames(record, state);
  if (state.revision !== revision) throw stale();
  return available ? registrations : null;
}

async function enable(record) {
  if (record.webmcp?.ready) return record.webmcp.ready;
  const state = { tools: new Map(), revision: 0, active: new Set(), worlds: new Map(), snapshots: new Map(), sessions: new Map(), registrationChanges: 0, disabled: false, worldName: 'opencu-webmcp-' + randomUUID() };
  record.webmcp = state;
  const added = ({ tools }) => { for (const tool of tools) state.tools.set(keyOf(tool), { ...tool, registration_id: randomUUID() }); invalidate(state); };
  const removed = ({ tools }) => { for (const tool of tools) state.tools.delete(keyOf(tool)); invalidate(state); };
  const navigated = ({ frame }, cdp) => {
    for (const [key, tool] of state.tools) if (!frame.parentId && cdp === record.cdp || tool.frameId === frame.id) state.tools.delete(key);
    if (!frame.parentId && cdp === record.cdp) { state.disabled = false; state.registrationChanges = 0; state.descriptorSnapshot = undefined; }
    invalidate(state);
  };
  const events = { 'WebMCP.toolsAdded': added, 'WebMCP.toolsRemoved': removed, 'Page.frameNavigated': navigated, 'Page.frameAttached': () => invalidate(state), 'Page.frameDetached': () => invalidate(state), 'Page.documentOpened': () => invalidate(state), 'Target.detachedFromTarget': () => invalidate(state), 'Runtime.executionContextsCleared': () => invalidate(state), 'Runtime.executionContextDestroyed': ({ executionContextId }, cdp) => { if ([...state.worlds.values()].some(binding => binding.cdp === cdp && binding.contextId === executionContextId)) invalidate(state); } };
  state.observe = async cdp => {
    let session = state.sessions.get(cdp);
    if (!session) {
      const listeners = Object.entries(events).map(([name, listener]) => [name, payload => listener(payload, cdp)]);
      for (const [name, listener] of listeners) cdp.on(name, listener);
      session = { id: randomUUID(), listeners, ready: (async () => { await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('WebMCP.enable'); })() };
      state.sessions.set(cdp, session);
    }
    return session.ready;
  };
  state.ready = (async () => {
    const version = await record.cdp.send('Browser.getVersion');
    const major = Number(version.product?.match(/\/(\d+)/)?.[1]);
    // Chrome 152 exposes invoke/cancel but does not pass the cancellation
    // signal to tool callbacks. The native cancellation contract is verified
    // on Chromium 153; older connections keep their normal browser features.
    if (!(major >= 153)) throw new Error('WebMCP requires Chromium 153 or newer for cancellable tool execution; connected: ' + version.product);
    await state.observe(record.cdp);
    return state;
  })().catch(error => {
    for (const [cdp, session] of state.sessions) for (const [name, listener] of session.listeners) cdp.off(name, listener);
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
  if (state.disabled) throw disabled();
  const native = await readNative(record, state);
  signal?.throwIfAborted();
  const provider = native === null ? 'cdp' : 'native', registered = native ?? [...state.tools.values()].filter(tool => state.frameOwners.has(tool.frameId)).map(tool => {
    const owner = state.frameOwners.get(tool.frameId);
    return { ...tool, origin: owner.fileUrl ?? owner.origin, pageUrl: record.page.url() };
  });
  const tools = registered.map(tool => ({ name: tool.call_name ?? tool.name + '__' + tool.registration_id, ...(tool.title == null ? {} : { title: tool.title }), ...(tool.description == null ? {} : { description: tool.description }), inputSchema: provider === 'native' ? tool.input_schema : tool.inputSchema ?? null, ...(tool.annotations == null ? {} : { annotations: tool.annotations }), ...(tool.origin == null ? {} : { origin: tool.origin }), ...(tool.pageUrl == null ? {} : { pageUrl: tool.pageUrl }) }));
  const descriptors = tools.map((tool, index) => ({ ...tool, name: registered[index].name, pageUrl: undefined }));
  const descriptorSnapshot = JSON.stringify(descriptors);
  if (registered.length > limits.maxTools || Buffer.byteLength(descriptorSnapshot) > limits.maxTotalDescriptorBytes || state.descriptorSnapshot != null && state.descriptorSnapshot !== descriptorSnapshot && ++state.registrationChanges > limits.maxRegistrationChanges) { state.disabled = true; throw disabled(); }
  state.descriptorSnapshot = descriptorSnapshot;
  const handle = randomUUID();
  const snapshot = { handle, provider, generation: record.generation, revision: state.revision, tools: new Map(tools.map((tool, index) => [tool.name, registered[index]])) };
  state.snapshots.set(handle, snapshot);
  return { handle, provider, description: tools.length ? ['WebMCP tools available in this document:', JSON.stringify(tools, null, 2), 'Call tools.call(name, input) to invoke one.'].join('\n') : 'No WebMCP tools are available in this document.' };
}

export async function inspectWebMcpTools(record, signal) {
  if (!await webMcpAvailable(record, signal)) return { available: false, tools: [] };
  const result = await fetchWebMcpTools(record, signal), state = record.webmcp;
  const snapshot = state?.snapshots.get(result.handle);
  if (!snapshot || snapshot.generation !== record.generation || snapshot.revision !== state.revision) throw stale();
  try {
    signal?.throwIfAborted();
    return { available: true, tools: [...snapshot.tools.values()].map(tool => ({ name: tool.name,
      ...(tool.title == null ? {} : { title: tool.title }), ...(tool.description == null ? {} : { description: tool.description }),
      inputSchema: snapshot.provider === 'native' ? tool.input_schema : tool.inputSchema ?? null,
      ...(tool.annotations == null ? {} : { annotations: tool.annotations }), ...(tool.origin == null ? {} : { origin: tool.origin }) })) };
  } finally { state.snapshots.delete(result.handle); }
}

export async function callWebMcpTool(record, handle, name, input = {}, signal, options = {}) {
  const state = await enable(record), snapshot = state.snapshots.get(handle);
  signal?.throwIfAborted();
  if (state.disabled) throw disabled();
  if (!snapshot || snapshot.handle !== handle || snapshot.generation !== record.generation || snapshot.revision !== state.revision) throw stale();
  const callName = name.trim(), tool = snapshot.tools.get(callName);
  if (!tool) throw new Error(`WebMCP tool ${JSON.stringify(callName)} is not available in this snapshot. Call fetchTools() again.`);
  if (options?.timeoutMs != null && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new TypeError('WebMCP timeoutMs must be a positive integer.');
  if (snapshot.provider === 'native') return callNativeTool(record, state, snapshot, tool, input, signal, options);
  if (options?.timeoutMs != null) {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    signal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  }
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

async function callNativeTool(record, state, snapshot, tool, input, signal, options) {
  await nativeFrames(record, state);
  signal?.throwIfAborted();
  if (snapshot.revision !== state.revision || snapshot.generation !== record.generation) throw stale();
  const invocationId = randomUUID();
  const inputJson = JSON.stringify(input ?? null);
  let rejectClosed, cancelled, settled = false;
  const closedResponse = new Promise((_, reject) => { rejectClosed = reject; });
  const closed = () => rejectClosed(new Error('The WebMCP page or control connection closed.'));
  record.page.on('close', closed);
  const requested = evaluateNative(tool.binding, 'invoke', { registrationId: tool.registration_id, generation: tool.binding.generation, inputJson, invocationId, timeoutMs: options?.timeoutMs, staleMessage: stale().message }).finally(() => { settled = true; });
  void requested.catch(() => {});
  const active = { cancel: () => cancelled ??= (async () => {
    if (settled) return;
    await evaluateNative(tool.binding, 'cancel', { invocationId });
    // Completion confirms that the native execution has released its abort signal.
    await requested.catch(() => {});
  })().catch(error => { cancelled = null; throw error; }) };
  state.active.add(active);
  const abort = () => { void active.cancel().catch(rejectClosed); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const result = await Promise.race([requested, closedResponse]);
    signal?.throwIfAborted();
    if (result !== null && typeof result !== 'string') throw new Error('WebMCP executeTool returned an invalid result.');
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    record.page.off('close', closed); signal?.removeEventListener('abort', abort);
    if (settled) state.active.delete(active);
  }
}

export function expireWebMcpTools(record) { record.webmcp?.snapshots.clear(); }

export async function cancelWebMcp(record) {
  if (!record.webmcp) return;
  const active = [...record.webmcp.active];
  const results = await Promise.allSettled(active.map(async call => { await call.cancel(); record.webmcp.active.delete(call); }));
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'WebMCP cancellation was not confirmed: ' + errors.map(error => error.message).join('; '));
}
