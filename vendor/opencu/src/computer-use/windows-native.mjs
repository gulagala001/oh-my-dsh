import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { release } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NativeHost, nativeValue } from './native.mjs';
import { McpClient } from './mcp-client.mjs';
import { windowsNativeBuild } from './windows-native-build.mjs';
import { WindowsNativeRuntime } from './windows-native-runtime.mjs';

// Windows sessions use dedicated child transports. The native input lease is
// an OS mutex shared across those processes; preview/share clients are read-only.
export class WindowsNativeHost extends NativeHost {
  constructor(directory, options = {}) {
    super(directory, options);
    this.platform = 'win32'; this.externalBinary = options.binary;
    this.runtime = options.runtime ?? new WindowsNativeRuntime(directory);
    this.client = options.client ?? ((binary, args, settings) => new McpClient(binary, args, settings));
    this.pointers = new Map(); this.previewDescriptors = new Map();
    this.osPlatform = options.platform ?? process.platform; this.osRelease = options.osRelease ?? release();
    this.binary = this.externalBinary ?? this.runtime.binary() ?? ''; this.ownsDaemon = false;
  }
  supported() { return this.osPlatform === 'win32' && ['x64', 'arm64'].includes(process.arch) && Number(this.osRelease.split('.')[2]) >= 19041; }
  available() { this.binary = this.externalBinary ?? this.runtime.binary() ?? ''; return this.supported() && !!this.binary && existsSync(this.binary); }
  expectedBuild() { return windowsNativeBuild(); }
  async installedInfo() {
    if (!this.externalBinary) return this.runtime.installedInfo();
    if (!existsSync(this.externalBinary)) return null;
    const info = await this.runtime.inspect(this.externalBinary), file = await stat(this.externalBinary);
    if (info.name !== 'oh-my-dsh-windows-desktop' || info.protocol !== 1) throw new Error('指定文件不是匹配的 Windows 桌面控制程序');
    return { ...info, version: '0.1.1', binary: this.externalBinary, displayName: 'Oh My DSH Computer Use', identity: `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}` };
  }
  async probeInfo() {
    const clients = await Promise.all([...this.connections.values()].map(pending => pending.catch(() => null)));
    return clients.find(connection => connection && !connection.client.closed)?.info ?? null;
  }
  async launch() {
    if (this.closed) throw new Error('Windows 桌面控制已关闭');
    if (!this.available()) throw new Error('请先在电脑面板的运行环境中安装 Windows 桌面控制');
    await this.installedInfo();
  }
  async install({ beforeReplace } = {}) {
    if (!this.supported()) throw new Error('Windows 桌面控制需要 Windows 10 2004 或更新版本');
    if (this.externalBinary) throw new Error('当前使用手动指定的运行时，请先更新该程序');
    if (this.removing) throw new Error('Windows 桌面运行时正在移除，请等待完成');
    if (this.installing) return this.installing;
    let replaced = false;
    const replace = async () => {
      if (replaced) return;
      if (this.closed) throw new Error('桌面控制已关闭');
      this.replacing = true;
      await beforeReplace?.();
      await Promise.all([...this.connections.keys()].map(id => this.release(id)));
      replaced = true;
    };
    this.installing = (async () => {
      await this.runtime.install({ beforeReplace: replace });
      const expected = await this.expectedBuild();
      const live = await Promise.all([...this.connections.values()].map(pending => pending.catch(() => null)));
      if (live.some(connection => connection && connection.info._meta?.trisoul?.build !== expected.build)) await replace();
      this.binary = this.runtime.binary() ?? '';
    })().finally(() => { this.replacing = false; this.installing = null; });
    return this.installing;
  }
  async uninstall({ beforeRemove } = {}) {
    if (this.closed) throw new Error('Windows 桌面控制已关闭');
    if (this.externalBinary) throw new Error('当前使用手动指定的运行时，请自行移除该程序');
    if (this.installing) throw new Error('Windows 桌面运行时正在安装，请等待完成后再移除');
    if (this.removing) return this.removing;
    this.removing = this.runtime.uninstall({ beforeRemove: async () => {
      if (this.closed) throw new Error('Windows 桌面控制已关闭');
      this.replacing = true;
      await beforeRemove?.();
      await Promise.all([...this.connections.keys()].map(id => this.release(id)));
    } }).finally(() => { this.binary = this.runtime.binary() ?? ''; this.replacing = false; this.removing = null; });
    return this.removing;
  }
  async connection(sessionId) {
    if (this.closed) throw new Error('Windows 桌面控制已关闭');
    if (!this.connections.has(sessionId)) {
      const pending = (async () => {
        await this.start();
        const label = 'trisoul-' + randomUUID();
        const readOnly = sessionId === 'ui-permissions' || /^(native-preview-|window-share-|reveal-)/.test(sessionId);
        const clear = () => { for (const [key, pointer] of this.pointers) if (pointer.sessionId === sessionId) this.pointers.delete(key); };
        const client = this.client(this.binary, ['mcp'], { onNotification: message => {
          if (readOnly || message.method !== 'notifications/trisoul/cursor') return;
          const value = message.params;
          if (value?.hidden) { clear(); return; }
          const target = [...this.targets.values()].find(target => target.sessionId === sessionId && target.pid === value?.pid && target.windowId === value.window_id && target.processIdentity === value.process_identity);
          if (target) this.pointers.set(value.process_identity + ':' + value.window_id, { ...value, source: label, sessionId });
        } });
        client.child?.once?.('exit', clear);
        try {
          const info = await client.initialize();
          if (info.serverInfo?.name !== 'trisoul-computer-use' || info._meta?.trisoul?.protocol !== 1) throw new Error('Windows 桌面控制协议不匹配，请更新运行时');
          await client.call('start_session', { session: label, read_only: readOnly });
          return { client, label, info, readOnly };
        } catch (error) { await client.close(); throw error; }
      })().catch(error => { if (this.connections.get(sessionId) === pending) this.connections.delete(sessionId); throw error; });
      this.connections.set(sessionId, pending);
    }
    return this.connections.get(sessionId);
  }
  async permissions(sessionId) {
    const value = nativeValue(await this.call(sessionId, 'check_permissions'));
    if (value.platform !== 'win32' || typeof value.interactive !== 'boolean' || typeof value.capture_supported !== 'boolean') throw new Error('Windows 桌面运行时返回了无效的可用性状态');
    return value;
  }
  async bind(sessionId, query, signal) {
    signal?.throwIfAborted();
    const requested = typeof query === 'string' ? { id: query } : query;
    if (!requested || typeof requested.id !== 'string' || !requested.id.trim()) throw new Error('getApp expects an application name, ID, executable path, or {id, windowId}.');
    if (requested.windowId !== undefined && (!Number.isSafeInteger(requested.windowId) || requested.windowId <= 0)) throw new Error('windowId must be a current Windows window ID.');
    const connection = await this.connection(sessionId), expected = await this.expectedBuild();
    if (connection.info._meta?.trisoul?.build !== expected.build) throw new Error('桌面控制运行时需要更新或重启，请先在运行环境中更新桌面控制');
    const target = nativeValue(await this.call(sessionId, 'launch_app', { name: requested.id, ...(requested.windowId !== undefined ? { window_id: requested.windowId } : {}) }, signal));
    if (!Number.isSafeInteger(target.pid) || target.pid <= 0 || !Number.isSafeInteger(target.window_id) || target.window_id <= 0 || typeof target.process_identity !== 'string' || !target.process_identity || typeof target.app_id !== 'string' || !target.app_id || typeof target.app_name !== 'string') throw new Error('Windows 返回了无效的应用窗口身份，未建立控制绑定');
    signal?.throwIfAborted();
    return this.bindWindow(sessionId, { id: target.app_id, pid: target.pid, displayName: target.app_name }, { ...target, processIdentity: target.process_identity });
  }
  async call(sessionId, name, args = {}, signal) {
    const result = await super.call(sessionId, name, args, signal);
    if (name === 'start_preview') this.previewDescriptors.set(sessionId, { key: args.process_identity + ':' + args.window_id, owner: args.owner_session_id });
    if (name === 'preview_frame' && result.structuredContent) {
      const descriptor = this.previewDescriptors.get(sessionId), pointer = this.pointers.get(descriptor?.key);
      result.structuredContent.cursor = pointer && pointer.sessionId === descriptor.owner && Date.now() - pointer.at < 1500 ? pointer : null;
    }
    return result;
  }
  async releaseConnection(sessionId) {
    await super.releaseConnection(sessionId);
    this.previewDescriptors.delete(sessionId);
    for (const [key, pointer] of this.pointers) if (pointer.sessionId === sessionId) this.pointers.delete(key);
  }
  async showSetup() { return this.permissions('ui-permissions'); }
  async confirmDisconnected(connection, original) {
    const { child } = connection.client;
    // An EOF cancels the native protocol, which waits for input/clipboard
    // cleanup. A normal exit confirms it; a forced exit is not a Stop ACK.
    if (child?.exitCode === 0) return;
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { const timeout = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timeout); resolve(); }); });
      if (child.exitCode === 0) return;
    }
    throw Object.assign(new Error('Windows 原生连接异常退出，未取得完整清理确认；请检查目标并重试停止。'), { code: 'NATIVE_CLEANUP_UNCONFIRMED', cause: original });
  }
  async close() {
    this.closed = true; await this.installing?.catch(() => {}); await this.removing?.catch(() => {});
    await super.close();
  }
}
