import { z } from 'zod';

const capabilityInfo = Object.freeze({
  cdp: Object.freeze({ id: 'cdp', description: 'Send raw Chrome DevTools Protocol commands and read debugger events through a supported tab for developer use cases.' }),
  browserAuth: Object.freeze({ id: 'browserAuth', description: 'MUST read its documentation before the first interaction with any authentication or sign-in flow required for the task. Covers method selection, secure user-provided credentials, and post-authentication verification and recovery.' }),
  botDetection: Object.freeze({ id: 'botDetection', description: 'Use when the current tab is blocked by bot detection, a failed CAPTCHA, a hard access denial, or a repeated challenge/login loop.' }),
});
const unavailable = id => Object.assign(new Error('Tab capability is not available: ' + id), { code: 'CAPABILITY_UNAVAILABLE' });
const targetSchema = z.object({ sessionId: z.string().min(1).optional(), targetId: z.string().min(1).optional() })
  .refine(value => (value.sessionId == null) !== (value.targetId == null), 'CDP target must provide exactly one of sessionId or targetId.');
const paramsSchema = z.record(z.string(), z.unknown());
const sendOptionsSchema = z.object({ target: targetSchema.optional(), timeoutMs: z.number().int().positive().optional() });
const eventsOptionsSchema = z.object({
  afterSequence: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(1000).optional(),
  methods: z.array(z.string().min(1)).min(1).optional(), target: targetSchema.optional(),
  timeoutMs: z.number().int().nonnegative().optional(),
});
const eventSchema = z.object({
  method: z.string().min(1), params: paramsSchema.optional(),
  source: z.object({ extensionId: z.string().optional(), sessionId: z.string().optional(), tabId: z.number().int().optional(), targetId: z.string().optional() }),
  trackedTargetId: z.string().optional(),
});
const botReportSchema = z.object({ reason: z.enum(['captcha_failed', 'access_denied', 'challenge_loop', 'unexpected_bot_error']) });
const authSelectorSchema = z.union([z.string(), z.object({ $locator: z.object({ id: z.string(), browserId: z.string().optional(), chain: z.array(z.object({ method: z.string(), args: z.array(z.unknown()).optional() })) }) })]);
const authIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value));
const authFieldSchema = z.object({ id: authIdSchema, label: z.string(), type: z.string().min(1), autocomplete: z.string().nullable().optional(), required: z.boolean(), selector: authSelectorSchema });
const authOptionSchema = z.object({ id: authIdSchema, label: z.string().trim().min(1).max(120), selector: authSelectorSchema.optional(), field_ids: z.array(z.string()).max(6).optional() })
  .refine(value => (value.selector != null) !== ((value.field_ids?.length ?? 0) > 0), 'Browser auth options require either a selector or credential fields.');
export const browserAuthRequestSchema = z.object({
  origin: z.string(), fields: z.array(authFieldSchema).max(6), options: z.array(authOptionSchema).min(2).max(10).optional(),
  qr_code: z.literal(true).optional(), submit: z.object({ selector: authSelectorSchema, action: z.enum(['click', 'press_enter']) }).optional(),
  otpHandle: z.string().min(1).max(16384).optional(),
}).refine(value => value.fields.length > 0 || value.options != null || value.qr_code === true, 'Browser auth requires credential fields, sign-in options or a QR code.');
const rejectionSchema = z.object({
  outcome: z.enum(['origin_changed', 'submission_failed']), reason: z.enum(['request_url_invalid', 'request_scheme', 'request_origin', 'paused_iframe', 'iframe_origin', 'child_frame_origin', 'other']),
  request_class: z.enum(['main_document', 'background', 'other']), submission_phase: z.enum(['pending', 'settled', 'not_applicable']),
});
const attemptSchema = z.object({
  sequence: z.number().int().min(0).max(65535),
  kind: z.enum(['prompt_completed', 'field_fill_started', 'field_fill_completed', 'field_fill_uncertain', 'url_changed', 'document_changed', 'frame_changed', 'reinspection_started', 'reinspection_succeeded', 'reinspection_failed', 'site_request', 'site_navigation', 'site_submission_verified', 'submit_started', 'attempt_completed']),
  phase: z.enum(['prompt', 'filling', 'before_submit', 'submitting', 'settled']), field_index: z.number().int().min(0).max(63).optional(), reinspection: z.number().int().min(1).max(3).optional(),
  outcome: z.enum(['submitted', 'unavailable', 'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed', 'prompt_changed']).optional(),
  request_class: z.enum(['main_document', 'background']).optional(), method: z.enum(['get', 'post', 'other']).optional(), origin_relation: z.enum(['same', 'cross', 'other']).optional(),
});
export const browserAuthResultSchema = z.object({
  status: z.enum(['submitted', 'declined', 'cancelled', 'unavailable', 'expired', 'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed']),
  locator_error: z.object({ field_id: z.string(), reason: z.literal('not_user_visible') }).optional(), selected_option: z.string().optional(), reason: z.literal('user_took_over').optional(),
  submission_diagnostics: z.object({ schema_version: z.literal(1), request_id: z.string().uuid(), submission_mode: z.enum(['ordinary', 'private']), first_rejection: rejectionSchema.optional(), terminal_rejection: rejectionSchema.optional(), attempt_events: z.array(attemptSchema).max(64).optional(), dropped_attempt_events: z.number().int().min(0).max(65535).optional() }).optional(),
});

