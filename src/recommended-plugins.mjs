import { readJsonBody, sendJson } from './http.mjs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { recommendedPlugins, resolveRecommendedPlugin } from './recommended-plugin-catalog.mjs';
import { prepareReviewedPackage } from './recommended-plugin-package.mjs';
import { compareVersions, parseVersion, releaseHostVersion, INSTALLED_VERSION } from './version.mjs';

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
  if (plugin.review?.releaseTag && version !== plugin.review.version) throw Error("桥接发行包需要固定核验版本");
  if (plugin.hostBuilds && (!plugin.review || plugin.unavailable || !/^[a-f0-9]{64}$/.test(plugin.review.sha256 ?? ''))) throw Error('对应宿主的固定核验构建尚未就绪');
  const source = plugin.review?.source;
  if (source) {
    if (version !== plugin.review.version || !/^[\w.-]+\/[\w.-]+$/.test(source.repository)
      || !/^[a-f0-9]{40}$/.test(source.commit) || !/^[a-f0-9]{64}$/.test(plugin.review.sha256))
      throw Error('已核验源码快照需要固定提交、对应版本及 SHA-256');
    return `https://codeload.github.com/${source.repository}/tar.gz/${source.commit}`;
  }
  if (plugin.githubRelease) return `https://github.com/${plugin.githubRelease}/releases/download/${plugin.review?.releaseTag || 'v' + version}/${plugin.review?.asset || plugin.packageName + '-' + version + '.tgz'}`;
  if (plugin.review?.sha256) {
    if (version !== plugin.review.version || !/^[a-f0-9]{64}$/.test(plugin.review.sha256)
      || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(plugin.packageName))
      throw Error('已核验 npm 安装包需要固定包名、版本及 SHA-256');
    const basename = plugin.packageName.split('/').at(-1);
    return `https://registry.npmjs.org/${plugin.packageName}/-/${basename}-${version}.tgz`;
  }
  return `${plugin.packageName}@${version}`;
}
export async function latestPluginVersion(plugin, signal) {
  const response = await fetch(plugin.githubRelease ? `https://api.github.com/repos/${plugin.githubRelease}/releases/${plugin.review?.releaseTag ? 'tags/' + encodeURIComponent(plugin.review.releaseTag) : 'latest'}` : `https://registry.npmjs.org/${encodeURIComponent(plugin.packageName)}/latest`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw Error(`查询最新版本失败（HTTP ${response.status}）`);
  }
  const parts = []; let bytes = 0;
  for await (const part of response.body) {
    bytes += part.length; if (bytes > 512 * 1024) throw Error('插件版本信息过大'); parts.push(part);
  }
  const manifest = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (plugin.githubRelease) {
    const version = plugin.review?.releaseTag ? plugin.review.version : manifest.tag_name?.replace(/^v/, '');
    if (plugin.review?.releaseTag && manifest.tag_name !== plugin.review.releaseTag) throw Error('GitHub Release 与固定桥接版本不一致');
    parseVersion(version);
    const reviewedPrerelease = plugin.review?.allowPrerelease === true && plugin.review.releaseTag === 'v' + version && /^[a-f0-9]{64}$/.test(plugin.review.sha256 ?? '');
    if (manifest.draft || (manifest.prerelease && !reviewedPrerelease) || !manifest.assets?.some(asset => asset.browser_download_url === pluginInstallSpec(plugin, version)))
      throw Error('GitHub Release 缺少预期的 DSH 插件安装包');
    return version;
  }
  if (manifest.name !== plugin.packageName || !manifest.dsh?.bundle?.patch) throw Error('该包不是预期的 DSH 插件');
  parseVersion(manifest.version);
  return manifest.version;
}

