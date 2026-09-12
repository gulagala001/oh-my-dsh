import { access, chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowsExtensionRuntime } from './windows-extension.mjs';

const HOST = 'ai.trisoul.computer_use', OWNER = 'trisoul-x-computer-use';
const digest = data => createHash('sha256').update(data).digest('hex');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const read = async path => { try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function atomicWrite(path, data, mode = 0o600) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.tmp-' + randomUUID();
  try { await writeFile(temporary, data, { mode, flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
async function sourceFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of (await readdir(join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) for (const [name, data] of await sourceFiles(directory, path)) files.set(name, data);
    else if (entry.isFile()) files.set(path, await readFile(join(directory, path)));
    else throw new Error('Extension bundles cannot contain symbolic links or special files');
  }
  return files;
}

export class ExtensionInstaller {
  constructor(directory, socketPath, options = {}) {
    this.directory = join(directory, 'chrome-extension'); this.socketPath = socketPath;
    this.hostName = options.hostName ?? HOST;
    if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(this.hostName)) throw new Error('Invalid browser host name');
    this.platform = options.platform ?? process.platform;
    this.windows = this.platform === 'win32' ? options.windowsRuntime ?? new WindowsExtensionRuntime(directory) : null;
    this.source = options.source ?? fileURLToPath(new URL('../../browser-extension', import.meta.url));
    this.nodePath = options.nodePath ?? process.execPath;
    this.profile = options.chromeUserDataDir || (this.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'Google/Chrome/User Data') : this.platform === 'darwin' ? join(homedir(), 'Library/Application Support/Google/Chrome') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'google-chrome'));
    if (!isAbsolute(this.profile)) throw new Error('Chrome user data directory must be an absolute path');
    this.extensionPath = join(this.directory, 'extension'); this.launcher = join(this.directory, 'native-host');
    this.registration = this.windows ? join(this.directory, this.hostName + '.json') : join(this.profile, 'NativeMessagingHosts', this.hostName + '.json');
    this.receipt = join(this.directory, 'installation.json');
  }
  supported() { return ['darwin', 'linux', 'win32'].includes(this.platform); }
  async bundle() {
    const files = await sourceFiles(this.source), manifest = JSON.parse(files.get('manifest.json'));
    if (!manifest.key || !files.has('worker.js')) throw new Error('The extension bundle is incomplete');
    const extensionId = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).split('').map(char => String.fromCharCode(97 + parseInt(char, 16))).join('');
    const hash = createHash('sha256');
    for (const [name, data] of files) { hash.update(name); hash.update('\0'); hash.update(data); hash.update('\0'); }
    const build = hash.digest('hex');
    files.set('worker.js', Buffer.concat([Buffer.from('const TRISOUL_BUNDLE_ID = ' + JSON.stringify(build) + ';\n'), files.get('worker.js')]));
    const host = await readFile(new URL('../../scripts/computer-use-extension-host.mjs', import.meta.url));
    const hostPath = join(this.directory, 'native-host.mjs'), origin = 'chrome-extension://' + extensionId + '/';
    const runtime = this.windows ? await this.windows.location() : null;
    if (runtime) this.launcher = runtime.binary;
    const launcher = Buffer.from('#!/bin/sh\nexec ' + [this.nodePath, hostPath, '--socket', this.socketPath, '--extension-origin', origin].map(quote).join(' ') + ' "$@"\n');
    const registration = Buffer.from(JSON.stringify({ name: this.hostName, description: 'Oh My DSH Computer Use browser connection', path: this.launcher, type: 'stdio', allowed_origins: [origin] }, null, 2) + '\n');
    const windowsConfig = runtime ? { path: join(runtime.directory, 'bridge.json'), data: Buffer.from(JSON.stringify({ pipe: this.socketPath, origin }) + '\n') } : null;
    return { files, manifest, extensionId, build, host, launcher, registration, runtime, windowsConfig };
  }
  async status(browsers = []) {
    const bundle = await this.bundle(), record = await read(this.receipt);
    let receipt;
    try { receipt = record && JSON.parse(record); } catch {}
    let prepared = receipt?.owner === OWNER && !receipt.removed && receipt.build === bundle.build && receipt.nodePath === this.nodePath && receipt.socketPath === this.socketPath;
    if (prepared && this.windows) {
      prepared = receipt.runtimeBuild === bundle.runtime.build && receipt.launcher === this.launcher && await this.windows.valid();
      if (prepared) prepared = (await this.windows.read(this.hostName)).every(entry => entry.hasValue && entry.value?.toLowerCase() === this.registration.toLowerCase());
    }
    if (prepared) {
      const files = [...bundle.files].map(([name, data]) => [join(this.extensionPath, name), data]);
      if (this.windows) files.push([bundle.windowsConfig.path, bundle.windowsConfig.data]);
      else files.push([join(this.directory, 'native-host.mjs'), bundle.host], [this.launcher, bundle.launcher]);
      files.push([this.registration, bundle.registration]);
      for (const [path, expected] of files) { const actual = await read(path); if (!actual?.equals(expected)) { prepared = false; break; } }
      try { await access(this.nodePath, constants.X_OK); await access(this.launcher, constants.X_OK); } catch { prepared = false; }
    }
    return { supported: this.supported(), platform: this.platform, preparing: !!this.preparing, prepared, version: bundle.manifest.version, build: bundle.build, extensionId: bundle.extensionId, extensionPath: this.extensionPath, browserProfile: this.profile, registrationPath: this.registration, updateAvailable: !!receipt && !receipt.removed && !prepared, reloadRequired: prepared && browsers.some(browser => browser.build !== bundle.build), installedVersion: receipt?.version ?? null };
  }
  async prepare() {
    if (!this.supported()) throw new Error('This platform does not support browser connection installation');
    if (!this.preparing) {
      const pending = this.install().finally(() => { if (this.preparing === pending) this.preparing = null; }); this.preparing = pending;
    }
    await this.preparing;
    return this.status();
  }
  async install() {
    if (!this.windows) return this.installFiles();
    await this.windows.ensure();
    const unlock = await this.windows.lock(this.hostName);
    try { return await this.installFiles(); } finally { await unlock(); }
  }
  async installFiles() {
    const bundle = await this.bundle();
    await access(this.nodePath, constants.X_OK);
    const oldReceipt = await read(this.receipt); let receipt;
    if (oldReceipt) { try { receipt = JSON.parse(oldReceipt); } catch {} if (receipt?.owner !== OWNER) throw new Error('已有安装记录不属于 Oh My DSH Computer Use'); }
    const registryBefore = this.windows ? await this.windows.read(this.hostName) : null;
    if (registryBefore?.some(entry => entry.hasValue && entry.value?.toLowerCase() !== this.registration.toLowerCase())) throw new Error('这个 Chrome 已连接其他实例。本次没有替换注册表中的连接程序。');
    const registration = await read(this.registration);
    if (registration && !registration.equals(bundle.registration)) {
      let previous; try { previous = JSON.parse(registration); } catch {}
      if ((previous?.path !== this.launcher && !(this.windows && receipt?.launcher === previous?.path)) || previous?.name !== this.hostName) throw new Error('这个 Chrome 已连接其他实例。本次没有替换现有连接程序：' + this.registration);
    }
    if (!receipt) {
      const existing = await readdir(this.directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      if (existing.length) throw new Error('安装目录已有其他内容，请选择独立的 Oh My DSH 数据目录');
      // Retain ownership after an interrupted first install. A retry can
      // repair our partial files without treating them as somebody else's.
      await atomicWrite(this.receipt, Buffer.from(JSON.stringify({ owner: OWNER, files: [], ...(registryBefore ? { registryBefore } : {}) }) + '\n'));
    }
    const operations = new Map([...bundle.files].map(([name, data]) => [join(this.extensionPath, name), { data, mode: 0o600 }]));
    if (this.windows) operations.set(bundle.windowsConfig.path, { data: bundle.windowsConfig.data, mode: 0o600 });
    else {
      operations.set(join(this.directory, 'native-host.mjs'), { data: bundle.host, mode: 0o600 });
      operations.set(this.launcher, { data: bundle.launcher, mode: 0o700 });
    }
    operations.set(this.registration, { data: bundle.registration, mode: 0o600 });
    const nextReceipt = { owner: OWNER, version: bundle.manifest.version, build: bundle.build, nodePath: this.nodePath, socketPath: this.socketPath, extensionId: bundle.extensionId, files: [...bundle.files].map(([name, data]) => ({ name, hash: digest(data) })) };
    if (this.windows) Object.assign(nextReceipt, { runtimeBuild: bundle.runtime.build, launcher: this.launcher, registryBefore: receipt?.registryBefore ?? registryBefore });
    const changed = [];
    let registryChanged = false;
    try {
      for (const [path, operation] of operations) {
        const before = await read(path); if (before?.equals(operation.data)) { await chmod(path, operation.mode); continue; }
        changed.push({ path, before, mode: operation.mode }); await atomicWrite(path, operation.data, operation.mode);
      }
      // Even a failed set may have changed one registry view. Always attempt
      // guarded restoration before rolling back the files it could now name.
      if (this.windows) { registryChanged = true; await this.windows.set(this.hostName, this.registration); }
      const before = await read(this.receipt); changed.push({ path: this.receipt, before, mode: 0o600 });
      await atomicWrite(this.receipt, Buffer.from(JSON.stringify(nextReceipt, null, 2) + '\n'));
    } catch (error) {
      // Restore the external registration before removing the files it names.
      // If another owner changed it, retain our files for explicit recovery.
      if (registryChanged) {
        try { await this.windows.restore(this.hostName, this.registration, registryBefore); }
        catch (recovery) { throw new AggregateError([error, recovery], '安装失败，注册表恢复未完成；已保留连接程序文件：' + recovery.message); }
      }
      const restored = await Promise.allSettled(changed.reverse().map(({ path, before, mode }) => before ? atomicWrite(path, before, mode) : rm(path, { force: true })));
      const failures = restored.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError([error, ...failures], '安装失败，部分文件未能恢复：' + error.message);
      throw error;
    }
  }
  async unregister() {
    await this.preparing;
    const data = await read(this.receipt); if (!data) return;
    const receipt = JSON.parse(data);
    if (receipt.owner !== OWNER) throw new Error('该连接程序不属于 Oh My DSH，未移除');
    const unlock = this.windows ? await this.windows.lock(this.hostName) : null;
    try {
      if (this.windows) {
        if (!Array.isArray(receipt.registryBefore)) throw new Error('安装记录缺少原注册状态，未移除注册');
        await this.windows.restore(this.hostName, this.registration, receipt.registryBefore);
      } else {
        const current = await read(this.registration);
        if (current) {
          const value = JSON.parse(current);
          if (value.name !== this.hostName || value.path !== this.launcher) throw new Error('Chrome 已连接其他实例，未移除其连接');
          await rm(this.registration);
        }
      }
      // Keep the extension/cache for Chrome's loaded-unpacked reference and a
      // later repair. There is no OS registration left that can launch it.
      await atomicWrite(this.receipt, Buffer.from(JSON.stringify({ ...receipt, removed: true }) + '\n'));
    } finally { await unlock?.(); }
  }
}
