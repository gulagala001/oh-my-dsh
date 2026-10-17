import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, realpath, readdir, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupFixture } from './process.mjs';

const inside = (parent, path) => path === parent || path.startsWith(parent + sep);
const identity = info => ({ dev: info.dev, ino: info.ino, uid: info.uid });
const same = (info, expected) => ['dev', 'ino', 'uid'].every(key => info[key] === expected[key]);
const owners = new WeakSet();

async function directoryIdentity(path, requireOwner = true) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory() || await realpath(path) !== path)
    throw Error('Fixture directory must be a canonical non-symlink directory: ' + path);
  if (requireOwner && process.getuid && info.uid !== process.getuid()) throw Error('Fixture directory has a foreign owner: ' + path);
  return identity(info);
}

// Removal authority stays in this closure. The serializable identity is audit
// data only; no API can turn it back into permission to remove a directory.
async function ownDirectory(path, parentIdentity) {
  const parent = dirname(path), expected = await directoryIdentity(path);
  const expectedParent = parentIdentity ?? await directoryIdentity(parent, false);
  const audit = Object.freeze({ path, ...expected, parent, parentIdentity: Object.freeze({ ...expectedParent }) });
  let removed = false;
  const children = new Map();
  const assertRootIdentity = async () => {
    if (removed) throw Error('Fixture directory was already removed: ' + path);
    if (!same(await directoryIdentity(parent, false), expectedParent) || !same(await directoryIdentity(path), expected))
      throw Error('Fixture directory identity changed: ' + path);
    return path;
  };
  const assertIdentity = async () => {
    await assertRootIdentity();
    for (const [child, expectedChild] of children) if (!same(await directoryIdentity(child), expectedChild))
      throw Error('Fixture child directory identity changed: ' + child);
    return path;
  };
  const owner = Object.freeze({ path, audit, assertIdentity, assertRootIdentity, async trackDirectory(name) {
    if (!name || name.split(sep).some(part => !part || part === '.' || part === '..') || resolve(path, name) !== join(path, name))
      throw Error('Invalid owned fixture child directory');
    await assertIdentity();
    let child = path;
    for (const part of name.split(sep)) {
      child = join(child, part);
      const expectedChild = await directoryIdentity(child);
      if (children.has(child) && !same(expectedChild, children.get(child))) throw Error('Fixture child directory identity changed: ' + child);
      children.set(child, expectedChild);
    }
  }, async remove() {
    if (removed) return;
    await assertIdentity();
    // Root ownership does not authorize following a nested symlink/junction
    // or mount into another tree. Unlink link-shaped entries without following
    // them (package managers legitimately create these), then recheck root.
    const inspect = async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const child = join(directory, entry.name), info = await lstat(child);
        if (info.isSymbolicLink()) { await unlink(child); continue; }
        if (info.isDirectory()) {
          if (info.dev !== expected.dev || process.getuid && info.uid !== process.getuid() || await realpath(child) !== child)
            throw Error('Fixture cleanup refuses foreign nested directories: ' + child);
          await inspect(child);
        }
      }
    };
    await inspect(path); await assertIdentity();
    await rm(path, { recursive: true, force: false });
    removed = true;
  } });
  await assertIdentity();
  owners.add(owner);
  return owner;
}

/** Allocate an owner-only directory and retain its creation-time parent identity. */
export async function createOwnedFixtureDirectory(prefix, parent = tmpdir()) {
  if (!/^[\w-]+-$/.test(prefix)) throw Error('Invalid fixture directory prefix');
  const canonicalParent = await realpath(parent), parentIdentity = await directoryIdentity(canonicalParent, false);
  const path = await mkdtemp(join(canonicalParent, prefix));
  return ownDirectory(path, parentIdentity);
}

/** An explicit false overrides the legacy, opt-in whole-fixture debug retention. */
export function fixtureRetention(retainFixture, debugArtifacts = process.env.TRISOUL_UI_ARTIFACTS) {
  if (retainFixture !== undefined && typeof retainFixture !== 'boolean') throw Error('retainFixture must be a boolean');
  return retainFixture ?? Boolean(debugArtifacts);
}

