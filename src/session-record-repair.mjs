import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, realpath, stat, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { constants, zstdCompress, zstdDecompress } from 'node:zlib';
import { symbols } from '@deepseek-ai/cordis';

export const OPTIMIZATION_RECORD = 'plugin:oh-my-dsh/tool-optimization';
const compress = promisify(zstdCompress), decompress = promisify(zstdDecompress);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
const inside = (root, path) => { const rel = relative(root, path); return rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel); };
async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const file = await open(path, 'r'); try { await file.sync(); } finally { await file.close(); }
}
async function writeExclusive(path, bytes) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}

// The faulty writer dropped only the envelope marker. Keep every other byte
// of every JSON row, including inherited records from a different session.
function repairLine(line, changed) {
  if (!line.includes(OPTIMIZATION_RECORD)) return line;
  const row = JSON.parse(line);
  if (row.type !== OPTIMIZATION_RECORD || row.ignorable === true) return line;
  const data = row.data;
  if (Object.hasOwn(row, 'ignorable') || Object.hasOwn(row, 'surfaceOp') || Object.hasOwn(row, 'sourceEventSeqs')
    || !Number.isSafeInteger(row.seq) || row.seq < 0 || !Number.isSafeInteger(row.time)
    || data?.version !== 1 || typeof data.sessionId !== 'string' || !data.sessionId
    || typeof data.id !== 'string' || !data.id.startsWith('tool-optimization:')
    || !['success', 'error', 'cancelled'].includes(data.status) || !Array.isArray(data.rules)
    || Object.keys(row).some(key => !['type', 'seq', 'time', 'data'].includes(key)))
    throw Error('工具优化记录不符合已知缺陷，原日志保留');
  changed.push(row.seq);
  return line.replace(/}(\s*)$/, ',"ignorable":true}$1');
}

// Call only for a native refusal of this exact owned record. The native lease,
// strict full-log validation and source recheck also protect offline repair.
export async function repairOptimizationRecords(path, { root, dataDir, sessionId, support, signal }) {
  signal?.throwIfAborted();
  const canonicalRoot = await realpath(root), canonicalPath = await realpath(path);
  if (!inside(canonicalRoot, canonicalPath) || !/^session\.v4\.jsonl(?:\.zstd)?$/.test(basename(path)))
    throw Error('工具优化修复只接受当前宿主目录中的 V4 日志');
  const compression = path.endsWith('.zstd') ? 'zstd' : 'none';
  const lease = await support.SessionWriteLease.acquire(dirname(canonicalPath), sessionId);
  let temporary;
  try {
    signal?.throwIfAborted();
    const before = await stat(canonicalPath, { bigint: true }), original = await readFile(canonicalPath, { signal });
    const scan = compression === 'zstd' ? support.scanZstdFrames(original) : { frames: [{ start: 0, end: original.length }] };
    if (scan.tornStart !== undefined) throw Error('会话尾帧不完整，原日志保留');
    const changed = [], frames = []; let header;
    for (const [index, frame] of scan.frames.entries()) {
      signal?.throwIfAborted();
      const bytes = original.subarray(frame.start, frame.end), text = utf8.decode(compression === 'zstd' ? await decompress(bytes) : bytes);
      if (!text.endsWith('\n')) throw Error('会话日志包含不完整记录，原日志保留');
      const lines = text.split('\n');
      if (index === 0) {
        header = JSON.parse(lines[0]);
        if (header.type !== 'session' || header.version !== 4 || header.id !== sessionId
          || await realpath(support.generationLogPath(root, header.cwd, header.id, 4, compression)) !== canonicalPath)
          throw Error('会话身份或存储路径不匹配，原日志保留');
        if (compression === 'zstd' && lines.length !== 2) throw Error('会话头帧结构无效，原日志保留');
      }
      const count = changed.length;
      const next = lines.map((line, n) => !line || index === 0 && n === 0 ? line : repairLine(line, changed)).join('\n');
      frames.push(count === changed.length ? bytes : compression === 'zstd'
        ? await compress(next, { params: { [constants.ZSTD_c_checksumFlag]: 1 } }) : Buffer.from(next));
    }
    if (!changed.length) return { changed: 0, sessionId };
    const output = Buffer.concat(frames);
    temporary = join(dirname(canonicalPath), '.omd-record-repair-' + randomUUID());
    await writeExclusive(temporary, output);
    await support.readDecodedJsonlSource(temporary, 4, compression, {
      createRestore: h => support.sessionFormatCatalog.createRestore(h, { recovery: 'strict', validation: 'current' }),
    }, signal);
    const originalSha256 = digest(original), backupDir = join(dataDir, 'session-record-repair', sessionId);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = join(backupDir, originalSha256 + '.' + basename(canonicalPath));
    try { await writeExclusive(backup, original); }
    catch (error) { if (error.code !== 'EEXIST' || digest(await readFile(backup)) !== originalSha256) throw error; }
    await syncDirectory(backupDir);
    signal?.throwIfAborted();
    if (identity(before) !== identity(await stat(canonicalPath, { bigint: true }))
      || digest(await readFile(canonicalPath)) !== originalSha256 || await realpath(path) !== canonicalPath)
      throw Error('会话在修复期间发生变化，保留原日志与备份');
    await rename(temporary, canonicalPath); temporary = undefined;
    await syncDirectory(dirname(canonicalPath));
    return { changed: changed.length, sessionId, sequences: changed, backup, originalSha256, sha256: digest(output) };
  } finally {
    try { if (temporary) await rm(temporary, { force: true }); } finally { await lease.release(); }
  }
}

// No archive sweep or startup decoding. Repair one refused open, then let the
// unchanged native reader validate and open it again. Unrelated errors retain
// the native fail-closed behavior; live writers retain their kernel lease.
export function installSessionRecordRepair(ctx, dataDir, loadSupport = async () =>
  (await import('../lib/host/session-migration.mjs')).loadMigrationSupport(ctx)) {
  const service = ctx.get('sessionPersistence'), backend = service?.[symbols.original] ?? service;
  if (!backend?.config?.root || typeof backend.open !== 'function') return;
  const original = backend.open, pending = new Map(); let closed = false;
  async function wrapped(id, access, options) {
    try { return await original.call(this, id, access, options); }
    catch (error) {
      if (closed || error?.name !== 'SessionFormatUnsupportedError' || error.location?.kind !== 'jsonl'
        || !error.message.includes(`contains event type "${OPTIMIZATION_RECORD}"`)) throw error;
      options?.signal?.throwIfAborted();
      const path = resolve(error.location.path);
      if (!pending.has(path)) {
        const repair = loadSupport().then(support => repairOptimizationRecords(path, {
          root: backend.config.root, dataDir, sessionId: id, support,
        })).then(result => { if (result.changed) ctx.logger?.info?.('已恢复会话 %s 的 %s 条工具优化记录；原始日志已备份。', id, result.changed); });
        pending.set(path, repair); repair.finally(() => { if (pending.get(path) === repair) pending.delete(path); }).catch(() => {});
      }
      await pending.get(path); options?.signal?.throwIfAborted();
      return original.call(this, id, access, options);
    }
  }
  backend.open = wrapped;
  ctx.effect(() => async () => {
    closed = true;
    if (backend.open === wrapped) backend.open = original;
    await Promise.allSettled([...pending.values()]);
  });
}
