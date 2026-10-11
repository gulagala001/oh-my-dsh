import { createHash, randomUUID } from 'node:crypto';
import { constants, lstatSync } from 'node:fs';
import { lstat, open, realpath, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setImmediate as yieldRead } from 'node:timers/promises';
import { readWindowsSourceSnapshot } from './import-windows-snapshot.mjs';

export const importFailure = (code, message = 'The selected import source could not be used') => Object.assign(new Error(message), { code });
export const sourceHash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = info => [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.birthtimeNs].map(String).join(':');
const directoryFingerprint = info => [info.dev, info.ino, info.birthtimeNs].map(String).join(':');
const missing = error => error?.code === 'ENOENT';
export const assertImportSignal = signal => { if (signal?.aborted) throw importFailure('ABORTED', 'Import was canceled'); };

export async function sourceIdentity(path, { optional = false, directory = false, marker = false, maxBytes = 268435456 } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f]/u.test(path)) throw importFailure('SOURCE_PATH_INVALID');
  let info;
  try { info = await lstat(path, { bigint: true }); }
  catch (error) { if (optional && missing(error)) return { path, exists: false }; throw importFailure(error.code === 'EACCES' || error.code === 'EPERM' ? 'SOURCE_FILE_ACCESS_DENIED' : 'SOURCE_FILE_UNAVAILABLE'); }
  if (marker) return { path, exists: true, marker: true, stamp: fingerprint(info), bytes: Number(info.size) };
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw importFailure('SOURCE_FILE_TYPE_INVALID');
  if (!directory && info.size > BigInt(maxBytes)) throw importFailure('SOURCE_FILE_TOO_LARGE');
  const actual = await realpath(path);
  if (process.platform === 'win32' ? actual.toLowerCase() !== path.toLowerCase() : actual !== path) throw importFailure('SOURCE_PATH_SYMLINK_UNSUPPORTED');
  return { path, exists: true, directory, stamp: directory ? directoryFingerprint(info) : fingerprint(info), bytes: Number(info.size) };
}

export async function assertSourceIdentity(identity) {
  const current = await sourceIdentity(identity.path, { optional: !identity.exists, directory: identity.directory, marker: identity.marker, maxBytes: Number.MAX_SAFE_INTEGER });
  if (current.exists !== identity.exists || current.stamp !== identity.stamp) throw importFailure('SOURCE_CHANGED');
}

export function assertSourceIdentitiesSync(identities) {
  for (const identity of identities) {
    let info;
    try { info = lstatSync(identity.path, { bigint: true }); }
    catch (error) { if (!identity.exists && missing(error)) continue; throw importFailure('SOURCE_CHANGED'); }
    if (!identity.exists || (!identity.marker && (info.isSymbolicLink() || (identity.directory ? !info.isDirectory() : !info.isFile())))
      || (identity.directory ? directoryFingerprint(info) : fingerprint(info)) !== identity.stamp) throw importFailure('SOURCE_CHANGED');
  }
}

export async function assertSourceAncestors(path) {
  for (let current = dirname(path); current !== parse(current).root; current = dirname(current)) {
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw importFailure('SOURCE_PATH_SYMLINK_UNSUPPORTED');
  }
}

// Copy only a closed source. Two complete reads, path/handle identities and
// sidecar identities bind the SQLite image to the actual selected file.
export async function readSelectedBytes(identity, { signal, maxBytes = 268435456, expectedHash } = {}) {
  assertImportSignal(signal);
  if (!identity.exists || identity.directory || identity.bytes > maxBytes) throw importFailure('SOURCE_FILE_UNAVAILABLE');
  await assertSourceAncestors(identity.path);
  await assertSourceIdentity(identity);
  if (process.platform === 'win32') {
    const bytes = await readWindowsSourceSnapshot(identity, signal);
    try {
      const digest = sourceHash(bytes);
      if (expectedHash !== undefined && digest !== expectedHash) throw importFailure('SOURCE_CHANGED');
      await assertSourceIdentity(identity); assertImportSignal(signal);
      return { bytes, digest };
    } catch (error) { bytes.fill(0); throw error; }
  }
  const handle = await open(identity.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  let bytes;
  try {
    if (fingerprint(await handle.stat({ bigint: true })) !== identity.stamp) throw importFailure('SOURCE_CHANGED');
    bytes = Buffer.alloc(identity.bytes);
    for (let offset = 0; offset < bytes.length;) {
      assertImportSignal(signal);
      const result = await handle.read(bytes, offset, Math.min(65536, bytes.length - offset), offset);
      if (!result.bytesRead) throw importFailure('SOURCE_CHANGED');
      offset += result.bytesRead;
      if (offset % 1048576 === 0) await yieldRead();
    }
    const digest = sourceHash(bytes), verify = createHash('sha256'), chunk = Buffer.alloc(Math.min(65536, Math.max(1, bytes.length)));
    try {
      for (let offset = 0; offset < bytes.length;) {
        assertImportSignal(signal);
        const result = await handle.read(chunk, 0, Math.min(chunk.length, bytes.length - offset), offset);
        if (!result.bytesRead) throw importFailure('SOURCE_CHANGED');
        verify.update(chunk.subarray(0, result.bytesRead)); offset += result.bytesRead;
      }
    } finally { chunk.fill(0); }
    if (verify.digest('hex') !== digest || expectedHash !== undefined && digest !== expectedHash
      || fingerprint(await handle.stat({ bigint: true })) !== identity.stamp) throw importFailure('SOURCE_CHANGED');
    await assertSourceIdentity(identity); assertImportSignal(signal);
    return { bytes, digest };
  } catch (error) { bytes?.fill(0); throw error; }
  finally { await handle.close(); }
}

export async function readSourceJson(identity, options = {}) {
  const { bytes, digest } = await readSelectedBytes(identity, { maxBytes: 16777216, ...options });
  try {
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw importFailure('SOURCE_METADATA_INVALID'); }
    return { value, digest };
  } finally { bytes.fill(0); }
}

