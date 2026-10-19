import { registerExtensionDownload } from '../extension/distribution.mjs';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import { createPluginRuntime } from './runtime.mjs';
import { installToolDefinitions } from './tools.mjs';
import { publicConfig } from './config.mjs';
import { createComputerSession } from './computer.mjs';
import { createActivityFeed } from './activity.mjs';
import { createBrowserHost } from './browser-host.mjs';
import { createPresentationHost } from './presentation.mjs';
import { createPreferences } from './preferences.mjs';
import { createBrowserHistory } from './browser-history.mjs';

const key = Symbol.for('opencu.shared-root.v1');
const roots = globalThis[key] ??= new WeakMap();
const mutating = new Set(['select', 'observe', 'act', 'focus', 'openTarget', 'resume', 'computer_use']);

function failure(error) {
  return { ok: false, error: { code: error?.code || 'OPENCU_ERROR', message: error?.message || String(error), details: error?.details ?? {} } };
}

export function acquireOpenCU(ctx, { namespace = 'opencu', config = {}, getConfig, configuration = true } = {}) {
  const root = ctx.root;
  let entry = roots.get(root);
  if (entry?.retiring) throw new Error('OpenCU is releasing the last lease; retry after cleanup');
  if (!entry) {
    entry = { root, leases: new Set(), tools: new Map(), config: () => config };
    entry.browserHost = createBrowserHost();
    let cursorOwner;
    entry.runtime = createPluginRuntime({ getConfig: () => entry.config(), dshBrowser: entry.browserHost.backend, onAppApprovalsChanged: () => entry.activity?.invalidate(),
      async onCursor(cursor, sessionId) {
        if (!cursor.visible) {
          const previous = cursorOwner; cursorOwner = undefined;
          if (previous) await entry.browserHost.cursor({ visible: false }, previous);
          return;
        }
        const owner = entry.browserHost.presentationOwner(cursor.target, sessionId);
        if (cursorOwner && cursorOwner !== owner) await entry.browserHost.cursor({ visible: false }, cursorOwner);
        cursorOwner = owner;
        return entry.browserHost.cursor(cursor, owner);
      },
    });
    entry.preferences = createPreferences(() => entry.runtime.dataDir);
    entry.history = createBrowserHistory(() => entry.runtime.dataDir);
    entry.computers = new Map();
    const turns = new WeakMap();
    entry.activity = createActivityFeed(id => turns.get(root.get('sessions')?.get(id)));
    entry.offSessionEvent = root.on('session/event', (session, event) => {
      if (event.type === 'turn/start') turns.set(session, event.data.turn);
      else if (event.type === 'turn/end' && turns.get(session) === event.data.turn) turns.delete(session);
      entry.activity.sessionEvent(session.id, event);
    }, { global: true });
    entry.offSessionDisposed = root.on('session/disposed', session => {
      turns.delete(session);
      entry.runtime.forgetSession(session.id);
      entry.activity.forget(session.id);
      const computer = entry.computers.get(session.id);
      if (!computer) return;
      return computer.close().then(() => {
        if (entry.computers.get(session.id) === computer) entry.computers.delete(session.id);
        entry.activity.forget(session.id);
      }).catch(error => console.error('OpenCU computer session cleanup', error));
    }, { global: true });
    entry.presentation = createPresentationHost({ runtime: entry.runtime, activity: entry.activity, browserHost: entry.browserHost });
    entry.request = async (endpoint, args = {}, { signal, attachments, sessionKey, modelProjection = false } = {}) => {
      signal?.throwIfAborted();
      if (endpoint.startsWith('recovery/')) throw new Error('Recovery confirmation is available only in browser connection settings');
      if (entry.retiring && !['stop', 'browser/poll', 'browser/result', 'browser/disconnect'].includes(endpoint)) throw new Error('OpenCU is releasing the last lease; retry after cleanup');
      if (endpoint === 'settings/read') return { ok: true, settings: await entry.preferences.read() };
      if (endpoint === 'settings/write') return { ok: true, settings: await entry.preferences.write(args.key, args.value) };
      if (endpoint.startsWith('history/')) return { ok: true, value: await entry.history.handle(endpoint.slice(8), args) };
      if (endpoint === 'events') {
        const snapshot = await entry.activity.wait(args.after, signal, { heartbeat: args.heartbeat === true, compact: args.compact === true });
        return snapshot.unchanged ? snapshot : { ...snapshot, appApprovals: entry.runtime.pendingAppApprovals() };
      }
      if (endpoint === 'presentation/event') return entry.presentation.event(args);
      if (endpoint.startsWith('presentation/')) return entry.presentation.handle(endpoint.slice(13), args);
      if (endpoint.startsWith('browser/')) {
        const result = await entry.browserHost.handle(endpoint, args, signal);
        if (endpoint === 'browser/connect') void entry.presentation.sessionsChanged().catch(error => console.error('OpenCU monitoring reconnect', error));
        else if (['browser/sessions', 'browser/disconnect'].includes(endpoint)) await entry.presentation.sessionsChanged();
        return result;
      }
      const activity = mutating.has(endpoint) ? entry.activity.begin(sessionKey, endpoint, args) : null;
      let release, outcome, failure;
      // Input release remains global; only the aborted owner's approvals are cancelled.
      // Anonymous API requests have no approval owner, so use a non-null root sentinel.
      const onAbort = () => { release ??= entry.runtime.request('stop', {}, { sessionKey: sessionKey ?? root }); };
      if (mutating.has(endpoint)) signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (signal?.aborted) { if (mutating.has(endpoint)) onAbort(); signal.throwIfAborted(); }
        let result;
        if (endpoint === 'computer_use' || endpoint === 'computer_use_reset') {
          const id = sessionKey ?? root;
          let computer = entry.computers.get(id);
          if (!computer) { computer = createComputerSession((method, payload) => entry.request(method, payload, { signal: method === 'stop' ? undefined : computer.signal, attachments: computer.attachments, sessionKey: id, modelProjection: method === 'state' || method === 'targets' })); entry.computers.set(id, computer); }
          computer.attachments = attachments;
          result = endpoint === 'computer_use_reset' ? await computer.reset() : await computer.run(args, signal);
        } else if (endpoint === 'openTarget' && String(args.browserId).startsWith('dsh:')) {
          const target = await entry.browserHost.openTab({ ...args, sessionId: typeof sessionKey === 'string' ? sessionKey : undefined });
          result = await entry.runtime.request('select', { reference: { id: target.id, identity: target.identity } }, { attachments, signal, sessionKey });
        } else {
          result = await entry.runtime.request(endpoint, args, { attachments, signal, sessionKey, modelProjection });
          if (endpoint === 'state' || endpoint === 'targets') result = { ...result, browsers: [...entry.browserHost.listBrowsers(), ...(result.browsers ?? [])],
            ...(!modelProjection ? { presentation: entry.presentation.snapshot() } : {}) };
        }
        signal?.throwIfAborted();
        outcome = result;
        return result;
      } catch (error) { failure = error; throw error; }
      finally {
        entry.activity.finish(activity, outcome, failure);
        signal?.removeEventListener('abort', onAbort);
        if (release) {
          const result = await release;
          if (result.ok === false) throw Object.assign(new Error(`OpenCU cancellation release failed: ${result.error.message}`), result.error);
        }
      }
    };
    entry.service = { request: entry.request, acquire: (owner, options) => acquireOpenCU(owner, options), installTools: (scope, options) => installTools(scope, options), get leaseCount() { return entry.leases.size; } };
    entry.unprovide = root.provide('opencu', entry.service);
    entry.rpcFiber = root.inject(['connection', 'attachments'], async connectionCtx => {
      connectionCtx.effect(() => registerExtensionDownload(connectionCtx), 'opencu: static extension download');
      const resources = JSON.parse(await readFile(new URL('../../lib/rea-assets/manifest.json', import.meta.url), 'utf8'));
      for (const { file, asset = file } of resources) connectionCtx.effect(() => connectionCtx.connection.fetch.register({
        path: `/api/opencu/rea-assets/${file}`, methods: ['GET'], requestBody: 'buffered',
        async fetch() {
          const type = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.woff2') ? 'font/woff2' : 'text/javascript';
          return new Response(await readFile(new URL(`../../lib/rea-assets/${asset}`, import.meta.url)), { headers: { 'Content-Type': type, 'Cache-Control': /-[a-f0-9]+\./.test(file) ? 'private, max-age=31536000, immutable' : 'no-cache' } });
        },
      }), `opencu: REA resource ${file}`);
      connectionCtx.effect(() => connectionCtx.connection.fetch.register({
        path: '/api/opencu', methods: ['POST'], requestBody: 'buffered',
        async fetch(request) {
          try {
            const { method, args = {} } = await request.json();
            if (typeof method !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) return Response.json(failure(new Error('Invalid OpenCU request')), { status: 400 });
            if (method.startsWith('recovery/')) return Response.json(await entry.runtime.uiRecovery(method.slice(9), args));
            if (method === 'config') return Response.json({ ok: true, config: publicConfig(entry.config()) });
            return Response.json(await entry.request(method, args, { signal: request.signal, attachments: connectionCtx.attachments }));
          } catch (error) { return Response.json(failure(error)); }
        },
      }), 'opencu: authenticated API');
      for (const [path, file, type] of [
        ['/api/opencu/browser-surface', 'browser-surface.html', 'text/html; charset=utf-8'],
        ['/api/opencu/browser-surface.js', 'browser-surface.js', 'text/javascript; charset=utf-8'],
        ['/api/opencu/presentation', 'presentation.html', 'text/html; charset=utf-8'],
        ['/api/opencu/presentation.js', 'presentation.js', 'text/javascript; charset=utf-8'],
        ['/api/opencu/cursor', 'cursor.html', 'text/html; charset=utf-8'],
        ['/api/opencu/page-cursor.js', 'page-cursor.js', 'text/javascript; charset=utf-8'],
      ]) connectionCtx.effect(() => connectionCtx.connection.fetch.register({ path, methods: ['GET'], requestBody: 'buffered',
        async fetch() { return new Response(await readFile(new URL(`../../lib/${file}`, import.meta.url)), { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } }); },
      }), `opencu: ${file}`);
    });
    roots.set(root, entry);
  }
  const refreshConfig = () => {
    const owners = [...entry.leases].filter(owner => owner.configuration);
    const owner = owners.findLast(owner => owner.namespace === 'opencu') ?? owners.at(-1);
    if (owner) entry.config = owner._config;
  };
  const lease = {
    namespace, configuration,
    request: (endpoint, args, options) => entry.request(endpoint, args, options),
    installTools: (scope, options) => installTools(scope, { ...options, namespace, config, getConfig }),
    get service() { return entry.service; },
    get dataDir() { return entry.runtime.dataDir; },
    async release() {
      if (!entry.leases.has(lease)) return;
      if (entry.leases.size > 1) { entry.leases.delete(lease); refreshConfig(); return; }
      entry.retiring = true;
      if (!entry.closing) entry.closing = (async () => {
        const failures = [];
        const release = async work => { try { await work(); } catch (error) { failures.push(error); } };
        const resets = await Promise.allSettled([...entry.computers.values()].map(computer => computer.close()));
        failures.push(...resets.filter(result => result.status === 'rejected').map(result => result.reason));
        await release(() => entry.presentation.close());
        await release(() => entry.runtime.close());
        await release(() => entry.preferences.close());
        await release(() => entry.history.close());
        // A failed input release keeps the transport and owner available for a retry.
        if (failures.length) throw new AggregateError(failures, 'OpenCU unload could not finish releasing resources');
        entry.offSessionEvent(); entry.offSessionDisposed(); entry.activity.close();
        entry.browserHost.close();
        await entry.rpcFiber.dispose();
        entry.computers.clear(); entry.unprovide();
        entry.leases.delete(lease);
        roots.delete(root);
      })().catch(error => { entry.closing = undefined; throw error; });
      await entry.closing;
    },
    _config: getConfig || (() => config),
  };
  entry.leases.add(lease);
  refreshConfig();
  ctx.effect(() => () => lease.release(), `opencu: ${namespace} lease`);
  return lease;
}