const allowedDomains = new Set(['Accessibility', 'Audits', 'CacheStorage', 'Console', 'CSS', 'Database', 'Debugger', 'DOM', 'DOMDebugger', 'DOMSnapshot', 'Emulation', 'Fetch', 'IO', 'Input', 'Inspector', 'Log', 'Network', 'Overlay', 'Page', 'Performance', 'Profiler', 'Runtime', 'Storage', 'Target', 'Tracing', 'WebAudio', 'WebAuthn']);
const blockedDomains = new Set(['CacheStorage', 'Database', 'Storage', 'Target', 'WebAuthn']);
const blockedMethods = new Set(['DOM.getFileInfo', 'DOM.setFileInputFiles', 'Input.dispatchKeyEvent', 'Input.setInterceptDrags', 'Network.clearBrowserCookies', 'Network.deleteDeviceBoundSession', 'Network.enableDeviceBoundSessions', 'Network.getAllCookies', 'Network.getResponseBodyForInterception', 'Network.setCookieControls', 'Network.setExtraHTTPHeaders', 'Network.setRequestInterception', 'Network.takeResponseBodyForInterceptionAsStream', 'Page.addScriptToEvaluateOnLoad', 'Page.addScriptToEvaluateOnNewDocument', 'Page.crash', 'Page.disable', 'Page.getNavigationHistory', 'Page.resetNavigationHistory', 'Page.setAdBlockingEnabled', 'Page.setBypassCSP', 'Page.setDownloadBehavior', 'Page.setInterceptFileChooserDialog', 'Page.setRPHRegistrationMode', 'Page.setSPCTransactionMode', 'Tracing.requestMemoryDump', 'Input.dispatchDragEvent', 'Network.continueInterceptedRequest', 'Network.getCertificate', 'Network.loadNetworkResource', 'Network.replayXHR', 'Page.navigate', 'Page.navigateToHistoryEntry']);
const unsupported = () => new Error('This method is not supported through raw CDP.');
const owns = (value, key) => value != null && Object.hasOwn(value, key);

function urlParameter(method, params, name, required = false, label = name) {
  if (!owns(params, name)) {
    if (required) throw new Error(`${method} ${label} is required so every affected origin can be authorized.`);
    return [];
  }
  if (typeof params[name] !== 'string') throw new TypeError(`${method} ${label} must be a string.`);
  return [params[name]];
}
function cookieUrls(method, cookie, prefix = '') {
  for (const key of ['domain', 'sourcePort', 'sourceScheme']) if (owns(cookie, key)) throw new Error(`${method} ${prefix}${key} is not supported; use ${prefix}url.`);
  const urls = urlParameter(method, cookie, 'url', true, prefix + 'url');
  if (cookie?.partitionKey != null) {
    const partition = paramsSchema.parse(cookie.partitionKey);
    urls.push(...urlParameter(method, partition, 'topLevelSite', false, prefix + 'partitionKey.topLevelSite'));
  }
  return urls;
}

