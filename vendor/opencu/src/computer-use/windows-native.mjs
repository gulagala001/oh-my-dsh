import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { release } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NativeHost, nativeValue } from './native.mjs';
import { McpClient, NativeProtocolError } from './mcp-client.mjs';
import { windowsNativeBuild } from './windows-native-build.mjs';
import { WindowsNativeRuntime } from './windows-native-runtime.mjs';

export function windowsBridgeActive({ platform = process.platform, osRelease = release() } = {}) {
  return platform === 'linux' && /microsoft/i.test(osRelease);
}

// Windows sessions use dedicated child transports. The native input lease is
// an OS mutex shared across those processes; preview/share clients are read-only.
export class WindowsNativeHost extends NativeHost {
  constructor(directory, options = {}) {
    super(directory, options);
    this.platform = 'win32'; this.externalBinary = options.binary;
    this.bridge = !!this.externalBinary && windowsBridgeActive(options);
    this.runtime = options.runtime ?? new WindowsNativeRuntime(directory);
    this.client = options.client ?? ((binary, args, settings) => new McpClient(binary, args, settings));
    this.pointers = new Map(); this.previewDescriptors = new Map();
    this.osPlatform = this.bridge ? 'win32' : options.platform ?? process.platform; this.osRelease = options.osRelease ?? release();
    this.binary = this.externalBinary ?? this.runtime.binary() ?? ''; this.ownsDaemon = false;
  }
  // WSL reports a Linux kernel version. The Windows executable checks the
  // actual Windows version and desktop capabilities when starting MCP.
  supported() { return this.osPlatform === 'win32' && ['x64', 'arm64'].includes(process.arch) && (this.bridge || Number(this.osRelease.split('.')[2]) >= 19041); }
  available() { this.binary = this.externalBinary ?? this.runtime.binary() ?? ''; return this.supported() && !!this.binary && existsSync(this.binary); }
  async expectedBuild() {
    if (!this.bridge) return windowsNativeBuild();
    // This binary is managed outside WSL. Keep disk/live identity checks,
    // without treating the Linux plugin's source hash as its build receipt.
    const installed = await this.installedInfo();
    return { build: installed?.build ?? null, version: installed?.version ?? '0.1.1', protocol: 1 };
  }
  async installedInfo() {
    if (!this.externalBinary) return this.runtime.installedInfo();
    if (!existsSync(this.externalBinary)) return null;
    const info = await this.runtime.inspect(this.externalBinary), file = await stat(this.externalBinary);
    if (info.name !== 'oh-my-dsh-windows-desktop' || info.protocol !== 1 || (this.bridge && !/^[a-f0-9]{64}$/.test(info.build ?? ''))) throw new Error('指定文件不是匹配的 Windows 桌面控制程序，请使用配套构建脚本重新编译');
    return { ...info, version: info.version ?? '0.1.1', binary: this.externalBinary, displayName: 'Oh My DSH Computer Use', identity: `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}` };
  }
  async probeInfo() {
    const clients = await Promise.all([...this.connections.values()].map(pending => pending.catch(() => null)));
    return clients.find(connection => connection && !connection.client.closed)?.info ?? null;
  }
  async launch() {
    if (this.closed) throw new Error('Windows 桌面控制已关闭');
    if (!this.available()) throw new Error(this.externalBinary ? '指定的 Windows 桌面控制程序不可用，请检查程序路径和运行环境' : '请先在电脑面板的运行环境中安装 Windows 桌面控制');
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
        let connection;
        const client = this.client(this.binary, ['mcp'], { onNotification: message => {
          if (connection && this.connections.get(sessionId) === pending) for (const listener of this.notifications.get(sessionId) ?? []) {
            try { listener(message, connection); } catch {}
          }
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
          if (this.bridge && (info._meta?.trisoul?.platform !== 'win32' || info._meta?.trisoul?.build !== (await this.expectedBuild()).build)) throw new Error('Windows 桌面控制运行时需要更新或重启，运行中的程序与指定文件不匹配');
          await client.call('start_session', { session: label, read_only: readOnly, thread_id: sessionId });
          connection = { client, label, info, readOnly }; return connection;
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
  // Called only by the authenticated screenshot-copy UI action.
  async copyImageToClipboard(sessionId, pngBase64, signal) {
    signal?.throwIfAborted();
    const maxBytes = 2 * 1024 * 1024;
    if (typeof pngBase64 !== 'string' || !pngBase64.length || pngBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pngBase64)) throw Object.assign(new TypeError('图片复制需要完整的 base64 PNG'), { code: 'INVALID_CLIPBOARD_IMAGE' });
    if (pngBase64.length > 4 * Math.ceil(maxBytes / 3)) throw Object.assign(new RangeError('截图 PNG 超过 2 MiB 剪贴板限制'), { code: 'CLIPBOARD_IMAGE_TOO_LARGE' });
    const pngBytes = Buffer.byteLength(pngBase64, 'base64');
    if (pngBytes > maxBytes) throw Object.assign(new RangeError('截图 PNG 超过 2 MiB 剪贴板限制'), { code: 'CLIPBOARD_IMAGE_TOO_LARGE' });
    const temporary = !this.connections.has(sessionId), id = temporary ? 'clipboard-copy-' + randomUUID() : sessionId;
    let release = temporary;
    try {
      const connection = await this.connection(id);
      signal?.throwIfAborted();
      if (connection.info._meta?.trisoul?.build !== (await this.expectedBuild()).build) throw Object.assign(new Error('请先更新或重启桌面控制，再复制截图'), { code: 'NATIVE_CLIPBOARD_UPDATE_REQUIRED' });
      const capabilities = nativeValue(await this.call(id, 'check_permissions', {}, signal));
      if (capabilities.image_clipboard?.available !== true) throw Object.assign(new Error('当前桌面控制运行时不支持图片剪贴板'), { code: 'NATIVE_CLIPBOARD_UNAVAILABLE' });
      const value = nativeValue(await this.call(id, 'copy_image_to_clipboard', { pngBase64 }, signal));
      signal?.throwIfAborted();
      if (value.copied !== true || !Number.isSafeInteger(value.width) || value.width <= 0 || value.width > 16384 || !Number.isSafeInteger(value.height) || value.height <= 0 || value.height > 16384 || value.width * value.height > 32 * 1024 * 1024 || value.pngBytes !== pngBytes) throw new NativeProtocolError('Windows runtime did not confirm the copied PNG');
      return { copied: true, width: value.width, height: value.height, pngBytes: value.pngBytes };
    } catch (error) {
      if (signal?.aborted || ['CANCELLED', 'NATIVE_TRANSPORT_TIMEOUT', 'NATIVE_TRANSPORT_CLOSED', 'NATIVE_PROTOCOL_ERROR'].includes(error?.code)) release = true;
      throw error;
    } finally {
      if (release) {
        try { await this.release(id); }
        catch (error) { throw Object.assign(new Error('图片复制会话清理尚未确认：' + error.message), { code: 'CLIPBOARD_CLEANUP_FAILED', cause: error }); }
      }
    }
  }
  async list(sessionId, signal) {
    const value = nativeValue(await this.call(sessionId, 'list_apps', {}, signal));
    return (value.apps ?? []).map(app => ({
      id: app.bundle_id ?? String(app.pid), displayName: app.name, pid: app.pid,
      isRunning: app.running, path: app.launch_path,
      windows: (app.windows ?? []).map(window => ({
        id: window.window_id, windowId: window.window_id, pid: window.pid, title: window.title,
      })),
      ...(app.discovery_error ? { unavailableReason: app.discovery_error } : {}),
    }));
  }
  async bind(sessionId, query, signal) {
    signal?.throwIfAborted();
    const requested = typeof query === 'string' ? { id: query } : query;
    if (!requested || typeof requested !== 'object' || Array.isArray(requested) || (requested.id === undefined ? requested.windowId === undefined : typeof requested.id !== 'string' || !requested.id.trim())) throw new Error('getApp expects an application name, ID, executable path, {id, windowId}, or {windowId} from current discovery.');
    if (requested.windowId !== undefined && (!Number.isSafeInteger(requested.windowId) || requested.windowId <= 0)) throw new Error('windowId must be a current Windows window ID.');
    const connection = await this.connection(sessionId), expected = await this.expectedBuild();
    if (connection.info._meta?.trisoul?.build !== expected.build) throw new Error('桌面控制运行时需要更新或重启，请先在运行环境中更新桌面控制');
    let target;
    if (requested.id === undefined) {
      const discovery = nativeValue(await this.call(sessionId, 'list_windows', {}, signal));
      target = (discovery.windows ?? []).find(window => window.window_id === requested.windowId);
      if (!target) throw Object.assign(new Error(`Window ${requested.windowId} is unavailable. Discover its current window before binding again.`), { code: 'STALE_WINDOW' });
    } else {
      target = nativeValue(await this.call(sessionId, 'launch_app', { name: requested.id, ...(requested.windowId !== undefined ? { window_id: requested.windowId } : {}) }, signal));
    }
    if (!Number.isSafeInteger(target.pid) || target.pid <= 0 || !Number.isSafeInteger(target.window_id) || target.window_id <= 0 || typeof target.process_identity !== 'string' || !target.process_identity || typeof target.app_id !== 'string' || !target.app_id || typeof target.app_name !== 'string') throw new Error('Windows 返回了无效的应用窗口身份，未建立控制绑定');
    signal?.throwIfAborted();
    return this.bindWindow(sessionId, { id: target.app_id, pid: target.pid, displayName: target.app_name }, { ...target, processIdentity: target.process_identity });
  }
  async invoke(sessionId, id, method, args = [], signal) {
    if (method === 'scroll' && args[2] !== null && typeof args[2] === 'object') {
      signal?.throwIfAborted();
      const target = this.targets.get(id);
      if (!target || target.sessionId !== sessionId) throw new Error('This native target has been released. Bind the application again.');
      if (!Array.isArray(args[0])) throw new Error('Windows pixel scroll requires a point and a { pixels } distance.');
      if (!Number.isFinite(args[0][0]) || !Number.isFinite(args[0][1])) throw new Error('A point must contain finite x and y coordinates: [x,y].');
      if (Array.isArray(args[2]) || !Number.isFinite(args[2].pixels) || args[2].pixels <= 0) throw new Error('pixels must be a positive finite number.');
      if (!['up', 'u', 'down', 'd', 'left', 'l', 'right', 'r'].includes(args[1])) throw new Error(`Unknown scroll direction: ${args[1]}.`);
      throw Object.assign(new Error('Pixel scrolling is unavailable in the installed Windows native runtime. Use the supported page scrolling distance.'), { code: 'UNSUPPORTED_CAPABILITY' });
    }
    return super.invoke(sessionId, id, method, args, signal);
  }
  async call(sessionId, name, args = {}, signal) {
    const result = await super.call(sessionId, name, args, signal);
    if (name === 'start_preview') this.previewDescriptors.set(sessionId, { key: args.process_identity + ':' + args.window_id, owner: args.owner_session_id });
    if (name === 'preview_frame' && result.structuredContent) {
      const descriptor = this.previewDescriptors.get(sessionId), pointer = this.pointers.get(descriptor?.key);
      result.structuredContent.cursor = pointer && pointer.sessionId === descriptor.owner ? pointer : null;
    }
    return result;
  }
  async releaseConnection(sessionId) {
    if (!sessionId.startsWith('native-preview-')) await this.windowsPresentations?.stopThread(sessionId, 'owner-released');
    await super.releaseConnection(sessionId);
    this.previewDescriptors.delete(sessionId);
    for (const [key, pointer] of this.pointers) if (pointer.sessionId === sessionId) this.pointers.delete(key);
  }
  async presentationTarget(sessionId, turnID, target) {
    const selected = this.targets.get(target?.id);
    if (!selected || selected.sessionId !== sessionId || selected.pid !== target.pid || selected.windowId !== target.windowId
      || selected.processIdentity !== target.processIdentity || typeof turnID !== 'string' || !turnID) throw new NativeProtocolError('The Windows presentation owner target changed');
    return { ...selected, viewId: selected.viewId ?? selected.id, associatedWindowIDs: [] };
  }
  async windowsPresentationCall(sessionId, name, args, expectedConnection) {
    if (!['start_native_presentation', 'stop_native_presentation', 'get_native_presentation_state', 'update_native_presentation'].includes(name)) throw new TypeError('Unsupported Windows presentation operation');
    const pending = this.connections.get(sessionId);
    if (!pending) throw new NativeProtocolError('The Windows presentation connection has been released');
    const connection = await pending;
    if (connection !== expectedConnection || this.connections.get(sessionId) !== pending || connection.client.closed || connection.releasing) throw new NativeProtocolError('The Windows presentation connection changed');
    connection.hasNativePresentation = true;
    const result = await connection.client.call(name, { ...args, session: connection.label }, { timeoutMs: 120000 });
    if (this.connections.get(sessionId) !== pending || connection.client.closed) throw new NativeProtocolError('The Windows presentation reply belongs to a released connection');
    return result;
  }
  async endPresentationTurn(sessionId, turnID) {
    await this.windowsPresentations?.completeTurn(sessionId, turnID, 'turn-ended');
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
