import { symbols } from '@deepseek-ai/cordis';

// Only the native anonymous fetch provider is adapted. DNS validation, redirect
// policy, byte limits, decoding, deadlines and tool rendering remain native.
export function createPinnedHttpPool({ Agent, fetch }, { idleMs = 30_000, maxPools = 8 } = {}) {
  const pools = new Map(), closing = new Set(), cleanupErrors = [];
  let closed = false, created = 0, reused = 0;
  const closeEntry = entry => {
    clearTimeout(entry.timer);
    if (pools.get(entry.key) === entry) pools.delete(entry.key);
    const done = Promise.resolve().then(() => entry.active ? entry.agent.close() : entry.agent.destroy()).catch(error => entry.agent.destroy(error))
      .catch(error => { cleanupErrors.push(error); throw error; }).finally(() => closing.delete(done));
    closing.add(done); return done;
  };
  function lookup(addresses) {
    return (hostname, options, callback) => {
      const family = typeof options.family === 'number' ? options.family : options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : 0;
      const eligible = family === 0 ? addresses : addresses.filter(address => address.family === family), selected = eligible[0];
      if (!selected) { callback(Object.assign(new Error(`no validated address for ${hostname} in family ${family}`), { code: 'ENOTFOUND', hostname }), options.all === true ? [] : '', family); return; }
      if (options.all === true) callback(null, eligible.map(address => ({ ...address })));
      else callback(null, selected.address, selected.family);
    };
  }
  return {
    async request(url, addresses, headers, signal) {
      signal?.throwIfAborted();
      if (closed) throw new Error('Web fetch connection pool is closed');
      // Every request reaches the native resolver first. A changed answer set
      // receives another connector; no socket can bypass revalidation.
      const pinned = addresses.map(({ address, family }) => ({ address, family }));
      const key = JSON.stringify([url.origin, pinned]);
      let entry = pools.get(key);
      if (!entry) {
        entry = { key, active: 0, agent: new Agent({ autoSelectFamily: true, connections: 4,
          keepAliveTimeout: 15_000, keepAliveMaxTimeout: 15_000, connect: { lookup: lookup(pinned) } }) };
        pools.set(key, entry); created++;
      } else { pools.delete(key); pools.set(key, entry); reused++; }
      clearTimeout(entry.timer); entry.active++;
      for (const candidate of pools.values()) {
        if (pools.size <= maxPools) break;
        if (!candidate.active) void closeEntry(candidate).catch(() => {});
      }
      let released = false;
      const release = async () => {
        if (released) return;
        released = true; entry.active--;
        if (entry.active || closed) return;
        if (pools.size > maxPools) { await closeEntry(entry); return; }
        entry.timer = setTimeout(() => { void closeEntry(entry).catch(() => {}); }, idleMs); entry.timer.unref?.();
      };
      try {
        const response = await fetch(url, { method: 'GET', redirect: 'manual', headers, signal, dispatcher: entry.agent });
        return { response, close: release };
      } catch (error) { await release(); throw error; }
    },
    status: () => ({ pools: pools.size, active: [...pools.values()].reduce((sum, entry) => sum + entry.active, 0), created, reused }),
    async close() {
      closed = true;
      await Promise.allSettled([...pools.values()].map(closeEntry));
      await Promise.allSettled([...closing]);
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Could not release web-fetch connections');
    },
  };
}