// These restrictions protect managed navigation, file transfer and origin scope.
export function prepareTabCdpCommand(method, params, { preserveDocumentInterception = false } = {}) {
  method = z.string().min(1).parse(method);
  if (params !== undefined) params = paramsSchema.parse(params);
  const domain = method.slice(0, method.indexOf('.'));
  const trace = params?.traceConfig;
  if (!allowedDomains.has(domain) || blockedDomains.has(domain) || blockedMethods.has(method)
    || ['Fetch.continueResponse', 'Fetch.fulfillRequest'].includes(method) && params?.binaryResponseHeaders != null
    || method === 'Network.configureDurableMessages' && params?.maxTotalBufferSize != null
    || method === 'Network.enable' && params?.enableDurableMessages === true
    || method === 'Page.createIsolatedWorld' && params?.grantUniveralAccess === true
    || method === 'Page.reload' && params?.scriptToEvaluateOnLoad != null
    || method === 'Tracing.start' && (params?.perfettoConfig != null || params?.tracingBackend === 'system' || typeof params?.options === 'string' && params.options.split(',').some(value => value.trim() === 'enable-systrace') || trace != null && (trace.enableSystrace === true || trace.memoryDumpConfig != null))) throw unsupported();
  if (preserveDocumentInterception) {
    if (method === 'Fetch.disable') throw unsupported();
    if (method === 'Fetch.enable') {
      if (!Array.isArray(params?.patterns) || params.patterns.some(pattern => pattern == null || typeof pattern !== 'object' || Array.isArray(pattern) || typeof pattern.resourceType !== 'string' || pattern.resourceType === 'Document')) throw unsupported();
      params = { ...params, patterns: [...params.patterns, { resourceType: 'Document', requestStage: 'Response' }] };
    }
  }
  const urls = [];
  if (method === 'Fetch.continueRequest') urls.push(...urlParameter(method, params, 'url'));
  if (['Fetch.continueResponse', 'Fetch.fulfillRequest'].includes(method) && params?.responseHeaders != null) {
    for (const header of z.array(z.object({ name: z.string(), value: z.string() })).parse(params.responseHeaders)) if (header.name.trim().toLowerCase() === 'location') urls.push(header.value);
  }
  if (method === 'Network.getCookies') {
    const values = z.array(z.string()).parse(params?.urls ?? []);
    if (!values.length) throw new Error('Network.getCookies urls must include at least one URL so every affected origin can be authorized.');
    urls.push(...values);
  }
  if (['Network.setCookie', 'Network.deleteCookies'].includes(method)) urls.push(...cookieUrls(method, params));
  if (method === 'Network.setCookies' && params?.cookies != null) for (const [index, cookie] of z.array(paramsSchema).parse(params.cookies).entries()) urls.push(...cookieUrls(method, cookie, `cookies[${index}].`));
  if (method === 'Page.deleteCookie') urls.push(...urlParameter(method, params, 'url', true));
  return { method, params, urls };
}

export class CdpEventBuffer {
  constructor() { this.sequence = 0; this.evictedThrough = 0; this.events = []; this.waiters = new Set(); this.closed = false; }
  record(value) {
    if (this.closed) return;
    const event = eventSchema.parse(value);
    this.events.push({ ...structuredClone(event), sequence: ++this.sequence });
    if (this.events.length > 1000) this.evictedThrough = this.events.splice(0, this.events.length - 1000).at(-1).sequence;
    for (const wake of [...this.waiters]) wake();
  }
  discard() {
    this.evictedThrough = Math.max(this.evictedThrough, this.sequence); this.events = [];
    for (const wake of [...this.waiters]) wake();
  }
  result(afterSequence, options) {
    const matching = this.events.filter(event => event.sequence > afterSequence
      && (options.methods == null || options.methods.includes(event.method))
      && (options.target?.sessionId != null ? event.source.sessionId === options.target.sessionId : options.target?.targetId == null || event.source.targetId === options.target.targetId || event.trackedTargetId === options.target.targetId));
    const selected = matching.slice(0, options.limit ?? matching.length), hasMore = selected.length < matching.length;
    return { cursor: hasMore ? selected.at(-1).sequence : this.sequence,
      events: selected.map(({ trackedTargetId: _tracked, ...event }) => structuredClone(event)), hasMore, truncated: afterSequence < this.evictedThrough };
  }
  async read(options = {}, signal) {
    options = eventsOptionsSchema.parse(options); signal?.throwIfAborted();
    const afterSequence = options.afterSequence ?? this.sequence, initial = this.result(afterSequence, options);
    if (initial.events.length || initial.truncated || !options.timeoutMs || this.closed) return initial;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true; clearTimeout(timer); this.waiters.delete(wake); signal?.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(value);
      };
      const wake = () => { const value = this.result(afterSequence, options); if (value.events.length || value.truncated || this.closed) finish(null, value); };
      const abort = () => finish(signal.reason);
      const timer = setTimeout(() => finish(null, this.result(afterSequence, options)), options.timeoutMs);
      this.waiters.add(wake); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort(); else wake();
    });
  }
  close() { this.closed = true; this.discard(); }
}

function webOrigin(url) {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null; }
  catch { return null; }
}
function hostname(url) { try { return new URL(url).hostname || null; } catch { return null; } }
const cdpConfigured = (provider, record) => provider?.enabled === true
  && ['authorizeOrigin', 'authorizeUrl'].every(key => typeof provider[key] === 'function')
  && (typeof provider.createAdapter === 'function' || record.capabilityAdapter != null);
