import { readJsonBody, sendJson } from './http.mjs';
import { currentDirectory } from './working-directory.mjs';

/** CodeGraph owns preparation; OpenCU owns its separate capability settings. */
export class Components {
  constructor(ctx, hub) {
    this.ctx = ctx; this.hub = hub;
    this.operations = new Map(); this.records = new Map(); this.roots = new Map(); this.controller = new AbortController();
    this.automatic = hub.config().componentAutoSetup !== false;
    const configuration = () => JSON.stringify([hub.config().codegraphEnabled, hub.config().componentAutoSetup]);
    let previous = configuration();
    ctx.on('app-boot/config-reload', () => {
      const next = configuration();
      if (next === previous) return;
      previous = next;
      return this.reconfigure().catch(error => ctx.logger.warn(error.message));
    }, { global: true });
  }
  async run(id, action) {
    if (this.operations.has(id)) return this.operations.get(id);
    const state = { status: 'preparing', error: null }; this.records.set(id, state);
    const pending = Promise.resolve().then(() => { this.controller.signal.throwIfAborted(); return action(); })
      .then(() => { state.status = 'ready'; }, error => { state.status = 'error'; state.error = error.message; })
      .finally(() => { this.operations.delete(id); });
    this.operations.set(id, pending); return pending;
  }
  start() {
    if (!this.closed && this.hub.config().componentAutoSetup !== false) void this.prepare(undefined, { automatic: true });
  }
  async prepare(only, { automatic = false } = {}) {
    if (this.closed) return;
    if ((!only || only === 'codegraph') && (!automatic || !this.records.has('codegraph')) && this.hub.config().codegraphEnabled !== false) {
      await this.run('codegraph', async () => {
        await this.hub.codegraph.prepare({ allowDownload: true });
        if (only || this.hub.codegraph.catalogError) this.hub.codegraph.retryCatalog();
        for (const [path, state] of this.hub.codegraph.projects) if (state.status === 'error') this.project(path, { retry: true });
      });
    }
  }
  project(cwd, { retry = false } = {}) {
    if (this.hub.config().codegraphEnabled === false || this.closed) return;
    // Every request names its cwd; skip path resolution while that root stays ready.
    if (!retry && this.hub.codegraph.projects?.get(this.roots.get(cwd))?.status === 'ready') return;
    void this.hub.codegraph.ensureProject(cwd, { retry }).then(root => { this.roots.set(cwd, root); }, () => {}); // The components page retains the actionable failure.
  }
  reconfigure() {
    if (this.writingSettings) return Promise.resolve();
    return this.configuring = (this.configuring || Promise.resolve()).catch(() => {}).then(async () => {
      if (this.closed) return;
      const automatic = this.hub.config().componentAutoSetup !== false;
      if ((!this.hub.codegraph.enabled && this.hub.config().codegraphEnabled !== false || !this.automatic && automatic) && !this.operations.has('codegraph')) this.records.delete('codegraph');
      this.automatic = automatic;
      this.hub.codegraph.autoInstall = automatic;
      await this.hub.codegraph.setEnabled(this.hub.config().codegraphEnabled !== false);
      if (this.closed) return;
      this.start();
      if (this.hub.config().codegraphEnabled !== false) for (const agent of this.hub.agents.values()) {
        const preset = this.ctx.sessionProjections?.stateOf(agent.session, 'agentPreset') ?? agent.session.header.agentPreset;
        if (['trisoul-x', 'omd-ptc'].includes(preset)) this.project(currentDirectory(this.ctx, agent.session));
      }
    });
  }
  async status() {
    return { automatic: this.hub.config().componentAutoSetup !== false,
      codegraph: { ...this.hub.codegraph.status(), operation: this.records.get('codegraph') } };
  }
  async settings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象');
    for (const [key, value] of Object.entries(patch)) {
      if (!['codegraphEnabled', 'componentAutoSetup'].includes(key)) throw new Error('未知的组件设置');
      if (typeof value !== 'boolean') throw new Error('组件开关必须为开或关');
    }
    if (this.closed) throw new Error('组件准备已停止');
    if (!Object.keys(patch).length) return this.configuring;
    return this.saving = (this.saving || Promise.resolve()).catch(() => {}).then(async () => {
      this.writingSettings = true;
      try { await this.ctx.settings.update('trisoul-x', patch); }
      finally { this.writingSettings = false; await this.reconfigure(); }
    });
  }
  async close() {
    this.closed = true; this.controller.abort(new Error('组件准备已停止'));
    await Promise.allSettled([this.saving, this.configuring, ...this.operations.values()]);
  }
}

export function mountComponents(ctx, components) {
  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/trisoul-x/components', async handler(req, res) {
    const denied = scope.connection.requestRejection(req);
    if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
    const send = (status, body) => sendJson(res, status, body);
    try {
      if (req.method === 'POST') {
        const input = await readJsonBody(req, { maxBytes: 65536 });
        if (input.action === 'settings') await components.settings(input.patch);
        else if (input.action === 'prepare' && (!input.component || input.component === 'codegraph')) void components.prepare(input.component);
        else if (input.action === 'index' && components.hub.codegraph.projects.has(input.path)) components.project(input.path, { retry: true });
        else throw new Error('未知的组件操作');
      } else if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
      send(200, await components.status());
    } catch (error) { send(error.statusCode || 400, { error: error.message }); }
  } })));
}
