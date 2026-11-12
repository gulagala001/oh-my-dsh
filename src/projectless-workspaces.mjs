import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { publishWorkspace } from './workspace-publish.mjs';

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
  // SQLite owns the inter-process lock, including release on process death.
  // Keep the previous pid lock protocol inside it for older running hosts.
  const db = new DatabaseSync(path.join(storeDir, 'allocation.sqlite'));
  try {
    const deadline = Date.now() + 10_000;
    while (true) {
      try { db.exec('BEGIN IMMEDIATE'); break; }
      catch (error) {
        if (error.errcode !== 5) throw error;
        if (Date.now() >= deadline) throw fail('workspace allocation is busy; retry the same requestId');
        await pause(20);
      }
    }
    return await withLegacyLock(storeDir, run);
  } finally { db.close(); }
}

async function withLegacyLock(storeDir, run) {
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

  async function directoryIdentity(cwd) {
    const stat = await fs.lstat(cwd, { bigint: true }).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!stat) return null;
    if (!stat.isDirectory() || stat.ino === 0n) return false;
    return [stat.dev, stat.ino, stat.birthtimeNs].join('/');
  }

  async function matches(record, cwd) {
    if (!await safeDirectory(path.dirname(cwd))) return false;
    const identity = await directoryIdentity(cwd);
    if (!identity) return false;
    return identity === record.identity;
  }

  async function resolve({ requestId } = {}) {
    const id = requestKey(requestId);
    const record = await load(id);
    if (!record || record.state !== 'ready') return null;
    const workspace = result(record, id);
    return await matches(record, workspace.cwd) ? workspace : null;
  }

  async function owns(cwd, { requireDirectory = true, sessionId } = {}) {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd) return false;
    if (!await safeDirectory(claimsDir) || !await safeDirectory(requestsDir)) return false;
    let claimedCwd = cwd;
    let claim = await readJson(path.join(claimsDir, `${hash(cwd)}.json`));
    if (!claim) {
      claimedCwd = path.dirname(cwd);
      claim = await readJson(path.join(claimsDir, `${hash(claimedCwd)}.json`));
    }
    if (!claim) return false;
    if (!/^[a-f0-9]{64}$/.test(claim.requestHash || '')) throw fail('invalid workspace name metadata');
    const record = await readJson(path.join(requestsDir, `${claim.requestHash}.json`));
    if (!record || record.state !== 'ready') return false;
    const id = requestKey(record.requestId);
    // New projectless allocation uses the final native Session ID as its
    // request identity. Directory provenance alone cannot authorize another
    // blank Session left behind by an older first-send flow to reuse its cwd.
    // Dream can still query provenance without claiming session ownership.
    if (sessionId !== undefined && sessionId !== id) return false;
    // Claims outlive changes to the configured root. Verify the original
    // allocation rather than treating old Chat directories as new projects.
    const allocationRoot = absolute(record.root, 'stored root');
    if (keyFor(id, allocationRoot) !== claim.requestHash || result(record, id, allocationRoot).cwd !== claimedCwd) return false;
    // Read-only provenance for directories created by older releases.
    if (claimedCwd !== cwd && (!validStoredName(record.workingName) || path.join(claimedCwd, record.workingName) !== cwd)) return false;
    // Saved allocation provenance remains private after its files are removed.
    // UI and file operations still require the original safe directory.
    if (!requireDirectory && (!record.identity || (await directoryIdentity(claimedCwd)) === null)) return true;
    if (!await matches(record, claimedCwd)) return false;
    return claimedCwd === cwd || await safeDirectory(cwd);
  }

  async function prepare({ requestId } = {}) {
    const id = requestKey(requestId);
    return serialize(storeDir, async () => {
      await safeDirectory(storeDir, true);
      return withLock(storeDir, async () => {
        await safeDirectory(requestsDir, true);
        await safeDirectory(claimsDir, true);
        let record = await load(id);
        if (record?.state === 'ready') {
          const workspace = result(record, id);
          if (await matches(record, workspace.cwd)) return workspace;
          if (await directoryIdentity(workspace.cwd) !== null) {
            throw fail(record.identity ? 'confirmed workspace directory was replaced' : 'existing workspace has no physical ownership record');
          }
          // A removed workspace may be recreated, but only by exclusive publication.
        }
        const baseName = '新聊天';
        let date = record?.date;
        if (!date) {
          const instant = now();
          if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw fail('now must return a valid Date');
          date = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
        }
        const requestHash = keyFor(id);
        // Called only under the allocation lock; another request's reservation
        // survives even when the filesystem name is currently occupied.
        const releaseClaim = async file => {
          if ((await readJson(file))?.requestHash === requestHash) await fs.unlink(file);
        };
        const parent = path.join(root, date);
        await safeDirectory(parent, true);
        const privateStage = path.join(storeDir, 'staging');
        await safeDirectory(privateStage, true);
        const sameVolume = (await fs.stat(privateStage)).dev === (await fs.stat(parent)).dev;
        const stageParent = sameVolume ? privateStage : parent;
        let stage, identity;
        if (record?.state === 'pending' && record.stage && /^[.]omd-[0-9a-f-]{36}$/.test(record.stage)) {
          const previous = result(record, id);
          const claim = await readJson(path.join(claimsDir, hash(previous.cwd) + '.json'));
          if (claim?.requestHash === requestHash && record.identity && await matches(record, previous.cwd)) {
            await writeJson(fileFor(id), { ...record, state: 'ready', stage: undefined });
            return previous;
          }
          const candidate = path.join(stageParent, record.stage);
          const candidateIdentity = await directoryIdentity(candidate);
          if (candidateIdentity !== null && (!record.identity || candidateIdentity !== record.identity)) {
            // Keep a durable reference before replacing the request record. A crash or
            // external replacement left no proof that we may publish or remove this path.
            const retained = path.join(storeDir, 'unverified-stages');
            await safeDirectory(retained, true);
            await writeJson(path.join(retained, hash(candidate) + '.json'), { requestId: id, path: candidate });
          }
          if (record.identity && candidateIdentity === record.identity) {
            stage = candidate;
            identity = record.identity;
          }
        }
        // The private prepared directory's identity is durable before its
        // public name can exist. Never derive ownership from that public path.
        const firstSuffix = Number(/^新聊天-(\d+)$/.exec(record?.name)?.[1]) || 1;
        for (let suffix = firstSuffix; suffix <= 100_000; suffix++) {
          const name = suffix === firstSuffix && record?.name ? record.name : suffix === 1 ? baseName : baseName + '-' + suffix;
          const cwd = path.join(parent, name);
          const claimFile = path.join(claimsDir, hash(cwd) + '.json');
          if (await directoryIdentity(cwd) !== null) { await releaseClaim(claimFile); continue; }
          try { await writeJson(claimFile, { requestHash }, true); }
          catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if ((await readJson(claimFile))?.requestHash !== requestHash) continue;
          }
          if (!stage) {
            const stageName = '.omd-' + randomUUID();
            stage = path.join(stageParent, stageName);
            record = { version: 1, requestId: id, root, date, name, state: 'pending', stage: stageName };
            await writeJson(fileFor(id), record);
            await fs.mkdir(stage, { mode: 0o700 });
            identity = await directoryIdentity(stage);
            if (!identity) throw fail('cannot identify prepared directory');
          }
          record = { version: 1, requestId: id, root, date, name, state: 'pending', stage: path.basename(stage), identity };
          await writeJson(fileFor(id), record);
          if (await directoryIdentity(stage) !== identity) throw fail('prepared workspace directory was replaced');
          if (!await publishWorkspace(stage, cwd)) { await releaseClaim(claimFile); continue; }
          if (!await matches(record, cwd)) throw fail('published workspace directory was replaced');
          await writeJson(fileFor(id), { ...record, stage: undefined, state: 'ready' });
          return result(record, id);
        }
        throw fail('too many workspaces with the same name');
      });
    });
  }

  return { root, resolve, prepare, owns };
}
