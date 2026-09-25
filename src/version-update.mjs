import { randomUUID } from 'node:crypto';
import { readJsonBody } from './http.mjs';
import { compareVersions, parseVersion } from './version.mjs';
import { pluginManagementError } from './recommended-plugins.mjs';

const PACKAGE = 'trisoul_x';
const failure = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export function versionInstallSpec(version) {
  parseVersion(version);
  return 'github:gulagala001/oh-my-dsh#v' + version.replace(/^v/, '');
}

// Updating an existing bundle uses the host's transaction and requires a restart.
// Keep the running version separate from the package now present on disk.
export class VersionUpdater {
  constructor({ versions, getManager, isRunning = () => false }) {
    Object.assign(this, { versions, getManager, isRunning });
    this.state = { phase: 'idle', targetVersion: null, error: '' };
    this.job = null; this.closed = false; this.requestId = null;
  }
  snapshot() { return { ...this.state }; }
  async inventory() {
    const manager = this.getManager();
    if (!manager) return { reason: '插件管理尚未加载，请稍后重试。' };
    const bundle = (await manager.listBundles()).find(row => row.name === PACKAGE);
    if (!bundle?.installed || bundle.readOnlyReason) return { reason: '此安装由宿主管理，请通过原安装方式更新。' };
    return { manager, bundle };
  }
  async status() {
    if (this.job) return { ...this.snapshot(), available: false };
    const { bundle, reason } = await this.inventory();
    if (bundle?.version && compareVersions(bundle.version, this.versions.snapshot().currentVersion) !== 0) {
      if (this.state.phase === 'failed') return { ...this.snapshot(), available: false, blockedReason: '安装状态有变化，请先到 DSH 的“插件”页面检查。' };
      return { phase: 'restart-required', targetVersion: bundle.version, error: '', available: false };
    }
    const blockedReason = reason || (this.isRunning() ? '有任务正在运行，请等任务结束后更新。' : '');
    return { ...this.snapshot(), available: !this.closed && !blockedReason, blockedReason };
  }
  start(version) {
    if (this.closed) throw failure('更新服务已停止，请重新打开 DSH。', 503);
    if (this.job) throw failure('更新正在进行，请稍候。');
    versionInstallSpec(version);
    this.state = { phase: 'checking', targetVersion: version, error: '' };
    this.requestId = randomUUID();
    this.job = this.run(version).catch(error => {
      this.state = { phase: 'failed', targetVersion: version, error: String(error.message).slice(-2000) };
    }).finally(() => { this.job = null; this.requestId = null; });
    return this.job;
  }
  progress({ requestId, phase }) {
    if (this.job && requestId === this.requestId && ['installing', 'applying'].includes(phase)) this.state.phase = phase;
  }
  async run(version) {
    const release = await this.versions.check(true);
    if (release.error || release.stale) throw failure('未能确认最新发布信息，请重新检查更新后再试。');
    if (release.status !== 'update' || release.latestVersion !== version) throw failure('发布版本已变化，请重新检查更新。');
    const { manager, bundle, reason } = await this.inventory();
    if (reason) throw failure(reason);
    if (bundle.version && compareVersions(bundle.version, release.currentVersion) !== 0) throw failure('已安装的版本与运行版本不同，请先重启 DSH。');
    if (this.closed) throw failure('更新服务已停止。');
    if (this.isRunning()) throw failure('有任务正在运行，请等任务结束后更新。');
    this.state.phase = 'installing';
    const result = await manager.installBundle(versionInstallSpec(version), { enabled: bundle.enabled, requestId: this.requestId });
    if (result.application === 'failed') {
      if (result.pendingBuilds?.length) throw Error('安装脚本需要授权，请到 DSH 的“插件”页面处理：' + result.pendingBuilds.join('、'));
      throw Error(pluginManagementError(result.error) || result.packageResult?.output || '更新失败，请重试。');
    }
    if (result.application === 'cancelled') throw Error('更新已取消，可以重试。');
    if (result.application === 'overridden') throw Error('插件配置被其他配置覆盖，请到 DSH 的“插件”页面检查。');
    if (!['applied', 'restart-required'].includes(result.application) || result.bundle !== PACKAGE) throw Error('未能确认更新结果，请到 DSH 的“插件”页面检查。');
    const installed = (await manager.listBundles()).find(row => row.name === PACKAGE);
    if (!installed?.installed || !installed.version || compareVersions(installed.version, version) !== 0) throw Error('安装版本与目标版本不一致，请到 DSH 的“插件”页面检查。');
    this.state = { phase: 'restart-required', targetVersion: installed.version, error: '' };
  }
  close() {
    this.closed = true;
    if (this.requestId) void this.getManager()?.cancelInstall(this.requestId).catch(() => {});
  }
}

// Mounted after the shared authentication and Origin check in index.mjs.
export async function handleVersionUpdateApi({ req, res, url, service, send }) {
  if (url.pathname !== '/trisoul-x/api/version-update') return false;
  if (req.method === 'GET') send(res, 200, await service.status());
  else if (req.method === 'POST') {
    const input = await readJsonBody(req, { maxBytes: 4096 });
    void service.start(input.version);
    send(res, 202, service.snapshot());
  } else send(res, 405, { error: 'Method not allowed' });
  return true;
}
