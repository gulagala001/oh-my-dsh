import { randomUUID } from 'node:crypto';
import { checkExpected, fail, inputReleased, json, referenceMatches, sameIdentity } from '../protocol.mjs';
import { compactPresentationImages } from '../presentation-images.mjs';

/** The authenticated DSH renderer owns each real sidebar guest, not a screenshot proxy. */
export function createBrowserHost() {
  const clients = new Map(), pending = new Map(), sessionOwners = new Map(), bindings = new Map(), retired = new Map();
  let closed = false;
  const resetPresentationImages = client => { client.presentationSequence++; client.presentationFrames = []; };
  function disconnect(client, reason) {
    resetPresentationImages(client);
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
  function retire(target) {
    retired.set(target.id, json(target));
    if (sameIdentity(bindings.get(target.id)?.target.identity, target.identity)) bindings.delete(target.id);
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
    async listBrowsers() { return liveClients().map(client => ({id: `dsh:${client.id}`, provider: 'dsh', name: 'DSH Browser'})); },
    async newTab(browserId, url, {sessionId, signal} = {}) {
      signal?.throwIfAborted();
      const client = liveClients().find(client => browserId === `dsh:${client.id}`);
      if (!client) fail('BROWSER_HOST_DISCONNECTED', 'Choose one connected sidebar browser');
      const result = await request(client, 'openTab', {sessionId, url});
      return result.target;
    },
    getDiagnostics() {
      const renderers = liveClients();
      const targetCount = renderers.reduce((count, client) => count + client.targets.length, 0);
      return { configured: true, connectedRenderers: renderers.length, targetCount,
        status: !renderers.length ? 'renderer_unavailable' : targetCount ? 'ready' : 'no_tabs',
        ...(!renderers.length ? { code: 'DSH_RENDERER_UNAVAILABLE',
          message: 'No DSH sidebar browser renderer is connected. Installing the plugin alone does not provide a sidebar browser.',
          nextStep: 'Open a DSH client with a supported sidebar browser adapter, or configure a browser extension or CDP connection.' }
          : !targetCount ? { code: 'DSH_NO_BROWSER_TABS', message: 'The DSH browser renderer is connected but has no published browser tabs.',
            nextStep: 'Open a browser tab in the connected DSH client.' } : {}) };
    },
    async listTargets() { return liveClients().flatMap(client => client.targets).map(json); },
    async select(reference) {
      const matches = (await backend.listTargets()).filter(target => referenceMatches(target, reference));
      if (matches.length !== 1) fail(matches.length ? 'AMBIGUOUS_TARGET' : 'TARGET_NOT_FOUND', 'Select one live DSH sidebar tab');
      const target = matches[0]; checkExpected(target, reference.expected);
      const client = clientFor(target), previous = bindings.get(target.id);
      if (previous?.needsRelease && previous.client !== client) {
        const release = await request(client, 'release', { target, dismissDialogs: false });
        if (!inputReleased(release)) fail('RELEASE_FAILED', 'Reselection requires the original guest to release its input', release);
        previous.needsRelease = false;
      }
      await request(client, 'select', { target });
      bindings.set(target.id, {target: json(target), client, needsRelease: previous?.needsRelease ?? false});
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
      const previous = bindings.get(target.id);
      const reading = ['getDialog', 'getDOM', 'domSnapshot', 'hitTest', 'siteTools', 'cursor'].includes(action.action);
      if (!reading && previous && previous.client !== client) fail('RECOVERY_REQUIRED', 'The sidebar reconnected; resume the original target before input', {inputDispatched: false});
      // Keep the connection that owns selection and unresolved input even after
      // it disappears from inventory. A replacement connection is not a receipt.
      const binding = previous ?? {target: json(target), client, needsRelease: false};
      if (!reading) { binding.needsRelease = true; bindings.set(target.id, binding); }
      let interruption;
      const abort = () => { interruption ??= request(client, 'release', { target }).catch(error => ({ released: false, error: error.message })); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        signal?.throwIfAborted();
        const result = await request(client, 'act', { target, action });
        signal?.throwIfAborted();
        if (result?.closedTargetId === target.id) bindings.delete(target.id);
        return result;
      } finally {
        signal?.removeEventListener('abort', abort);
        if (interruption) {
          const release = await interruption;
          if (!inputReleased(release)) fail('RELEASE_FAILED', 'Cancelled sidebar input release was not acknowledged', release);
          binding.needsRelease = false;
        }
      }
    },
    async releaseTarget(target, {dismissDialogs = false} = {}) {
      const binding = bindings.get(target.id), client = binding?.client ?? clientFor(target);
      const result = await request(client, 'release', {target, dismissDialogs});
      if (inputReleased(result) && binding) binding.needsRelease = false;
      return result;
    },
    async release({ targets = [], dismissDialogs = true } = {}) {
      const failures = [];
      const retiredTargetIds = targets.filter(target => sameIdentity(retired.get(target.id)?.identity, target.identity)
        || target.cold && target.releaseAcknowledged === true && !bindings.has(target.id)
          && !liveClients().some(client => client.targets.some(current => sameIdentity(current.identity, target.identity)))).map(target => target.id);
      for (const target of targets) if (target.cold && !retiredTargetIds.includes(target.id) && !bindings.has(target.id))
        bindings.set(target.id, {target: json(target), needsRelease: true});
      await Promise.all(liveClients().map(async client => {
        try {
          const result = await request(client, 'release', { dismissDialogs });
          if (!inputReleased(result)) { failures.push({rendererId: client.id, code: 'RELEASE_FAILED', result}); return; }
          for (const binding of bindings.values()) if (binding.client === client || client.targets.some(target =>
            target.id === binding.target.id && sameIdentity(target.identity, binding.target.identity))) binding.needsRelease = false;
        } catch (error) { failures.push({rendererId: client.id, code: error.code, message: error.message}); }
      }));
      for (const binding of bindings.values()) if (binding.needsRelease) failures.push({targetId: binding.target.id,
        code: 'STALE_TARGET', message: 'The original sidebar guest has not acknowledged input release', identity: binding.target.identity});
      return { released: failures.length === 0, failures, retiredTargetIds };
    },
    async confirmClosedTargets(targets) {
      for (const target of targets) {
        if (liveClients().some(client => client.targets.some(current => current.id === target.id && sameIdentity(current.identity, target.identity))))
          fail('BROWSER_STILL_CONNECTED', 'The original sidebar guest is still connected; release it normally');
        const binding = bindings.get(target.id);
        if (binding && !sameIdentity(binding.target.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'Recovery refers to another sidebar guest');
      }
      for (const target of targets) bindings.delete(target.id);
      return {released: true};
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
      if (!owner.presentationImages) return request(owner, 'presentation', { operation: 'update', payload });
      const sequence = ++owner.presentationSequence, baseline = randomUUID();
      const current = () => clients.get(owner.id) === owner && sequence === owner.presentationSequence;
      const send = frames => request(owner, 'presentation', { operation: 'update', payload: { ...payload, frames, presentationImageBaseline: baseline } });
      try {
        let result;
        try { result = await send(compactPresentationImages(owner.presentationFrames, payload.frames)); }
        catch (error) {
          // A renderer can lose its cache independently of the broker. Retry
          // this display update once with full pixels, never an input action.
          if (error.code !== 'PRESENTATION_IMAGE_BASELINE_MISSING' || !current()) throw error;
          result = await send(payload.frames);
        }
        if (current()) owner.presentationFrames = result?.presentationImageBaseline === baseline ? payload.frames.map(frame => ({ ...frame })) : [];
        const { presentationImageBaseline, ...value } = result ?? {};
        return value;
      } catch (error) { if (current()) owner.presentationFrames = []; throw error; }
    },
    async hidePresentation(ownerId) {
      const owner = liveClients().find(client => client.id === ownerId && client.presentation);
      if (owner) { resetPresentationImages(owner); await request(owner, 'presentation', { operation: 'hide', payload: {} }); }
    },
    async closePresentations() {
      await Promise.all(liveClients().filter(client => client.presentation).map(client => {
        resetPresentationImages(client); return request(client, 'presentation', { operation: 'close', payload: {} });
      }));
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
        const connectionId = randomUUID();
        clients.set(id, { id, connectionId, presentation: args.presentation === true, presentationImages: args.presentationImages === 1, presentationFrames: [], presentationSequence: 0,
          sessionIds: Array.isArray(args.sessionIds) ? args.sessionIds.filter(id => typeof id === 'string') : [],
          targets: [], commands: [], wake: null, lastSeen: Date.now() });
        for (const sessionId of clients.get(id).sessionIds) sessionOwners.set(sessionId, id);
        return { ok: true, rendererId: id, connectionId };
      }
      const client = clients.get(args.rendererId);
      if (method === 'browser/disconnect' && (!client || args.connectionId !== client.connectionId)) {
        // A late receipt can retire only its own connection's obligations.
        // It cannot disconnect or release a replacement using the same renderer ID.
        if (inputReleased(args)) for (const [id, binding] of bindings)
          if (binding.target.identity.rendererId === args.rendererId && binding.client?.connectionId === args.connectionId) bindings.delete(id);
        return {ok: true, ignored: true};
      }
      if (!client) fail('BROWSER_HOST_DISCONNECTED', 'Reconnect the sidebar renderer');
      if (args.connectionId !== client.connectionId) fail('BROWSER_HOST_DISCONNECTED', 'The sidebar connection was replaced; reconnect before sending more messages');
      client.lastSeen = Date.now();
      if (method === 'browser/sessions') {
        if (!Array.isArray(args.sessionIds) || args.sessionIds.some(id => typeof id !== 'string')) fail('INVALID_TARGET', 'Expected live window session IDs');
        if (JSON.stringify([...client.sessionIds].sort()) !== JSON.stringify([...args.sessionIds].sort())) resetPresentationImages(client);
        client.sessionIds = args.sessionIds;
        for (const sessionId of client.sessionIds) sessionOwners.set(sessionId, client.id);
        return { ok: true };
      }
      if (method === 'browser/publish') {
        if (!Array.isArray(args.targets)) fail('INVALID_TARGET', 'Expected the live sidebar target list');
        const validate = target => {
          if (typeof target.id !== 'string' || typeof target.identity?.guestId !== 'string' || target.identity.rendererId !== client.id) fail('INVALID_TARGET', 'Invalid sidebar guest identity');
          const bound = bindings.get(target.id)?.target;
          if (bound && !sameIdentity(bound.identity, target.identity)) fail('TARGET_IDENTITY_CHANGED', 'A sidebar target ID cannot replace another occurrence');
          return { ...target, backend: 'browser', provider: 'dsh', kind: 'tab', browserId: `dsh:${client.id}` };
        };
        const targets = args.targets.map(validate);
        if (args.retiredTargets !== undefined && !Array.isArray(args.retiredTargets)) fail('INVALID_TARGET', 'Expected released sidebar targets');
        const released = (args.retiredTargets ?? []).map(validate);
        if (released.some(target => targets.some(live => live.id === target.id))) fail('INVALID_TARGET', 'A live sidebar target cannot be retired');
        for (const target of released) retire(target);
        client.targets = targets.filter(target => !sameIdentity(retired.get(target.id)?.identity, target.identity));
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
      if (method === 'browser/disconnect') {
        if (inputReleased(args)) {
          const targets = [...client.targets, ...[...bindings.values()].filter(binding => binding.client === client).map(binding => binding.target)];
          if (args.retiredTargets !== undefined && (!Array.isArray(args.retiredTargets) || args.retiredTargets.some(target =>
            typeof target.id !== 'string' || typeof target.identity?.guestId !== 'string' || target.identity.rendererId !== client.id))) fail('INVALID_TARGET', 'Invalid retired sidebar targets');
          for (const target of [...targets.filter(target => target.identity.rendererId === client.id), ...(args.retiredTargets ?? [])]) retire(target);
        }
        disconnect(client, 'The sidebar renderer disconnected'); return { ok: true };
      }
      fail('UNSUPPORTED_METHOD', 'Unknown sidebar browser transport operation');
    },
    close() { closed = true; for (const client of [...clients.values()]) disconnect(client, 'OpenCU unloaded'); sessionOwners.clear(); bindings.clear(); retired.clear(); },
  };
}
