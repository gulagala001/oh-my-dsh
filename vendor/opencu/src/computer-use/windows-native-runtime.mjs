import { existsSync, readFileSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
    if (this.removing) throw new Error('Windows 桌面运行时正在移除，请等待完成');
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
    const epoch = (await this.ownerRecord()).epoch ?? null;
    // Only publish the pointer after validation. In particular the lock helper
    // runs from this generation: Windows cannot rename its executable directory
    // while it owns the installation mutex.
    const name = expected.build + '-' + randomUUID(), staging = join(this.directory, name);
    await mkdir(staging);
    let unlock, published = false, prior = null;
    try {
      await this.compile(staging);
      const candidate = join(staging, expected.executable), info = await this.inspect(candidate);
      if (info.name !== 'oh-my-dsh-windows-desktop' || info.protocol !== expected.protocol || info.build !== expected.build || (await this.buildInfo()).build !== expected.build) throw new Error('Windows 桌面运行时构建期间源码发生变化，请重新更新');
      const check = async binary => { const live = await this.probe(binary); if (live.serverInfo?.name !== 'trisoul-computer-use' || live._meta?.trisoul?.build !== expected.build || live._meta?.trisoul?.protocol !== expected.protocol) throw new Error('Windows 桌面运行时启动校验失败'); };
      await check(candidate);
      const sha256 = createHash('sha256').update(await readFile(candidate)).digest('hex');
      const record = { ...expected, owner, sha256, published: false };
      await writeFile(join(staging, 'build.json'), JSON.stringify(record) + '\n');
      unlock = await this.lock(candidate, this.directory);
      if (((await this.ownerRecord()).epoch ?? null) !== epoch) throw new Error('Windows 桌面运行时已在构建期间移除；本次安装已取消，请重新安装');
      let current; try { current = await this.installedInfo(); } catch { current = null; }
      if (current?.build === expected.build) return current;
      prior = this.pointer();
      if ((await this.buildInfo()).build !== expected.build) throw new Error('Windows 桌面运行时源码发生变化，请重新更新');
      await beforeReplace?.();
      await writeFile(join(staging, 'build.json'), JSON.stringify({ ...record, published: true }) + '\n');
      await this.publish({ owner, directory: name }); published = true;
      await check(join(this.directory, name, expected.executable));
      return await this.installedInfo();
    } catch (error) {
      if (published) {
        try { if (prior) await this.publish(prior); else await rm(join(this.directory, 'current.json')); }
        catch (recovery) { throw new Error('Windows 桌面更新失败，恢复安装记录也未完成；原版本目录已保留：' + this.directory); }
      }
      throw error;
    } finally { await unlock?.(); if (!published) await rm(staging, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }
  async ownerRecord() {
    const directory = await lstat(this.directory), marker = join(this.directory, 'owner.json');
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Windows 桌面运行时目录不是独立目录，未修改');
    const file = await lstat(marker);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('Windows 桌面运行时归属记录不是普通文件，未修改');
    const record = JSON.parse(await readFile(marker, 'utf8'));
    if (record.owner !== owner) throw new Error('Windows 桌面运行时目录不属于 Oh My DSH');
    return record;
  }
  async uninstall({ beforeRemove } = {}) {
    if (this.removing) return this.removing;
    if (this.installing) throw new Error('Windows 桌面运行时正在安装，请等待完成后再移除');
    this.removing = this.remove(beforeRemove).finally(() => { this.removing = null; }); return this.removing;
  }
  async remove(beforeRemove) {
    if (!existsSync(this.directory)) return { removed: true, retained: [] };
    await this.ownerRecord();
    // The installation lock must outlive deletion of the installed executable.
    // Run a verified copy outside this directory, never a helper being removed.
    const temporary = await mkdtemp(join(tmpdir(), 'oh-my-dsh-native-remove-'));
    let unlock;
    try {
      let installed; try { installed = await this.installedInfo(); } catch { installed = null; }
      const helper = join(temporary, 'OhMyDsh.Desktop.exe');
      if (installed) {
        await copyFile(installed.binary, helper);
        const record = JSON.parse(await readFile(join(this.directory, this.pointer().directory, 'build.json'), 'utf8'));
        if (createHash('sha256').update(await readFile(helper)).digest('hex') !== record.sha256) throw new Error('Windows 桌面运行时在准备卸载时发生变化，请重试');
        const copied = await this.inspect(helper);
        if (copied.name !== 'oh-my-dsh-windows-desktop' || copied.protocol !== 1 || copied.build !== installed.build) throw new Error('Windows 桌面卸载程序身份校验失败');
      } else {
        // A damaged executable cannot be used to coordinate deletion. The
        // development installer can rebuild a trusted helper in isolation.
        const expected = await this.buildInfo(); await this.compile(temporary);
        const rebuilt = await this.inspect(helper);
        if (rebuilt.name !== 'oh-my-dsh-windows-desktop' || rebuilt.protocol !== 1 || rebuilt.build !== expected.build) throw new Error('Windows 桌面卸载程序构建校验失败');
      }
      unlock = await this.lock(helper, this.directory);
      const marker = await this.ownerRecord(); await beforeRemove?.();
      // In-flight compilers with the old epoch must not republish after remove.
      // Keep this small tombstone so an explicit later install can start anew.
      await this.publish({ ...marker, epoch: randomUUID() }, 'owner.json');
      const pointer = this.pointer(), retained = [];
      const names = (await readdir(this.directory)).filter(name => generation.test(name));
      names.sort((a, b) => Number(b === pointer?.directory) - Number(a === pointer?.directory));
      for (const name of names) {
        const path = join(this.directory, name), metadata = join(path, 'build.json');
        const folder = await lstat(path);
        if (!folder.isDirectory() || folder.isSymbolicLink()) { retained.push(path); continue; }
        let record;
        try { const file = await lstat(metadata); if (!file.isFile() || file.isSymbolicLink()) { retained.push(path); continue; } record = JSON.parse(await readFile(metadata, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) { retained.push(path); continue; } throw error; }
        if (record.owner !== owner || record.protocol !== 1 || !name.startsWith(record.build + '-') || record.published === false) { retained.push(path); continue; }
        const binary = join(path, 'OhMyDsh.Desktop.exe');
        try { const file = await lstat(binary); if (!file.isFile() || file.isSymbolicLink()) { retained.push(path); continue; } }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        // Delete only our two recorded files. Additional content belongs to the
        // user; do not recursively remove a directory based on its name alone.
        await rm(binary, { force: true });
        if (name === pointer?.directory) await rm(join(this.directory, 'current.json'), { force: true });
        await rm(metadata);
        try { await rmdir(path); } catch (error) { if (['ENOTEMPTY', 'EEXIST'].includes(error.code)) retained.push(path); else throw error; }
      }
      if (this.binary()) throw new Error('当前 Windows 桌面运行时未能完整移除，已保留安装记录，请检查目录后重试');
      this.verified = null; return { removed: true, retained };
    } finally {
      await unlock?.();
      await rm(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }
  async publish(value, file = 'current.json') {
    const temporary = join(this.directory, '.current-' + randomUUID());
    try { await writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx' }); await rename(temporary, join(this.directory, file)); }
    finally { await rm(temporary, { force: true }); }
  }
}
