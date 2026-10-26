import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const failure = error => inspect(error, { depth: 5, colors: false });
function dependencyPath(directory, path, portable) {
  if (portable) {
    const rel = relative(realpathSync(directory), realpathSync(path));
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw Error('依赖解析到了离线目录外：' + path);
  }
  return path;
}

export async function checkNativeDependencies(directory, { portable = false } = {}) {
  const checks = [], errors = [], require = createRequire(join(directory, 'package.json'));
  const owned = path => dependencyPath(directory, path, portable);
  for (const name of ['sharp', '@colbymchenry/codegraph']) {
    try {
      owned(require.resolve(name));
      if (name === 'sharp') {
        const sharp = require(name);
        // Loading a manifest or resolving a .node path does not prove the
        // native entry, DLLs and runtime are intact. Exercise the actual codec.
        await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
      } else {
        const upstream = createRequire(require.resolve(name + '/package.json'));
        owned(upstream.resolve(`${name}-${process.platform}-${process.arch}/lib/dist/index.js`));
        require(name);
      }
      checks.push(name);
    } catch (error) {
      // sharp can replace MODULE_NOT_FOUND with a generic installation hint.
      // Probe its own native resolver only after failure to recover the path
      // and cause, while allowing working source/WASM builds to pass normally.
      if (name === 'sharp') {
        try {
          const upstream = createRequire(require.resolve('sharp'));
          const platform = process.platform === 'linux' && upstream('detect-libc').familySync() === 'musl' ? 'linuxmusl' : process.platform;
          upstream(`@img/sharp-${platform}-${process.arch}/sharp.node`);
        } catch (cause) { error = new AggregateError([error, cause], 'sharp 实际加载失败；原生入口诊断'); }
      }
      errors.push(`${name}: ${failure(error)}`);
    }
  }
  return { checks, errors };
}

export async function checkDeferredDependencies(directory, options = {}) {
  const checks = [], errors = [], require = createRequire(join(directory, 'package.json'));
  for (const name of ['@modelcontextprotocol/client', '@modelcontextprotocol/client/stdio', '@deepseek-ai/dsh-mcp-client', 'playwright', 'ws', '@mozilla/readability', 'jsdom']) {
    try { await import(pathToFileURL(dependencyPath(directory, require.resolve(name), options.portable)).href); checks.push(name); }
    catch (error) { errors.push(`${name}: ${failure(error)}`); }
  }
  const native = await checkNativeDependencies(directory, options);
  checks.push(...native.checks); errors.push(...native.errors);
  return { checks, errors };
}

export async function checkRuntime(directory = root) {
  directory = resolve(directory);
  const checks = [], errors = [];
  for (const entry of ['src/index.mjs', 'src/runtime.mjs', 'src/ptc.mjs', 'vendor/opencu/src/dsh/index.mjs']) {
    try {
      const plugin=await import(pathToFileURL(join(directory, entry)).href);
      if(typeof plugin.apply!=='function')throw Error('Plugin entry does not export apply()');
      checks.push(entry);
    }
    catch (error) { errors.push(`${entry}: ${failure(error)}`); }
  }
  const deferred = await checkDeferredDependencies(directory);
  checks.push(...deferred.checks); errors.push(...deferred.errors);
  return { ok: errors.length === 0, checks, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await checkRuntime(process.argv[2] ?? root);
    for (const check of result.checks) console.log('OK ' + check);
    for (const error of result.errors) console.error(error);
    if (!result.ok) {
      console.error('依赖检查失败。完整退出 DSH 并备份 profile，按原安装来源重新安装后再检查；--lockfile-only 不修复缺失文件。');
      process.exitCode = 1;
    } else console.log('插件入口和依赖实际加载通过；sharp 已生成测试 PNG。');
  } catch (error) { console.error(failure(error)); process.exitCode = 1; }
}