const authConfigured = provider => provider?.enabled === true && provider.secure === true && typeof provider.request === 'function';
const botConfigured = provider => provider?.enabled === true && typeof provider.report === 'function';

// Providers own permissions and secure credential handling. Missing providers
// never expose a substitute path through the internal automation channel.
export function createTabCapabilities(record, providers = {}, { browserId, resolveSelector } = {}) {
  const events = new CdpEventBuffer();
  let adapterPromise, activeAdapter, unsubscribe, eventError, disposing, disposed = false, authInProgress = false, origin = webOrigin(record.page.url());
  const available = async id => {
    if (disposed) return false;
    const provider = providers[id], configured = id === 'cdp' ? cdpConfigured(provider, record) : id === 'browserAuth' ? authConfigured(provider) : id === 'botDetection' && botConfigured(provider);
    if (!configured) return false;
    try { return typeof provider.isAvailable !== 'function' || await provider.isAvailable(record) === true; }
    catch { return false; }
  };
  const requireProvider = async id => { if (!await available(id)) throw unavailable(id); return providers[id]; };
  const canObserve = connection => !authInProgress && connection.canObserve?.() !== false
    && (!authConfigured(providers.browserAuth) || typeof providers.browserAuth.canObserve === 'function' && providers.browserAuth.canObserve(record) === true);
  const adapter = async provider => {
    if (!adapterPromise) adapterPromise = Promise.resolve().then(async () => {
      const value = typeof provider.createAdapter === 'function' ? await provider.createAdapter(record) : await record.capabilityAdapter;
      if (disposed) { await value?.dispose?.(); throw unavailable('cdp'); }
      if (!value || typeof value.send !== 'function' || typeof value.subscribeEvents !== 'function') throw unavailable('cdp');
      activeAdapter = value;
      unsubscribe = value.subscribeEvents(event => {
        try {
          if (disposed || !canObserve(value)) return;
          events.record(event);
          if (event.topLevel === true && event.method === 'Page.frameNavigated') {
            const next = event.params?.frame?.securityOrigin ?? webOrigin(event.params?.frame?.url);
            if (origin !== next) { origin = next; events.discard(); }
          }
        } catch { eventError = new Error('The scoped CDP adapter supplied an invalid event.'); events.close(); }
      }, () => events.close());
      if (typeof unsubscribe !== 'function') throw unavailable('cdp');
      return value;
    }).catch(async error => {
      adapterPromise = undefined;
      try { if (typeof unsubscribe === 'function') unsubscribe(); }
      finally { await activeAdapter?.dispose?.(); activeAdapter = undefined; }
      throw error;
    });
    return adapterPromise;
  };
  const authorize = async (provider, signal) => {
    signal?.throwIfAborted();
    if (authInProgress) throw new Error('Raw CDP is unavailable during secure browser authentication.');
    const current = webOrigin(record.page.url());
    if (!current) throw new Error('Raw CDP requires an HTTP(S) page. Navigate to the tab first.');
    if (await provider.authorizeOrigin({ origin: current, record, signal }) !== true) throw Object.assign(new Error('Raw CDP origin access was not granted.'), { code: 'CAPABILITY_PERMISSION_DENIED' });
    signal?.throwIfAborted();
    if (webOrigin(record.page.url()) !== current) throw new Error('The tab origin changed while authorizing raw CDP.');
    if (origin !== current) { origin = current; events.discard(); }
    return current;
  };
  const resolveAuthSelector = async (selector, signal) => {
    if (typeof selector === 'string') return selector;
    const marker = selector.$locator;
    if (marker.id !== record.id || marker.browserId !== undefined && marker.browserId !== browserId) throw new Error('Browser auth selector locator must belong to this tab.');
    if (typeof resolveSelector !== 'function') throw unavailable('browserAuth');
    return await resolveSelector(marker, signal);
  };
  const api = {
    async list() {
      const result = [];
      for (const id of ['cdp', 'browserAuth', 'botDetection']) if (await available(id)) result.push(capabilityInfo[id]);
      return result;
    },
    async get(id) {
      await requireProvider(id);
      if (id === 'cdp') return Object.freeze({ id, send: (method, params, options) => api.dispatch('cdp.send', [method, params, options]), readEvents: options => api.dispatch('cdp.readEvents', [options]) });
      if (id === 'browserAuth') return Object.freeze({ id, request: options => api.dispatch('browserAuth.request', [options]) });
      return Object.freeze({ id, report: options => api.dispatch('botDetection.report', [options]) });
    },
    async dispatch(method, args = [], signal) {
      signal?.throwIfAborted();
      if (method === 'cdp.send' || method === 'cdp.readEvents') {
        const provider = await requireProvider('cdp');
        const options = method === 'cdp.send' ? sendOptionsSchema.parse(args[2] ?? {}) : eventsOptionsSchema.parse(args[0] ?? {});
        const prepared = method === 'cdp.send' ? prepareTabCdpCommand(args[0], args[1], { preserveDocumentInterception: options.target == null && provider.preserveDocumentInterception === true }) : null;
        const current = await authorize(provider, signal), connection = await adapter(provider);
        if (eventError) throw eventError;
        if (!canObserve(connection)) throw new Error('Raw CDP is unavailable while browser credentials or requests are protected.');
        if (!prepared) { const result = await events.read(options, signal); if (eventError) throw eventError; return result; }
        const affectedUrls = [...prepared.urls];
        let childTarget;
        if (options.target != null) {
          childTarget = typeof connection.resolveTarget === 'function' ? await connection.resolveTarget(options.target) : null;
          if (!childTarget) throw new Error('The CDP child target is not attached to this tab.');
          if (typeof childTarget.url !== 'string' || childTarget.url.length === 0) throw new Error('The CDP child target URL is unavailable for authorization.');
          affectedUrls.push(childTarget.url);
        }
        for (const url of affectedUrls) {
          if (await provider.authorizeUrl({ url, record, signal }) !== true) throw Object.assign(new Error('Raw CDP URL access was not granted.'), { code: 'CAPABILITY_PERMISSION_DENIED' });
          signal?.throwIfAborted();
        }
        if (webOrigin(record.page.url()) !== current) throw new Error('The tab origin changed before raw CDP dispatch.');
        if (childTarget) {
          const latest = await connection.resolveTarget(options.target);
          if (!latest || latest.sessionId !== childTarget.sessionId || latest.targetId !== childTarget.targetId || latest.url !== childTarget.url) throw new Error('The CDP child target changed while authorizing raw CDP.');
        }
        signal?.throwIfAborted();
        if (!canObserve(connection)) throw new Error('Raw CDP is unavailable while browser credentials or requests are protected.');
        return await connection.send(prepared.method, prepared.params, { ...options, timeoutMs: options.timeoutMs ?? 3000, signal }) ?? {};
      }
      if (method === 'browserAuth.request') {
        const provider = await requireProvider('browserAuth'), request = browserAuthRequestSchema.parse(args[0]);
        if (webOrigin(request.origin) !== request.origin || webOrigin(record.page.url()) !== request.origin) throw new Error('Browser auth requires the current canonical HTTP(S) origin.');
        if (authInProgress) throw new Error('A secure browser authentication request is already in progress.');
        authInProgress = true; events.discard();
        try {
          for (const field of request.fields) field.selector = await resolveAuthSelector(field.selector, signal);
          for (const option of request.options ?? []) if (option.selector != null) option.selector = await resolveAuthSelector(option.selector, signal);
          if (request.submit) request.submit.selector = await resolveAuthSelector(request.submit.selector, signal);
          signal?.throwIfAborted();
          if (webOrigin(record.page.url()) !== request.origin) return { status: 'origin_changed' };
          try {
            const result = browserAuthResultSchema.parse(await provider.request(request, { record, signal }));
            if (result.selected_option != null && !request.options?.some(option => option.id === result.selected_option)
              || result.locator_error != null && !request.fields.some(field => field.id === result.locator_error.field_id)) throw new Error('Invalid browser authentication result reference.');
            return result;
          }
          catch { signal?.throwIfAborted(); throw Object.assign(new Error('The secure browser authentication provider failed. Authentication state is unknown.'), { code: 'BROWSER_AUTH_PROVIDER_FAILED' }); }
        }
        finally { authInProgress = false; events.discard(); }
      }
      if (method === 'botDetection.report') {
        const provider = await requireProvider('botDetection'), { reason } = botReportSchema.parse(args[0]), reportedHostname = hostname(record.page.url());
        await provider.report({ hostname: reportedHostname, reason }, { signal }); signal?.throwIfAborted();
        return { status: 'reported', hostname: reportedHostname };
      }
      throw new Error('Unsupported tab capability method: ' + method);
    },
    dispose() {
      if (disposing) return disposing;
      disposed = true;
      disposing = (async () => {
        try { unsubscribe?.(); }
        finally { events.close(); if (adapterPromise) await adapterPromise.catch(() => {}); await activeAdapter?.dispose?.(); }
      })();
      return disposing;
    },
  };
  return Object.freeze(api);
}