export function installTools(scope, options = {}) {
  const ctx = Context.is(scope) ? scope : scope.ctx;
  const isolation = ctx[Context.isolate]?.tools;
  const scopeKey = scopeOf(ctx) ?? isolation ?? ctx.root;
  if (roots.get(ctx.root)?.tools.get(scopeKey)?.closing) throw new Error('OpenCU tools are releasing; retry after cleanup');
  const lease = acquireOpenCU(ctx, options);
  const entry = roots.get(ctx.root);
  let record = entry.tools.get(scopeKey);
  if (!record) {
    const owner = isolation ? ctx.root.isolate('tools', isolation) : ctx.root;
    const registrationScope = scopeOf(ctx) ? createScope(owner, scopeOf(ctx)) : { ctx: owner, dispose: async () => {} };
    record = { refs: 0, registrationScope };
    record.fiber = registrationScope.ctx.inject(['tools', 'attachments'], toolsCtx => installToolDefinitions(toolsCtx, lease, scopeKey));
    entry.tools.set(scopeKey, record);
  }
  record.refs++;
  let released = false, disposing;
  const dispose = () => {
    if (!disposing) disposing = (async () => {
      if (!released) {
        if (record.refs === 1) {
          record.closing = true;
          await record.fiber.dispose();
          await record.registrationScope.dispose();
          entry.tools.delete(scopeKey);
        }
        record.refs--;
        released = true;
      }
      await lease.release();
    })().catch(error => { disposing = undefined; throw error; });
    return disposing;
  };
  ctx.effect(() => dispose, 'opencu: scoped tools');
  return { lease, ready: record.fiber, dispose };
}
