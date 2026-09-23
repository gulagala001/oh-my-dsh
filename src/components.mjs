import { installBrowser } from '#opencu/src/computer-use/browser-install.mjs';

const CU_FIELDS = ['computerUseEnabled', 'computerUseBrowserExecutable', 'computerUseChromeUserDataDir', 'computerUseNativeBinary', 'computerUseNativeSocket'];

/** Setup uses the component owners; it does not create another CU/CodeGraph runtime. */
export class Components {
  constructor(ctx, hub, computer) {
    this.ctx = ctx; this.hub = hub; this.computer = computer;
    this.operations = new Map(); this.records = new Map(); this.controller = new AbortController();
    this.automatic = hub.config().componentAutoSetup !== false;
    this.computerEnabled = computer.config().computerUseEnabled !== false;
    const configuration = () => JSON.stringify([hub.config().codegraphEnabled, hub.config().componentAutoSetup, computer.config().computerUseEnabled]);
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
    const manager = this.computer.computerUse, config = this.computer.config();
    const tasks = [];
    const include = id => (!only || only === id) && (!automatic || !this.records.has(id));
    if (include('codegraph') && this.hub.config().codegraphEnabled !== false) tasks.push(this.run('codegraph', async () => {
      await this.hub.codegraph.prepare({ allowDownload: true });
      if (only || this.hub.codegraph.catalogError) this.hub.codegraph.retryCatalog();
      for (const [path, state] of this.hub.codegraph.projects) if (state.status === 'error') this.project(path, { retry: true });
    }));
    if (config.computerUseEnabled !== false) {
      if (include('browser')) tasks.push(this.run('browser', () => typeof manager.installBrowser === 'function'
        ? manager.installBrowser({ signal: this.controller.signal })
        : installBrowser({ executablePath: manager.browser.executablePath, signal: this.controller.signal })));
      if (include('native') && manager.native.supported()) tasks.push(this.run('native', async () => {
        // User-supplied runtimes belong to their owner; do not overwrite them.
        if (config.computerUseNativeBinary || config.computerUseNativeSocket) {
          if (!manager.native.available()) throw new Error('自定义桌面控制程序不可用，请检查高级设置。');
          return;
        }
        if (!manager.native.available() || only === 'native') await manager.installNative();
        else await manager.native.permissions('component-setup');
      }));
      if (include('extension')) tasks.push(this.run('extension', async () => {
        const current = await manager.extensionInstaller.status(manager.extensionHub.list());
        if (current.supported && !current.prepared) await manager.installExtension();
      }));
    }
    await Promise.all(tasks);
  }
  project(cwd, { retry = false } = {}) {
    if (this.hub.config().codegraphEnabled === false || this.closed) return;
    void this.hub.codegraph.ensureProject(cwd, { retry }).catch(() => {}); // The components page retains the actionable failure.
  }
  reconfigure() {
    if (this.writingSettings) return Promise.resolve();
    return this.configuring = (this.configuring || Promise.resolve()).catch(() => {}).then(async () => {
      if (this.closed) return;
      const automatic = this.hub.config().componentAutoSetup !== false;
      const computerEnabled = this.computer.config().computerUseEnabled !== false;
      const newlyEnabled = [
        ...(!this.hub.codegraph.enabled && this.hub.config().codegraphEnabled !== false ? ['codegraph'] : []),
        ...(!this.computerEnabled && computerEnabled ? ['browser', 'native', 'extension'] : []),
        ...(!this.automatic && automatic ? ['codegraph', 'browser', 'native', 'extension'] : []),
      ];
      for (const id of newlyEnabled) if (!this.operations.has(id)) this.records.delete(id);
      this.automatic = automatic; this.computerEnabled = computerEnabled;
      this.hub.codegraph.autoInstall = this.hub.config().componentAutoSetup !== false;
      await this.hub.codegraph.setEnabled(this.hub.config().codegraphEnabled !== false);
      await this.computer.configuring;
      this.start();
      if (this.hub.config().codegraphEnabled !== false) for (const agent of this.hub.agents.values()) {
        const preset = this.ctx.sessionProjections?.stateOf(agent.session, 'agentPreset') ?? agent.session.header.agentPreset;
        if (['trisoul-x', 'omd-ptc'].includes(preset)) this.project(agent.session.header.cwd);
      }
    });
  }
  async status() {
    let setup, error;
    try { setup = await this.computer.computerUse.setupStatus(); } catch (e) { error = e.message; }
    const config = this.computer.config();
    return { automatic: this.hub.config().componentAutoSetup !== false,
      codegraph: { ...this.hub.codegraph.status(), operation: this.records.get('codegraph') },
      computerUse: { enabled: config.computerUseEnabled !== false, setup, error,
        operations: Object.fromEntries([...this.records].filter(([key]) => key !== 'codegraph')),
        paths: Object.fromEntries(CU_FIELDS.filter(key => key !== 'computerUseEnabled').map(key => [key, config[key] || ''])) } };
  }
  async settings(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象');
    const own = {}, cu = {};
    for (const [key, value] of Object.entries(patch)) {
      if (['codegraphEnabled', 'componentAutoSetup', 'computerUseEnabled'].includes(key)) {
        if (typeof value !== 'boolean') throw new Error('组件开关必须为开或关');
      } else if (!CU_FIELDS.includes(key) || typeof value !== 'string') throw new Error('未知的组件设置');
      (CU_FIELDS.includes(key) ? cu : own)[key] = value;
    }
    if (!Object.keys(own).length && !Object.keys(cu).length) return this.configuring;
    return this.saving = (this.saving || Promise.resolve()).catch(() => {}).then(async () => {
      this.writingSettings = true;
      try {
        const standalone = this.ctx.settings.describe().some(entry => entry.ns === 'opencu');
        if (!standalone) Object.assign(own, cu);
        if (Object.keys(own).length) await this.ctx.settings.update('trisoul-x', own);
        if (standalone && Object.keys(cu).length) await this.ctx.settings.update('opencu', cu);
      } finally {
        this.writingSettings = false;
        await this.reconfigure();
      }
    });
  }
  close() { this.closed = true; this.controller.abort(new Error('组件准备已停止')); }
}

export function mountComponents(ctx, components) {
  ctx.inject(['webServer', 'connection'], scope => scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/trisoul-x/components', async handler(req, res) {
    const denied = scope.connection.requestRejection(req);
    if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
    const send = (status, body) => { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'POST') {
        let raw = ''; for await (const part of req) { raw += part; if (Buffer.byteLength(raw) > 65536) throw new Error('设置内容过长'); }
        const input = JSON.parse(raw || '{}');
        if (input.action === 'settings') await components.settings(input.patch);
        else if (input.action === 'prepare' && (!input.component || ['codegraph', 'browser', 'native', 'extension'].includes(input.component))) void components.prepare(input.component);
        else if (input.action === 'index' && components.hub.codegraph.projects.has(input.path)) components.project(input.path, { retry: true });
        else if (input.action === 'permissions') await components.computer.computerUse.native.showSetup();
        else throw new Error('未知的组件操作');
      } else if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
      send(200, await components.status());
    } catch (error) { send(400, { error: error.message }); }
  } })));
}
