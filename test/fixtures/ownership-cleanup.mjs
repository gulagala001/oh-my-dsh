import { mkdtemp, mkdir, lstat, realpath, cp, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';

const identityOf = info => ({ dev: info.dev, ino: info.ino, uid: info.uid });
const sameIdentity = (info, identity) => ['dev', 'ino', 'uid'].every(key => info[key] === identity[key]);
const directory = info => info.isDirectory() && !info.isSymbolicLink();
const within = (parent, path) => { const rest = relative(parent, path); return !rest || !isAbsolute(rest) && rest !== '..' && !rest.startsWith('..' + sep); };
const failure = error => ({ name: error.name, code: error.code, message: error.message });

// Only allocation mints deletion authority. A path or a writable audit/receipt
// cannot reconstruct this closure, even when it has the same TMPDIR prefix.
export async function createOwnedDirectory({ prefix, parent = tmpdir() }) {
  if (typeof prefix !== 'string' || !prefix || prefix.includes('/') || prefix.includes('\\') || ['.', '..'].includes(prefix)) throw Error('Invalid owned directory prefix');
  const canonicalParent = await realpath(resolve(parent)), parentInfo = await lstat(canonicalParent);
  if (!directory(parentInfo)) throw Error('Owned directory parent must be a canonical directory, not a symlink');
  const path = await mkdtemp(join(canonicalParent, prefix)), info = await lstat(path);
  if (!directory(info) || await realpath(path) !== path || typeof process.getuid === 'function' && info.uid !== process.getuid()) throw Error('Allocated directory lacks the current creation identity');
  const identity = Object.freeze({ path, parent: Object.freeze({ path: canonicalParent, ...identityOf(parentInfo) }), ...identityOf(info), symlink: false });
  const verify = async () => {
    const currentParent = await lstat(identity.parent.path);
    if (!directory(currentParent) || !sameIdentity(currentParent, identity.parent) || await realpath(identity.parent.path) !== identity.parent.path) throw Error('Owned directory parent identity changed');
    const current = await lstat(identity.path);
    if (!directory(current) || !sameIdentity(current, identity) || await realpath(identity.path) !== identity.path) throw Error('Owned directory creation identity changed');
    return identity;
  };
  await verify();
  let cleaning;
  const cleanup = ({ evidenceDirectory } = {}) => cleaning ??= (async () => {
    const errors = []; let verified = false, removed = false, evidence;
    try {
      await verify(); verified = true;
      if (evidenceDirectory !== undefined) {
        const requested = resolve(evidenceDirectory);
        if (within(identity.path, requested)) throw Error('Owned directory evidence must be outside the deleted directory');
        await mkdir(dirname(requested), { recursive: true });
        const destination = join(await realpath(dirname(requested)), basename(requested));
        if (within(identity.path, destination)) throw Error('Owned directory evidence must be outside the deleted directory');
        try { await lstat(destination); throw Object.assign(Error('Owned directory evidence already exists'), { code: 'EEXIST' }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await verify();
        await cp(identity.path, destination, { recursive: true, errorOnExist: true, force: false, dereference: false, verbatimSymlinks: true });
        evidence = Object.freeze({ directory: destination, capturedBeforeRemoval: true });
      }
    } catch (error) { errors.push(error); }
    // Failed evidence capture is still reported, but must not skip legitimate
    // cleanup. Recheck after capture; replacements and symlinks are never removed.
    if (verified) try {
      await verify();
      await rm(identity.path, { recursive: true, force: false });
      try { await lstat(identity.path); throw Error('Owned directory still exists after removal'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      removed = true;
    } catch (error) { errors.push(error); }
    const receipt = Object.freeze({ identity, verified, removed, evidence, errors: Object.freeze(errors.map(error => Object.freeze(failure(error)))) });
    if (errors.length) throw Object.assign(new AggregateError(errors, 'Owned directory cleanup failed: ' + errors.map(error => error.message).join('; ')), { receipt });
    return receipt;
  })();
  return Object.freeze({ path, identity, verify, cleanup });
}

// This is the actual ProcessMonitor.snapshot() contract, not an audit-path
// allowlist. In particular, closed alone says nothing about pending gates.
export function assertRetiredMonitor(snapshot) {
  if (!snapshot || snapshot.attached !== true || snapshot.stopping !== true || snapshot.closed !== true || snapshot.pending !== 0) throw Error('Process monitor did not close and drain its gates');
  if (!Array.isArray(snapshot.groups) || !snapshot.groups.length || snapshot.groups.some(group => group.retired !== true || group.unsafe !== false || !Array.isArray(group.members) || group.members.length)) throw Error('Process monitor groups did not safely retire');
  if (!Array.isArray(snapshot.processes) || !snapshot.processes.length || snapshot.processes.some(record => record.retired !== true || record.unsafe !== false)) throw Error('Process monitor processes did not safely retire');
  return true;
}

// Retirement permits removal after a failed stop without calling that stop
// healthy. Both the stop error and the error-bearing snapshot remain failures.
export function assertStoppedMonitor(snapshot) {
  assertRetiredMonitor(snapshot);
  if (!Array.isArray(snapshot.errors) || snapshot.errors.length) throw Error('Process monitor cleanup contains errors');
  return true;
}
