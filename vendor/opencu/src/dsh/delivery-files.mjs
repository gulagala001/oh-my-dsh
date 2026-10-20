import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, readFile, writeFile, rename, open, unlink, realpath } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

function storedName(name) {
  const suffix = extname(name), extension = Buffer.byteLength(suffix) <= 64 ? suffix : '';
  let stem = '', bytes = Buffer.byteLength(extension);
  for (const character of name.slice(0, name.length - extension.length)) {
    bytes += Buffer.byteLength(character);
    if (bytes > 255) break;
    stem += character;
  }
  return stem + extension;
}

/** Keep attachment identity separate from the editable file opened by desktop apps. */
export function createDeliveryFiles(getDataDir) {
  let registry, directory, loading, tail = Promise.resolve();
  const pending = new Map();
  const key = ref => `${ref.attachmentId}:${ref.name}`;
  function validate(ref) {
    if (!ref || !/^sha256:[a-f0-9]{64}$/.test(ref.attachmentId) || typeof ref.name !== 'string' || !ref.name || basename(ref.name) !== ref.name || /[\\\u0000-\u001f]/.test(ref.name) || ['.', '..'].includes(ref.name) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw new Error('Invalid delivered file reference');
  }
  async function ready() {
    directory ??= join(resolve(getDataDir()), 'delivered-files');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (registry) return;
    if (!loading) loading = (async () => {
      let next;
      try { next = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; next = {}; }
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('Invalid delivered file registry');
      for (const [id, ref] of Object.entries(next)) { validate(ref); if (key(ref) !== id) throw new Error('Invalid delivered file identity'); }
      registry = next;
    })().finally(() => { loading = undefined; });
    await loading;
  }
  function retainAll(refs) {
    refs = [...refs];
    for (const ref of refs) validate(ref);
    const work = tail.then(async () => {
      if (!refs.length) return;
      await ready();
      const additions = refs.filter(ref => !registry[key(ref)]);
      if (!additions.length) return;
      const next = { ...registry };
      for (const ref of additions) if (!next[key(ref)]) next[key(ref)] = ref;
      await writeFile(join(directory, 'index.json.pending'), JSON.stringify(next), { mode: 0o600 });
      await rename(join(directory, 'index.json.pending'), join(directory, 'index.json'));
      registry = next;
    });
    tail = work.catch(() => {}); return work;
  }
  async function resolveFile(ref, attachments, signal) {
    signal?.throwIfAborted();
    const id = key(ref);
    for (;;) {
      let operation = pending.get(id);
      if (!operation) {
        operation = { signal };
        operation.work = (async () => {
          const longName = Buffer.byteLength(ref.name) > 255;
          let folder = join(directory, ref.attachmentId.slice(7)), path = join(folder, ref.name);
          const check = async () => {
            const actual = await realpath(path);
            if (!actual.startsWith(`${await realpath(directory)}${sep}`)) throw new Error('Delivered file escaped storage');
            const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
            try { if (!(await file.stat()).isFile()) throw new Error('Delivered file is not a regular file'); }
            finally { await file.close(); }
            return actual;
          };
          try { return await check(); }
          catch (error) { if (error.code !== 'ENOENT' && !(longName && error.code === 'ENAMETOOLONG')) throw error; }
          if (longName) {
            // Keep full-name identity separate from the shortened private filename.
            folder = join(directory, 'long-names', createHash('sha256').update(id).digest('hex'));
            path = join(folder, storedName(ref.name));
            try { return await check(); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
          await mkdir(folder, { recursive: true, mode: 0o700 });
          const temporary = join(folder, `${randomUUID()}.pending`);
          const file = await open(temporary, 'wx', 0o600), hash = createHash('sha256');
          let size = 0;
          try {
            for await (const chunk of attachments.readFileStream(ref, signal)) {
              signal?.throwIfAborted(); hash.update(chunk); size += chunk.length;
              let offset = 0;
              while (offset < chunk.length) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
            }
            if (size !== ref.bytes || `sha256:${hash.digest('hex')}` !== ref.attachmentId) throw new Error('Delivered attachment bytes changed');
            await file.close(); signal?.throwIfAborted(); await rename(temporary, path);
            return await check();
          } finally { await file.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
        })().finally(() => pending.delete(id));
        pending.set(id, operation);
      }
      let abort;
      try {
        const cancelled = signal && new Promise((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
        const path = await (cancelled ? Promise.race([operation.work, cancelled]) : operation.work);
        signal?.throwIfAborted();
        return { ok: true, path, file: ref };
      } catch (error) {
        signal?.throwIfAborted();
        // Another caller's cancellation must not fail this live request.
        if (!operation.signal?.aborted) throw error;
      } finally { if (abort) signal.removeEventListener('abort', abort); }
    }
  }
  return {
    retain: ref => retainAll([ref]),
    retainAll,
    async resolve({ attachmentId, name }, attachments, signal) {
      await tail; await ready();
      const ref = registry[`${attachmentId}:${name}`];
      if (!ref) throw new Error('The file is not in this OpenCU delivery registry');
      return resolveFile(ref, attachments, signal);
    },
    async resolveAttachment(ref, attachments, signal) {
      ref = structuredClone(ref);
      validate(ref);
      await ready();
      // User uploads belong to DSH's attachment store, not the delivery index.
      return resolveFile(ref, attachments, signal);
    },
    async close() { await tail; await Promise.all([...pending.values()].map(operation => operation.work)); },
  };
}
