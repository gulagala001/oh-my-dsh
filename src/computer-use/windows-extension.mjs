import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { windowsBridgeBuild } from './windows-build.mjs';
import { nativeLock } from './native-lock.mjs';

const run = promisify(execFile);

export class WindowsExtensionRuntime {
  constructor(directory) { this.directory = join(directory, 'windows-browser-bridge'); }
  async location() {
    const info = await windowsBridgeBuild();
    let current;
    try { current = JSON.parse(await readFile(join(this.directory, 'current.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    const name = current?.build === info.build && new RegExp('^' + info.build + '-[a-f0-9-]{36}$').test(current.directory) ? current.directory : info.build;
    return { ...info, directory: join(this.directory, name), binary: join(this.directory, name, info.executable) };
  }
  async command() {
    const value = await this.location();
    if (!existsSync(value.binary) || !await this.valid()) throw new Error('请先在运行环境中准备或修复 Chrome 连接；Windows 开发安装需要 .NET 10 SDK。');
    return { command: value.binary, args: [] };
  }
  async valid() {
    const value = await this.location();
    try {
      const record = JSON.parse(await readFile(join(value.directory, 'build.json'), 'utf8'));
      if (record.build !== value.build || record.owner !== 'trisoul-x-browser-bridge') return false;
      const file = await stat(value.binary), identity = `${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`;
      if (this.verified?.identity !== identity || this.verified?.binary !== value.binary) {
        const digest = createHash('sha256').update(await readFile(value.binary)).digest('hex');
        if (digest !== record.sha256) return false;
        this.verified = { identity, binary: value.binary };
      }
      return true;
    } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code) || error instanceof SyntaxError) return false; throw error; }
  }
  async ensure() {
    if (await this.valid()) return;
    if (this.building) return this.building;
    this.building = this.build().finally(() => { this.building = null; }); return this.building;
  }
  async build() {
    const expected = await this.location();
    await mkdir(this.directory, { recursive: true });
    const marker = join(this.directory, 'owner.json');
    if (!existsSync(marker) && (await readdir(this.directory)).length) throw new Error('Windows 连接程序目录已有其他内容，未覆盖');
    try { await writeFile(marker, JSON.stringify({ owner: 'trisoul-x-browser-bridge' }) + '\n', { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || JSON.parse(await readFile(marker, 'utf8')).owner !== 'trisoul-x-browser-bridge') throw new Error('Windows 连接程序目录不属于 Oh My DSH'); }
    const staging = await mkdtemp(join(this.directory, '.build-'));
    try {
      try {
        await run(process.execPath, [fileURLToPath(new URL('../../scripts/build-computer-use-windows.mjs', import.meta.url))], { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, TRISOUL_CU_WINDOWS_OUTPUT: staging } });
      } catch (error) { throw new Error(error.killed ? 'Windows 连接程序构建超时，请重试。' : 'Windows 连接程序构建失败，请确认已安装 .NET 10 SDK，并可访问 NuGet。'); }
      const candidate = join(staging, expected.executable), info = JSON.parse((await run(candidate, ['info'], { windowsHide: true, timeout: 5000 })).stdout);
      if (info.name !== 'oh-my-dsh-browser-bridge' || info.protocol !== 1 || info.build !== expected.build || (await this.location()).build !== expected.build) throw new Error('Windows 连接程序构建版本不一致，请重新准备。');
      const sha256 = createHash('sha256').update(await readFile(candidate)).digest('hex');
      await writeFile(join(staging, 'build.json'), JSON.stringify({ owner: 'trisoul-x-browser-bridge', build: expected.build, sha256 }) + '\n');
      // Publish a fresh generation even when repairing the same source build.
      // Windows may still have the old executable open; never overwrite it.
      const name = expected.build + '-' + randomUUID();
      await rename(staging, join(this.directory, name));
      const pointer = join(this.directory, '.current-' + randomUUID());
      try { await writeFile(pointer, JSON.stringify({ build: expected.build, directory: name }) + '\n', { flag: 'wx' }); await rename(pointer, join(this.directory, 'current.json')); }
      finally { await rm(pointer, { force: true }); }
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  async call(args) { const { command } = await this.command(); return JSON.parse((await run(command, args, { windowsHide: true, timeout: 10000, maxBuffer: 65536 })).stdout); }
  async lock(host) { const { command } = await this.command(); return nativeLock(command, 'HKCU/Chrome/NativeMessagingHosts/' + host); }
  read(host) { return this.call(['registry-read', host]); }
  set(host, path) { return this.call(['registry-set', host, path]); }
  restore(host, path, records) { return this.call(['registry-restore', host, path, JSON.stringify(records)]); }
}
