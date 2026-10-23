import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { symbols } from '@deepseek-ai/cordis';
import { runProbe, sweep } from './process.mjs';
import { LIMITS, packageDigest, profileStamp, problem, redact, repairPrompt } from './shared.mjs';
import { readJsonBody, rejectUntrusted, sendJson } from '../http.mjs';

const TRANSACTION = Symbol.for('omd.plugin-preflight.transaction.v1');
const untrace = value => value?.[symbols.original] || value;
const unavailable = code => /unavailable|timeout|resource|preparation|cleanup|environment|ENOENT|ENOMEM/.test(code || '');
const cancelled = target => ({ application: 'cancelled', changed: false, stage: 'install', target });
function readBounded(read, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => { clearTimeout(timer); signal.removeEventListener('abort', abort); callback(value); };
    const abort = () => finish(reject, signal.reason);
    const timer = setTimeout(() => finish(reject, problem('environment-timeout', '当前宿主状态读取超时，预检未完成')), 10000);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(read).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

// Callers which retire the old bundle before installing can include that step
// in the protected continuation. Others use the native methods unchanged.
export function withPluginPreflight(manager, spec, options, perform) {
  return manager[TRANSACTION] ? manager[TRANSACTION](spec, options, perform) : perform();
}

export class PluginPreflight {
  constructor({ manager, profile, directory, getEnabled, getEntryStates = () => [], probe = runProbe, hostVersion, cli }) {
    Object.assign(this, { manager: untrace(manager), profile, directory, getEnabled, getEntryStates, probe, hostVersion, cli });
    this.local = new AsyncLocalStorage(); this.listeners = new Set(); this.restores = []; this.queue = [];
    this.state = { active: false }; this.closed = false;
  }
  snapshot() { return { enabled: this.getEnabled(), ...this.state }; }
  publish(patch) {
    this.state = patch;
    for (const listener of this.listeners) { try { listener(this.snapshot()); } catch {} }
  }
  subscribe(listener) { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  wrap(key, factory) {
    const original = this.manager[key], descriptor = Object.getOwnPropertyDescriptor(this.manager, key);
    if (typeof key === 'string' && typeof original !== 'function') return;
    const wrapped = factory(original);
    Object.defineProperty(this.manager, key, { configurable: true, writable: true, value: wrapped });
    this.restores.push(() => {
      if (this.manager[key] !== wrapped) return;
      if (descriptor) Object.defineProperty(this.manager, key, descriptor); else delete this.manager[key];
    });
  }
  bind() {
    const self = this;
    this.wrap(TRANSACTION, () => (spec, options, perform) => self.run('install', spec, options || {}, perform));
    this.wrap('installBundle', original => function (spec, options = {}) {
      const invoke = () => original.call(this, self.local.getStore()?.checked?.installSpec || spec, options);
      return self.run('install', spec, options, invoke);
    });
    this.wrap('setBundleEnabled', original => function (name, enabled) {
      return enabled ? self.run('enable', name, {}, () => original.call(this, name, enabled), { bundle: name }) : original.call(this, name, enabled);
    });
    this.wrap('setPluginEnabled', original => function (id, enabled) {
      if (!enabled) return original.call(this, id, enabled);
      return self.run('entry', id, {}, () => original.call(this, id, enabled), { entry: id });
    });
    this.wrap('cancelInstall', original => async function (requestId) {
      const queued = self.queue.find(job => job.requestId === requestId);
      if (queued) {
        self.queue.splice(self.queue.indexOf(queued), 1); queued.resolve(cancelled(queued.target));
        return { status: 'cancelled' };
      }
      const job = self.job;
      if (job && job.requestId === requestId && job.phase !== 'applying') {
        job.abort.abort(problem('cancelled', '安装已取消')); job.decision?.(false);
        await job.promise; return { status: 'cancelled' };
      }
      return original.call(this, requestId);
    });
    this.wrap('waitForInstall', original => function (requestId) {
      return self.job?.requestId === requestId ? self.job.promise
        : self.queue.find(job => job.requestId === requestId)?.promise ?? original.call(this, requestId);
    });
    // Check the payload the native installer actually produced before it can
    // activate it. This catches mutable URLs/local packages changing in flight.
    this.wrap('runPnpm', original => async function (args, ...rest) {
      const result = await original.call(this, args, ...rest), job = self.local.getStore();
      if (args[0] !== 'add' || result.exitCode !== 0 || !job?.checked?.identity || job.forced) return result;
      const actual = await packageDigest(join(self.profile.dir, 'node_modules', job.checked.identity.name));
      if (actual.digest === job.checked.identity.digest) return result;
      return { ...result, exitCode: 1, output: '安装内容与预检内容发生变化，未启用插件；请重新安装并检查。' };
    });
    return this;
  }
  run(action, target, options, perform, extra = {}) {
    // A later plugin may retain one of our wrappers. Once disposed, that
    // retained function must behave exactly like the original native method.
    if (this.closed) return perform();
    const inherited = this.local.getStore();
    if (inherited && inherited.target === target && action === 'install') return perform();
    if (action === 'install' && (typeof target !== 'string' || !target.trim() || target.startsWith('-'))) return perform();
    if (!this.getEnabled()) return perform();
    if (inherited || this.queue.length >= 16) return Promise.resolve({ application: 'failed', changed: false, stage: action === 'install' ? 'install' : 'enable', target,
      error: { code: 'operation-error', diagnostic: inherited ? '不能在当前安装事务中嵌套安装另一插件' : '插件安装队列已满，请稍后重试。' } });
    const job = { id: randomUUID(), action, target, requestId: options.requestId, phase: 'preparation', abort: new AbortController(), options, perform, extra };
    job.promise = new Promise(resolve => { job.resolve = resolve; });
    if (this.job) this.queue.push(job); else this.start(job);
    return job.promise;
  }
  start(job) {
    this.job = job;
    void Promise.resolve().then(() => {
      if (this.closed || job.abort.signal.aborted) return cancelled(job.target);
      if (this.getEnabled()) return this.execute(job, job.options, job.perform, job.extra);
      job.phase = 'applying'; return job.perform();
    }).then(job.resolve,
      error => job.resolve({ application: 'failed', changed: false, stage: 'install', target: job.target,
        error: { code: 'operation-error', diagnostic: redact(error.message) } })).finally(() => {
      if (this.job === job) { this.job = null; this.publish({ active: false }); }
      if (!this.closed && this.queue.length) this.start(this.queue.shift());
    });
  }
  async execute(job, options, perform, extra) {
    const state = phase => ({ active: true, id: job.id, action: job.action, target: redact(job.target), hostVersion: this.hostVersion, phase });
    this.publish(state('正在准备插件安装预检'));
    try {
      let stamp;
      try {
        if (!this.cli || typeof this.manager.runPnpm !== 'function') throw problem('host-unavailable', '当前宿主没有匹配的安装预检入口，预检未完成');
        const read = task => readBounded(task, job.abort.signal);
        stamp = await read(() => profileStamp(this.profile));
        if (extra.entry) {
          const row = (await read(() => this.manager.listPlugins())).find(row => row.entryId === extra.entry);
          if (!row) throw problem('environment-unavailable', '找不到待启用的插件入口');
          const owners = (await read(() => this.manager.listBundles())).filter(bundle => bundle.rows?.some(entry => entry.entryId === extra.entry));
          extra = { bundle: owners.length === 1 ? owners[0].name : undefined, entryId: row.patchId };
          if (!extra.bundle) throw problem('environment-unavailable', '此独立配置入口尚不能建立隔离预检，请检查来源后选择是否继续');
        }
        job.checked = await this.probe({ profile: this.profile, cli: this.cli, hostVersion: this.hostVersion, action: job.action,
          target: job.target, options, ...extra, entryStates: await read(() => this.getEntryStates()), userHome: homedir(), localAppData: process.env.LOCALAPPDATA,
          packageEnvironment: {
            ...Object.fromEntries(['PNPM_HOME', 'COREPACK_HOME', 'npm_config_cache', 'NPM_CONFIG_CACHE'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
            XDG_DATA_HOME: process.env.XDG_DATA_HOME || join(homedir(), process.platform === 'darwin' ? 'Library' : '.local/share'),
            ...(process.env.LOCALAPPDATA ? { LOCALAPPDATA: process.env.LOCALAPPDATA } : {}),
          },
        }, {
          directory: this.directory, signal: job.abort.signal, progress: phase => this.publish(state(phase)),
        });
        job.abort.signal.throwIfAborted();
        if (await read(() => profileStamp(this.profile)) !== stamp) throw problem('environment-changed', '预检期间安装环境发生变化，请重新操作以检查当前组合');
      } catch (error) {
        if (job.abort.signal.aborted || this.closed) return cancelled(job.target);
        const failure = { kind: unavailable(error.code) ? 'unavailable' : 'failed', code: error.code || 'probe-failed',
          message: redact(error.message), details: redact(error.details || error.stack) };
        const view = { ...state(this.state.phase), failure };
        job.phase = 'decision';
        const approved = new Promise(resolve => { job.decision = resolve; });
        this.publish({ ...view, phase: 'decision', failedPhase: view.phase, canContinue: error.code !== 'cleanup-failed', repair: repairPrompt(view) });
        const timer = setTimeout(() => job.decision?.(false), LIMITS.decisionMs);
        const onAbort = () => job.decision?.(false); job.abort.signal.addEventListener('abort', onAbort, { once: true });
        let proceed;
        try { proceed = await approved; }
        finally { clearTimeout(timer); job.abort.signal.removeEventListener('abort', onAbort); job.decision = undefined; }
        if (!proceed || job.abort.signal.aborted || this.closed) return cancelled(job.target);
        // Permission applies only to this retained request, not other versions.
        job.forced = true; job.checked = undefined;
      }
      job.abort.signal.throwIfAborted();
      job.phase = 'applying'; this.publish({ ...state('applying'), active: false });
      return await this.local.run(job, perform);
    } catch (error) {
      if (job.abort.signal.aborted) return cancelled(job.target);
      return { application: 'failed', changed: false, stage: 'install', target: job.target,
        error: { code: 'operation-error', diagnostic: redact(error.message) } };
    }
  }
  decide(id, choice) {
    if (!this.job || this.job.id !== id || this.job.phase !== 'decision' || !this.job.decision || !['continue', 'cancel'].includes(choice)
      || choice === 'continue' && this.state.canContinue === false)
      throw Object.assign(problem('stale-decision', '这次安装已经结束或发生变化，请重新操作'), { statusCode: 409 });
    const decide = this.job.decision; this.job.decision = undefined; decide(choice === 'continue');
  }
  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.resolve(cancelled(job.target));
    for (const restore of this.restores.reverse()) restore(); this.restores = [];
    // Await cleanup before disposing, but never wait on the native HMR operation
    // which may itself be disposing this OMD instance during its own update.
    if (this.job && this.job.phase !== 'applying') {
      this.job.abort.abort(problem('cancelled', '插件预检已停止')); this.job.decision?.(false);
      await this.job.promise;
    }
    this.listeners.clear();
  }
}

export function mountPluginPreflight(ctx, hub) {
  if (process.env.OMD_PLUGIN_PREFLIGHT === '1') return;
  ctx.inject(['pluginManager', 'profileContext', 'webServer', 'connection'], scope => {
    const profile = scope.profileContext;
    let cli, hostVersion = 'unknown';
    try {
      const req = createRequire(profile.installAnchor);
      hostVersion = createRequire(import.meta.url)('node:fs').readFileSync(req.resolve('@deepseek-ai/dsh-app-boot/package.json'), 'utf8');
      hostVersion = JSON.parse(hostVersion).version;
      try {
        cli = join(dirname(req.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js');
        if (/[\\/]app\.asar[\\/]/.test(cli)) cli = join(dirname(req.resolve('@deepseek-ai/dsh-desktop-host/package.json')), 'lib/cli.js');
      } catch { cli = join(dirname(req.resolve('@deepseek-ai/dsh-desktop-host/package.json')), 'lib/cli.js'); }
    } catch { /* The control stays available; an install reports the missing capability. */ }
    const service = new PluginPreflight({ manager: scope.pluginManager, profile, cli,
      hostVersion,
      directory: join(hub.store.dir, 'plugin-preflight'), getEnabled: () => hub.config().pluginPreflightEnabled !== false,
      getEntryStates: async () => (await scope.pluginManager.listPlugins()).filter(row => typeof row.patchId === 'string' && !row.enabled)
        .map(row => ({ id: row.patchId, disabled: true })),
    }).bind();
    const streams = new Set();
    scope.effect(() => {
      void sweep(service.directory).catch(error => scope.logger.warn('预检临时目录清理未完成：%s', error.message));
      return () => { for (const close of [...streams]) close(); return service.close(); };
    });
    scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/oh-my-dsh/plugin-preflight', async handler(req, res) {
      if (rejectUntrusted(scope, req, res)) return;
      const url = new URL(req.url, 'http://localhost');
      try {
        if (url.pathname === '/oh-my-dsh/plugin-preflight/events' && req.method === 'GET') {
          if (service.listeners.size >= 16) { sendJson(res, 429, { error: '预检状态连接过多' }); return; }
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          const off = service.subscribe(state => { if (!res.destroyed) res.write('data: ' + JSON.stringify(state) + '\n\n'); });
          const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 25000); heartbeat.unref?.();
          const close = () => { clearInterval(heartbeat); off(); streams.delete(close); if (!res.writableEnded) res.end(); };
          streams.add(close); res.once('close', close);
          return;
        }
        if (url.pathname !== '/oh-my-dsh/plugin-preflight') { sendJson(res, 404, { error: 'Not found' }); return; }
        if (req.method === 'POST') { const { id, choice } = await readJsonBody(req, { maxBytes: 1024 }); service.decide(id, choice); }
        else if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
        sendJson(res, 200, service.snapshot());
      } catch (error) { sendJson(res, error.statusCode || 400, { error: error.message }); }
    } }));
  });
}
