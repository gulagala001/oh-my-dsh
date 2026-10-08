// Local API failures against one isolated simulation root. This does not model
// disk controllers, power loss, FileHandle methods, or arbitrary native I/O.
import fs from 'node:fs';
import promises from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setImmediate as realSetImmediate } from 'node:timers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports } from 'node:module';

if (process.env.OMD_SIMULATION === '1') {
  const originals = Object.fromEntries(Object.keys(fs).filter((key) => typeof fs[key] === 'function').map((key) => [key, fs[key]]));
  const originalPromises = Object.fromEntries(['readFile', 'writeFile', 'appendFile', 'open', 'rename', 'unlink', 'link'].map((key) => [key, promises[key]]));
  const realpath = originals.realpathSync.native ?? originals.realpathSync;
  const configuredRoot = process.env.OMD_SIM_ROOT;
  if (!configuredRoot || !isAbsolute(configuredRoot) || configuredRoot.includes('\0')) {
    throw new Error('Simulation file faults require an existing absolute OMD_SIM_ROOT');
  }
  const root = realpath(configuredRoot);
  if (!originals.statSync(root).isDirectory()) throw new Error('OMD_SIM_ROOT must be an existing directory');
  const auditPath = join(root, 'faults.jsonl');
  const validCodes = new Set(['EIO', 'ENOSPC', 'EACCES']);
  const validOperations = new Set(['write', 'read', 'rename', 'unlink']);
  const privateIo = new AsyncLocalStorage();
  const events = [], matches = [], auditErrors = [];
  const matchedApis = Object.create(null);
  let active = null, nextFault = 0, sequence = 0;

  const inside = (path) => {
    const rest = relative(root, path);
    return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`));
  };
  const pathString = (value) => {
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) {
      const text = value.toString();
      return Buffer.from(text).equals(value) ? text : null;
    }
    if (value instanceof URL) return fileURLToPath(value);
    return null;
  };
  // Use native realpath on the original path, preserving symlink/.. semantics.
  // A new file is checked through its closest existing parent directory.
  const canonical = (value) => {
    let path = pathString(value);
    if (!path || path.includes('\0')) throw new TypeError('Fault path must be a nonempty filesystem path');
    if (!isAbsolute(path)) path = `${process.cwd()}${sep}${path}`;
    const resolveExisting = (candidate, depth = 0) => {
      if (depth > 40) throw new Error('Fault path contains too many symbolic links');
      const suffix = [];
      for (;;) {
        try { return join(realpath(candidate), ...suffix); }
        catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
          // realpath fails for a dangling symlink even though the link itself
          // exists. Follow its target before falling back to the parent, so an
          // outside, not-yet-created target cannot masquerade as a local file.
          let link;
          try { if (originals.lstatSync(candidate).isSymbolicLink()) link = originals.readlinkSync(candidate); }
          catch (linkError) {
            if (!['ENOENT', 'ENOTDIR'].includes(linkError.code)) throw linkError;
          }
          if (link !== undefined) {
            const absolute = isAbsolute(link) ? link : `${dirname(candidate)}${sep}${link}`;
            return join(resolveExisting(absolute, depth + 1), ...suffix);
          }
          const parent = dirname(candidate);
          if (parent === candidate) throw error;
          const part = candidate.slice(parent.length + (parent.endsWith(sep) ? 0 : 1));
          // A nonexistent directory before '..' is an invalid OS path, not a
          // license to collapse it and write a different existing file.
          if (part === '.' || part === '..') throw error;
          suffix.unshift(part);
          candidate = parent;
        }
      }
    };
    return resolveExisting(path);
  };
  const safePath = (value) => {
    try {
      const path = canonical(value);
      return inside(path) && path !== auditPath ? path : null;
    } catch { return null; }
  };
  const errorData = (error) => ({ name: error.name, message: error.message, code: error.code ?? null,
    errno: error.errno ?? null, syscall: error.syscall ?? null, path: error.path ?? null });
  const record = (event) => {
    const item = structuredClone({ sequence: ++sequence, at: Date.now(), ...event });
    try {
      // Original APIs bypass all fault wrappers. O_NOFOLLOW protects the final
      // audit file; realpath also rechecks its existing parent on every append.
      if (canonical(auditPath) !== auditPath || !inside(realpath(root))) throw new Error('Simulation fault audit escaped its root');
      privateIo.run(true, () => originals.appendFileSync(auditPath, `${JSON.stringify(item)}\n`, {
        flag: fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0), mode: 0o600,
      }));
    } catch (error) {
      auditErrors.push(errorData(error));
      throw error;
    }
    events.push(item);
    return item;
  };
  // Fail at preload, before host imports, if the audit destination is unsafe or
  // unwritable. No armed failure may silently lose its independent audit.
  record({ type: 'ready', root });

  const openOperations = (flags) => {
    if (flags === undefined) return ['read'];
    if (typeof flags === 'number') {
      if (!Number.isInteger(flags) || flags < 0 || flags > 0x7fffffff) return [];
      const access = flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR);
      if (access === (fs.constants.O_WRONLY | fs.constants.O_RDWR)) return [];
      const writes = access !== fs.constants.O_RDONLY || Boolean(flags & (fs.constants.O_CREAT | fs.constants.O_TRUNC));
      return [...(access !== fs.constants.O_WRONLY ? ['read'] : []), ...(writes ? ['write'] : [])];
    }
    if (typeof flags !== 'string') return [];
    const accepted = new Set(['r', 'rs', 'sr', 'r+', 'rs+', 'sr+', 'w', 'wx', 'xw', 'w+', 'wx+', 'xw+',
      'a', 'ax', 'xa', 'a+', 'ax+', 'xa+', 'as', 'sa', 'as+', 'sa+']);
    if (!accepted.has(flags)) return [];
    return [...(flags.startsWith('r') || flags.startsWith('s') && flags.includes('r') || flags.includes('+') ? ['read'] : []),
      ...(flags.includes('w') || flags.includes('a') || flags.includes('+') ? ['write'] : [])];
  };
  const select = (name, args) => {
    if (privateIo.getStore() || !active || active.remaining === 0) return null;
    const publication = name === 'rename' || name === 'link';
    const operations = name === 'open' ? openOperations(args[1]) : [
      name === 'readFile' ? 'read' : name === 'rename' ? 'rename' : name === 'unlink' ? 'unlink' : 'write',
    ];
    if (name === 'rename') operations.push('write');
    if (!operations.includes(active.operation)) return null;
    const paths = (publication ? [args[0], args[1]] : [args[0]]).map(safePath);
    // Atomic writers stage elsewhere and publish with rename/link. Match the
    // exact destination for a logical write failure; never infer a target from
    // a temp basename, UUID, source path, or an unrelated file in the root.
    const targets = publication && active.operation === 'write' ? [paths[1]] : paths;
    if (paths.some((path) => path === null) || !targets.includes(active.path)) return null;
    return { fault: active, paths };
  };
  const simulatedError = (fault, name) => {
    const message = { EIO: 'simulated I/O error', ENOSPC: 'simulated no space left on device', EACCES: 'simulated permission denied' }[fault.code];
    const error = new Error(`${fault.code}: ${message}, ${name} '${fault.path}'`);
    Object.assign(error, { code: fault.code, errno: -osConstants.errno[fault.code], syscall: name, path: fault.path });
    return error;
  };
  const partialPrefix = (hit, name, api, args) => {
    if (hit.fault.partialBytes === undefined) return null;
    const data = args[1];
    if (name !== 'writeFile' || !['fs.writeFileSync', 'fs.promises.writeFile'].includes(api)
      || !(typeof data === 'string' || ArrayBuffer.isView(data))) {
      const error = new Error(`Partial file-write injection is unsupported for ${api} or this data type`);
      error.code = 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED';
      record({ type: 'unsupported', faultId: hit.fault.id, api, path: hit.fault.path, error: errorData(error) });
      throw error;
    }
    const options = args[2];
    const encoding = typeof options === 'string' ? options : options?.encoding ?? 'utf8';
    const bytes = typeof data === 'string' ? Buffer.from(data, encoding)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return Buffer.from(bytes.subarray(0, hit.fault.partialBytes));
  };
  const consume = (hit, api) => {
    const { fault, paths } = hit;
    const before = fault.remaining;
    fault.remaining--;
    try { record({ type: 'match', faultId: fault.id, operation: fault.operation, path: fault.path, paths, api, countBefore: before, remaining: fault.remaining }); }
    catch (error) { fault.remaining = before; throw error; }
    matchedApis[api] = (matchedApis[api] ?? 0) + 1;
    return { faultId: fault.id, operation: fault.operation, path: fault.path, api, code: fault.code, remaining: fault.remaining };
  };
  const finish = (match, error, prefix) => {
    const result = { ...match, error: errorData(error), partialBytesWritten: prefix?.length ?? null };
    matches.push(result);
    record({ type: 'failure', ...result });
    return error;
  };

  for (const name of ['readFile', 'writeFile', 'appendFile', 'open', 'rename', 'unlink', 'link']) {
    const syncName = `${name}Sync`;
    fs[syncName] = (...args) => {
      const hit = select(name, args);
      if (!hit) return originals[syncName](...args);
      const api = `fs.${syncName}`;
      const prefix = partialPrefix(hit, name, api, args);
      const match = consume(hit, api);
      let error = simulatedError(hit.fault, name);
      if (prefix !== null) {
        try { privateIo.run(true, () => originals.writeFileSync(hit.fault.path, prefix, args[2])); }
        catch (actual) { throw finish(match, actual, null); }
      }
      throw finish(match, error, prefix);
    };
    fs[name] = (...args) => {
      const callback = args.at(-1);
      // Invalid callback shapes retain native validation and do not consume a
      // fault without a valid asynchronous filesystem operation.
      if (typeof callback !== 'function') return originals[name](...args);
      const hit = select(name, args);
      if (!hit) return originals[name](...args);
      const api = `fs.${name}`;
      let error;
      try {
        partialPrefix(hit, name, api, args);
        const match = consume(hit, api);
        error = finish(match, simulatedError(hit.fault, name), null);
      } catch (actual) { error = actual; }
      realSetImmediate(() => callback(error));
    };
    promises[name] = async (...args) => {
      const hit = select(name, args);
      if (!hit) return originalPromises[name](...args);
      const api = `fs.promises.${name}`;
      const prefix = partialPrefix(hit, name, api, args);
      const match = consume(hit, api);
      let error = simulatedError(hit.fault, name);
      if (prefix !== null) {
        try { await privateIo.run(true, () => originalPromises.writeFile(hit.fault.path, prefix, args[2])); }
        catch (actual) { error = actual; throw finish(match, error, null); }
      }
      throw finish(match, error, prefix);
    };
  }
  syncBuiltinESMExports();

  const snapshot = () => structuredClone({ root, auditPath, active, remaining: active?.remaining ?? 0,
    matchedApis: { ...matchedApis }, matches, events, auditErrors,
    controlled: ['fs sync/callback and node:fs/promises readFile/writeFile/appendFile/open/rename/unlink/link', 'write faults match exact rename/link publication destinations', 'open flags distinguish read and write access', 'partial prefix only for writeFileSync and fs.promises.writeFile string/byte data'],
    boundaries: ['already-open fs.FileHandle methods', 'numeric file descriptors', 'non-UTF8 Buffer paths', 'native bindings and I/O bypassing wrapped APIs', 'OS races and hardware/power-loss behavior', 'streams not using wrapped open', 'non-file storage and external processes'],
  });
  globalThis[Symbol.for('omd.simulation.faults')] = Object.freeze({
    arm(config) {
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Fault configuration must be an object');
      if (active?.remaining > 0) throw new Error('An unconsumed file fault is already armed; call clear() first');
      const { operation, path, count = 1, code = 'EIO', partialBytes } = config;
      if (!validOperations.has(operation)) throw new TypeError('Invalid file fault operation');
      if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new TypeError('Fault path must be an absolute string');
      if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Fault count must be a positive safe integer');
      if (!validCodes.has(code)) throw new TypeError('Invalid file fault code');
      if (partialBytes !== undefined && (operation !== 'write' || !Number.isSafeInteger(partialBytes) || partialBytes < 0)) {
        throw new RangeError('partialBytes requires write and a nonnegative safe integer');
      }
      const actualPath = canonical(path);
      if (!inside(actualPath) || actualPath === root || actualPath === auditPath) throw new Error('Fault path is outside the isolated root or reserved for its audit');
      const fault = { id: nextFault + 1, operation, requestedPath: path, path: actualPath, count, remaining: count, code,
        ...(partialBytes !== undefined ? { partialBytes } : {}) };
      record({ type: 'arm', fault });
      active = fault;
      nextFault++;
      return snapshot();
    },
    clear() {
      record({ type: 'clear', faultId: active?.id ?? null, remaining: active?.remaining ?? 0 });
      active = null;
      return snapshot();
    },
    snapshot,
  });
}
