import {mkdir, readFile, readdir, rename, stat, chmod, writeFile, open, unlink} from 'node:fs/promises';
import {basename, extname, join, resolve, sep} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';

// Leave room for the UUID prefix and the temporary copy suffix within 255 bytes.
function storedName(name) {
  const extension = extname(name), suffix = Buffer.byteLength(extension) <= 213 ? extension : '';
  let stem = '', bytes = Buffer.byteLength(suffix);
  for (const character of name.slice(0, name.length - suffix.length)) {
    bytes += Buffer.byteLength(character);
    if (bytes > 213) break;
    stem += character;
  }
  return stem + suffix;
}

export async function createDeliveryStore(dataDir) {
  const directory = join(resolve(dataDir), 'deliveries');
  const index = join(directory, 'index.json');
  await mkdir(directory, {recursive: true});
  let records = [];
  try { records = JSON.parse(await readFile(index, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(records)) throw new Error('Invalid delivery index');
  records = records.map(record => record.status === 'pending' ? {...record, status: 'interrupted'} : record);
  let tail = Promise.resolve();
  const pending = new Set(), imports = new Map(), uncommitted = new Map();
  function update(record) {
    const work = tail.then(async () => {
      const next = [...records.filter(item => item.id !== record.id), record];
      const temporary = `${index}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2), {mode: 0o600});
        await rename(temporary, index);
        records = next;
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    tail = work.catch(() => {});
    return work;
  }
  async function hashFile(path) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
  }
  const importJournal = record => join(directory, record.id + '.import.json');
  async function rememberImport(record) {
    const journal = importJournal(record), temporary = journal + '.pending';
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(record)); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, journal);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    uncommitted.set(record.sourceId, record);
  }
  async function forgetImport(record) {
    await unlink(importJournal(record)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    uncommitted.delete(record.sourceId);
  }
  async function recoverImport(record) {
    let file, temporary = false;
    try { file = await open(record.path, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      file = await open(record.path + '.part', constants.O_RDONLY | constants.O_NOFOLLOW); temporary = true;
    }
    try {
      const before = await file.stat(), hash = createHash('sha256');
      if (!before.isFile() || before.size !== record.bytes) throw new Error('Pending download copy changed before recovery');
      for await (const chunk of file.createReadStream({autoClose: false})) hash.update(chunk);
      const after = await file.stat();
      if (hash.digest('hex') !== record.sha256 || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Pending download copy changed before recovery');
    } finally { await file.close(); }
    if (temporary) await rename(record.path + '.part', record.path);
    await update(record); await forgetImport(record);
    return record;
  }
  for (const entry of await readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.import\.json$/.test(entry)) continue;
    const record = JSON.parse(await readFile(join(directory, entry), 'utf8'));
    if (!record || typeof record.id !== 'string' || !/^[a-f0-9-]{36}$/.test(record.id) || entry !== record.id + '.import.json'
      || typeof record.sourceId !== 'string' || typeof record.name !== 'string' || basename(record.name) !== record.name
      || record.path !== join(directory, record.id + '-' + storedName(record.name)) || record.status !== 'complete'
      || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw new Error('Invalid pending download import');
    uncommitted.set(record.sourceId, record);
  }
  async function save(download, targetId) {
    const id = randomUUID();
    const name = basename(download.suggestedFilename().replaceAll('\\', '/')).replace(/[\u0000-\u001f]/g, '_') || 'download';
    const path = join(directory, `${id}-${storedName(name)}`);
    const record = {id, targetId, name, url: download.url(), path, createdAt: new Date().toISOString(), status: 'pending'};
    await update(record);
    try {
      await download.saveAs(path);
      await chmod(path, 0o600);
      const failure = await download.failure();
      if (failure) throw new Error(failure);
      const info = await stat(path);
      await update({...record, status: 'complete', bytes: info.size, sha256: await hashFile(path)});
    } catch (error) {
      await update({...record, status: 'failed', error: error.message});
    }
    return records.find(item => item.id === id);
  }
  return {
    importFile(sourcePath, metadata) {
      if (imports.has(metadata.sourceId)) return imports.get(metadata.sourceId);
      const work = (async () => {
        const existing = records.find(record => record.sourceId === metadata.sourceId && record.status === 'complete');
        if (existing) {
          const copied = uncommitted.get(metadata.sourceId);
          if (copied) await forgetImport(copied);
          return existing;
        }
        const copied = uncommitted.get(metadata.sourceId);
        if (copied) return recoverImport(copied);
        const id = randomUUID(), name = basename(sourcePath).replace(/[\u0000-\u001f]/g, '_') || 'download';
        const path = join(directory, `${id}-${storedName(name)}`), temporary = `${path}.part`;
        const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const before = await source.stat();
          if (!before.isFile() || metadata.expectedBytes >= 0 && before.size !== metadata.expectedBytes) throw new Error('Completed download size changed before import');
          const output = await open(temporary, 'wx', 0o600), hash = createHash('sha256');
          let bytes = 0;
          try {
            for await (const chunk of source.createReadStream({ autoClose: false })) {
              hash.update(chunk); bytes += chunk.length;
              let offset = 0;
              while (offset < chunk.length) {
                const written = await output.write(chunk, offset, chunk.length - offset);
                if (!written.bytesWritten) throw new Error('Download copy stopped before completion');
                offset += written.bytesWritten;
              }
            }
            await output.sync();
          } finally { await output.close(); }
          const after = await source.stat();
          if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Download changed while importing its durable copy');
          const record = { id, sourceId: metadata.sourceId, name, path, url: metadata.url, createdAt: new Date().toISOString(),
            attribution: metadata.attribution, status: 'complete', bytes, sha256: hash.digest('hex') };
          await rememberImport(record);
          await rename(temporary, path);
          await update(record); await forgetImport(record); return record;
        } finally {
          await source.close();
          if (!uncommitted.has(metadata.sourceId)) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      })();
      imports.set(metadata.sourceId, work); pending.add(work);
      work.finally(() => { imports.delete(metadata.sourceId); pending.delete(work); }).catch(() => {});
      return work;
    },
    capture(download, targetId) {
      const work = save(download, targetId);
      pending.add(work);
      work.finally(() => pending.delete(work)).catch(() => {});
      return work;
    },
    async list() {
      await tail;
      return Promise.all(records.map(async record => {
        if (record.status !== 'complete') return {...record};
        const absolute = resolve(record.path);
        if (!absolute.startsWith(`${directory}${sep}`)) return {...record, status: 'invalid'};
        try {
          const info = await stat(absolute);
          return {...record, status: info.size === record.bytes ? 'complete' : 'changed'};
        } catch { return {...record, status: 'missing'}; }
      }));
    },
    async flush() { await Promise.all([...pending]); await tail; },
  };
}
