import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { symbols } from '@deepseek-ai/cordis';
import { isDeepStrictEqual } from 'node:util';

const bindingKey = Symbol.for('dsh.packaged-search-compat.v2');
const copiesKey = Symbol.for('dsh.packaged-search-copies.v2');
const original = service => service?.[symbols.original] ?? service;
function restoreMethods(service, methods) {
  for (const method of methods) {
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(service, method.name), method.owned)) continue;
    if (method.descriptor) Object.defineProperty(service, method.name, method.descriptor);
    else delete service[method.name];
  }
}

// A desktop package can retain rg's bytes while dropping its POSIX execute
// bits. Repair only a private copy; the installed host is never modified.
export async function copyNonExecutableSearchBinary(source, directory) {
  if (process.platform === 'win32' || !isAbsolute(source)) return null;
  const canonical = await realpath(source);
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) return null;
    try { await access(canonical, constants.X_OK); return null; }
    catch (error) { if (error.code !== 'EACCES') throw error; }
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  const root = join(resolve(directory), 'components', 'fs-search');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
    || (metadata.mode & 0o022) !== 0) throw new Error('Search compatibility requires an owner-controlled cache directory');
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

async function acquireSearchCopy(service, source, directory) {
  let copies = service[copiesKey];
  if (!copies) {
    copies = new Map();
    // Retain resolved paths through plugin reload and asynchronous confinement.
    // Native provider disposal also starts process termination; wait for the
    // search handles before removing executable bytes, regardless of hook order.
    service.ctx.effect(() => async () => {
      try {
        await Promise.all([...copies.values()].map(async pending => {
          const copy = await pending.catch(() => null);
          if (copy) { await Promise.allSettled([...copy.pending]); await copy.dispose(); }
        }));
      } finally { if (service[copiesKey] === copies) delete service[copiesKey]; }
    });
    Object.defineProperty(service, copiesKey, { configurable: true, value: copies });
  }
  if (!copies.has(source)) {
    const pending = copyNonExecutableSearchBinary(source, directory).then(copy => copy && { ...copy, pending: new Set() });
    copies.set(source, pending);
    pending.catch(() => { if (copies.get(source) === pending) copies.delete(source); });
  }
  return copies.get(source);
}

// Repair the exact packaged executable, not a tool name or registry layer.
// Native search tools live on preset scopes (and may be inherited by children),
// while typed workflow searches resolve the binary before sandbox confinement.
// Keep both native methods, their receiver, arguments and cancellation intact.
export function bindSearchSubprocess(ctx, service, copy) {
  service = original(service);
  let binding = service[bindingKey];
  if (!binding || !binding.methods.every(method => service[method.name] === method.wrapper)) {
    binding = { owners: new Set(), methods: [] };
    const select = path => [...binding.owners].find(receipt => path === receipt.copy.source);
    const wrap = (name, factory) => {
      const method = { name, descriptor: Object.getOwnPropertyDescriptor(service, name), original: service[name] };
      if (typeof method.original !== 'function') return;
      method.wrapper = factory(method.original);
      Object.defineProperty(service, name, { configurable: true, writable: true, value: method.wrapper });
      method.owned = Object.getOwnPropertyDescriptor(service, name);
      binding.methods.push(method);
    };
    try {
      wrap('spawn', spawn => function (spec) {
        const receipt = select(spec.argv?.[0]);
        const handle = spawn.call(this, receipt ? { ...spec, argv: [receipt.copy.executable, ...spec.argv.slice(1)] } : spec);
        const copy = receipt?.copy ?? [...binding.owners].find(owner => spec.argv?.[0] === owner.copy.executable)?.copy;
        if (copy?.pending) {
          const settled = Promise.resolve(handle.done).then(() => {}, () => {});
          copy.pending.add(settled);
          settled.then(() => copy.pending.delete(settled));
        }
        return handle;
      });
      wrap('resolveExecutable', resolveExecutable => function (command, ...args) {
        return resolveExecutable.call(this, select(command)?.copy.executable ?? command, ...args);
      });
      Object.defineProperty(service, bindingKey, { configurable: true, value: binding });
    } catch (error) { restoreMethods(service, binding.methods); throw error; }
  }
  const receipt = { copy };
  binding.owners.add(receipt);
  return () => {
    binding.owners.delete(receipt);
    if (binding.owners.size !== 0) return;
    restoreMethods(service, binding.methods);
    if (service[bindingKey] === binding) delete service[bindingKey];
  };
}

export function installSearchCompatibility(ctx, directory) {
  if (process.platform === 'win32') return;
  return ctx.inject(['subprocess', 'loader'], async scope => {
    let copy;
    try {
      const entries = [...scope.loader.entries()];
      const local = entries.find(entry => entry.options.name === '@deepseek-ai/dsh-subprocess-local');
      if (!local) return;
      // Resolve through the local host's Loader, even before any preset has
      // mounted fs-search. A session's later creation must not miss this repair.
      const [searchModule, localModule] = await Promise.all([
        local.parent.tree.import('@deepseek-ai/dsh-tool-fs-search'),
        local.parent.tree.import('@deepseek-ai/dsh-subprocess-local'),
      ]);
      const LocalRuntime = localModule.LocalSubprocessRuntime ?? localModule.default;
      const service = original(scope.subprocess);
      if (typeof LocalRuntime !== 'function' || Object.getPrototypeOf(service) !== LocalRuntime.prototype
        || typeof searchModule.resolveRgPath !== 'function') return;
      copy = await acquireSearchCopy(service, await searchModule.resolveRgPath(), directory);
      if (!copy) return;
      if (scope.fiber && (scope.fiber.uid === null || ![1, 2].includes(scope.fiber.state))) return;
      const release = bindSearchSubprocess(scope, service, copy);
      scope.effect(() => release);
    } catch (error) {
      scope.logger.warn('Could not prepare the packaged search executable: %s', error.message);
    }
  });
}
