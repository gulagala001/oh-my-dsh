import {mkdir, open, readFile, rename, unlink, lstat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {fail} from '../protocol.mjs';

export async function createStorage(dataDir) {
  if (typeof dataDir !== 'string' || !dataDir) fail('INVALID_ARGUMENT', 'dataDir is required');
  const directory = resolve(dataDir);
  await mkdir(directory, {recursive: true});
  const lockPath = join(directory, 'controller.lock');
  const token = randomUUID();
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await readFile(lockPath, 'utf8')); }
    catch { fail('DATA_DIR_LOCKED', 'Controller lock is unreadable; inspect it before recovery'); }
    let alive = true;
    try { process.kill(owner.pid, 0); }
    catch (probe) { if (probe.code === 'ESRCH') alive = false; }
    if (alive) fail('DATA_DIR_LOCKED', 'Another controller owns this dataDir', {pid: owner.pid});
    await unlink(lockPath);
    lock = await open(lockPath, 'wx', 0o600);
  }
  try {
    try { await lock.writeFile(JSON.stringify({pid: process.pid, token})); }
    finally { await lock.close(); }
  } catch (error) { await unlink(lockPath); throw error; }
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
    },
  };
}
