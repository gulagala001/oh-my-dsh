import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const offlineEntries = [
  'src/index.mjs', 'src/ptc.mjs', 'lib/host/jobs-local.mjs',
  'lib/host/workflow-spawn.mjs', 'lib/host/pwsh-sandbox.mjs',
  'lib/host/ui-conversation.mjs', 'vendor/opencu/src/host/ui-chat.mjs',
];

export function inside(directory, path) {
  const rel = relative(directory, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}

// A directory junction can still exist after extraction while its target
// points at the preparing computer. Check links without following cycles.
export function checkLinks(directory, portable = false) {
  const errors = [];
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const target = realpathSync(child);
          if (portable && !inside(directory, target)) errors.push(`${relative(directory, child)}: 链接指向离线目录外的文件`);
          else if (portable) errors.push(`${relative(directory, child)}: 离线目录仍包含符号链接，请重新准备`);
        } catch { errors.push(`${relative(directory, child)}: 依赖链接已失效，请在有网机重新准备离线目录`); }
      } else if (entry.isDirectory()) walk(child);
    }
  };
  walk(directory);
  return errors;
}

export async function checkOffline(directory = root) {
  const errors = [], checks = [];
  let pkg;
  try {
    directory = realpathSync(resolve(directory));
    pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (typeof pkg?.version !== 'string') throw new Error('缺少插件版本');
  } catch (error) {
    return { ok: false, checks, errors: ['无法读取插件目录或 package.json，请选择完整解压后的 OMD 目录：' + error.message] };
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 19) errors.push('需要 Node.js ≥22.19（建议使用 Node.js 24）');
  const marker = join(directory, 'offline-manifest.json');
  if (existsSync(marker)) {
    try {
      const manifest = JSON.parse(readFileSync(marker, 'utf8'));
      if (manifest?.schema !== 1) errors.push('无法识别离线目录格式，请在有网机重新准备');
      else {
        if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
          errors.push(`离线目录为 ${manifest.platform}/${manifest.arch}，本机为 ${process.platform}/${process.arch}；请在同系统、同架构的有网机重新准备`);
        }
        if (manifest.version !== pkg.version) errors.push('离线清单与插件版本不一致，请重新准备');
      }
    } catch (error) {
      errors.push('离线清单无法读取或已损坏，请重新解压完整离线包：' + error.message);
    }
  }
  const dependencies = join(directory, 'node_modules');
  if (!existsSync(dependencies)) errors.push('node_modules 依赖目录缺失；源码压缩包不包含离线依赖，请在有网机运行 offline:prepare 并完整复制输出目录');
  else {
    try { errors.push(...checkLinks(dependencies, existsSync(marker))); }
    catch (error) { errors.push('无法检查依赖目录，请确认完整解压且目录可读取：' + error.message); }
  }
  // Do not attempt to load a native binary prepared for another platform.
  if (errors.length) return { ok: false, checks, errors };
  for (const entry of offlineEntries) {
    try { await import(pathToFileURL(join(directory, entry)).href); checks.push(entry); }
    catch (error) { errors.push(`${entry}: ${error.stack ?? error}`); }
  }
  const requirePackage = createRequire(join(directory, 'package.json'));
  for (const name of ['sharp', '@colbymchenry/codegraph']) {
    try {
      if (!inside(directory, realpathSync(requirePackage.resolve(name)))) throw new Error('依赖解析到了离线目录外');
      if (name === 'sharp') {
        const sharp = requirePackage(name);
        await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
      } else {
        const target = `${name}-${process.platform}-${process.arch}`;
        if (!inside(directory, realpathSync(requirePackage.resolve(target + '/lib/dist/index.js')))) throw new Error('平台包解析到了离线目录外');
        requirePackage(name);
      }
      checks.push(name);
    } catch (error) { errors.push(`${name}: ${error.stack ?? error}`); }
  }
  return { ok: errors.length === 0, checks, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkOffline(process.argv[2] ?? root);
    for (const check of result.checks) console.log('OK ' + check);
    for (const error of result.errors) console.error(error);
    if (!result.ok) process.exitCode = 1;
    else console.log('离线依赖与插件入口检查通过；请在 DSH 中安装并完整重启后验证。');
  } catch (error) { console.error(error.stack ?? error); process.exitCode = 1; }
}