export function redactFixtureText(value) {
  return String(value ?? '')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/(\b(?:cookie|authorization)\b["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\n}]+)/gi, '$1[redacted]')
    .replace(/(\b(?:token|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret)\b["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s,;"'<>}]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[\w.\/-]+/gi, 'Bearer [redacted]');
}

export function fixtureError(error, seen = new Set(), depth = 0) {
  if (error && typeof error === 'object') {
    if (seen.has(error)) return { name: 'Error', message: '[repeated error cause]' };
    seen.add(error);
  }
  return { name: error?.name ?? 'Error', message: redactFixtureText(error?.message ?? error), stack: redactFixtureText(error?.stack),
    code: error?.code, status: error?.status, signal: error?.signal, killed: error?.killed,
    ...(error?.diagnostic ? { diagnostic: { code: error.diagnostic.code, exitCode: error.diagnostic.exitCode, status: error.diagnostic.status,
      signal: error.diagnostic.signal, killed: error.diagnostic.killed, elapsedMs: error.diagnostic.elapsedMs, timeoutMs: error.diagnostic.timeoutMs,
      argv: error.diagnostic.argv?.map(redactFixtureText) } } : {}),
    ...(error?.errors && depth < 16 ? { errors: Array.from(error.errors, value => fixtureError(value, seen, depth + 1)) } : {}),
    ...(error?.cause && depth < 16 ? { cause: fixtureError(error.cause, seen, depth + 1) } : {}) };
}

async function regularFile(path, expected) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile() || await realpath(path) !== path || expected && !same(info, expected))
    throw Error('Fixture evidence source is not its owned regular file: ' + path);
  if (process.getuid && info.uid !== process.getuid()) throw Error('Fixture evidence file has a foreign owner: ' + path);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!same(opened, info) || !opened.isFile()) throw Error('Fixture evidence file changed while opening: ' + path);
    if (opened.size > 32 * 1024 * 1024) throw Error('Fixture evidence file exceeds its size limit: ' + path);
    return await handle.readFile();
  } finally { await handle.close(); }
}

const safeName = (name, extension) => {
  if (typeof name !== 'string' || !/^[\w][\w.-]{0,127}$/.test(name) || basename(name) !== name || !name.endsWith(extension))
    throw Error('Invalid fixture evidence filename');
  return name;
};
const png = bytes => bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const summaries = rows => rows?.map(row => ({ id: row.id, events: row.events, sha256: row.sha256, status: row.status }));
const lifecycleEntry = entry => entry && ({ id: entry.id, module: entry.module, disabled: entry.disabled, state: entry.state, disposing: entry.disposing });
function lifecycleRow(row, native) {
  // No model requests, messages, credentials, session bodies or private Host
  // log tree are copied. These fields are the existing observer's lifecycle proof.
  if (native) {
    const value = {};
    for (const key of ['bootId', 'pid', 'root', 'home', 'profile', 'profileDir', 'event', 'at', 'pending', 'requested', 'id', 'events', 'sha256', 'participated',
      'sessionId', 'code', 'rootDisposed', 'rootState', 'persistenceDrained', 'liveSessions', 'liveAgents']) if (row[key] !== undefined) value[key] = row[key];
    for (const key of ['sessions', 'agents', 'finalSessions']) if (row[key] !== undefined) value[key] = summaries(row[key]);
    if (row.error !== undefined) value.error = redactFixtureText(row.error);
    if (row.failures !== undefined) value.failures = row.failures.map(redactFixtureText);
    if (row.errors !== undefined) value.errors = row.errors.map(error => ({ name: error.name, type: error.type, args: error.args.map(redactFixtureText) }));
    return value;
  }
  return { at: row.at, event: row.event, entry: lifecycleEntry(row.entry), snapshot: row.snapshot?.map(lifecycleEntry),
    registered: row.registered, error: row.error === undefined ? undefined : redactFixtureText(row.error),
    stack: row.stack === undefined ? undefined : redactFixtureText(row.stack) };
}

export function fixtureShutdownProof(proof) {
  if (!proof) return proof;
  const result = {};
  for (const key of ['graceful', 'naturalExit', 'exitCode', 'signalCode', 'pid', 'persistenceDrained', 'rootDisposed', 'pendingAtShutdown', 'pendingAtFlush', 'reason'])
    if (proof[key] !== undefined) result[key] = typeof proof[key] === 'string' ? redactFixtureText(proof[key]) : proof[key];
  if (proof.error) result.error = proof.error;
  if (proof.finalSessions) result.finalSessions = summaries(proof.finalSessions);
  if (proof.lifecycle) result.lifecycle = proof.lifecycle.map(row => lifecycleRow(row, true));
  if (proof.ownedProcesses) result.ownedProcesses = proof.ownedProcesses.map(row => ({ pid: row.pid, parent: row.parent, created: row.created }));
  return result;
}

async function evidenceParent(directory, root) {
  const requested = resolve(directory);
  // Check lexical overlap before creation, then canonical overlap before writing.
  if (inside(root, requested) || inside(requested, root)) throw Error('Fixture evidence must be outside its disposable root/home/profile');
  const missing = []; let parent = requested;
  for (;;) {
    const info = await lstat(parent).catch(error => { if (error.code === 'ENOENT') return; throw error; });
    if (info) {
      if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Fixture evidence directory must not be a symlink or file');
      break;
    }
    missing.unshift(basename(parent)); parent = dirname(parent);
  }
  parent = await realpath(parent);
  const target = join(parent, ...missing);
  if (inside(root, target) || inside(target, root)) throw Error('Fixture evidence must be outside its disposable root/home/profile');
  for (const part of missing) {
    const expected = await directoryIdentity(parent, false), next = join(parent, part);
    await mkdir(next, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    if (!same(await directoryIdentity(parent, false), expected)) throw Error('Fixture evidence parent changed during creation');
    await directoryIdentity(next); parent = next;
  }
  if (inside(root, parent) || inside(parent, root)) throw Error('Fixture evidence must be outside its disposable root/home/profile');
  return parent;
}

/** Create a unique minimal evidence directory; an unset destination never retains the fixture. */
export async function createFixtureEvidence(owner, directory) {
  if (!directory) return;
  if (!owners.has(owner)) throw Error('Fixture evidence requires its creation-time directory owner');
  if (typeof directory !== 'string') throw Error('Fixture evidence directory must be a path');
  await owner.assertIdentity();
  const output = await createOwnedFixtureDirectory('frontend-', await evidenceParent(directory, owner.path));
  const sources = new Map(); let retainedBytes = 0;
  const write = async (name, bytes) => {
    const size = typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length;
    if (size > 32 * 1024 * 1024 || retainedBytes + size > 256 * 1024 * 1024) throw Error('Fixture evidence exceeds its size limit');
    retainedBytes += size;
    await output.assertIdentity();
    const handle = await open(join(output.path, name), 'wx', 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  };
  const copyLifecycle = async name => {
    const expected = sources.get(name);
    if (!expected) return;
    // A foreign child home/profile vetoes deletion, but must not suppress the
    // independently owned root-level lifecycle log that records that failure.
    await owner.assertRootIdentity();
    const bytes = await regularFile(join(owner.path, name), expected), errors = [], rows = [];
    for (const [index, line] of bytes.toString('utf8').split('\n').entries()) {
      if (!line) continue;
      try { rows.push(lifecycleRow(JSON.parse(line), name === 'native-shutdown.jsonl')); }
      catch (error) {
        // V8 JSON errors can quote the rejected row (including model/secret
        // fields). Retain the actual error type and location, never that row.
        const failure = { name: error.name, message: 'Invalid lifecycle JSON or lifecycle fields' };
        errors.push(Error(name + ' row ' + (index + 1) + ': ' + failure.name + ': ' + failure.message));
        rows.push({ event: 'evidence-parse-error', source: name, line: index + 1, error: failure });
      }
    }
    await write(name, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
    if (errors.length) throw new AggregateError(errors, 'Fixture lifecycle evidence contains malformed rows');
  };
  return Object.freeze({ directory: output.path, audit: output.audit,
    async trackLifecycle(name) {
      if (!['native-shutdown.jsonl', 'lifecycle.jsonl'].includes(name)) throw Error('Unapproved fixture lifecycle evidence source');
      await owner.assertIdentity();
      const path = join(owner.path, name);
      await regularFile(path);
      sources.set(name, identity(await lstat(path)));
    },
    async writeScreenshot(name, bytes) {
      safeName(name, '.png');
      if (bytes.length > 32 * 1024 * 1024 || !png(bytes)) throw Error('Fixture screenshot must be a bounded PNG');
      await write(name, bytes);
    },
    async writeReport(name, value) {
      if (!['shutdown.json', 'cleanup.json'].includes(name)) throw Error('Unapproved fixture evidence report');
      await write(name, JSON.stringify(value, null, 2) + '\n');
    },
    async writeHostLog(log) { await write('host.log', redactFixtureText(log).slice(-65536) + '\n'); },
    copyNativeShutdown: () => copyLifecycle('native-shutdown.jsonl'), copyLifecycle: () => copyLifecycle('lifecycle.jsonl'),
    async copyScreenshots() {
      await owner.assertRootIdentity();
      const entries = (await readdir(owner.path, { withFileTypes: true })).filter(entry => entry.isFile() && /^[\w][\w.-]{0,127}\.png$/.test(entry.name));
      if (entries.length > 128) throw Error('Fixture screenshot count exceeds its limit');
      const errors = []; let total = 0;
      for (const entry of entries) {
        if (total > 128 * 1024 * 1024) { errors.push(Error('Fixture screenshots exceed their total size limit')); break; }
        try {
          await owner.assertRootIdentity();
          const bytes = await regularFile(join(owner.path, entry.name)); total += bytes.length;
          if (total > 128 * 1024 * 1024) throw Error('Fixture screenshots exceed their total size limit');
          if (!png(bytes)) throw Error('Fixture screenshot is not a PNG: ' + entry.name);
          await write('root-' + entry.name, bytes);
        } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Fixture screenshot evidence capture failed');
    },
  });
}

/** Keep cleanup errors visible and continue every independent cleanup action. */
export async function cleanupWithFixtureEvidence(steps, failures) {
  await cleanupFixture(steps.map(([step, action]) => async () => {
    try { await action(); }
    catch (error) { failures.push({ step, error: fixtureError(error) }); throw error; }
  }));
}
