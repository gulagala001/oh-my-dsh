import { constants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { symbols } from '@deepseek-ai/cordis';

const calls = new AsyncLocalStorage();
const bindings = new WeakMap();
const original = service => service?.[symbols.original] ?? service;

// A desktop package can retain rg's bytes while dropping its POSIX execute
// bits. Repair only a private copy; the installed host is never modified.
export async function copyNonExecutableSearchBinary(source, directory) {
  if (process.platform === 'win32' || !isAbsolute(source)) return null;
  const canonical = await realpath(source);
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o111) !== 0) return null;
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  const root = join(resolve(directory), 'components', 'fs-search');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
    || (metadata.mode & 0o022) !== 0) throw new Error('OMD search compatibility requires an owner-controlled cache directory');
  const temporary = await mkdtemp(join(root, 'rg-'));
  try {
    const executable = join(temporary, 'rg');
    await writeFile(executable, bytes, { flag: 'wx', mode: 0o500 });
    await chmod(executable, 0o500);
    return { source, executable, dispose: () => rm(temporary, { recursive: true, force: true }) };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

// Keep spawn synchronous and keep the same provider, including its process
// containment, output collection, environment scrubbing and cancellation.
export function bindSearchSubprocess(ctx, service, copy) {
  service = original(service);
  let binding = bindings.get(service);
  if (!binding || service.spawn !== binding.wrapper) {
    const descriptor = Object.getOwnPropertyDescriptor(service, 'spawn');
    const spawn = service.spawn;
    binding = { descriptor, owners: new Set() };
    binding.wrapper = function (spec) {
      const receipt = calls.getStore();
      if (binding.owners.has(receipt) && spec.argv?.[0] === receipt.copy.source && spec.argv[1] === '--no-config') {
        return spawn.call(this, { ...spec, argv: [receipt.copy.executable, ...spec.argv.slice(1)] });
      }
      return spawn.call(this, spec);
    };
    Object.defineProperty(service, 'spawn', { configurable: true, writable: true, value: binding.wrapper });
    bindings.set(service, binding);
  }
  const receipt = { copy };
  binding.owners.add(receipt);
  ctx.on('tools/execute', (exec, next) => {
    const tool = ['grep', 'glob'].includes(exec.name) ? ctx.tools.get(exec.name) : undefined;
    const eligible = tool !== undefined && ctx.tools.get(exec.name, exec.agent) === tool;
    return calls.run(eligible ? receipt : null, next);
  }, { global: true });
  return () => {
    binding.owners.delete(receipt);
    if (binding.owners.size !== 0) return;
    if (service.spawn === binding.wrapper) {
      if (binding.descriptor) Object.defineProperty(service, 'spawn', binding.descriptor);
      else delete service.spawn;
    }
    if (bindings.get(service) === binding) bindings.delete(service);
  };
}

export function installSearchCompatibility(ctx, directory) {
  if (process.platform === 'win32') return;
  ctx.inject(['subprocess'], async scope => {
    let copy;
    try {
      const entries = [...scope.loader.entries()];
      const search = entries.find(entry => entry.options.name === '@deepseek-ai/dsh-tool-fs-search');
      const local = entries.find(entry => entry.options.name === '@deepseek-ai/dsh-subprocess-local');
      if (!search || !local) return;
      const [searchModule, localModule] = await Promise.all([
        search.parent.tree.import('@deepseek-ai/dsh-tool-fs-search'),
        local.parent.tree.import('@deepseek-ai/dsh-subprocess-local'),
      ]);
      const LocalRuntime = localModule.LocalSubprocessRuntime ?? localModule.default;
      const service = original(scope.subprocess);
      if (typeof LocalRuntime !== 'function' || Object.getPrototypeOf(service) !== LocalRuntime.prototype
        || typeof searchModule.resolveRgPath !== 'function') return;
      copy = await copyNonExecutableSearchBinary(await searchModule.resolveRgPath(), directory);
      if (!copy) return;
      if (scope.fiber && (scope.fiber.uid === null || ![1, 2].includes(scope.fiber.state))) { await copy.dispose(); return; }
      const release = bindSearchSubprocess(scope, service, copy);
      scope.effect(() => async () => { release(); await copy.dispose(); });
    } catch (error) {
      await copy?.dispose();
      scope.logger.warn('OMD could not prepare the packaged search executable: %s', error.message);
    }
  });
}
