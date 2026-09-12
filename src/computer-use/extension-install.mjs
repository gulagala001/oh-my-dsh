import { access, chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    this.source = options.source ?? fileURLToPath(new URL('../../browser-extension', import.meta.url));
    this.nodePath = options.nodePath ?? process.execPath;
    this.profile = options.chromeUserDataDir || (process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/Google/Chrome') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'google-chrome'));
    if (!isAbsolute(this.profile)) throw new Error('Chrome user data directory must be an absolute path');
    this.extensionPath = join(this.directory, 'extension'); this.launcher = join(this.directory, 'native-host');
    this.registration = join(this.profile, 'NativeMessagingHosts', HOST + '.json');
    this.receipt = join(this.directory, 'installation.json');
  }
  supported() { return process.platform === 'darwin' || process.platform === 'linux'; }
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
    const launcher = Buffer.from('#!/bin/sh\nexec ' + [this.nodePath, hostPath, '--socket', this.socketPath, '--extension-origin', origin].map(quote).join(' ') + ' "$@"\n');
    const registration = Buffer.from(JSON.stringify({ name: HOST, description: 'Oh My DSH Computer Use browser connection', path: this.launcher, type: 'stdio', allowed_origins: [origin] }, null, 2) + '\n');
    return { files, manifest, extensionId, build, host, launcher, registration };
  }
  async status(browsers = []) {
    const bundle = await this.bundle(), record = await read(this.receipt);
    let receipt;
    try { receipt = record && JSON.parse(record); } catch {}
    let prepared = receipt?.owner === OWNER && receipt.build === bundle.build && receipt.nodePath === this.nodePath && receipt.socketPath === this.socketPath;
    if (prepared) {
      const files = [...bundle.files].map(([name, data]) => [join(this.extensionPath, name), data]);
      files.push([join(this.directory, 'native-host.mjs'), bundle.host], [this.launcher, bundle.launcher], [this.registration, bundle.registration]);
      for (const [path, expected] of files) { const actual = await read(path); if (!actual?.equals(expected)) { prepared = false; break; } }
      try { await access(this.nodePath, constants.X_OK); await access(this.launcher, constants.X_OK); } catch { prepared = false; }
    }
    return { supported: this.supported(), preparing: !!this.preparing, prepared, version: bundle.manifest.version, build: bundle.build, extensionId: bundle.extensionId, extensionPath: this.extensionPath, browserProfile: this.profile, registrationPath: this.registration, updateAvailable: !!receipt && !prepared, reloadRequired: prepared && browsers.some(browser => browser.build !== bundle.build), installedVersion: receipt?.version ?? null };
  }
  async prepare() {
    if (!this.supported()) throw new Error('Windows browser connection installation has not been implemented yet');
    if (!this.preparing) {
      const pending = this.install().finally(() => { if (this.preparing === pending) this.preparing = null; }); this.preparing = pending;
    }
    await this.preparing;
    return this.status();
  }
  async install() {
    const bundle = await this.bundle();
    await access(this.nodePath, constants.X_OK);
    const registration = await read(this.registration);
    if (registration && !registration.equals(bundle.registration)) {
      let previous; try { previous = JSON.parse(registration); } catch {}
      if (previous?.path !== this.launcher || previous?.name !== HOST) throw new Error('这个 Chrome 已连接其他实例。本次没有替换现有连接程序：' + this.registration);
    }
    const oldReceipt = await read(this.receipt); let receipt;
    if (oldReceipt) { try { receipt = JSON.parse(oldReceipt); } catch {} if (receipt?.owner !== OWNER) throw new Error('已有安装记录不属于 Oh My DSH Computer Use'); }
    if (!receipt) {
      const existing = await readdir(this.directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      if (existing.length) throw new Error('安装目录已有其他内容，请选择独立的 Oh My DSH 数据目录');
      // Retain ownership after an interrupted first install. A retry can
      // repair our partial files without treating them as somebody else's.
      await atomicWrite(this.receipt, Buffer.from(JSON.stringify({ owner: OWNER, files: [] }) + '\n'));
    }
    const operations = new Map([...bundle.files].map(([name, data]) => [join(this.extensionPath, name), { data, mode: 0o600 }]));
    operations.set(join(this.directory, 'native-host.mjs'), { data: bundle.host, mode: 0o600 });
    operations.set(this.launcher, { data: bundle.launcher, mode: 0o700 });
    operations.set(this.registration, { data: bundle.registration, mode: 0o600 });
    const nextReceipt = { owner: OWNER, version: bundle.manifest.version, build: bundle.build, nodePath: this.nodePath, socketPath: this.socketPath, extensionId: bundle.extensionId, files: [...bundle.files].map(([name, data]) => ({ name, hash: digest(data) })) };
    operations.set(this.receipt, { data: Buffer.from(JSON.stringify(nextReceipt, null, 2) + '\n'), mode: 0o600 });
    const changed = [];
    try {
      for (const [path, operation] of operations) {
        const before = await read(path); if (before?.equals(operation.data)) { await chmod(path, operation.mode); continue; }
        changed.push({ path, before, mode: operation.mode }); await atomicWrite(path, operation.data, operation.mode);
      }
    } catch (error) {
      const restored = await Promise.allSettled(changed.reverse().map(({ path, before, mode }) => before ? atomicWrite(path, before, mode) : rm(path, { force: true })));
      const failures = restored.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError([error, ...failures], '安装失败，部分文件未能恢复：' + error.message);
      throw error;
    }
  }
}