const bindings = new WeakMap();
function lease(binding) {
  let released = false;
  return () => { if (released) return; released = true; return release(binding); };
}
export function bindWebFetchPooling(web, { HttpFetchProvider, WebError, timeoutOf, proxyRouteFor, Agent, fetch }) {
  web = web?.[symbols.original] ?? web;
  let binding = bindings.get(web);
  if (binding) { binding.owners++; return lease(binding); }
  if (!(web?.fetchProviders instanceof Map) || typeof web.registerFetchProvider !== 'function') return () => {};
  const attached = new Map();
  function attach(provider) {
    if (attached.has(provider) || !Object.isExtensible(provider) || Object.getPrototypeOf(provider) !== HttpFetchProvider.prototype
      || provider.requestOnce !== HttpFetchProvider.prototype.requestOnce) return;
    const descriptor = Object.getOwnPropertyDescriptor(provider, 'requestOnce'), original = provider.requestOnce;
    const pool = createPinnedHttpPool({ Agent, fetch });
    const requests = new Set();
    async function requestOnce(url, signal) {
      const done = Promise.withResolvers(); requests.add(done.promise);
      try {
        const route = proxyRouteFor(url);
        // Proxy credentials, destination policy and legacy behavior stay wholly
        // native. Only already-validated direct public addresses are pooled.
        if (route.proxied) return await original.call(this, url, signal);
        const addresses = await this.resolveAddresses(url.hostname, signal);
        return await pool.request(url, addresses, {
          'user-agent': this.limits.userAgent,
          accept: 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8',
        }, signal);
      } catch (error) {
        if (error instanceof WebError) throw error;
        const timeout = signal ? timeoutOf(signal, 'WEB_FETCH_TIMEOUT') : undefined;
        if (timeout !== undefined) throw new WebError('web fetch timed out', 'WEB_FETCH_TIMEOUT', { cause: timeout });
        if (signal?.aborted) throw new WebError('web fetch aborted', 'WEB_ABORTED', { cause: error });
        throw new WebError(`web fetch failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
      } finally { requests.delete(done.promise); done.resolve(); }
    }
    Object.defineProperty(provider, 'requestOnce', { value: requestOnce, configurable: true, writable: true });
    attached.set(provider, { descriptor, requestOnce, pool, requests });
  }
  async function detach(provider) {
    const receipt = attached.get(provider);
    if (!receipt) return;
    attached.delete(provider);
    if (provider.requestOnce === receipt.requestOnce) {
      if (receipt.descriptor) Object.defineProperty(provider, 'requestOnce', receipt.descriptor);
      else delete provider.requestOnce;
    }
    await Promise.allSettled([...receipt.requests]);
    await receipt.pool.close();
  }
  const descriptor = Object.getOwnPropertyDescriptor(web, 'registerFetchProvider'), original = web.registerFetchProvider;
  function registerFetchProvider(provider) {
    const dispose = original.call(this, provider);
    for (const previous of attached.keys()) if (![...web.fetchProviders.values()].includes(previous)) void detach(previous);
    attach(provider);
    return () => { dispose(); void detach(provider); };
  }
  Object.defineProperty(web, 'registerFetchProvider', { value: registerFetchProvider, configurable: true, writable: true });
  for (const provider of web.fetchProviders.values()) attach(provider);
  binding = { owners: 1, web, descriptor, registerFetchProvider, attached, detach };
  bindings.set(web, binding);
  return lease(binding);
}
async function release(binding) {
  if (--binding.owners > 0) return;
  if (binding.web.registerFetchProvider === binding.registerFetchProvider) {
    if (binding.descriptor) Object.defineProperty(binding.web, 'registerFetchProvider', binding.descriptor);
    else delete binding.web.registerFetchProvider;
  }
  bindings.delete(binding.web);
  const results = await Promise.allSettled([...binding.attached.keys()].map(binding.detach));
  const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Could not release web-fetch pooling');
}

export function installWebFetchPooling(ctx) {
  return ctx.inject(['web', 'loader'], async scope => {
    const entry = [...scope.loader.entries()].find(row => row.options.name === '@deepseek-ai/dsh-web-fetch-http');
    if (!entry) return;
    const tree = entry.parent.tree;
    try {
      const [native, errors, timers, proxy, transport] = await Promise.all([
        tree.import('@deepseek-ai/dsh-web-fetch-http'), tree.import('@deepseek-ai/dsh-web'),
        tree.import('@deepseek-ai/dsh-timeout'), tree.import('@deepseek-ai/dsh-http-proxy'), tree.import('undici'),
      ]);
      if (scope.fiber && (scope.fiber.uid === null || ![1, 2].includes(scope.fiber.state))) return;
      const dispose = bindWebFetchPooling(scope.web, { ...native, ...errors, ...timers, ...proxy, ...transport });
      scope.effect(() => dispose);
    } catch (error) { scope.logger.warn('Could not reuse native web-fetch connections: %s', error.message); }
  });
}
