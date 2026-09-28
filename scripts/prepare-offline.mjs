import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { checkLinks, inside } from './check-offline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageCommand = name => process.platform === 'win32' ? name + '.cmd' : name;
function canonicalDestination(path) {
  const names = [];
  while (!existsSync(path)) {
    const parent = dirname(path);
    if (parent === path) throw new Error('无法访问输出目录所在的磁盘：' + path);
    names.unshift(basename(path)); path = parent;
  }
  return resolve(realpathSync(path), ...names);
}

export async function prepareOffline(destination, source = root) {
  if (!destination) throw new Error('用法：node scripts/prepare-offline.mjs <新的离线目录>');
  destination = canonicalDestination(resolve(destination)); source = realpathSync(source);
  if (inside(source, destination) || inside(destination, source)) throw new Error('离线目录必须在源码目录外');
  if (existsSync(destination)) throw new Error('离线目录已存在，请指定一个新目录；不会覆盖已有文件');
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  await mkdir(dirname(destination), { recursive: true });
  // Stage on the destination volume: C: -> D: must not fail at the final rename.
  const staging = await mkdtemp(join(dirname(destination), '.omd-offline-'));
  const env = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
  const run = (command, args, cwd = staging) => execFileSync(command, args, {
    cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 600000,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    // Reuse npm's actual release inventory. Never copy data, credentials,
    // ignored handoff notes, or the preparing computer's node_modules.
    const [packed] = JSON.parse(run(packageCommand('npm'), ['pack', '--dry-run', '--json', '--ignore-scripts'], source));
    for (const file of packed.files) {
      const target = resolve(staging, file.path);
      if (!inside(staging, target)) throw new Error('发行文件越过离线目录：' + file.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(source, file.path), target);
    }
    await copyFile(join(source, 'pnpm-lock.yaml'), join(staging, 'pnpm-lock.yaml'));
    const config = parse(await readFile(join(source, 'pnpm-workspace.yaml'), 'utf8')) ?? {};
    config.nodeLinker = 'hoisted';
    config.packageImportMethod = 'copy';
    await writeFile(join(staging, 'pnpm-workspace.yaml'), stringify(config));
    console.log('在隔离目录安装本机平台依赖（不改动原安装）…');
    run(packageCommand('pnpm'), ['install', '--frozen-lockfile']);
    console.log('构建离线插件…');
    run(process.execPath, ['scripts/build.mjs']);
    // Unix .bin entries are symlinks. Runtime entry points use explicit paths;
    // remove build-only launchers so ZIP extraction never depends on link support.
    const removeBins = async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.name === '.bin') await rm(path, { recursive: true, force: true });
        else if (entry.isDirectory()) await removeBins(path);
      }
    };
    await removeBins(join(staging, 'node_modules'));
    const links = checkLinks(staging, true);
    if (links.length) throw new Error(links.join('\n'));
    await writeFile(join(staging, 'offline-manifest.json'), JSON.stringify({
      schema: 1, version: pkg.version, hostVersion: pkg.devDependencies['@deepseek-ai/dsh'],
      platform: process.platform, arch: process.arch, node: process.versions.node,
    }, null, 2) + '\n');
    // CodeGraph already carries a Node runtime. The offline Windows computer
    // need not install a separate Node just to run the diagnostic.
    if (process.platform === 'win32') {
      const node = `node_modules\\@colbymchenry\\codegraph-win32-${process.arch}\\node.exe`;
      if (!existsSync(join(staging, node))) throw new Error('离线目录缺少随包的 Windows Node 运行时');
      await writeFile(join(staging, 'check-offline.cmd'), `@echo off\r\n"%~dp0${node}" "%~dp0scripts\\check-offline.mjs"\r\nexit /b %errorlevel%\r\n`);
    }
    console.log('检查模块导入和本机平台包…');
    console.log(run(process.execPath, ['scripts/check-offline.mjs']).trim());
    if (existsSync(destination)) throw new Error('离线目录已被其他操作创建，请重新选择目录');
    await rename(staging, destination);
    console.log(`已准备 ${process.platform}/${process.arch} 离线目录：${destination}`);
    console.log(`完整压缩此目录，解压后运行 node scripts/check-offline.mjs；通过后在 DSH 本地安装中填写 link:<解压目录的绝对路径>。宿主须为 ${pkg.devDependencies['@deepseek-ai/dsh']}。`);
    return destination;
  } catch (error) {
    if (error.stdout) console.error(String(error.stdout).slice(-12000));
    if (error.stderr) console.error(String(error.stderr).slice(-12000));
    throw error;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareOffline(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
