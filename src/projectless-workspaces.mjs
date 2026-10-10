import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const queues = new Map();
const deviceName = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function fail(message) {
  const error = new Error(`projectless workspace: ${message}`);
  error.code = 'ERR_PROJECTLESS_WORKSPACE';
  return error;
}

function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw fail(`${label} must be an absolute path`);
  const result = path.normalize(value);
  if (result === path.parse(result).root) throw fail(`${label} must not be a filesystem root`);
  return result;
}

function requestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) throw fail('invalid requestId');
  return value;
}

function chatName(prompt) {
  if (prompt !== undefined && typeof prompt !== 'string') throw fail('prompt must be a string');
  let name = (prompt || '').split(/\r?\n/).find((line) => line.trim()) || '新聊天';
  name = name.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
  name = Array.from(name).slice(0, 48).join('');
  while (Buffer.byteLength(name) > 120) name = Array.from(name).slice(0, -1).join('');
  name = name.replace(/[. ]+$/g, '') || '新聊天';
  if (deviceName.test(name)) name = `聊天-${name}`;
  return name;
}

function validStoredName(name) {
  return typeof name === 'string' && name.length > 0 && Array.from(name).length <= 60 && Buffer.byteLength(name) <= 140
    && !/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(name) && !name.includes('..')
    && name === name.trim() && !/^[.]|[.]$/.test(name)
    && !deviceName.test(name);
}

// Check every component, including ancestors: recursive mkdir/realpath alone follows symlinks.
async function safeDirectory(directory, create = false) {
  const parsed = path.parse(directory);
  let current = parsed.root;
  for (const part of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return false;
      try { await fs.mkdir(current, { mode: 0o700 }); }
      catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
      stat = await fs.lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail(`unsafe directory: ${current}`);
  }
  return true;
}

