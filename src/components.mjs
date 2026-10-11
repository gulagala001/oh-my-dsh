import { readJsonBody, sendJson } from './http.mjs';
import { existsSync } from 'node:fs';
import { currentDirectory } from './working-directory.mjs';

const CU_FIELDS = ['computerUseEnabled', 'computerUseBrowserExecutable', 'computerUseChromeUserDataDir', 'computerUseNativeBinary', 'computerUseNativeSocket'];
const CU_PATH_FIELDS = CU_FIELDS.filter(key => key !== 'computerUseEnabled');
const pathsOf = config => Object.fromEntries(CU_PATH_FIELDS.map(key => [key, config[key] || '']));

/** Setup uses the component owners; it does not create another CU/CodeGraph runtime. */
export class Components {
  constructor(ctx, hub, computer) {
    this.ctx = ctx; this.hub = hub; this.computer = computer;
    this.operations = new Map(); this.records = new Map(); this.controller = new AbortController();
    this.automatic = hub.config().componentAutoSetup !== false;
    this.computerEnabled = computer.config().computerUseEnabled !== false;
    this.runtimePaths = pathsOf(computer.config());
    const configuration = () => JSON.stringify([hub.config().codegraphEnabled, hub.config().componentAutoSetup, ...CU_FIELDS.map(key => computer.config()[key])]);
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
      .then(async result => {
        this.controller.signal.throwIfAborted();
        if (id !== 'codegraph') await this.computerReady();
        state.status = result?.status || 'ready';
      })
      .catch(error => { state.status = this.controller.signal.aborted ? 'stopped' : 'error'; state.error = error.message; })
      .finally(() => { this.operations.delete(id); });
    this.operations.set(id, pending); return pending;
  }
  start() {
    if (!this.closed && this.hub.config().componentAutoSetup !== false) void this.prepare(undefined, { automatic: true }).catch(error => this.ctx.logger.warn(error.message));
  }
  pathsChanged() {
    return CU_PATH_FIELDS.some(key => this.runtimePaths[key] !== (this.computer.config()[key] || ''));
  }
  async computerReady() {
    await this.computer.configuring;
    this.controller.signal.throwIfAborted();
    if (this.computer.config().computerUseEnabled === false || this.computer.computerUse.enabled === false) throw new Error('Computer Use 已关闭');
    if (this.pathsChanged()) throw new Error('自定义路径已变更，请重启服务后准备组件。');
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
      if (include('browser')) tasks.push(this.run('browser', async () => {
        await this.computerReady();
        const executable = await manager.installBrowser({ signal: this.controller.signal });
        if (typeof executable !== 'string' || !existsSync(executable)) throw new Error('浏览器准备结束，但没有可用的运行程序，请重新准备。');
      }));
      if (include('native') && manager.native.supported()) tasks.push(this.run('native', async () => {
        await this.computerReady();
        // User-supplied runtimes belong to their owner; do not overwrite them.
        const custom = this.runtimePaths.computerUseNativeBinary || this.runtimePaths.computerUseNativeSocket;
        let installed = manager.native.available();
        let current = installed ? await manager.native.installationStatus() : {};
        const needsUpdate = current.updateAvailable || current.restartRequired || current.repairRequired;
        if (custom && !installed) throw new Error('自定义桌面控制程序不可用，请检查高级设置。');
        if (needsUpdate && (custom || automatic)) throw new Error(custom ? '自定义桌面控制程序需要更新或重启，请由该程序的维护方处理。' : '桌面控制程序需要更新或重启，请点击“更新或修复”。');
        if (!installed || needsUpdate || (!automatic && only === 'native' && !custom)) {
          await manager.installNative();
          await this.computerReady();
          installed = manager.native.available();
          if (!installed) throw new Error('桌面控制准备结束，但没有可用的运行程序，请重新准备。');
          current = await manager.native.installationStatus();
          if (current.updateAvailable || current.restartRequired || current.repairRequired) throw new Error('桌面控制准备后仍需要更新或修复，请重新检查运行环境。');
        }
        const permissions = await manager.native.permissions('component-setup');
        const ready = permissions?.platform === 'win32' ? permissions.interactive && permissions.capture_supported : permissions?.accessibility && permissions?.screen_recording;
        return { status: ready ? 'ready' : 'permissions-required' };
      }));
      if (include('extension')) tasks.push(this.run('extension', async () => {
        await this.computerReady();
        const current = await manager.extensionInstaller.status(manager.extensionHub.list());
        if (!current.supported) return { status: 'unsupported' };
        if (current.prepared !== true) await manager.installExtension({ takeover: !automatic });
        const prepared = await manager.extensionInstaller.status(manager.extensionHub.list());
        if (prepared.prepared !== true) throw new Error(prepared.error || 'Chrome 连接程序尚未准备完成，请重试。');
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
      await (this.computer.configuring ?? this.computer.refresh?.());
      this.start();
      if (this.hub.config().codegraphEnabled !== false) for (const agent of this.hub.agents.values()) {
        const preset = this.ctx.sessionProjections?.stateOf(agent.session, 'agentPreset') ?? agent.session.header.agentPreset;
        if (['trisoul-x', 'omd-ptc'].includes(preset)) this.project(currentDirectory(this.ctx, agent.session));
      }
    });
  }
  async status() {
    let setup, error;
    try { await this.configuring; await this.computer.configuring; } catch (e) { error = e.message; }
    try { setup = await this.computer.computerUse.setupStatus(); } catch (e) { error = [error, e.message].filter(Boolean).join('；'); }
    const config = this.computer.config();
    const operations = Object.fromEntries([...this.records].filter(([key]) => key !== 'codegraph').map(([id, record]) => {
      if (record.status === 'preparing' || record.status === 'stopped' || record.status === 'unsupported') return [id, { ...record }];
      const installed = id === 'browser' ? setup?.browser?.installed : id === 'native' ? setup?.native?.installed : setup?.extension?.installation?.prepared;
      let status = record.status, operationError = record.error;
      if (installed !== true) {
        if (!operationError) status = installed === false ? 'pending' : 'unknown';
      }
      else if (id === 'native') {
        const native = setup.native;
        if (native.error || native.updateAvailable || native.restartRequired || native.repairRequired) status = 'update-required';
        else {
          status = (native.platform === 'win32' ? native.interactive && native.captureSupported : native.accessibility && native.screenRecording) ? 'ready' : 'permissions-required';
          operationError = null;
        }
      }
      else if (!(id === 'browser' ? setup.browser.error : setup.extension.error || setup.extension.installation.error)) { status = 'ready'; operationError = null; }
      return [id, { ...record, status, error: operationError }];
    }));
    return { automatic: this.hub.config().componentAutoSetup !== false,
      codegraph: { ...this.hub.codegraph.status(), operation: this.records.get('codegraph') },
      computerUse: { enabled: config.computerUseEnabled !== false, setup, error,
        settingsNamespace: this.computerSettingsNamespace(), restartRequired: this.pathsChanged(),
        operations,
        paths: pathsOf(config) } };
  }
  computerSettingsNamespace() {
    const standalone = [...(this.computer.owners?.values() || [])].some(owner => owner.namespace === 'opencu')
      || this.ctx.get?.('configEditor')?.configuration().some(row => row.entry.options.id === 'opencu' && !row.entry.disabled)
      || (!this.computer.owners && this.ctx.settings.describe().some(entry => entry.ns === 'opencu'));
    return standalone ? 'opencu' : 'trisoul-x';
  }
  async permissions() {
    await this.computerReady();
    if (!this.computer.computerUse.native.available()) throw new Error('请先安装桌面控制程序。');
    await this.computer.computerUse.native.showSetup();
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
        const standalone = this.computerSettingsNamespace() === 'opencu';
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
    const send = (status, body) => sendJson(res, status, body);
    try {
      if (req.method === 'POST') {
        const input = await readJsonBody(req, { maxBytes: 65536 });
        if (input.action === 'settings') await components.settings(input.patch);
        else if (input.action === 'prepare' && (!input.component || ['codegraph', 'browser', 'native', 'extension'].includes(input.component))) void components.prepare(input.component).catch(error => scope.logger.warn(error.message));
        else if (input.action === 'index' && components.hub.codegraph.projects.has(input.path)) components.project(input.path, { retry: true });
        else if (input.action === 'permissions') await components.permissions();
        else throw new Error('未知的组件操作');
      } else if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
      send(200, await components.status());
    } catch (error) { send(error.statusCode || 400, { error: error.message }); }
  } })));
}