export class RecommendedPluginManager {
  constructor({ manager, getConfig, saveConfig, packageDirectory, preparePackage = prepareReviewedPackage, isRunning = () => false, catalog = recommendedPlugins, latest = latestPluginVersion, now = Date.now, hostVersion = releaseHostVersion(INSTALLED_VERSION), getHostVersion }) {
    Object.assign(this, { manager, getConfig, saveConfig, packageDirectory, preparePackage, isRunning, catalog, latest, now, hostVersion, getHostVersion });
    this.hostResolved = !getHostVersion;
    this.records = new Map(); this.job = null; this.current = null; this.checkedAt = null; this.closed = false;
    this.abort = new AbortController();
  }
  async refreshHost() {
    if (this.getHostVersion) { this.hostVersion = await this.getHostVersion(); this.hostResolved = true; }
  }
  unavailable(plugin) {
    plugin = resolveRecommendedPlugin(plugin, this.hostVersion);
    return plugin.unavailable && (!plugin.unavailableHosts || plugin.unavailableHosts.includes(this.hostVersion)) ? plugin.unavailable : null;
  }
  async status() {
    if (this.getHostVersion) await this.refreshHost();
    const bundles = await this.manager.listBundles();
    return { autoUpdate: this.getConfig().recommendedPluginsAutoUpdate === true, checkedAt: this.checkedAt, busy: this.current,
      plugins: this.catalog.map(plugin => {
        plugin = resolveRecommendedPlugin(plugin, this.hostVersion);
        const bundle = bundles.find(item => item.name === plugin.packageName);
        const record = this.records.get(plugin.id);
        const needsBuildSwitch = !!plugin.hostBuilds && !!bundle?.installed && !!bundle.version && !!plugin.review && bundle.version !== plugin.review.version && !bundle.version.startsWith(this.hostVersion + '.iui.');
        return { id: plugin.id, installed: !!bundle?.installed, enabled: !!bundle?.enabled, removable: !!bundle?.removable && !bundle?.readOnlyReason, unavailable: this.unavailable(plugin),
          version: bundle?.version || null, ...record,
          ...(plugin.hostBuilds ? { hostVersion: this.hostVersion, review: plugin.review ?? null, expectedVersion: plugin.review?.version ?? null, needsBuildSwitch,
            ...(needsBuildSwitch && !record?.error ? { message: `当前安装包面向其他宿主，请点“更新”换成 DSH ${this.hostVersion} 对应的 ${plugin.review.version}；界面状态数据将保留。` } : {}) } : {}),
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
    const entry = this.catalog.find(item => item.id === id);
    const plugin = entry && resolveRecommendedPlugin(entry, this.hostVersion);
    if (!plugin || !['install', 'update', 'uninstall'].includes(action)) throw Error('未知的插件操作');
    if (plugin.manualInstall) throw Error(plugin.manualInstall);
    const unavailable = this.unavailable(plugin);
    if (unavailable && action !== 'uninstall' && (!entry.hostBuilds || this.hostResolved)) throw Error(unavailable);
    if (this.closed) throw Error('插件管理已停止');
    if (this.job) throw Error('另一个插件操作正在进行，请稍候');
    this.current = { id, action, automatic, startedAt: this.now(), requestId: randomUUID() };
    this.records.set(id, { ...this.records.get(id), message: '', error: '', pendingBuilds: [] });
    this.job = this.run(entry, action, automatic).catch(error => {
      this.records.set(id, { ...this.records.get(id), error: error.message, message: '' });
    }).finally(() => { this.current = null; this.job = null; });
    return this.job;
  }
  async run(plugin, action, automatic) {
    const entry = plugin;
    if (this.getHostVersion) await this.refreshHost();
    const operationHost = this.hostVersion;
    plugin = resolveRecommendedPlugin(entry, operationHost);
    if (action !== 'uninstall' && this.unavailable(plugin)) throw Error(this.unavailable(plugin));
    let bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
    this.abort.signal.throwIfAborted();
    if (action === 'install' && bundle?.installed) throw Error('插件已经安装，请使用更新');
    if (action !== 'install' && !bundle?.installed) throw Error('插件尚未安装');
    if (bundle?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
    let result, version;
    if (action === 'uninstall') {
      if (!bundle.removable) throw Error('此插件无法卸载');
      result = await this.manager.removeBundle(plugin.packageName);
    } else {
      // An approved catalog entry is a tested version, not permission to follow latest.
      version = plugin.review?.version ?? await this.latest(plugin, this.abort.signal);
      parseVersion(version);
      this.records.set(plugin.id, { ...this.records.get(plugin.id), latestVersion: version, checkedAt: this.now() });
      // Decide before fetching an archive, then recheck after any download so
      // concurrent host changes or opt-out cannot be overwritten by stale state.
      const installable = current => {
        this.abort.signal.throwIfAborted();
        if (automatic && (!plugin.review?.version || plugin.review.source || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning() || !current?.installed || !current.enabled)) return false;
        if (action === 'install' && current?.installed) throw Error('插件已经安装，请使用更新');
        if (current?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
        if (action === 'update' && !current?.installed) throw Error('插件已被卸载');
        const comparison = action === 'update' && current?.version ? compareVersions(version, current.version) : null;
        // A reviewed fork may retain the upstream base version with an -omd
        // suffix. SemVer ranks that below upstream's stable release, so allow
        // only the catalog's exact, SHA-pinned migration to the fixed fork.
        const reviewedForkMigration = typeof plugin.review?.upstreamVersion === 'string'
          && current?.version === plugin.review.upstreamVersion
          && version === plugin.review?.version && plugin.githubRelease
          && plugin.review?.releaseTag === 'v' + version && /^[a-f0-9]{64}$/.test(plugin.review?.sha256 || '')
          && version.startsWith(current.version + '-omd.');
        const reviewedBuildMigration = !!plugin.hostBuilds && plugin.review?.dsh === this.hostVersion && /^[a-f0-9]{64}$/.test(plugin.review?.sha256 ?? '')
          && Object.entries(plugin.hostBuilds).some(([host, build]) => host !== this.hostVersion && build.version === current?.version);
        if (automatic && plugin.hostBuilds && current?.version && !current.version.startsWith(this.hostVersion + '.iui.')) { this.records.set(plugin.id, { ...this.records.get(plugin.id), message: '宿主已变更，请手动更新为对应核验构建；界面状态数据将保留。', error: '' }); return false; }
        if (comparison !== null && ((comparison < 0 && !reviewedForkMigration && !reviewedBuildMigration) || (comparison === 0 && !plugin.review?.source && this.records.get(plugin.id)?.failedInstallVersion !== version))) {
          this.records.set(plugin.id, { ...this.records.get(plugin.id), message: plugin.review ? (current.version === version ? '已是核验版本' : '当前版本高于核验版本，未降级') : '已是最新版本', error: '' });
          return false;
        }
        return true;
      };
      bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
      if (!installable(bundle)) return;
      let spec = pluginInstallSpec(plugin, version);
      if (plugin.review?.sha256) {
        spec = await this.preparePackage(spec, plugin.review.sha256, this.packageDirectory, this.abort.signal);
        if (this.getHostVersion) await this.refreshHost();
        if (plugin.hostBuilds && this.hostVersion !== operationHost) throw Error('宿主版本在下载安装包期间改变，请重新更新以选择对应核验构建');
        bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
        if (!installable(bundle)) return;
        // Naming the archive lets the host identify unchanged dependencies on
        // activation retries and explicit source-snapshot reinstallation.
        spec = `${plugin.packageName}@${spec}`;
      }
      result = await this.manager.installBundle(spec, { enabled: action === 'install' ? true : bundle.enabled, requestId: this.current.requestId });
    }
    if (result.application === 'failed') {
      const pending = result.pendingBuilds || [];
      this.records.set(plugin.id, { ...this.records.get(plugin.id), pendingBuilds: pending,
        ...(action !== 'uninstall' && result.stage === 'enable' && result.bundle === plugin.packageName ? { failedInstallVersion: version } : {}),
      });
      const message = result.error?.code === 'incompatible-version' ? pluginManagementError(result.error)
        : result.error?.diagnostic || result.packageResult?.output || result.error?.code || '插件操作失败';
      throw Error(pending.length ? `安装脚本需要授权，请到宿主“插件”页面处理：${pending.join('、')}` : message.slice(-2000));
    }
    if (result.application === 'cancelled') throw Error('操作已取消');
    if (result.application === 'overridden') throw Error('插件配置被其他配置覆盖，请到宿主“插件”页面检查');
    if (!['applied', 'restart-required'].includes(result.application)) throw Error('未能确认插件操作结果，请到宿主“插件”页面检查');
    const restartRequired = result.application === 'restart-required';
    this.records.set(plugin.id, { ...this.records.get(plugin.id), failedInstallVersion: undefined, restartRequired, error: '',
      message: (action === 'uninstall' ? '已卸载' : action === 'update' ? '更新已完成' : '安装已完成') + (restartRequired ? '，重启 DSH 后生效' : ''),
    });
  }
  async tick() {
    if (this.closed || this.job || this.checking || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning()
      || this.checkedAt != null && this.now() - this.checkedAt < AUTO_UPDATE_INTERVAL) return;
    this.checking = true;
    try {
      if (this.getHostVersion) await this.refreshHost();
      const bundles = await this.manager.listBundles();
      for (const entry of this.catalog) {
        const plugin = resolveRecommendedPlugin(entry, this.hostVersion);
        if (this.closed || this.job || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning()) return;
        const bundle = bundles.find(item => item.name === plugin.packageName);
        if (plugin.review?.version && !plugin.review.source && !plugin.manualInstall && !this.unavailable(plugin) && bundle?.installed && bundle.enabled && !bundle.readOnlyReason) await this.start(plugin.id, 'update', true);
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
      packageDirectory: resolve(hub.store.dir, 'recommended-packages'),
      getHostVersion: () => actualHostVersion(scope),
      saveConfig: patch => scope.settings.update('trisoul-x', patch), isRunning: () => scope.agents.list().some(agent => agent.status === 'running') });
    scope.effect(() => {
      const tick = () => { void service.tick().catch(error => scope.logger.warn(error.message)); };
      const timer = setInterval(tick, 60000); timer.unref();
      return () => { clearInterval(timer); service.close(); };
    });
    scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/trisoul-x/recommended-plugins', async handler(req, res) {
      const denied = scope.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
      const send = (status, data) => sendJson(res, status, data);
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

export async function actualHostVersion(ctx) {
  const loader = ctx.get('loader')?.internal;
  if (!loader || !ctx.baseUrl) return null;
  try {
    const specifier = '@deepseek-ai/dsh/package.json';
    const result = loader.version === 'v2' ? loader.resolveSync(ctx.baseUrl, { specifier, attributes: {} }) : loader.resolveSync(specifier, ctx.baseUrl, {});
    const manifest = JSON.parse(await readFile(new URL(result.url), 'utf8'));
    if (manifest.name !== '@deepseek-ai/dsh') return null;
    parseVersion(manifest.version); return manifest.version;
  } catch { return null; }
}
