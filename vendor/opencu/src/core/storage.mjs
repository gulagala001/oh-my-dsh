import {mkdir, open, readFile, rename, unlink, lstat, link, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fail} from '../protocol.mjs';

export async function createStorage(dataDir) {
  if (typeof dataDir !== 'string' || !dataDir) fail('INVALID_ARGUMENT', 'dataDir is required');
  const directory = resolve(dataDir);
  await mkdir(directory, {recursive: true});
  const lockPath = join(directory, 'controller.lock');
  const token = randomUUID();
  const guard = new DatabaseSync(join(directory, 'controller-owner.sqlite'));
  try {
    try { guard.exec('BEGIN IMMEDIATE'); }
    catch (error) {
      if (error.errcode === 5) fail('DATA_DIR_LOCKED', 'Another controller owns this dataDir');
      throw error;
    }
    // Publish the complete legacy-compatible marker in one exclusive step.
    // The OS releases the SQLite writer on exit, fencing concurrent reapers.
    const candidate = join(directory, token + '.lock.tmp');
    try {
      const file = await open(candidate, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({protocol: 2, pid: process.pid, token})); await file.sync(); }
      finally { await file.close(); }
      for (;;) {
        try { await link(candidate, lockPath); break; }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        let owner;
        try { owner = JSON.parse(await readFile(lockPath, 'utf8')); }
        catch (error) {
          if (error.code === 'ENOENT') continue;
          fail('DATA_DIR_LOCKED', 'Controller lock is unreadable; inspect it before recovery');
        }
        if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0) fail('DATA_DIR_LOCKED', 'Controller lock owner is unknown');
        if (owner.protocol !== 2) {
          try { process.kill(owner.pid, 0); fail('DATA_DIR_LOCKED', 'Another controller owns this dataDir', {pid: owner.pid}); }
          catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
        await rm(lockPath, {force: true});
      }
    } finally { await rm(candidate, {force: true}); }
  } catch (error) { guard.close(); throw error; }
  let tail = Promise.resolve();
  const committed = new Map();
  const stamp = info => info.isFile() ? `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}` : null;
  async function identity(path) {
    try {
      const info = await lstat(path, {bigint: true});
      return stamp(info);
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return {
    directory,
    async read(name, fallback) {
      try { return JSON.parse(await readFile(join(directory, name), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
    },
    write(name, value) {
      const work = tail.then(async () => {
        const target = join(directory, name), content = JSON.stringify(value, null, 2);
        const digest = createHash('sha256').update(content).digest('hex'), previous = committed.get(name);
        if (previous?.digest === digest && previous.identity && previous.identity === await identity(target)) return;
        const temporary = `${target}.${randomUUID()}.tmp`;
        const handle = await open(temporary, 'wx', 0o600);
        try {
          try {
            await handle.writeFile(content); await handle.sync();
            const written = await handle.stat({bigint: true});
            await rename(temporary, target);
            const current = await handle.stat({bigint: true});
            if (committed.size >= 16) committed.delete(committed.keys().next().value);
            committed.set(name, {digest, identity: written.size === current.size && written.mtimeNs === current.mtimeNs ? stamp(current) : null});
          } finally { await handle.close(); }
        } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      });
      tail = work.catch(() => {});
      return work;
    },
    async close() {
      await tail;
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      if (owner.token !== token) fail('DATA_DIR_LOCKED', 'Controller lock ownership changed');
      await unlink(lockPath);
      guard.close();
    },
  };
}
