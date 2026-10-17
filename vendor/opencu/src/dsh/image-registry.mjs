import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Keep legacy references readable without rewriting every previous screenshot. */
export function createImageRegistry(getDataDir) {
  let images, buckets, loading, directory, tail = Promise.resolve();
  const bucketOf = id => createHash('sha256').update(id).digest('hex')[0];
  async function read(path) {
    let value;
    try { value = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return {}; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid persisted image registry');
    return value;
  }
  async function ready() {
    if (images) return;
    if (!loading) loading = (async () => {
      const root = getDataDir(), next = await read(join(root, 'images.json')), shards = new Map();
      directory = join(root, 'image-registry');
      const names = await readdir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
      const stored = await Promise.all(names.filter(name => /^[a-f0-9][.]json$/.test(name)).sort().map(async name =>
        [name[0], await read(join(directory, name))]));
      for (const [id, entries] of stored) {
        for (const [key, image] of Object.entries(entries)) {
          if (bucketOf(key) !== id || image?.attachmentId !== key) throw new Error('Invalid persisted image registry shard');
          if (!Object.hasOwn(next, key)) Object.defineProperty(next, key, { value: image, writable: true, enumerable: true, configurable: true });
        }
        shards.set(id, entries);
      }
      images = next; buckets = shards;
    })().finally(() => { loading = undefined; });
    await loading;
  }
  function retain(image) {
    image = structuredClone(image);
    const work = tail.then(async () => {
      await ready();
      if (Object.hasOwn(images, image.attachmentId)) return;
      const id = bucketOf(image.attachmentId), next = { ...buckets.get(id), [image.attachmentId]: image };
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, id + '.json'), temporary = path + '.pending';
      try {
        await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
        await rename(temporary, path);
        buckets.set(id, next);
        Object.defineProperty(images, image.attachmentId, { value: image, writable: true, enumerable: true, configurable: true });
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    tail = work.catch(() => {}); return work;
  }
  return {
    ready,
    retain,
    get: id => Object.hasOwn(images ?? {}, id) ? images[id] : undefined,
    async close() { await tail; },
  };
}
