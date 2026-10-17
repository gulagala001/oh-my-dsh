import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const failure = (code, message, details = {}) => Object.assign(new Error(message), { code, details });
const identity = target => {
  const value = target?.identity;
  const bundleIdentifier = value?.bundleId || value?.executable;
  if (target?.backend !== 'native' || !bundleIdentifier || !value?.executable) throw failure('APP_IDENTITY_REQUIRED', 'Application access requires a verified bundle or executable identity');
  return { bundleIdentifier, executable: value.executable, displayName: target.name || target.title || bundleIdentifier,
    iconDataURL: target.iconDataURL ?? null };
};
const sameApp = (a, b) => a.bundleIdentifier === b.bundleIdentifier && a.executable === b.executable;

/** Permanent approvals skip prompts in later conversations; removal keeps current grants. */
export function createAppApprovals(getDirectory) {
  const sessions = new Map(), pending = new Map(), authorizing = new Set();
  let tail = Promise.resolve(), closed = false;
  async function read() {
    let value;
    try { value = JSON.parse(await readFile(join(getDirectory(), 'app-approvals.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return { approvedApps: [] }; }
    if (!Array.isArray(value?.approvedApps) || value.approvedApps.some(app => !app.bundleIdentifier || !app.executable || !app.displayName)) throw new Error('Invalid persisted application approvals');
    return value;
  }
  function change(update) {
    const work = tail.then(async () => {
      if (closed) throw new Error('Application approvals are closed');
      const next = update(await read()), directory = getDirectory();
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = join(directory, 'app-approvals.json'), temporary = file + '.pending';
      await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, file);
      return next;
    });
    tail = work.catch(() => {});
    return work;
  }
  function grants(sessionId) {
    let value = sessions.get(sessionId);
    if (!value) sessions.set(sessionId, value = new Map());
    return value;
  }
  return {
    async read() { await tail; return read(); },
    remove(bundleIdentifier) {
      if (typeof bundleIdentifier !== 'string' || !bundleIdentifier) throw new Error('An application identifier is required');
      return change(value => ({ approvedApps: value.approvedApps.filter(app => app.bundleIdentifier !== bundleIdentifier) }));
    },
    async authorize(target, sessionId, signal, readMetadata) {
      signal?.throwIfAborted();
      if (closed) throw new Error('Application approvals are closed');
      if (typeof sessionId !== 'string' || !sessionId) throw failure('APP_SESSION_REQUIRED', 'Application access requires a conversation');
      const app = identity(target), existing = grants(sessionId).get(app.bundleIdentifier);
      if (existing && sameApp(existing, app)) return;
      const attempt = { sessionId, cancelled: false }; authorizing.add(attempt);
      const check = () => {
        signal?.throwIfAborted();
        if (closed) throw new Error('Application approvals are closed');
        if (attempt.cancelled) throw failure('APP_APPROVAL_CANCELLED', 'The computer task was cancelled');
      };
      let request;
      try {
        await tail; check();
        const approved = (await read()).approvedApps.find(value => sameApp(value, app));
        check();
        if (approved) { grants(sessionId).set(app.bundleIdentifier, app); return; }
        request = [...pending.values()].find(value => value.conversationId === sessionId && sameApp(value.app, app));
        if (!request) {
          const metadata = await readMetadata?.();
          check();
          if (sameApp(grants(sessionId).get(app.bundleIdentifier) ?? {}, app)) return;
          request = [...pending.values()].find(value => value.conversationId === sessionId && sameApp(value.app, app));
          if (!request) {
            const display = metadata ? { ...app, displayName: metadata.displayName || app.displayName, iconDataURL: metadata.iconDataURL ?? null } : app;
            request = { id: randomUUID(), conversationId: sessionId, app: display, targetId: target.id, waiters: new Set() };
            pending.set(request.id, request);
          }
        }
      } finally { authorizing.delete(attempt); }
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) };
        const abort = () => {
          waiter.cleanup(); request.waiters.delete(waiter);
          if (!request.waiters.size) pending.delete(request.id);
          reject(signal.reason ?? failure('APP_APPROVAL_CANCELLED', 'Application request was cancelled'));
        };
        request.waiters.add(waiter);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    },
    pending(sessionId) {
      return [...pending.values()].filter(value => value.conversationId === sessionId).map(value => ({
        id: value.id, conversationId: value.conversationId, targetId: value.targetId,
        request: { appDisplayName: value.app.displayName, connectorName: 'OpenCU', persistModes: ['session', 'always'], riskLevel: 'normal' },
      }));
    },
    async respond({ conversationId, requestId, action, persist }) {
      const request = pending.get(requestId);
      if (!request || request.conversationId !== conversationId || request.responding) throw failure('APP_REQUEST_EXPIRED', 'This application access request is no longer pending');
      if (!['accept', 'decline'].includes(action) || action === 'accept' && !['session', 'always'].includes(persist)) throw new Error('Invalid application approval response');
      request.responding = true;
      try {
        if (action === 'accept' && persist === 'always') await change(value => ({ approvedApps: [...value.approvedApps.filter(app => app.bundleIdentifier !== request.app.bundleIdentifier), request.app] }));
        if (!pending.has(requestId)) throw failure('APP_REQUEST_EXPIRED', 'The task ended while saving this approval');
        if (action === 'accept') grants(conversationId).set(request.app.bundleIdentifier, request.app);
        pending.delete(requestId);
        for (const waiter of request.waiters) {
          waiter.cleanup();
          if (action === 'accept') waiter.resolve();
          else waiter.reject(failure('APP_ACCESS_DENIED', `Access to ${request.app.displayName} was declined`));
        }
        return { settled: true };
      } finally { request.responding = false; }
    },
    cancel(sessionId) {
      for (const attempt of authorizing) if (sessionId == null || attempt.sessionId === sessionId) attempt.cancelled = true;
      for (const request of pending.values()) if (sessionId == null || request.conversationId === sessionId) {
        pending.delete(request.id);
        for (const waiter of request.waiters) { waiter.cleanup(); waiter.reject(failure('APP_APPROVAL_CANCELLED', 'The computer task was cancelled')); }
      }
    },
    forgetSession(sessionId) {
      if (typeof sessionId !== 'string' || !sessionId) throw failure('APP_SESSION_REQUIRED', 'Application access requires a conversation');
      this.cancel(sessionId); sessions.delete(sessionId);
    },
    async close() { closed = true; this.cancel(); await tail; sessions.clear(); },
  };
}
