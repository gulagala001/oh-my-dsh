import { API, SETTINGS_EVENT } from '../shared/protocol.mjs';

export function createSettingsClient() {
  let snapshot = { config: null, error: '' }, queue = Promise.resolve(), generation = 0;
  const lifetime = new AbortController(), listeners = new Set(), revisions = new WeakMap();
  const publish = value => {
    if (lifetime.signal.aborted) return;
    snapshot = { ...snapshot, ...value };
    for (const listener of listeners) listener();
  };
  const request = async (body, revision) => {
    lifetime.signal.throwIfAborted();
    const response = await fetch(API + '/settings', { signal: lifetime.signal,
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body }) });
    const data = await response.json(), config = response.ok ? data : data.config;
    const etag = response.headers.get('etag');
    const valid = config && typeof config === 'object' && !Array.isArray(config) && /^"[a-f0-9]{64}"$/.test(etag ?? '');
    if (valid) revisions.set(config, etag);
    if (!response.ok) throw Object.assign(Error(data.error || '人格设置读取失败'), { config: valid ? config : undefined });
    if (!valid) throw Error('人格设置回执无效，请重新读取');
    return config;
  };
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    async load() {
      const ticket = ++generation;
      // Reads requested during a save must not replace it with an older snapshot.
      await queue;
      if (lifetime.signal.aborted || ticket !== generation) return;
      try { const config = await request(); if (ticket === generation) publish({ config, error: '' }); }
      catch (error) { if (ticket === generation) publish({ error: error.message }); }
    },
    commit(patch, base = snapshot.config) {
      if (lifetime.signal.aborted) return Promise.resolve(false);
      const revision = revisions.get(base);
      if (!revision) { publish({ error: '请重新读取人格设置后保存；编辑草稿已保留' }); return Promise.resolve(false); }
      // Bind the exact edit and its original read together, including queued
      // writes and asynchronous file imports. Never rebase a stale full library.
      const body = JSON.stringify(patch);
      ++generation;
      const write = async () => {
        if (lifetime.signal.aborted) return false;
        try {
          const config = await request(body, revision); ++generation;
          if (lifetime.signal.aborted) return false;
          publish({ config, error: '' });
          window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: config }));
          return true;
        } catch (error) {
          ++generation;
          publish({ ...(error.config ? { config: error.config } : {}), error: '保存失败：' + error.message });
          return false;
        }
      };
      queue = queue.then(write, write); return queue;
    },
    dispose() { lifetime.abort(); ++generation; listeners.clear(); },
  };
}
