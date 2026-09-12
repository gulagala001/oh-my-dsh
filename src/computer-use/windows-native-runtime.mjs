import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { windowsNativeBuild } from './windows-native-build.mjs';
import { nativeLock } from './native-lock.mjs';
import { McpClient } from './mcp-client.mjs';

const run = promisify(execFile), owner = 'trisoul-x-windows-desktop';
const generation = /^[a-f0-9]{64}-[a-f0-9-]{36}$/;

export class WindowsNativeRuntime {
  constructor(directory, { buildInfo = windowsNativeBuild, compile, inspect, probe, lock = nativeLock } = {}) {
    this.directory = join(directory, 'windows-desktop'); this.buildInfo = buildInfo; this.lock = lock;
    this.compile = compile ?? (async output => {
      try { await run(process.execPath, [fileURLToPath(new URL('../../scripts/build-computer-use-windows-native.mjs', import.meta.url))], { windowsHide: true, timeout: 180000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, TRISOUL_CU_WINDOWS_NATIVE_OUTPUT: output } }); }
      catch (error) { throw new Error(error.killed ? 'Windows 桌面运行时编译超时，请重试' : 'Windows 桌面运行时编译失败，请确认已安装 .NET 10 SDK，并可访问 NuGet'); }
    });
    this.inspect = inspect ?? (async binary => JSON.parse((await run(binary, ['info'], { windowsHide: true, timeout: 5000, maxBuffer: 65536 })).stdout));
    this.probe = probe ?? (async binary => {
      const client = new McpClient(binary, ['mcp']);
      try { return await client.initialize(); } finally { await client.close(); }
    });
  }
  pointer() {
    try { const value = JSON.parse(readFileSync(join(this.directory, 'current.json'), 'utf8')); return value.owner === owner && generation.test(value.directory) ? value : null; }
    catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  }
  binary() { const current = this.pointer(); return current ? join(this.directory, current.directory, 'OhMyDsh.Desktop.exe') : null; }
  async installedInfo() {
    const pointer = this.pointer(), binary = pointer ? join(this.directory, pointer.directory, 'OhMyDsh.Desktop.exe') : null;
    if (!binary || !existsSync(binary)) return null;
    const record = JSON.parse(await readFile(join(this.directory, pointer.directory, 'build.json'), 'utf8'));
    if (record.owner !== owner || record.protocol !== 1) throw new Error('桌面控制安装记录不属于匹配的 Oh My DSH 运行时');
    const file = await stat(binary), identity = [binary, file.dev, file.ino, file.size, file.mtimeMs, file.ctimeMs].join(':');
    if (this.verified?.identity !== identity || this.verified.sha256 !== record.sha256 || this.verified.build !== record.build) {
      if (createHash('sha256').update(await readFile(binary)).digest('hex') !== record.sha256) throw new Error('Windows 桌面运行时文件已变化，请更新并修复安装');
      const info = await this.inspect(binary);
      if (info.name !== 'oh-my-dsh-windows-desktop' || info.protocol !== 1 || info.build !== record.build) throw new Error('Windows 桌面运行时身份或版本与安装记录不一致');
      this.verified = { identity, sha256: record.sha256, build: record.build };
    }
    return { binary, identity, build: record.build, version: record.version, protocol: record.protocol, displayName: 'Oh My DSH Computer Use' };
  }
  async install({ beforeReplace } = {}) {
    if (this.installing) return this.installing;
    this.installing = this.update(beforeReplace).finally(() => { this.installing = null; }); return this.installing;
  }
  async update(beforeReplace) {
    const expected = await this.buildInfo();
    let initial; try { initial = await this.installedInfo(); } catch { initial = null; }
    if (initial?.build === expected.build) return initial;
    await mkdir(this.directory, { recursive: true });
    const marker = join(this.directory, 'owner.json');
    if (!existsSync(marker) && (await readdir(this.directory)).length) throw new Error('Windows 桌面运行时目录已有其他内容，未覆盖');
    try { await writeFile(marker, JSON.stringify({ owner }) + '\n', { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || JSON.parse(await readFile(marker, 'utf8')).owner !== owner) throw new Error('Windows 桌面运行时目录不属于 Oh My DSH'); }
    const staging = await mkdtemp(join(this.directory, '.build-'));
    let unlock, published = false, prior = null, name;
    try {
      await this.compile(staging);
      const candidate = join(staging, expected.executable), info = await this.inspect(candidate);
      if (info.name !== 'oh-my-dsh-windows-desktop' || info.protocol !== expected.protocol || info.build !== expected.build || (await this.buildInfo()).build !== expected.build) throw new Error('Windows 桌面运行时构建期间源码发生变化，请重新更新');
      const check = async binary => { const live = await this.probe(binary); if (live.serverInfo?.name !== 'trisoul-computer-use' || live._meta?.trisoul?.build !== expected.build || live._meta?.trisoul?.protocol !== expected.protocol) throw new Error('Windows 桌面运行时启动校验失败'); };
      await check(candidate);
      const sha256 = createHash('sha256').update(await readFile(candidate)).digest('hex');
      await writeFile(join(staging, 'build.json'), JSON.stringify({ ...expected, owner, sha256 }) + '\n');
      unlock = await this.lock(candidate, this.directory);
      let current; try { current = await this.installedInfo(); } catch { current = null; }
      if (current?.build === expected.build) return current;
      prior = this.pointer();
      if ((await this.buildInfo()).build !== expected.build) throw new Error('Windows 桌面运行时源码发生变化，请重新更新');
      await beforeReplace?.();
      name = expected.build + '-' + randomUUID();
      await rename(staging, join(this.directory, name));
      await this.publish({ owner, directory: name }); published = true;
      await check(join(this.directory, name, expected.executable));
      return await this.installedInfo();
    } catch (error) {
      if (published) {
        try { if (prior) await this.publish(prior); else await rm(join(this.directory, 'current.json')); }
        catch (recovery) { throw new Error('Windows 桌面更新失败，恢复安装记录也未完成；原版本目录已保留：' + this.directory); }
      }
      throw error;
    } finally { await unlock?.(); await rm(staging, { recursive: true, force: true }); }
  }
  async publish(value) {
    const temporary = join(this.directory, '.current-' + randomUUID());
    try { await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx' }); await rename(temporary, join(this.directory, 'current.json')); }
    finally { await rm(temporary, { force: true }); }
  }
}