export async function captureProfileSource(profile, options) {
  const identities = [await sourceIdentity(profile.rootPath, { directory: true }), await sourceIdentity(profile.profilePath, { directory: true }),
    await sourceIdentity(join(profile.rootPath, 'Local State'), { maxBytes: 16777216 })];
  const databases = [];
  if (options.importCookies) databases.push(join(profile.profilePath, 'Network', 'Cookies'), join(profile.profilePath, 'Cookies'));
  if (options.importPasswords) databases.push(join(profile.profilePath, 'Login Data'), join(profile.profilePath, 'Login Data For Account'));
  if (options.importHistory) databases.push(join(profile.profilePath, 'History'));
  for (const path of databases) {
    identities.push(await sourceIdentity(path, { optional: true }));
    for (const suffix of ['-wal', '-shm', '-journal']) identities.push(await sourceIdentity(path + suffix, { optional: true, marker: true }));
  }
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) identities.push(await sourceIdentity(join(profile.rootPath, name), { optional: true, marker: true }));
  return { identities, sourceFingerprint: sourceHash(JSON.stringify(identities)) };
}

export function requireClosedProfile(identities) {
  if (identities.some(identity => identity.exists && (basename(identity.path).startsWith('Singleton')
    || (identity.path.endsWith('-wal') || identity.path.endsWith('-journal')) && identity.bytes > 0)))
    throw importFailure('SOURCE_PROFILE_NOT_CLOSED', 'Close the source browser before importing its profile');
}

async function removeSnapshot(directory, path, bytes) {
  let handle, failed = false;
  try {
    handle = await open(path, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
    const zero = Buffer.alloc(Math.min(65536, Math.max(1, bytes)));
    for (let offset = 0; offset < bytes;) {
      const written = await handle.write(zero, 0, Math.min(zero.length, bytes - offset), offset);
      if (!written.bytesWritten) throw importFailure('SOURCE_SNAPSHOT_CLEANUP_FAILED');
      offset += written.bytesWritten;
    }
    await handle.sync();
  } catch (error) { if (!missing(error)) failed = true; }
  finally { await handle?.close().catch(() => { failed = true; }); }
  try { await rm(directory, { recursive: true, force: true }); } catch { failed = true; }
  if (failed) throw importFailure('SOURCE_SNAPSHOT_CLEANUP_FAILED');
}

export async function withSourceDatabase(identity, { directory, identities, signal }, work) {
  assertImportSignal(signal); assertSourceIdentitiesSync(identities); requireClosedProfile(identities);
  const image = await readSelectedBytes(identity, { signal });
  let database, staging, path;
  try {
    if (!image.bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw importFailure('SOURCE_DATABASE_INVALID');
    assertSourceIdentitiesSync(identities);
    const base = join(directory, 'import-staging');
    await mkdir(base, { recursive: true, mode: 0o700 });
    const baseInfo = await lstat(base);
    if (baseInfo.isSymbolicLink() || !baseInfo.isDirectory() || process.platform !== 'win32' && (baseInfo.mode & 0o077)) throw importFailure('SOURCE_SNAPSHOT_DIRECTORY_UNSAFE');
    staging = await mkdtemp(join(await realpath(base), 'source-')); path = join(staging, randomUUID() + '.sqlite');
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(image.bytes); await handle.sync(); } finally { await handle.close(); }
    image.bytes.fill(0);
    database = new DatabaseSync(path, { readOnly: true, allowExtension: false, timeout: 1000 });
    database.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN');
    const value = await work(database, image.digest);
    assertSourceIdentitiesSync(identities); assertImportSignal(signal);
    return value;
  } finally {
    image.bytes.fill(0);
    try { if (database) { try { database.exec('ROLLBACK'); } finally { database.close(); } } }
    finally { if (staging) await removeSnapshot(staging, path, identity.bytes); }
  }
}

export function sourceTable(database, name, required) {
  const table = database.prepare('SELECT type FROM sqlite_schema WHERE name=?').get(name);
  if (table?.type !== 'table') throw importFailure('SOURCE_SCHEMA_UNSUPPORTED');
  const columns = new Set(database.prepare(`PRAGMA table_info('${name}')`).all().map(row => row.name));
  if (required.some(column => !columns.has(column))) throw importFailure('SOURCE_SCHEMA_UNSUPPORTED');
  return columns;
}

export function sourceRecordCount(database, table, maximum) {
  const count = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) throw importFailure('SOURCE_RECORD_LIMIT_OR_COUNT_INVALID');
  return count;
}

export function clearImportRecords(records) {
  for (const record of records ?? []) { if ('password' in record) record.password = ''; if ('username' in record) record.username = ''; if ('value' in record) record.value = ''; }
  if (records) records.length = 0;
}
