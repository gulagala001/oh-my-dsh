import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile, stat, rename, open, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { ExtensionError, EXTENSION_PATH, PROTOCOL_VERSION, parseTarget, targetId, normalizeAction } from './protocol.mjs';
import { createDeliveryStore } from '../browser/deliveries.mjs';

const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const failure = (code, message) => new ExtensionError(code, message);

/** Mount handleRequest before the host UI's origin checks; an empty HTTP server is mounted automatically. */
export function createExtensionBackend({ server, token, dataDir, pairing, requestTimeoutMs = 20000 } = {}) {
  if (typeof token !== 'string' || token.length < 24) throw failure('INVALID_TOKEN', 'Use a random token of at least 24 characters.');
  if (!dataDir) throw failure('INVALID_DATA_DIR', 'A private dataDir is required for persistent download events.');
  const dir = resolve(dataDir), eventsFile = join(dir, 'extension-downloads.jsonl');
  const sessions = new Map(), pending = new Map(), downloads = new Map(), eventIds = new Set();
  const retired = new Set(), retirementsFile = join(dir, 'extension-retirements.json');
  const connectionKey = ({ instanceId, browserInstanceId, epoch }) => JSON.stringify([instanceId, browserInstanceId, epoch]);
  let retirements = Promise.resolve();
  const deliveryStore = createDeliveryStore(dir), importing = new Map(), importErrors = new Map();
  function retainDownload(download) {
    if (download.durableDownloadConsent !== true || download.state !== 'complete' || download.exists === false || !isAbsolute(download.filename || '')) return;
    if (importing.has(download.id)) return importing.get(download.id);
    const work = deliveryStore.then(store => store.importFile(download.filename, { sourceId: download.id,
      url: download.finalUrl ?? download.url, expectedBytes: download.totalBytes ?? download.bytesReceived, attribution: 'browser-wide' }));
    importing.set(download.id, work);
    work.then(() => importErrors.delete(download.id), error => importErrors.set(download.id, error.message))
      .finally(() => importing.delete(download.id));
    return work;
  }
  let closed = false, closing = false, closeWork, needsSeparator = false, persistence = Promise.resolve();
  const ready = (async () => {
    await deliveryStore;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try { for (const key of JSON.parse(await readFile(retirementsFile, 'utf8'))) retired.add(key); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let text = '';
    try { text = await readFile(eventsFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    needsSeparator = !!text && !text.endsWith('\n');
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { const event = JSON.parse(line); eventIds.add(event.eventId); downloads.set(event.download.id, event.download); }
      catch { /* A crash can leave a partial final JSONL record. */ }
    }
    for (const download of downloads.values()) retainDownload(download);
  })();

  async function retire(session) {
    const key = connectionKey(session);
    const work = retirements.catch(() => {}).then(async () => {
      if (retired.has(key)) return;
      const next = new Set([...retired, key]), temporary = retirementsFile + '.' + randomUUID() + '.tmp';
      try {
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify([...next]) + '\n'); await file.sync(); } finally { await file.close(); }
        await rename(temporary, retirementsFile);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      retired.add(key);
    });
    retirements = work;
    await work;
  }

  function expire(session, reason) {
    sessions.delete(session.sessionId);
    for (const [id, task] of pending) if (task.session === session) {
      clearTimeout(task.timer); task.reject(failure('DISCONNECTED', reason)); pending.delete(id);
    }
    session.waiter?.({ commands: [], disconnected: true }); session.waiter = null;
  }
  const sweep = setInterval(() => {
    for (const session of sessions.values()) if (!closing && !session.releaseError && Date.now() - session.lastSeen > 25000) expire(session, 'Extension heartbeat expired; reconnect and select again.');
  }, 5000);
  sweep.unref();

  function checkOrigin(req) {
    if (!loopback(req.socket.remoteAddress)) throw failure('UNTRUSTED_ADDRESS', 'Only loopback clients may connect.');
    const port = req.socket.localPort;
    if (req.headers.host !== `127.0.0.1:${port}`) throw failure('UNTRUSTED_HOST', 'Use 127.0.0.1 with the explicit listening port.');
    const origin = req.headers.origin;
    if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin || '')) throw failure('UNTRUSTED_ORIGIN', 'Only an explicitly authorized extension may connect.');
    return origin;
  }
  function authenticate(req, value) {
    const origin = checkOrigin(req);
    const supplied = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1] || '';
    const pair = pairing?.authenticate(origin, value.instanceId, supplied);
    if (pair) return {origin, pair};
    const a = Buffer.from(supplied), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw failure('UNAUTHORIZED', 'Invalid or revoked OpenCU pairing credential.');
    return {origin};
  }
  function send(res, status, value, origin) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
    res.end(JSON.stringify(value));
  }
  async function body(req) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw failure('INVALID_JSON', 'Content-Type must be application/json.');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 20 * 1024 * 1024) throw failure('BODY_TOO_LARGE', 'Extension message exceeds 20 MiB.'); chunks.push(chunk); }
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_JSON', 'An object message is required.');
    return value;
  }
  async function persistEvents(session, events = []) {
    if (!Array.isArray(events) || events.length > 500) throw failure('INVALID_EVENTS', 'At most 500 download events per batch.');
    const acknowledged = [];
    for (const value of events) {
      if (typeof value.eventId !== 'string' || !Number.isInteger(value.download?.id)) throw failure('INVALID_EVENTS', 'Invalid download event.');
      const id = `${session.instanceId}/${value.download.id}`;
      const eventId = `${session.instanceId}/${value.eventId}`;
      // A failed write rejects its caller; later event retries must still run.
      persistence = persistence.catch(() => {}).then(async () => {
        if (closed) throw failure('CLOSED', 'Extension backend is closed.');
        if (sessions.get(session.sessionId) !== session) throw failure('STALE_CONNECTION', 'Reconnect explicitly from the extension options page.');
        if (eventIds.has(eventId)) {
          if (importErrors.has(id) && session.durableDownloadConsent && value.durableDownloadConsent === true) retainDownload(downloads.get(id));
          return;
        }
        const event = { eventId, at: value.at, type: value.type, download: { ...downloads.get(id), ...value.download, nativeId: value.download.id,
          id, durableDownloadConsent: session.durableDownloadConsent && value.durableDownloadConsent === true,
          ...(value.type === 'erased' ? { historyErased: true } : {}), browserInstanceId: session.browserInstanceId, instanceId: session.instanceId, attribution: 'browser-wide' } };
        const line = (needsSeparator ? '\n' : '') + JSON.stringify(event) + '\n';
        needsSeparator = true;
        await appendFile(eventsFile, line, { mode: 0o600 });
        needsSeparator = false;
        eventIds.add(eventId); downloads.set(id, event.download);
        retainDownload(event.download);
      });
      await persistence;
      acknowledged.push(value.eventId);
    }
    return acknowledged;
  }
  function sessionFor(value) {
    const identity = parseTarget(value);
    const session = [...sessions.values()].find(s => s.instanceId === identity.instanceId && s.browserInstanceId === identity.browserInstanceId && s.epoch === identity.epoch);
    if (!session) throw failure('STALE_TARGET', 'Browser connection changed; listTargets() and select again.');
    return { session, identity };
  }
  function cancelControlRequests(session, error) {
    for (const [id, task] of pending) {
      if (session && task.session !== session || ['release', 'disconnect'].includes(task.method)) continue;
      clearTimeout(task.timer); pending.delete(id);
      task.session.queue = task.session.queue.filter(command => command.id !== id);
      task.reject(error);
    }
  }
  function request(session, method, params = {}, timeout = requestTimeoutMs, monitoring = false) {
    if (closed || !sessions.has(session.sessionId)) return Promise.reject(failure('DISCONNECTED', 'Extension is disconnected.'));
    if (closing && !['release', 'disconnect'].includes(method)) return Promise.reject(failure('CLOSING', 'Extension backend is shutting down; retry close before using control.'));
    if (session.releaseError && !['release', 'disconnect'].includes(method)) return Promise.reject(session.releaseError);
    const id = randomUUID();
    return new Promise((resolveResult, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id); session.queue = session.queue.filter(c => c.id !== id);
        if (monitoring) { reject(failure('PRESENTATION_TIMEOUT', `${method} timed out; monitoring is unavailable.`)); return; }
        if (['release', 'disconnect'].includes(method)) {
          session.releaseError = new ExtensionError('RELEASE_FAILED', `${method} timed out; input release remains unconfirmed. Retry release or disconnect.`, { method });
          cancelControlRequests(session, session.releaseError);
          reject(session.releaseError); return;
        }
        // Never replay an input after an unknown outcome. Fail closed and let the extension watchdog release input.
        expire(session, 'Command timed out; outcome is unknown. Reconnect explicitly before retrying.');
        reject(failure('COMMAND_TIMEOUT', `${method} timed out; action outcome may be unknown.`));
      }, timeout);
      pending.set(id, { session, method, fullRelease: !params.identity, timer, resolve: resolveResult, reject });
      session.queue.push({ id, method, params, monitoring, epoch: session.epoch, deadline: Date.now() + timeout });
      session.waiter?.({ commands: session.queue.splice(0) }); session.waiter = null;
    });
  }

  async function route(req, res, routeName) {
    let origin;
    try {
      await ready; await pairing?.ready;
      if (closed) throw failure('CLOSED', 'Extension backend is closed.');
      if (req.method === 'OPTIONS') {
        origin = req.headers.origin;
        if (!loopback(req.socket.remoteAddress) || req.headers.host !== `127.0.0.1:${req.socket.localPort}` || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin || '')) throw failure('UNTRUSTED_ORIGIN', 'Extension origin required.');
        res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }); res.end(); return;
      }
      if (req.method !== 'POST') throw failure('INVALID_METHOD', 'Use POST.');
      origin = checkOrigin(req); const value = await body(req);
      if (closed) throw failure('CLOSED', 'Extension backend is closed.');
      if (pairing && ['discover', 'pair', 'decline'].includes(routeName)) {
        if (closing) throw failure('CLOSING', 'OpenCU is shutting down.');
        const aborter = new AbortController();
        res.once('close', () => aborter.abort());
        const result = routeName === 'discover' ? await pairing.discover(origin, value, aborter.signal)
          : routeName === 'pair' ? await pairing.allow(origin, value) : pairing.decline(origin, value);
        send(res, 200, result, origin); return;
      }
      const authentication = authenticate(req, value);
      if (routeName === 'forget') {
        if (!authentication.pair) throw failure('UNAUTHORIZED', 'A paired browser is required.');
        await backend.disconnect(value.instanceId);
        await pairing.forget(value.instanceId);
        send(res, 200, {forgotten: true}, origin); return;
      }
      if (routeName === 'connect') {
        if (closing) throw failure('CLOSING', 'Extension backend is shutting down; new connections are not accepted.');
        if (value.protocol !== PROTOCOL_VERSION || value.authorized !== true || value.debuggerConsent !== true) throw failure('CONSENT_REQUIRED', 'User connection and debugger consent are required.');
        for (const key of ['instanceId', 'browserInstanceId', 'epoch']) if (!/^[a-zA-Z0-9_-]{8,100}$/.test(value[key] || '')) throw failure('INVALID_IDENTITY', `Invalid ${key}.`);
        if (retired.has(connectionKey(value))) throw failure('STALE_CONNECTION', 'This connection epoch has retired; reconnect with a fresh epoch.');
        for (const existing of sessions.values()) if (existing.instanceId === value.instanceId) expire(existing, 'Extension reconnected.');
        const session = { sessionId: randomUUID(), instanceId: value.instanceId, browserInstanceId: value.browserInstanceId,
          epoch: value.epoch, origin, durableDownloadConsent: value.durableDownloadConsent === true && (!authentication.pair || authentication.pair.durableDownloadConsent),
          label: String(value.label || 'Chrome / Edge').slice(0, 100), queue: [], lastSeen: Date.now() };
        sessions.set(session.sessionId, session); pairing?.connected(value.instanceId);
        send(res, 200, { protocol: PROTOCOL_VERSION, sessionId: session.sessionId, pollIntervalMs: 500 }, origin); return;
      }
      const session = sessions.get(value.sessionId);
      if (!session || session.origin !== origin || session.epoch !== value.epoch || authentication.pair && session.instanceId !== value.instanceId) throw failure('STALE_CONNECTION', 'The connection epoch expired; reconnect and observe the browser again.');
      session.lastSeen = Date.now();
      if (routeName === 'poll') {
        const ack = await persistEvents(session, value.events);
        send(res, 200, { commands: session.queue.splice(0), acknowledgedEvents: ack }, origin); return;
      }
      if (routeName === 'result') {
        const task = pending.get(value.id);
        if (!task || task.session !== session) { send(res, 200, { ignored: true }, origin); return; }
        pending.delete(value.id); clearTimeout(task.timer);
        const releasing = ['release', 'disconnect'].includes(task.method);
        let error = value.ok === true ? null : new ExtensionError(value.error?.code || 'EXTENSION_FAILURE', value.error?.message || 'Extension command failed.', value.error?.details);
        if (!error && releasing && (value.result?.released !== true || value.result.failures?.length || value.result.errors?.length)) error = new ExtensionError('RELEASE_FAILED', 'Browser input release was not acknowledged.', value.result);
        if (error) {
          if (releasing) { session.releaseError = error; cancelControlRequests(session, error); }
          task.reject(error);
        } else {
          if (releasing && task.fullRelease) delete session.releaseError;
          task.resolve(value.result);
        }
        send(res, 200, { accepted: true }, origin); return;
      }
      if (routeName === 'disconnect') {
        await persistEvents(session, value.events);
        if (value.released === true && !value.failures?.length && !value.errors?.length) await retire(session);
        expire(session, 'User disconnected extension.'); send(res, 200, { disconnected: true }, origin); return;
      }
      throw failure('NOT_FOUND', 'Unknown extension protocol route.');
    } catch (error) {
      const status = ['UNAUTHORIZED'].includes(error.code) ? 401 : /UNTRUSTED|CONSENT/.test(error.code || '') ? 403 : error.code === 'STALE_CONNECTION' ? 409 : 400;
      send(res, status, { ok: false, error: { code: error.code || 'INVALID_REQUEST', message: error.message } }, origin);
    }
  }
  function handleRequest(req, res) {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (!pathname.startsWith(EXTENSION_PATH + '/')) return false;
    void route(req, res, pathname.slice(EXTENSION_PATH.length + 1)); return true;
  }
  const mounted = server && server.listenerCount('request') === 0;
  const listener = (req, res) => { if (!handleRequest(req, res)) send(res, 404, { error: { code: 'NOT_FOUND' } }); };
  if (mounted) server.on('request', listener);

  const backend = {
    kind: 'extension', name: 'Chrome / Edge extension', path: EXTENSION_PATH, handleRequest,
    routeIntegrationRequired: !!server && !mounted,
    connections() {
      return [...sessions.values()].map(({ instanceId, browserInstanceId, epoch, label, lastSeen, origin }) => ({
        instanceId, browserInstanceId, epoch, label, lastSeen, extensionId: new URL(origin).hostname,
      }));
    },
    async openSettings(instanceId, section) {
      const session = [...sessions.values()].find(session => session.instanceId === instanceId);
      if (!session) throw failure('DISCONNECTED', 'The selected browser profile is no longer connected.');
      if (!['passwordManager', 'contactInfo', 'extensions', 'connection'].includes(section)) throw failure('INVALID_ARGUMENT', 'Unknown browser settings section.');
      return request(session, 'openSettings', { section });
    },
    async disconnect(instanceId) {
      const session = [...sessions.values()].find(session => session.instanceId === instanceId);
      if (!session) return { disconnected: true };
      if (!session.disconnectReleased) { await request(session, 'disconnect'); session.disconnectReleased = true; }
      await retire(session);
      expire(session, 'User disconnected this browser profile.');
      return { disconnected: true };
    },
    async forget(instanceId) {
      await this.disconnect(instanceId);
      await pairing?.forget(instanceId);
      return {forgotten: true};
    },
    async listTargets() {
      await ready;
      const inventories = await Promise.all([...sessions.values()].map(async session => {
        const tabs = await request(session, 'listTargets');
        return tabs.map(tab => ({ ...tab, kind: 'tab', backend: 'extension', browserId: `extension:${session.instanceId}`,
          id: targetId({ ...session, ...tab }), identity: { instanceId: session.instanceId, browserInstanceId: session.browserInstanceId,
            epoch: session.epoch, tabId: tab.tabId, documentId: tab.documentId } }));
      }));
      return inventories.flat();
    },
    async select(target) {
      if (typeof target === 'object' && !target.id && !target.targetId) {
        const targets = await this.listTargets();
        const matches = targets.filter(value => ['url', 'title', 'browserId', 'kind'].every(key => target[key] === undefined || target[key] === value[key]));
        if (matches.length !== 1) throw failure(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Reference must match one extension tab.');
        target = { ...matches[0], expected: target.expected };
      }
      const { session, identity } = sessionFor(target);
      const result = await request(session, 'select', { identity, expected: typeof target === 'object' ? { url: target.url, title: target.title, ...target.expected } : undefined });
      return { ...(typeof target === 'object' ? target : {}), ...result, id: targetId(identity), kind: 'tab', backend: 'extension',
        browserId: `extension:${session.instanceId}`, identity };
    },
    async focus(target) {
      const { session, identity } = sessionFor(target);
      return request(session, 'focus', { identity });
    },
    async verify(target, options = {}) {
      try {
        const { session, identity } = sessionFor(target);
        const current = await request(session, 'verify', { identity }, requestTimeoutMs, options.monitoring === true);
        return { valid: true, target: { ...(typeof target === 'object' ? target : {}), id: targetId(identity), identity,
          kind: 'tab', backend: 'extension', browserId: `extension:${session.instanceId}`, url: current.url, title: current.title } };
      } catch (error) { return { valid: false, reason: error.message, error: error.toJSON?.() }; }
    },
    async preview(target) {
      const { session, identity } = sessionFor(target);
      return request(session, 'preview', { identity }, requestTimeoutMs, true);
    },
    async observe(target, options = {}) {
      const {signal, ...payload} = options;
      if (signal?.aborted) throw failure('CONTROL_STOPPED', 'Control has been stopped.');
      const { session, identity } = sessionFor(target);
      if (options.fullPage) throw failure('UNSUPPORTED_OPERATION', 'Extension screenshots are viewport-only.');
      const result = await request(session, 'observe', { identity, options: { ...payload, screenshot: options.format === 'ax' ? false : options.screenshot } });
      if (signal?.aborted) throw failure('CONTROL_STOPPED', 'Control has been stopped.');
      result.observationId ??= randomUUID();
      result.coordinateSpace = 'screenshot-pixels';
      if (result.ax?.source !== 'chromium-accessibility-tree' || !Array.isArray(result.ax.nodes)) throw failure('INVALID_OBSERVATION', 'The extension did not return a Chromium accessibility tree; reload the matching extension package.');
      if (result.screenshot) {
        const screenshot = result.screenshot, bytes = Buffer.from(screenshot.data, 'base64');
        const directory = join(dir, 'observations'); await mkdir(directory, { recursive: true, mode: 0o700 });
        const path = join(directory, screenshot.id + '.png'); await writeFile(path, bytes, { mode: 0o600 });
        screenshot.path = path; screenshot.mediaType = screenshot.mimeType;
        screenshot.base64 = screenshot.data;
        screenshot.viewport = { width: screenshot.bounds.width, height: screenshot.bounds.height };
        if (!options.includeBase64) { delete screenshot.data; delete screenshot.base64; }
      }
      if (signal?.aborted) throw failure('CONTROL_STOPPED', 'Control has been stopped.');
      return result;
    },
    async act(target, action) {
      if (action.signal?.aborted) throw failure('CONTROL_STOPPED', 'Control has been stopped.');
      const { session, identity } = sessionFor(target);
      const normalized = normalizeAction(action); delete normalized.signal;
      if (normalized.type === 'upload') {
        if (!Array.isArray(normalized.files) || !normalized.files.length || normalized.files.some(file => typeof file !== 'string' || !isAbsolute(file))) throw failure('INVALID_ARGUMENT', 'upload requires absolute file paths');
        for (const file of normalized.files) if (!(await stat(file)).isFile()) throw failure('INVALID_ARGUMENT', 'Upload source must be a regular file');
        action.signal?.throwIfAborted();
      }
      let interruption;
      const abort = () => { interruption ??= request(session, 'release', { identity }).catch(error => ({ released: false, error: error.toJSON?.() ?? { message: error.message } })); };
      action.signal?.addEventListener('abort', abort, { once: true });
      try {
        action.signal?.throwIfAborted();
        const result = await request(session, 'act', { identity, action: normalized });
        action.signal?.throwIfAborted();
        if (result.closed) result.closedTargetId = typeof target === 'string' ? target : target.id;
        return result;
      } finally {
        action.signal?.removeEventListener('abort', abort);
        if (interruption) {
          const release = await interruption;
          if (release.released !== true) throw new ExtensionError('RELEASE_FAILED', 'Cancelled extension input was not acknowledged as released.', release);
        }
      }
    },
    async newTab(browserId, url = 'https://example.com/', {signal} = {}) {
      const session = [...sessions.values()].find(s => browserId === `extension:${s.instanceId}` || browserId === s.instanceId);
      if (!session) throw failure('DISCONNECTED', 'Select a connected extension browser.');
      signal?.throwIfAborted();
      let target, interruption;
      const abort = () => { interruption ??= request(session, 'release').catch(error => ({released: false, error: error.message})); };
      signal?.addEventListener('abort', abort, {once: true});
      try {
        signal?.throwIfAborted();
        const tab = await request(session, 'newTab', {url});
        const identity = {instanceId: session.instanceId, browserInstanceId: session.browserInstanceId, epoch: session.epoch,
          tabId: tab.tabId, documentId: tab.documentId};
        target = {...tab, id: targetId(identity), identity, browserId: 'extension:' + session.instanceId, kind: 'tab', backend: 'extension'};
        if (signal?.aborted) throw new ExtensionError('CONTROL_STOPPED', 'A tab was created before cancellation; discover before retrying.', {created: true, target});
        return target;
      } finally {
        signal?.removeEventListener('abort', abort);
        if (interruption && (await interruption).released !== true) throw new ExtensionError('RELEASE_FAILED', 'Cancelled tab creation input release was not acknowledged.',
          {created: !!target, ...(target ? {target} : {})});
      }
    },
    async release(target) {
      if (target && !target.targets) {
        await ready;
        const identity = parseTarget(target);
        if (retired.has(connectionKey(identity))) return { released: true, retired: true };
        const { session } = sessionFor(target); return request(session, 'release', { identity });
      }
      const failures = [];
      for (const session of sessions.values()) {
        try { await request(session, 'release', {}); } catch (error) { failures.push(error.toJSON?.() ?? { message: error.message }); }
      }
      return { released: failures.length === 0, failures };
    },
    async listDownloads() { await ready; return [...downloads.values()]; },
    async deliveries() {
      await ready;
      const store = await deliveryStore, retained = await store.list(), records = [];
      for (const download of downloads.values()) {
        const existing = retained.find(record => record.sourceId === download.id);
        if (existing) { records.push(existing); continue; }
        const error = importErrors.get(download.id);
        records.push({ ...download, status: importing.has(download.id) || download.state === 'in_progress' ? 'pending' : error ? 'unavailable' : 'metadata-only', ...(error ? { error } : {}) });
      }
      return records;
    },
    getDiagnostics() { return { connectedBrowsers: sessions.size, pendingCommands: pending.size, routeIntegrationRequired: !!server && !mounted }; },
    close() {
      if (closed) return Promise.resolve();
      if (closeWork) return closeWork;
      closing = true;
      cancelControlRequests(null, failure('CLOSING', 'Extension backend is shutting down.'));
      closeWork = (async () => {
        await ready;
        const errors = [];
        for (const session of [...sessions.values()]) {
          try {
            await request(session, 'release', {}, 5000);
            await retire(session);
            expire(session, 'OpenCU closed.');
          } catch (error) { errors.push(error.toJSON?.() ?? { message: error.message }); }
        }
        await persistence; await retirements; await Promise.allSettled([...importing.values()]); await (await deliveryStore).flush();
        if (errors.length) throw new ExtensionError('RELEASE_FAILED', 'Some extension targets could not acknowledge release.', { errors });
        closed = true; clearInterval(sweep); if (mounted) server.off('request', listener);
      })().finally(() => { closeWork = undefined; });
      return closeWork;
    },
  };
  return backend;
}
