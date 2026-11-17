import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Context, symbols } from '@deepseek-ai/cordis';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';

const originalOf = service => service?.[symbols.original] ?? service;
const closedError = () => Object.assign(Error('侧栏聊天已关闭，请重新打开。'), { statusCode: 410 });

/** Route explicitly owned sessions through the native backend in a disposable
 * directory. Ordinary sessions never move, and all storage semantics stay native. */
export class TemporarySessionStorage {
  constructor(ctx, directory, cleanup) {
    this.ctx = ctx; this.directory = directory; this.cleanup = cleanup; this.owners = new Map(); this.active = new Set(); this.restores = [];
    const storage = originalOf(ctx.sessionPersistence), agents = originalOf(ctx.agents), ownerOf = id => this.owners.get(id);
    const track = (owner, operation) => {
      const pending = Promise.resolve().then(operation);
      owner.pending.add(pending);
      void pending.then(() => owner.pending.delete(pending), () => owner.pending.delete(pending));
      return pending;
    };
    this.wrap(storage, 'create', original => function(header, options) {
      const owner = ownerOf(header.id) ?? ownerOf(header.parentSession);
      if (!owner) return original.call(this, header, options);
      if (owner.closing) return Promise.reject(closedError());
      // Registered before awaiting the backend: descendants cannot escape on a race.
      owner.register(header.id);
      return track(owner, () => owner.ready.then(() => owner.backend.sessionPersistence.create(header, options)));
    });
    for (const method of ['open', 'stat']) this.wrap(storage, method, original => function(id, ...args) {
      const owner = ownerOf(id);
      if (!owner) return original.call(this, id, ...args);
      if (owner.closing) return method === 'stat' ? Promise.resolve(undefined) : Promise.reject(closedError());
      return track(owner, () => owner.ready.then(() => owner.backend.sessionPersistence[method](id, ...args)));
    });
    const active = this.active;
    this.wrap(storage, 'list', original => async function(...args) {
      const lists = await Promise.all([original.apply(this, args), ...[...active].filter(owner => !owner.closing)
        .map(owner => track(owner, () => owner.ready.then(() => owner.backend.sessionPersistence.list(...args))))]);
      return lists.flat();
    });
    this.wrap(storage, 'flush', original => async function(...args) {
      const results = await Promise.allSettled([original.apply(this, args), ...[...active].filter(owner => !owner.closing)
        .map(owner => track(owner, () => owner.ready.then(() => owner.backend.sessionPersistence.flush(...args))))]);
      const errors = results.filter(row => row.status === 'rejected').map(row => row.reason);
      if (errors.length) throw new AggregateError(errors, '临时会话写入失败');
    });
    // Native descendants and resumed agents finish before their records go.
    for (const method of ['create', 'resume']) this.wrap(agents, method, original => function(options) {
      const id = method === 'create' ? options.sessionId : options.resumeSessionId;
      const owner = ownerOf(id) ?? ownerOf(options.meta?.parentSession);
      if (!owner) return original.call(this, options);
      if (owner.closing) return Promise.reject(closedError());
      owner.register(id);
      return track(owner, async () => {
        const signal = AbortSignal.any([owner.abort.signal, ...(options.signal ? [options.signal] : [])]);
        const handle = await original.call(this, { ...options, signal });
        owner.handles.add(handle); return handle;
      });
    });
    // The independent native backend outlives the agents during plugin unload.
    // Forward only its own sessions through the backend's public event contract.
    this.listeners = [ctx.on('session/event', (session, event) => ownerOf(session.id)?.backend.emit('session/event', session, event), { global: true }),
      ctx.on('session/flush', session => ownerOf(session.id)?.backend.parallel('session/flush', session), { global: true }),
      ctx.on('session/disposed', session => ownerOf(session.id)?.backend.emit('session/disposed', session), { global: true })];
  }
  wrap(service, name, factory) {
    const descriptor = Object.getOwnPropertyDescriptor(service, name), original = service[name], wrapped = factory(original);
    service[name] = wrapped;
    this.restores.push(() => { if (service[name] === wrapped) { if (descriptor) Object.defineProperty(service, name, descriptor); else delete service[name]; } });
  }
  create(id) {
    const owner = { backend: new Context(), abort: new AbortController(), ids: new Set([id]), handles: new Set(), pending: new Set(), closing: false, closed: false };
    owner.register = id => { owner.ids.add(id); this.owners.set(id, owner); };
    owner.register(id); this.active.add(owner);
    owner.ready = (async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      owner.path = await mkdtemp(join(this.directory, 'chat-'));
      await owner.backend.plugin(Jsonl, { root: owner.path, compression: 'none' });
    })();
    return owner;
  }
  async close(owner) {
    if (owner.closed) return;
    if (owner.cleanup) return owner.cleanup;
    owner.closing = true; owner.abort.abort(closedError());
    owner.cleanup = (async () => {
      await owner.ready.catch(() => {});
      while (owner.pending.size) await Promise.allSettled([...owner.pending]);
      for (const handle of [...owner.handles].reverse()) { await handle.dispose(); owner.handles.delete(handle); }
      await this.cleanup?.([...owner.ids]);
      await owner.backend.fiber.dispose();
      if (owner.path) await rm(owner.path, { recursive: true, force: true });
      owner.closed = true; this.active.delete(owner);
      // Keep only tombstones to reject late child creation; retain no transcripts.
      owner.backend = { emit() {}, parallel() {} };
    })();
    try { await owner.cleanup; } finally { owner.cleanup = null; }
  }
  async dispose() {
    const results = await Promise.allSettled([...this.active].map(owner => this.close(owner)));
    const errors = results.filter(row => row.status === 'rejected').map(row => row.reason);
    if (errors.length) throw new AggregateError(errors, '侧栏会话退出清理失败');
    for (const off of this.listeners) off();
    for (const restore of this.restores.reverse()) restore();
    this.owners.clear();
  }
}
