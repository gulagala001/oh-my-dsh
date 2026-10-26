import { readJsonBody, sendJson } from './http.mjs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { recommendedPlugins, resolveRecommendedPlugin } from './recommended-plugin-catalog.mjs';
import { prepareReviewedPackage } from './recommended-plugin-package.mjs';
import { compareVersions, parseVersion, releaseHostVersion, INSTALLED_VERSION } from './version.mjs';
import { pluginManagementError, requirePluginChange } from './plugin-operation.mjs';
import { withPluginPreflight } from './plugin-preflight/service.mjs';

export const AUTO_UPDATE_INTERVAL = 6 * 60 * 60 * 1000;
function reviewedMigration(plugin, currentVersion, hostVersion, automatic = false) {
  const review = plugin.review;
  if (!review || !/^[a-f0-9]{64}$/.test(review.sha256 ?? '')) return false;
  const fork = typeof review.upstreamVersion === 'string' && currentVersion === review.upstreamVersion && plugin.githubRelease
    && review.releaseTag === 'v' + (review.releaseVersion || review.version)
    && (review.version.startsWith(currentVersion + '-omd.') || !automatic && plugin.requireReviewedVersion && plugin.hostBuilds && review.dsh === hostVersion);
  const build = plugin.hostBuilds && review.dsh === hostVersion
    && [...Object.entries(plugin.historicalHostBuilds ?? {}), ...Object.entries(plugin.hostBuilds)]
      .some(([host, value]) => host !== hostVersion && value.version === currentVersion);
  return Boolean(fork || build);
}

function reviewedUpdateAvailable(plugin, bundle, hostVersion) {
  if (!bundle?.installed || bundle.readOnlyReason || !bundle.version || !plugin.review) return false;
  try { return compareVersions(plugin.review.version, bundle.version) > 0 || reviewedMigration(plugin, bundle.version, hostVersion); }
  catch { return false; }
}

export function pluginInstallSpec(plugin, version) {
  if (plugin.bundled) throw Error('内置插件随 OMD 管理，请通过 OMD 更新');
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
  if (plugin.bundled) throw Error('内置插件随 OMD 管理，不查询独立发行版本');
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
    const reviewedPrerelease = plugin.review?.allowPrerelease === true && plugin.review.releaseTag === 'v' + (plugin.review.releaseVersion || version) && /^[a-f0-9]{64}$/.test(plugin.review.sha256 ?? '');
    if (manifest.draft || (manifest.prerelease && !reviewedPrerelease) || !manifest.assets?.some(asset => asset.browser_download_url === pluginInstallSpec(plugin, version)))
      throw Error('GitHub Release 缺少预期的 DSH 插件安装包');
    return version;
  }
  if (manifest.name !== plugin.packageName || !manifest.dsh?.bundle?.patch) throw Error('该包不是预期的 DSH 插件');
  parseVersion(manifest.version);
  return manifest.version;
}

