import { mkdir, readdir, readFile, rename, writeFile, stat, realpath, unlink } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** The desktop writes bytes into this private directory; the plugin owns durable metadata. */
export function createSidebarDownloads(getDataDir) {
  let records, directory, index, loading, tail = Promise.resolve();
  const live = new Set();
  const active = record => ['started', 'in_progress', 'paused'].includes(record.status);
  const legacyInterruption = 'The download was interrupted when its desktop host exited';
  const unavailableFile = failure => ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'INVALID_FILE', 'DELIVERY_CHANGED'].includes(failure.code);
  const fileFailure = failure => ({ code: failure.code, message: 'The retained download file is missing, changed, or unavailable' });
  function normalize(value, fallbackTime = 0) {
    if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.filename !== 'string' ||
      basename(value.filename) !== value.filename || value.filename.includes('\\') || value.filename.includes('\0') || ['.', '..', ''].includes(value.filename) ||
      !['started', 'in_progress', 'paused', 'complete', 'failed', 'canceled'].includes(value.status)) throw new Error('Invalid retained download record');
    const record = { ...value, updatedAtMs: value.updatedAtMs ?? value.startedAtMs ?? fallbackTime,
      path: join(directory, value.id, value.filename), name: value.filename, provider: 'dsh', backend: 'browser' };
    if (!Number.isFinite(record.updatedAtMs) || record.updatedAtMs < 0) throw new Error('Invalid download update time');
    // Older indexes could persist a cold-start inference as a real failure.
    // Keep it recoverable; only a producer receipt can establish a terminal state.
    if (record.status === 'failed' && record.error === legacyInterruption) {
      record.status = 'started'; delete record.error;
    }
    return record;
  }
  function select(previous, next) {
    if (!previous) return next;
    if (previous.removed || !active(previous)) return previous;
    if (active(next) && next.updatedAtMs < previous.updatedAtMs) return previous;
    return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
  }
  function visible(record) {
    if (!active(record) || live.has(record.id)) return record;
    return { ...record, status: 'failed', error: 'The desktop host has not confirmed that this download is still active',
      canPause: false, canResume: false, canCancel: false };
  }
  async function retainedFile(record) {
    const actual = await realpath(record.path);
    if (!actual.startsWith(`${await realpath(directory)}${sep}`)) throw Object.assign(new Error('Retained download escaped storage'), { code: 'INVALID_FILE' });
    const info = await stat(actual);
    if (!info.isFile() || info.size !== (record.bytes ?? record.receivedBytes)) throw Object.assign(new Error('Retained download size changed'), { code: 'DELIVERY_CHANGED' });
    return { actual, info };
  }
  async function completed(record) {
    if (record.status !== 'complete') return record;
    const next = { ...record, bytes: record.receivedBytes ?? record.bytes };
    try {
      const { actual, info } = await retainedFile(next), hash = createHash('sha256');
      for await (const chunk of createReadStream(actual)) hash.update(chunk);
      next.bytes = info.size; next.sha256 = hash.digest('hex'); next.fileExists = true;
      delete next.fileError;
    } catch (failure) {
      if (!unavailableFile(failure)) throw failure;
      next.fileExists = false; next.fileError = fileFailure(failure);
    }
    return next;
  }
  async function ready() {
    directory ??= join(resolve(getDataDir()), 'sidebar-downloads');
    index ??= join(directory, 'index.json');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (records) return;
    if (!loading) loading = (async () => {
      let next;
      try { next = JSON.parse(await readFile(index, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; next = []; }
      if (!Array.isArray(next)) throw new Error('Invalid sidebar download history');
      next = new Map(next.map(value => { const record = normalize(value); return [record.id, record]; }));
      for (const id of await readdir(directory)) {
        if (!/^[a-f0-9-]{36}$/.test(id)) continue;
        const previous = next.get(id);
        if (previous && (previous.removed || !active(previous))) continue;
        let value;
        try { value = JSON.parse(await readFile(join(directory, id, 'record.json'), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (value.id !== id) throw new Error('Invalid retained download record');
        const record = select(previous, normalize(value));
        if (record !== previous) next.set(id, await completed(record));
      }
      records = next;
    })().finally(() => { loading = undefined; });
    await loading;
  }
  async function persist(next) {
    try {
      await writeFile(`${index}.tmp`, JSON.stringify([...next.values()]), { mode: 0o600 });
      await rename(`${index}.tmp`, index); records = next;
    } finally { await unlink(`${index}.tmp`).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return {
    async location() { await ready(); return directory; },
    update(value) {
      const work = tail.then(async () => {
        await ready();
        const candidate = normalize(value, Date.now()), previous = records.get(candidate.id);
        let record = select(previous, candidate);
        // A repeat of the same completion may recover a file unavailable when
        // first reported. It cannot change the identity or completed byte count.
        if (record === previous && !previous.removed && previous.status === 'complete' && !previous.sha256 &&
          candidate.status === 'complete' && candidate.filename === previous.filename && candidate.receivedBytes === previous.bytes) {
          const verified = await completed(previous);
          if (JSON.stringify(verified) !== JSON.stringify(previous)) record = verified;
        } else if (record !== previous) record = await completed(record);
        if (record !== previous) {
          await persist(new Map(records).set(record.id, record));
        }
        if (active(record) && !record.removed && candidate.updatedAtMs >= record.updatedAtMs) live.add(record.id);
        else if (!active(record) || record.removed) live.delete(record.id);
        return visible(record);
      });
      tail = work.catch(() => {}); return work;
    },
    async list({ text = '', offset = 0, maxResults = 100 } = {}) {
      await tail; await ready();
      const needle = String(text).toLowerCase();
      const found = [...records.values()].filter(item => !item.removed && `${item.filename}\n${item.url}`.toLowerCase().includes(needle))
        .sort((a, b) => b.startedAtMs - a.startedAtMs).slice(Math.max(0, offset), Math.max(0, offset) + Math.min(1000, Math.max(1, maxResults)));
      return Promise.all(found.map(async record => {
        const { fileError: previousError, ...metadata } = record;
        let fileExists = false, fileError;
        if (record.status === 'complete') {
          try {
            await retainedFile(record);
            if (record.sha256) fileExists = true;
            else fileError = previousError ?? fileFailure({ code: 'INVALID_FILE' });
          }
          catch (failure) { if (!unavailableFile(failure)) throw failure; fileError = fileFailure(failure); }
        }
        return { ...visible(metadata), fileExists, ...(fileError ? { fileError } : {}) };
      }));
    },
    remove(id, since = 0) {
      if (!Number.isFinite(since) || since < 0) throw new Error('Invalid download history time range');
      const work = tail.then(async () => {
        await ready();
        if (id && records.has(id) && active(visible(records.get(id)))) throw new Error('Cancel the active download before removing its history');
        const next = new Map(records);
        for (const [key, record] of records) if (id ? key === id : record.startedAtMs >= since && !active(visible(record))) {
          next.set(key, { ...record, removed: true }); live.delete(key);
        }
        await persist(next);
        return { ok: true };
      });
      tail = work.catch(() => {}); return work;
    },
    async close() { await tail; },
  };
}
