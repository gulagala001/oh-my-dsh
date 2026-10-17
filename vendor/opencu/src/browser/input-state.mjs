import {readFile, writeFile, rename, lstat, unlink, open} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sameIdentity} from '../protocol.mjs';

// Persist BEFORE sending a down event, so process death never loses a held input.
export async function createInputState(dataDir, browserId) {
  const path = join(dataDir, 'browser-inputs.json');
  let saved = [];
  try { saved = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(saved)) throw new Error('Invalid browser input state');
  const records = new Map();
  const unresolved = new Map(saved.filter(item => item.identity?.browserId === browserId).map(item => [item.id, item]));
  const foreign = saved.filter(item => item.identity?.browserId !== browserId);
  let tail = Promise.resolve(), committed;
  const stamp = info => info.isFile() ? `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}` : null;
  async function fileIdentity() {
    try {
      const info = await lstat(path, {bigint: true});
      return stamp(info);
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function persist() {
    const values = [...foreign, ...unresolved.values(), ...[...records.values()].filter(record => record.keys.size || record.buttons.size).map(record => ({
      id: record.id, identity: record.identity, keys: [...record.keys], buttons: [...record.buttons],
    }))];
    const content = JSON.stringify(values, null, 2);
    const work = tail.then(async () => {
      if (committed?.content === content && committed.identity && committed.identity === await fileIdentity()) return;
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, content, {mode: 0o600});
        const handle = await open(temporary, 'r');
        try {
          const written = await handle.stat({bigint: true});
          await rename(temporary, path);
          const current = await handle.stat({bigint: true});
          committed = {content, identity: written.size === current.size && written.mtimeNs === current.mtimeNs ? stamp(current) : null};
        } finally { await handle.close(); }
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
    tail = work.catch(() => {});
    return work;
  }
  return {
    adopt(record) {
      const previous = unresolved.get(record.id);
      if (previous && sameIdentity(previous.identity, record.identity)) {
        for (const key of previous.keys ?? []) record.keys.add(key);
        for (const button of previous.buttons ?? []) record.buttons.add(button);
        unresolved.delete(record.id);
      }
      records.set(record.id, record);
    },
    forget(record) {
      if (records.get(record.id) === record) records.delete(record.id);
      return persist();
    },
    persist,
    hasPending() { return unresolved.size > 0; },
    hasForeign() { return foreign.some(item => item.keys?.length || item.buttons?.length); },
    async missing(connectionId, liveIds) {
      for (const [id, previous] of unresolved) {
        // The exact CDP browser is live and the original target is gone, or an
        // owned process no longer exists. Neither can retain its old input.
        if ((previous.identity.connectionId === connectionId && !liveIds.has(id)) ||
            (previous.identity.connectionId.startsWith('owned:') && connectionId.startsWith('owned:'))) {
          unresolved.delete(id);
        }
      }
      await persist();
      return [...unresolved.values()].map(item => ({targetId: item.id, error: 'Held input belongs to an unverified browser occurrence', identity: item.identity}));
    },
  };
}