export class RecommendedPluginManager {
  constructor({ manager, getConfig, saveConfig, packageDirectory, preparePackage = prepareReviewedPackage, isRunning = () => false, catalog = recommendedPlugins, latest = latestPluginVersion, now = Date.now, hostVersion = releaseHostVersion(INSTALLED_VERSION), getHostVersion, getBundledPluginState = () => ({}) }) {
    Object.assign(this, { manager, getConfig, saveConfig, packageDirectory, preparePackage, isRunning, catalog, latest, now, hostVersion, getHostVersion, getBundledPluginState });
    this.hostResolved = !getHostVersion;
    this.records = new Map(); this.job = null; this.current = null; this.checkedAt = null; this.closed = false;
    this.abort = new AbortController();
  }
  async refreshHost() {
    if (this.getHostVersion) { this.hostVersion = await this.getHostVersion(); this.hostResolved = true; }
  }
  unavailable(plugin) {
    plugin = resolveRecommendedPlugin(plugin, this.hostVersion);
    if (plugin.unavailable && plugin.unavailableHosts && !this.hostVersion) return '未能核实当前 DSH 完整版本，暂不提供安装或更新。已有安装仍可卸载。';
    if (plugin.unavailable && (!plugin.unavailableHosts || plugin.unavailableHosts.includes(this.hostVersion))) return plugin.unavailable;
    if (plugin.supportedRuntimeTargets && !plugin.supportedRuntimeTargets.includes(`${process.platform}-${process.arch}`))
      return `此插件没有当前平台 ${process.platform}-${process.arch} 的原生运行时。支持：${plugin.supportedRuntimeTargets.join('、')}。已有安装仍可卸载。`;
    return null;
  }
  async status() {
    if (this.getHostVersion) await this.refreshHost();
    const bundles = await this.manager.listBundles();
    const entries = this.catalog.some(plugin => plugin.bundled) ? await this.manager.listPlugins() : [];
    return { autoUpdate: this.getConfig().recommendedPluginsAutoUpdate === true, checkedAt: this.checkedAt, busy: this.current, updating: this.checking === true,
      plugins: this.catalog.map(plugin => {
        plugin = resolveRecommendedPlugin(plugin, this.hostVersion);
        if (plugin.bundled) {
          const rows = entries.filter(row => row.moduleName === plugin.moduleName);
          const row = rows.length === 1 ? rows[0] : undefined;
          const enabled = row?.enabled === true;
          return { id: plugin.id, bundled: true, installed: true, enabled, active: row?.fiberPhase === 'active', removable: false, version: plugin.version ?? null,
            ...this.records.get(plugin.id),
            readOnly: !row || !!row.readOnlyReason,
            unavailable: !row ? '未找到可管理的功能入口，请重新读取状态。' : row.readOnlyReason ? '此功能由宿主配置管理。' : null,
            ...(!enabled && this.getBundledPluginState(plugin)?.enabled === true && !this.records.get(plugin.id)?.restartRequired
              ? { message: '内置入口已关闭，独立安装仍在提供此功能。' } : {}),
          };
        }
        const bundle = bundles.find(item => item.name === plugin.packageName);
        const record = this.records.get(plugin.id);
        const installed = !!bundle?.installed || bundle?.availability === 'installation';
        const needsBuildSwitch = !!plugin.hostBuilds && installed && !!bundle.version && !!plugin.review && !bundle.version.startsWith(this.hostVersion + '.' + (plugin.versionSuffix || 'iui') + '.');
        return { id: plugin.id, installed, enabled: !!bundle?.enabled, readOnly: !!bundle?.readOnlyReason, removable: !!bundle?.removable && !bundle?.readOnlyReason, unavailable: this.unavailable(plugin),
          version: bundle?.version || null, ...record,
          expectedVersion: plugin.review?.version ?? null,
          updateAvailable: !this.unavailable(plugin) && reviewedUpdateAvailable(plugin, bundle, this.hostVersion),
          ...(plugin.hostBuilds ? { hostVersion: this.hostVersion, review: plugin.review ?? null, expectedVersion: plugin.review?.version ?? null, needsBuildSwitch,
            ...(needsBuildSwitch && !record?.error ? { message: this.unavailable(plugin)
              ? '当前安装包面向其他宿主，安装与更新暂未开放；已有界面状态数据将保留。'
              : `当前安装包面向其他宿主，请点“更新”换成 DSH ${this.hostVersion} 对应的 ${plugin.review.version}；界面状态数据将保留。` } : {}) } : {}),
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
    if (!plugin || !['install', 'update', 'uninstall', 'enable', 'disable'].includes(action)) throw Error('未知的插件操作');
    if (plugin.bundled && !['enable', 'disable'].includes(action)) throw Error('内置功能随 OMD 更新');
    if (plugin.manualInstall && !['enable', 'disable', 'uninstall'].includes(action)) throw Error(plugin.manualInstall);
    const unavailable = this.unavailable(plugin);
    if (unavailable && ['install', 'update'].includes(action) && (this.hostResolved || entry.unavailable && !entry.unavailableHosts)) throw Error(unavailable);
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
    if (plugin.bundled) {
      const rows = (await this.manager.listPlugins()).filter(row => row.moduleName === plugin.moduleName);
      if (rows.length !== 1 || rows[0].readOnlyReason) throw Error('未找到可修改的功能入口，请到宿主“插件”页面检查');
      this.abort.signal.throwIfAborted();
      return this.finish(plugin, action, await this.manager.setPluginEnabled(rows[0].entryId, action === 'enable'));
    }
    const entry = plugin;
    if (this.getHostVersion) await this.refreshHost();
    const operationHost = this.hostVersion;
    plugin = resolveRecommendedPlugin(entry, operationHost);
    let bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
    this.abort.signal.throwIfAborted();
    const present = !!bundle?.installed || bundle?.availability === 'installation';
    if (['enable', 'disable'].includes(action)) {
      if (bundle?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
      if (action === 'enable' && plugin.requireReviewedVersion) {
        if (this.unavailable(plugin)) throw Error(this.unavailable(plugin));
        if (present && bundle.version !== plugin.review?.version) throw Error('当前安装版本不在兼容目录中，请先切换到当前宿主的固定版本；目录未登记的外部新版可卸载后重新开启。');
      }
      if (present) return this.finish(plugin, action, await this.manager.setBundleEnabled(plugin.packageName, action === 'enable'));
      if (action === 'disable') return this.finish(plugin, action, { application: 'applied' });
      // Enabling an absent feature is one operation: download, install and activate.
      action = 'install';
    }
    if (action !== 'uninstall' && (plugin.manualInstall || this.unavailable(plugin))) throw Error(plugin.manualInstall || this.unavailable(plugin));
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
      // The same admission rule applies before preparation and immediately
      // before mutation, including time spent queued or awaiting a decision.
      const installable = current => {
        this.abort.signal.throwIfAborted();
        if (plugin.hostBuilds && this.hostVersion !== operationHost) throw Error('宿主版本在准备安装期间改变，请重新更新以选择对应核验构建');
        if (this.unavailable(entry)) throw Error(this.unavailable(entry));
        if (automatic && (!plugin.review?.version || plugin.review.source || !this.getConfig().recommendedPluginsAutoUpdate || this.isRunning() || !current?.installed || !current.enabled)) return false;
        if (action === 'install' && current?.installed) throw Error('插件已经安装，请使用更新');
        if (current?.readOnlyReason) throw Error('此插件由宿主管理，无法在这里修改');
        if (action === 'update' && !current?.installed) throw Error('插件已被卸载');
        const comparison = action === 'update' && current?.version ? compareVersions(version, current.version) : null;
        // A reviewed fork may retain the upstream base version with an -omd
        // suffix. SemVer ranks that below upstream's stable release, so allow
        // only the catalog's exact, SHA-pinned migration to the fixed fork.
        const reviewedMigrationAllowed = version === plugin.review?.version && reviewedMigration(plugin, current?.version, this.hostVersion, automatic);
        if (automatic && plugin.hostBuilds && current?.version && !current.version.startsWith(this.hostVersion + '.' + (plugin.versionSuffix || 'iui') + '.')) { this.records.set(plugin.id, { ...this.records.get(plugin.id), message: '宿主已变更，请手动更新为对应核验构建；界面状态数据将保留。', error: '' }); return false; }
        if (comparison !== null && ((comparison < 0 && !reviewedMigrationAllowed) || (comparison === 0 && !plugin.review?.source && this.records.get(plugin.id)?.failedInstallVersion !== version))) {
          this.records.set(plugin.id, { ...this.records.get(plugin.id), message: plugin.review ? (current.version === version ? '已是核验版本' : '当前版本高于核验版本，未降级') : '已是最新版本', error: '' });
          return false;
        }
        return true;
      };
      const refreshCandidate = async () => {
        if (this.getHostVersion) await this.refreshHost();
        bundle = (await this.manager.listBundles()).find(item => item.name === plugin.packageName);
        return installable(bundle);
      };
      if (!await refreshCandidate()) return;
      let spec = pluginInstallSpec(plugin, version);
      if (plugin.review?.sha256) {
        spec = await this.preparePackage(spec, plugin.review.sha256, this.packageDirectory, this.abort.signal);
        if (!await refreshCandidate()) return;
        // Naming the archive lets the host identify unchanged dependencies on
        // activation retries and explicit source-snapshot reinstallation.
        spec = `${plugin.packageName}@${spec}`;
      }
      const options = { enabled: action === 'install' ? true : bundle.enabled, requestId: this.current.requestId };
      const preparedVersion = bundle?.version;
      const skipped = { application: 'cancelled', changed: false, stage: 'install', target: spec };
      result = await withPluginPreflight(this.manager, spec, options, async () => {
        if (!await refreshCandidate()) return skipped;
        if (action === 'update' && (bundle.version !== preparedVersion || bundle.enabled !== options.enabled))
          throw Error('插件安装版本或启用状态在预检期间改变，请重新操作以保留当前选择');
        if (action === 'update') {
          // Retire the old bundle only after the candidate passed preflight.
          // A running bundle without HMR stays until the required restart.
          const removed = await this.manager.removeBundle(plugin.packageName);
          if (removed.error?.code !== 'stop-profile' && !['applied', 'restart-required'].includes(removed.application)) return removed;
        }
        this.abort.signal.throwIfAborted();
        return this.manager.installBundle(spec, options);
      });
      // An intentional skip must not hide a missing native acknowledgement.
      if (result === skipped) return;
    }
    this.finish(plugin, action, result, version);
  }
  finish(plugin, action, result, version) {
    if (result?.application === 'failed') {
      const pending = result.pendingBuilds || [];
      this.records.set(plugin.id, { ...this.records.get(plugin.id), pendingBuilds: pending,
        ...(version && result.stage === 'enable' && result.bundle === plugin.packageName ? { failedInstallVersion: version } : {}),
      });
    }
    const restartRequired = requirePluginChange(result) === 'restart-required';
    this.records.set(plugin.id, { ...this.records.get(plugin.id), failedInstallVersion: undefined, restartRequired, error: '',
      message: ({ uninstall: '已卸载', update: '更新已完成', install: '已安装并启用', enable: '已开启', disable: '已关闭' }[action]) + (restartRequired ? '，重启 DSH 后生效' : ''),
    });
  }
  async tick() { return this.updateAll({ manual: false }); }
  // Automatic checks follow the opt-in, interval and idle gates. A manual
  // request checks now; both skip bundled, manual, unavailable and inactive rows.
  async updateAll({ manual = false } = {}) {
    const allowed = () => !this.closed && !this.job && (manual || this.getConfig().recommendedPluginsAutoUpdate && !this.isRunning());
    if (this.checking || !allowed() || !manual && this.checkedAt != null && this.now() - this.checkedAt < AUTO_UPDATE_INTERVAL) return;
    this.checking = true;
    try {
      if (this.getHostVersion) await this.refreshHost();
      const bundles = await this.manager.listBundles();
      for (const entry of this.catalog) {
        if (entry.bundled) continue;
        const plugin = resolveRecommendedPlugin(entry, this.hostVersion);
        if (!allowed()) return;
        const bundle = bundles.find(item => item.name === plugin.packageName);
        if (plugin.review?.version && !plugin.review.source && !plugin.manualInstall && !this.unavailable(plugin) && bundle?.installed && bundle.enabled && !bundle.readOnlyReason) await this.start(plugin.id, 'update', !manual);
      }
      if (!this.closed && (manual || this.getConfig().recommendedPluginsAutoUpdate && !this.isRunning())) this.checkedAt = this.now();
    } finally { this.checking = false; }
  }
  close() {
    this.closed = true; this.abort.abort();
    if (['install', 'enable', 'update'].includes(this.current?.action) && this.current?.requestId) void this.manager.cancelInstall(this.current.requestId).catch(() => {});
  }
}

export function mountRecommendedPlugins(ctx, hub) {
  ctx.inject(['pluginManager', 'webServer', 'connection'], scope => {
    const service = new RecommendedPluginManager({ manager: scope.pluginManager, getConfig: () => hub.config(),
      packageDirectory: resolve(hub.store.dir, 'recommended-packages'),
      getHostVersion: () => actualHostVersion(scope),
      getBundledPluginState: plugin => ({ 'dsh-deepseek-workbench': { enabled: scope.get('deepseekWorkbench')?.enabled === true }, 'dsh-extensions': { enabled: scope.get('dshExtensions')?.enabled === true } })[plugin.id] ?? {},
      saveConfig: patch => scope.settings.update('oh-my-dsh', patch), isRunning: () => scope.agents.list().some(agent => agent.status === 'running') });
    scope.effect(() => {
      const tick = () => { void service.tick().catch(error => scope.logger.warn(error.message)); };
      const timer = setInterval(tick, 60000); timer.unref();
      return () => { clearInterval(timer); service.close(); };
    });
    scope.effect(() => scope.webServer.register({ kind: 'prefix', path: '/oh-my-dsh/recommended-plugins', async handler(req, res) {
      const denied = scope.connection.requestRejection(req);
      if (denied !== undefined) { res.writeHead(denied); res.end(); return; }
      const send = (status, data) => sendJson(res, status, data);
      if (new URL(req.url, 'http://localhost').pathname !== '/oh-my-dsh/recommended-plugins') { send(404, { error: 'Not found' }); return; }
      try {
        if (req.method === 'POST') {
          const input = await readJsonBody(req, { maxBytes: 8192 });
          if (input.action === 'settings') await service.settings(input.autoUpdate);
          // Already running checks or jobs keep their state; report it unchanged.
          else if (input.action === 'update-all') void service.updateAll({ manual: true }).catch(error => scope.logger.warn(error.message));
          else void service.start(input.id, input.action);
        } else if (req.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
        send(200, await service.status());
      } catch (error) { send(error.statusCode || 400, { error: error.message }); }
    } }));
  });
}

export async function actualHostVersion(ctx) {
  const loader = ctx.get('loader')?.internal;
  if (!loader || !['v1', 'v2'].includes(loader.version) || !ctx.baseUrl) return null;
  try {
    const specifier = '@deepseek-ai/dsh/package.json';
    const result = loader.version === 'v2' ? loader.resolveSync(ctx.baseUrl, { specifier, attributes: {} }) : loader.resolveSync(specifier, ctx.baseUrl, {});
    const manifest = JSON.parse(await readFile(new URL(result.url), 'utf8'));
    if (manifest.name !== '@deepseek-ai/dsh') return null;
    parseVersion(manifest.version); return manifest.version;
  } catch { return null; }
}