async function readJson(file) {
  let handle;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw fail(`unsafe metadata file: ${file}`);
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) throw fail(`unsafe metadata file: ${file}`);
    return JSON.parse(await handle.readFile('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally { await handle?.close(); }
}

async function writeJson(file, data, exclusive = false) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(data)}\n`, { flag: 'wx', mode: 0o600 });
    if (exclusive) await fs.link(temporary, file);
    else {
      const existing = await fs.lstat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw fail(`unsafe metadata file: ${file}`);
      await fs.rename(temporary, file);
    }
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function withLock(storeDir, run) {
  const lockFile = path.join(storeDir, 'allocation.lock');
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await writeJson(lockFile, { pid: process.pid, token }, true);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.lstat(lockFile).catch((missing) => { if (missing.code === 'ENOENT') return null; throw missing; });
      if (!stat) continue;
      const owner = await readJson(lockFile);
      if (owner && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
        let dead = false;
        try { process.kill(owner.pid, 0); } catch (probeError) { dead = probeError.code === 'ESRCH'; }
        if (dead) {
          const latest = await fs.lstat(lockFile).catch(() => null);
          if (latest?.ino === stat.ino && latest?.dev === stat.dev) await fs.unlink(lockFile).catch((unlinkError) => { if (unlinkError.code !== 'ENOENT') throw unlinkError; });
          continue;
        }
      }
      if (Date.now() >= deadline) throw fail('workspace allocation is busy; retry the same requestId');
      await pause(20);
    }
  }
  try { return await run(); }
  finally {
    const owner = await readJson(lockFile);
    if (owner?.token === token) await fs.unlink(lockFile);
  }
}

function serialize(key, run) {
  const before = queues.get(key) || Promise.resolve();
  const next = before.catch(() => {}).then(run);
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}

/** Each requestId identifies one chat. resolve is read-only; prepare creates on demand. */
export function createProjectlessWorkspaceService({ root, storeDir, now = () => new Date() } = {}) {
  root = absolute(root, 'root');
  storeDir = absolute(storeDir, 'storeDir');
  if (root === storeDir || storeDir.startsWith(`${root}${path.sep}`) || root.startsWith(`${storeDir}${path.sep}`)) throw fail('root and storeDir must be separate directories');
  if (typeof now !== 'function') throw fail('now must be a function');
  const requestsDir = path.join(storeDir, 'requests');
  const claimsDir = path.join(storeDir, 'names');
  const keyFor = (id, allocationRoot = root) => hash(`${allocationRoot}\0${id}`);
  const fileFor = (id) => path.join(requestsDir, `${keyFor(id)}.json`);

  function result(record, id, allocationRoot = root) {
    if (record?.version !== 1 || record.requestId !== id || record.root !== allocationRoot || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || !validStoredName(record.name) || !['pending', 'ready'].includes(record.state)) throw fail('invalid workspace metadata');
    return { requestId: id, cwd: path.join(allocationRoot, record.date, record.name), name: record.name, date: record.date };
  }

  async function load(id) {
    if (!await safeDirectory(requestsDir)) return null;
    const record = await readJson(fileFor(id));
    if (record) result(record, id);
    return record;
  }

  async function resolve({ requestId } = {}) {
    const id = requestKey(requestId);
    const record = await load(id);
    if (!record || record.state !== 'ready') return null;
    const workspace = result(record, id);
    return await safeDirectory(workspace.cwd) ? workspace : null;
  }

  async function owns(cwd, { requireDirectory = true } = {}) {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd) return false;
    if (!await safeDirectory(claimsDir) || !await safeDirectory(requestsDir)) return false;
    const claim = await readJson(path.join(claimsDir, `${hash(cwd)}.json`));
    if (!claim) return false;
    if (!/^[a-f0-9]{64}$/.test(claim.requestHash || '')) throw fail('invalid workspace name metadata');
    const record = await readJson(path.join(requestsDir, `${claim.requestHash}.json`));
    if (!record || record.state !== 'ready') return false;
    const id = requestKey(record.requestId);
    // Claims outlive changes to the configured root. Verify the original
    // allocation rather than treating old Chat directories as new projects.
    const allocationRoot = absolute(record.root, 'stored root');
    if (keyFor(id, allocationRoot) !== claim.requestHash || result(record, id, allocationRoot).cwd !== cwd) return false;
    // Saved allocation provenance remains private after its files are removed.
    // UI and file operations still require the original safe directory.
    return requireDirectory ? await safeDirectory(cwd) : true;
  }

  async function prepare({ requestId, prompt } = {}) {
    const id = requestKey(requestId);
    const baseName = chatName(prompt);
    return serialize(storeDir, async () => {
      await safeDirectory(storeDir, true);
      return withLock(storeDir, async () => {
        await safeDirectory(requestsDir, true);
        await safeDirectory(claimsDir, true);
        let record = await load(id);
        if (record) {
          const workspace = result(record, id);
          await safeDirectory(workspace.cwd, true);
          if (record.state !== 'ready') await writeJson(fileFor(id), { ...record, state: 'ready' });
          return workspace;
        }
        const instant = now();
        if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw fail('now must return a valid Date');
        const date = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
        await safeDirectory(path.join(root, date), true);
        for (let suffix = 1; suffix <= 100_000; suffix++) {
          const name = suffix === 1 ? baseName : `${baseName}-${suffix}`;
          const cwd = path.join(root, date, name);
          const claimFile = path.join(claimsDir, `${hash(cwd)}.json`);
          const requestHash = keyFor(id);
          try { await writeJson(claimFile, { requestHash }, true); }
          catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if ((await readJson(claimFile))?.requestHash !== requestHash) continue;
          }
          // Existing directories and symlinks belong to the user; reserve a new name.
          const occupied = await fs.lstat(cwd).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
          if (occupied) continue;
          record = { version: 1, requestId: id, root, date, name, state: 'pending' };
          await writeJson(fileFor(id), record);
          try { await fs.mkdir(cwd, { mode: 0o700 }); }
          catch (error) {
            if (error.code === 'EEXIST') { await fs.unlink(fileFor(id)); continue; }
            throw error;
          }
          await safeDirectory(cwd);
          await writeJson(fileFor(id), { ...record, state: 'ready' });
          return result(record, id);
        }
        throw fail('too many workspaces with the same name');
      });
    });
  }

  return { root, resolve, prepare, owns };
}
