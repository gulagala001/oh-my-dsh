import { mkdir, readdir, readFile, rename, writeFile, stat, realpath } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** The desktop writes bytes into this private directory; the plugin owns durable metadata. */
export function createSidebarDownloads(getDataDir) {
  let records, directory, index, loading, tail = Promise.resolve();
  const unavailableFile = failure => ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'INVALID_FILE', 'DELIVERY_CHANGED'].includes(failure.code);
  const fileFailure = failure => ({ code: failure.code, message: 'The retained download file is missing, changed, or unavailable' });
  async function retainedFile(record) {
    const actual = await realpath(record.path);
    if (!actual.startsWith(`${await realpath(directory)}${sep}`)) throw Object.assign(new Error('Retained download escaped storage'), { code: 'INVALID_FILE' });
    const info = await stat(actual);
    if (!info.isFile() || info.size !== (record.bytes ?? record.receivedBytes)) throw Object.assign(new Error('Retained download size changed'), { code: 'DELIVERY_CHANGED' });
    return { actual, info };
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
      next = next.map(record => {
        if (!/^[a-f0-9-]{36}$/.test(record.id) || typeof record.filename !== 'string' || basename(record.filename) !== record.filename || record.filename.includes('\\') || ['.', '..'].includes(record.filename)) throw new Error('Invalid retained download record');
        return { ...record, updatedAtMs: record.updatedAtMs ?? record.startedAtMs,
          path: join(directory, record.id, record.filename), name: record.filename, provider: 'dsh', backend: 'browser' };
      });
      for (const id of await readdir(directory)) {
        if (!/^[a-f0-9-]{36}$/.test(id)) continue;
        const previous = next.find(record => record.id === id);
        if (previous?.removed || previous?.status === 'complete') continue;
        let value;
        try { value = JSON.parse(await readFile(join(directory, id, 'record.json'), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (value.id !== id || typeof value.filename !== 'string' || basename(value.filename) !== value.filename || value.filename.includes('\\') || ['.', '..'].includes(value.filename)) throw new Error('Invalid retained download record');
        const record = { ...value, updatedAtMs: value.updatedAtMs ?? previous?.updatedAtMs ?? value.startedAtMs,
          path: join(directory, id, value.filename), name: value.filename, provider: 'dsh', backend: 'browser' };
        if (record.status === 'complete') {
          record.bytes = value.receivedBytes;
          try {
            const { actual, info } = await retainedFile(record), hash = createHash('sha256');
            for await (const chunk of createReadStream(actual)) hash.update(chunk);
            record.bytes = info.size; record.sha256 = hash.digest('hex'); record.fileExists = true;
          } catch (failure) {
            if (!unavailableFile(failure)) throw failure;
            record.fileExists = false; record.fileError = fileFailure(failure);
          }
        } else if (['started', 'in_progress', 'paused'].includes(record.status)) {
          record.status = 'failed'; record.error = 'The download was interrupted when its desktop host exited';
          record.canPause = false; record.canResume = false; record.canCancel = false;
        }
        next = [...next.filter(item => item.id !== id), record];
      }
      records = next;
    })().finally(() => { loading = undefined; });
    await loading;
  }
  async function persist(next) {
    await writeFile(`${index}.tmp`, JSON.stringify(next), { mode: 0o600 });
    await rename(`${index}.tmp`, index); records = next;
  }
  return {
    async location() { await ready(); return directory; },
    update(value) {
      const work = tail.then(async () => {
        await ready();
        if (!value || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.filename !== 'string' ||
          !['started', 'in_progress', 'paused', 'complete', 'failed', 'canceled'].includes(value.status)) throw new Error('Invalid desktop download record');
        const previous = records.find(record => record.id === value.id);
        if (previous?.removed || previous?.status === 'complete') return previous;
        if (basename(value.filename) !== value.filename || value.filename.includes('\\') || ['.', '..'].includes(value.filename)) throw new Error('Invalid download filename');
        const record = { ...value, updatedAtMs: value.updatedAtMs ?? Date.now(),
          path: join(directory, value.id, value.filename), name: value.filename, provider: 'dsh', backend: 'browser' };
        if (value.status === 'complete') {
          const actual = await realpath(record.path);
          if (!actual.startsWith(`${await realpath(directory)}${sep}`)) throw new Error('Download escaped its storage directory');
          const info = await stat(actual);
          if (!info.isFile() || info.size !== value.receivedBytes) throw new Error('Download size does not match its completed record');
          const hash = createHash('sha256');
          for await (const chunk of createReadStream(actual)) hash.update(chunk);
          record.bytes = info.size; record.sha256 = hash.digest('hex'); record.fileExists = true;
        }
        await persist([...records.filter(item => item.id !== record.id), record]);
        return record;
      });
      tail = work.catch(() => {}); return work;
    },
    async list({ text = '', offset = 0, maxResults = 100 } = {}) {
      await tail; await ready();
      const needle = String(text).toLowerCase();
      const found = records.filter(item => !item.removed && `${item.filename}\n${item.url}`.toLowerCase().includes(needle))
        .sort((a, b) => b.startedAtMs - a.startedAtMs).slice(Math.max(0, offset), Math.max(0, offset) + Math.min(1000, Math.max(1, maxResults)));
      return Promise.all(found.map(async record => {
        const { fileError: previousError, ...metadata } = record;
        let fileExists = false, fileError;
        if (record.status === 'complete') {
          try { await retainedFile(record); fileExists = true; }
          catch (failure) { if (!unavailableFile(failure)) throw failure; fileError = fileFailure(failure); }
        }
        return { ...metadata, fileExists, ...(fileError ? { fileError } : {}) };
      }));
    },
    remove(id, since = 0) {
      if (!Number.isFinite(since) || since < 0) throw new Error('Invalid download history time range');
      const work = tail.then(async () => {
        await ready();
        if (id && records.some(record => record.id === id && ['started', 'in_progress', 'paused'].includes(record.status))) throw new Error('Cancel the active download before removing its history');
        await persist(records.map(record => (id ? record.id === id : record.startedAtMs >= since && !['started', 'in_progress', 'paused'].includes(record.status)) ? { ...record, removed: true } : record));
        return { ok: true };
      });
      tail = work.catch(() => {}); return work;
    },
    async close() { await tail; },
  };
}
