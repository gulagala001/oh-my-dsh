import { randomUUID } from 'node:crypto';
import { checkExpected, fail, json, referenceMatches, sameIdentity } from '../protocol.mjs';

/** The authenticated DSH renderer owns each real sidebar guest, not a screenshot proxy. */
export function createBrowserHost() {
  const clients = new Map(), pending = new Map(), sessionOwners = new Map();
  let closed = false;
  function disconnect(client, reason) {
    if (clients.get(client.id) === client) clients.delete(client.id);
    client.wake?.();
    for (const [id, task] of pending) if (task.client === client) {
      clearTimeout(task.timer); pending.delete(id);
      task.reject(Object.assign(new Error(reason), { code: 'BROWSER_HOST_DISCONNECTED' }));
    }
  }
  function liveClients() {
    for (const client of clients.values()) {
      if (Date.now() - client.lastSeen > 45000) disconnect(client, 'The sidebar renderer stopped polling');
    }
    return [...clients.values()];
  }
  function clientFor(target) {
    liveClients();
    const client = clients.get(target.identity?.rendererId);
    if (!client) fail('BROWSER_HOST_DISCONNECTED', 'The original sidebar renderer is no longer connected');
    const current = client.targets.find(item => item.id === target.id);
    if (current && !sameIdentity(current.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'The sidebar guest identity changed');
    // Inventory publication can lag a navigation or layout update. The renderer
    // verifies the retained guest occurrence before executing a bound command.
    return client;
  }
  async function request(client, method, params = {}, monitoring = false) {
    if (closed || clients.get(client.id) !== client) fail('BROWSER_HOST_DISCONNECTED', 'The DSH browser renderer is disconnected');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!monitoring && method !== 'presentation' && method !== 'preview') {
          disconnect(client, `${method} timed out; its outcome is unknown`);
          return;
        }
        // Monitoring cannot invalidate the independent input-release channel.
        pending.delete(id);
        client.commands = client.commands.filter(command => command.id !== id);
        reject(Object.assign(new Error(`${method} timed out; monitoring is unavailable`), { code: 'PRESENTATION_TIMEOUT' }));
      }, 30000);
      pending.set(id, { client, resolve, reject, timer });
      client.commands.push({ id, method, params: json(params) });
      client.wake?.();
    });
  }
  function presentationOwner(target, sessionId) {
    const available = liveClients().filter(client => client.presentation);
    const ownerId = target.identity?.rendererId ?? sessionOwners.get(sessionId);
    const owner = ownerId ? available.find(client => client.id === ownerId) : available.length === 1 ? available[0] : null;
    if (!owner) fail('PRESENTATION_HOST_UNAVAILABLE', 'The owning DSH window needs the OpenCU presentation adapter');
    return owner.id;
  }
  const backend = {
    kind: 'browser',
    async listTargets() { return liveClients().flatMap(client => client.targets).map(json); },
    async select(reference) {
      const matches = (await backend.listTargets()).filter(target => referenceMatches(target, reference));
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Select one live DSH sidebar tab');
      const target = matches[0]; checkExpected(target, reference.expected);
      await request(clientFor(target), 'select', { target });
      return target;
    },
    async verify(target, options = {}) {
      try {
        const current = await request(clientFor(target), 'verify', { target }, options.monitoring === true);
        return { valid: current.id === target.id && sameIdentity(current.identity, target.identity), target: current };
      } catch (error) { return { valid: false, reason: error.message }; }
    },
    async focus(target) { return request(clientFor(target), 'focus', { target }); },
    async preview(target) { return request(clientFor(target), 'preview', { target }); },
    async observe(target, options = {}) {
      const { signal, ...requestOptions } = options;
      signal?.throwIfAborted();
      return request(clientFor(target), 'observe', { target, options: requestOptions });
    },
    async act(target, options) {
      const { signal, ...action } = options;
      signal?.throwIfAborted();
      const client = clientFor(target);
      let interruption;
      const abort = () => { interruption ??= request(client, 'release', { target }).catch(error => ({ released: false, error: error.message })); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        signal?.throwIfAborted();
        const result = await request(client, 'act', { target, action });
        signal?.throwIfAborted();
        return result;
      } finally {
        signal?.removeEventListener('abort', abort);
        if (interruption) {
          const release = await interruption;
          if (release.released !== true) fail('RELEASE_FAILED', 'Cancelled sidebar input release was not acknowledged', release);
        }
      }
    },
    async release() {
      const results = await Promise.allSettled(liveClients().map(client => request(client, 'release')));
      const failures = results.flatMap(result => result.status === 'rejected' ? [{ message: result.reason.message }] : result.value?.released === true ? [] : [result.value]);
      return { released: failures.length === 0, failures };
    },
    async close() {
      const result = await backend.release();
      if (!result.released) fail('RELEASE_FAILED', 'Sidebar guest input release was not acknowledged', result.failures);
    },
  };
  return {
    backend,
    listBrowsers() { return liveClients().map(client => ({ id: `dsh:${client.id}`, provider: 'dsh', name: 'DSH Browser' })); },
    presentationOwner,
    isPresentationSession(rendererId, sessionId) { return liveClients().some(client => client.id === rendererId && client.presentation && client.sessionIds.includes(sessionId)); },
    async cursor(payload, ownerId) {
      const owner = liveClients().find(client => client.id === ownerId && client.presentation);
      if (!owner) fail('PRESENTATION_HOST_UNAVAILABLE', 'The cursor owning DSH window is no longer available');
      return request(owner, 'presentation', { operation: 'cursor', payload }, true);
    },
    async present(payload, ownerId) {
      const owner = liveClients().find(client => client.id === ownerId && client.presentation);
      if (!owner) fail('PRESENTATION_HOST_UNAVAILABLE', 'The owning DSH window is no longer available');
      return request(owner, 'presentation', { operation: 'update', payload });
    },
    async hidePresentation(ownerId) {
      const owner = liveClients().find(client => client.id === ownerId && client.presentation);
      if (owner) await request(owner, 'presentation', { operation: 'hide', payload: {} });
    },
    async closePresentations() {
      await Promise.all(liveClients().filter(client => client.presentation).map(client => request(client, 'presentation', { operation: 'close', payload: {} })));
    }, 
    async openTab({ browserId, sessionId, url }) {
      const matches = liveClients().filter(client => !browserId || browserId === `dsh:${client.id}`);
      if (matches.length !== 1) fail('AMBIGUOUS_TARGET', 'Choose one connected sidebar browser');
      const result = await request(matches[0], 'openTab', { sessionId, url });
      return result.target;
    },
    async handle(method, args, signal) {
      if (closed) fail('BROWSER_HOST_CLOSED', 'Sidebar browser host is closed');
      if (method === 'browser/connect') {
        if (args.rendererId !== undefined && (typeof args.rendererId !== 'string' || !/^[a-f0-9-]{36}$/.test(args.rendererId))) fail('INVALID_TARGET', 'Invalid sidebar renderer identity');
        const id = args.rendererId || randomUUID();
        const previous = clients.get(id);
        if (previous) disconnect(previous, 'The sidebar renderer reconnected; the previous command outcome is unknown');
        clients.set(id, { id, presentation: args.presentation === true, sessionIds: Array.isArray(args.sessionIds) ? args.sessionIds.filter(id => typeof id === 'string') : [],
          targets: [], commands: [], wake: null, lastSeen: Date.now() });
        for (const sessionId of clients.get(id).sessionIds) sessionOwners.set(sessionId, id);
        return { ok: true, rendererId: id };
      }
      const client = clients.get(args.rendererId);
      if (!client) fail('BROWSER_HOST_DISCONNECTED', 'Reconnect the sidebar renderer');
      client.lastSeen = Date.now();
      if (method === 'browser/sessions') {
        if (!Array.isArray(args.sessionIds) || args.sessionIds.some(id => typeof id !== 'string')) fail('INVALID_TARGET', 'Expected live window session IDs');
        client.sessionIds = args.sessionIds;
        for (const sessionId of client.sessionIds) sessionOwners.set(sessionId, client.id);
        return { ok: true };
      }
      if (method === 'browser/publish') {
        if (!Array.isArray(args.targets)) fail('INVALID_TARGET', 'Expected the live sidebar target list');
        client.targets = args.targets.map(target => {
          if (typeof target.id !== 'string' || typeof target.identity?.guestId !== 'string' || target.identity.rendererId !== client.id) fail('INVALID_TARGET', 'Invalid sidebar guest identity');
          return { ...target, backend: 'browser', provider: 'dsh', kind: 'tab', browserId: `dsh:${client.id}` };
        });
        return { ok: true };
      }
      if (method === 'browser/result') {
        const task = pending.get(args.id);
        if (!task || task.client !== client) return { ok: true, ignored: true };
        clearTimeout(task.timer); pending.delete(args.id);
        if (args.error) task.reject(Object.assign(new Error(args.error.message), { code: args.error.code ?? 'BROWSER_GUEST_ERROR', ...(args.error.details === undefined ? {} : {details: args.error.details}) }));
        else task.resolve(args.result);
        return { ok: true };
      }
      if (method === 'browser/poll') {
        signal?.throwIfAborted();
        if (!client.commands.length) await new Promise((resolve, reject) => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (client.wake === wake) client.wake = null; };
          const wake = () => { finish(); resolve(); };
          const abort = () => { finish(); reject(signal.reason); };
          const timer = setTimeout(wake, 20000);
          client.wake?.(); client.wake = wake;
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
        });
        const connected = clients.get(client.id) === client;
        return { ok: true, commands: connected ? client.commands.splice(0) : [], connected };
      }
      if (method === 'browser/disconnect') { disconnect(client, 'The sidebar renderer disconnected'); return { ok: true }; }
      fail('UNSUPPORTED_METHOD', 'Unknown sidebar browser transport operation');
    },
    close() { closed = true; for (const client of [...clients.values()]) disconnect(client, 'OpenCU unloaded'); sessionOwners.clear(); },
  };
}
