import { readJsonBody } from './http.mjs';
import { randomUUID } from 'node:crypto';
import { recommendedPlugins } from './recommended-plugin-catalog.mjs';
import { compareVersions, parseVersion } from './version.mjs';

export const AUTO_UPDATE_INTERVAL = 6 * 60 * 60 * 1000;
export function pluginManagementError(error) {
  if (error?.code === 'incompatible-version') {
    const versions = (error.incompatible || []).map(item => `${item.name} ${item.version} 不兼容 DSH ${item.runtimeVersion}`).join('；');
    return `${versions || '插件版本与当前 DSH 不兼容'}。请安装适配版本，或到宿主“插件”页面查看详情`;
  }
  return error?.diagnostic || error?.code || '';
}
export function pluginInstallSpec(plugin, version) {
  parseVersion(version);
  return plugin.githubRelease
    ? `https://github.com/${plugin.githubRelease}/releases/download/v${version}/${plugin.packageName}-${version}.tgz`
    : `${plugin.packageName}@${version}`;
}
export async function latestPluginVersion(plugin, signal) {
  const response = await fetch(plugin.githubRelease ? `https://api.github.com/repos/${plugin.githubRelease}/releases/latest` : `https://registry.npmjs.org/${encodeURIComponent(plugin.packageName)}/latest`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw Error(`查询最新版本失败（HTTP ${response.status}）`);
  const parts = []; let bytes = 0;
  for await (const part of response.body) {
    bytes += part.length; if (bytes > 512 * 1024) throw Error('插件版本信息过大'); parts.push(part);
  }
  const manifest = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (plugin.githubRelease) {
    const version = manifest.tag_name?.replace(/^v/, '');
    parseVersion(version);
    if (manifest.draft || manifest.prerelease || !manifest.assets?.some(asset => asset.browser_download_url === pluginInstallSpec(plugin, version)))
      throw Error('GitHub Release 缺少预期的 DSH 插件安装包');
    return version;
  }
  if (manifest.name !== plugin.packageName || !manifest.dsh?.bundle?.patch) throw Error('该包不是预期的 DSH 插件');
  parseVersion(manifest.version);
  return manifest.version;
}

export class RecommendedPluginManager {
  constructor({ manager, getConfig, saveConfig, isRunning = () => false, catalog = recommendedPlugins, latest = latestPluginVersion, now = Date.now }) {
    Object.assign(this, { manager, getConfig, saveConfig, isRunning, catalog, latest, now });
    this.records = new Map(); this.job = null; this.current = null; this.checkedAt = null; this.closed = false;
    this.abort = new AbortController();
  }
  async status() {
    const bundles = await this.manager.listBundles();
    return { autoUpdate: this.getConfig().recommendedPluginsAutoUpdate === true, checkedAt: this.checkedAt, busy: this.current,
      plugins: this.catalog.map(plugin => {
        const bundle = bundles.find(item => item.name === plugin.packageName);
        return { id: plugin.id, installed: !!bundle?.installed, enabled: !!bundle?.enabled, removable: !!bundle?.removable && !bundle?.readOnlyReason,
          version: bundle?.version || null, ...this.records.get(plugin.id),
          ...(bundle?.error ? this.current?.id === plugin.id
            ? { inventoryWarning: pluginManagementError(bundle.error) }
            : { error: this.records.get(plugin.id)?.error || pluginManagementError(bundle.error) } : {}) };
      }) };
  }
  async settings(value) {
    if (typeof value !== 'boolean') throw Error('自动更新开关必须为开或关');
    await this.saveConfig({ recommendedPluginsAutoUpdate: value });
  }
  start(id, action, automatic = false) {
    const plugin = this.catalog.find(item => item.id === id);
    if (!plugin || !['install', 'update', 'uninstall'].includes(action)) throw Error('未知的插件操作');
    if (plugin.manualInstall) throw Error(plugin.manualInstall);
    if (this.closed) throw Error('插件管理已停止');
    if (this.job) throw Error('另一个插件操作正在进行，请稍候');
    this.current = { id, action, automatic, startedAt: this.now(), requestId: randomUUID() };
    this.records.set(id, { ...this.records.get(id), message: '', error: '', pendingBuilds: [] });
    this.job = this.run(plugin, action, automatic).catch(error => {
      this.records.set(id, { ...this.records.get(id), error: error.message, message: '' });
    }).finally(() => { this.current = null; this.job = null; });
    return this.job;
  }
  async run(plugin, action, automatic) {
    let bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
    this.abort.signal.throwIfAborted();
    if (action === 'install' && bundle?.installed) throw Error('插件已经安装，请使用更新');
    if (action !== 'install' && !bundle?.installed) throw Error('插件尚未安装');
    if (bundle?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
    let result;
    if (action === 'uninstall') {
      if (!bundle.removable) throw Error('此插件无法卸载');
      result = await this.manager.removeBundle(plugin.packageName);
    } else {
      // An approved catalog entry is a tested version, not permission to follow latest.
      const version = plugin.review?.version ?? await this.latest(plugin, this.abort.signal);
      parseVersion(version);
      this.records.set(plugin.id, { ...this.records.get(plugin.id), latestVersion: version, checkedAt: this.now() });
      // Re-read after the lookup: the user or another manager may have changed
      // the installation or disabled automatic updates while it was pending.
      bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
      this.abort.signal.throwIfAborted();
      if (automatic && (!plugin.review?.version || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning() || !bundle?.installed || !bundle.enabled)) return;
      if (action === 'install' && bundle?.installed) throw Error('插件已经安装，请使用更新');
      if (bundle?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
      if (action === 'update' && !bundle?.installed) throw Error('插件已被卸载');
      if (action === 'update' && bundle.version && compareVersions(version, bundle.version) <= 0) {
        this.records.set(plugin.id, { ...this.records.get(plugin.id), message: plugin.review ? (bundle.version === version ? '已是核验版本' : '当前版本高于核验版本，未降级') : '已是最新版本', error: '' }); return;
      }
      result = await this.manager.installBundle(pluginInstallSpec(plugin, version), { enabled: action === 'install' ? true : bundle.enabled, requestId: this.current.requestId });
    }
    if (result.application === 'failed') {
      const pending = result.pendingBuilds || [];
      this.records.set(plugin.id, { ...this.records.get(plugin.id), pendingBuilds: pending });
      const message = result.error?.code === 'incompatible-version' ? pluginManagementError(result.error)
        : result.error?.diagnostic || result.packageResult?.output || result.error?.code || '插件操作失败';
      throw Error(pending.length ? `安装脚本需要授权，请到宿主“插件”页面处理：${pending.join('、')}` : message.slice(-2000));
    }
    if (result.application === 'cancelled') throw Error('操作已取消');
    if (result.application === 'overridden') throw Error('插件配置被其他配置覆盖，请到宿主“插件”页面检查');
    if (!['applied', 'restart-required'].includes(result.application)) throw Error('未能确认插件操作结果，请到宿主“插件”页面检查');
    const restartRequired = result.application === 'restart-required';
    this.records.set(plugin.id, { ...this.records.get(plugin.id), restartRequired, error: '',
      message: (action === 'uninstall' ? '已卸载' : action === 'update' ? '更新已完成' : '安装已完成') + (restartRequired ? '，重启 DSH 后生效' : ''),
    });
  }
  async tick() {
    if (this.closed || this.job || this.checking || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning()
      || this.checkedAt != null && this.now() - this.checkedAt < AUTO_UPDATE_INTERVAL) return;
    this.checking = true;
    try {
      const bundles = await this.manager.listBundles();
      for (const plugin of this.catalog) {
        if (this.closed || this.job || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning()) return;
        const bundle = bundles.find(item => item.name === plugin.packageName);
        if (plugin.review?.version && !plugin.manualInstall && bundle?.installed && bundle.enabled && !bundle.readOnlyReason) await this.start(plugin.id, 'update', true);
      }
      if (!this.closed && this.getConfig().recommendedPluginsAutoUpdate && !this.isRunning()) this.checkedAt = this.now();
    } finally { this.checking = false; }
  }
  close() {
    this.closed = true; this.abort.abort();
    if (this.current?.action !== 'uninstall' && this.current?.requestId) void this.manager.cancelInstall(this.current.requestId).catch(() => {});
  }
}

export function mountRecommendedPlugins(ctx, hub) {
  ctx.inject(['pluginManager', 'webServer', 'connection'], scope => {
    const service = new RecommendedPluginManager({ manager: scope.pluginManager, getConfig: () => hub.config(),
      saveConfig: patch => scope.settings.update('trisoul-x', patch), isRunning: () => scope.agents.list().some(agent => agent.status === 'running') });
    scope.effect(() => {
      const tick = () => { void service.tick().catch(error => scope.logger.warn(error.message)); };
      const timer = setInterval(tick, 60000); timer.unref();
      return () => { clearInterval(timer); service.close(); };
    });
    scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/trisoul-x/recommended-plugins', async handler(req, res) {
      const denied = scope.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
      const send = (status, data) => { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(status === 413 || status === 408 ? { Connection: 'close' } : {}) }); res.end(JSON.stringify(data)); };
      if (new URL(req.url, 'http://localhost').pathname !== '/trisoul-x/recommended-plugins') { send(404, { error: 'Not found' }); return; }
      try {
        if (req.method === 'POST') {
          const input = await readJsonBody(req, { maxBytes: 8192 });
          if (input.action === 'settings') await service.settings(input.autoUpdate);
          else void service.start(input.id, input.action);
        } else if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
        send(200, await service.status());
      } catch (error) { send(error.statusCode || 400, { error: error.message }); }
    } }));
  });
}
