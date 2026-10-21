import { createPoller } from './polling.mjs';

export async function pluginApi(input, signal) {
  const request = async signal => {
    const response = await fetch('trisoul-x/recommended-plugins', input === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
    if (response.status === 404) throw Error('插件管理尚未加载，请重启 DSH 后重试');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    signal?.throwIfAborted();
    window.dispatchEvent(new CustomEvent('omd:features-state', { detail: data }));
    return data;
  };
  if (input === undefined) return request(signal);
  const controller = new AbortController();
  let timeout;
  try {
    // Writes stop polling. Bound the HTTP acknowledgement, including its body,
    // so an accepted operation can still be observed after a lost response.
    return await Promise.race([request(controller.signal), new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = Error('请求超时，正在重新读取插件状态，请确认当前状态后重试');
        reject(error); controller.abort(error);
      }, 10000);
    })]);
  } finally { clearTimeout(timeout); }
}

// Bundled client contributions follow the host's actual runtime entry. A
// standalone installation retains its own lease when OMD releases this one.
export function applyFeatureClients(ctx, clients) {
  ctx.effect(() => {
    let alive = true, revision = 0, queued = Promise.resolve();
    const fibers = new Map();
    const sync = snapshot => {
      const ticket = ++revision;
      queued = queued.catch(() => {}).then(async () => {
        if (!alive || ticket !== revision) return;
        for (const [id, client] of Object.entries(clients)) {
          const entry = snapshot.plugins?.find(plugin => plugin.id === id);
          if (!entry) continue;
          if (entry.active && !fibers.has(id)) {
            // A client is its apply function, or `{ apply, inject }` when it waits for services.
            const fiber = ctx.plugin({ name: `omd-feature-${id}`, ...typeof client === 'function' ? { apply: client } : client });
            fibers.set(id, fiber);
            try { await fiber; } catch (error) { fibers.delete(id); await fiber.dispose(); throw error; }
          } else if (!entry.active && fibers.has(id)) {
            const fiber = fibers.get(id); fibers.delete(id); await fiber.dispose();
          }
        }
      }).catch(error => { if (alive) console.error('扩展功能界面加载失败', error); });
    };
    const changed = event => sync(event.detail);
    window.addEventListener('omd:features-state', changed);
    const poller = createPoller({ read: signal => pluginApi(undefined, signal), onData: () => {}, onError: () => {}, interval: 10000 });
    poller.start();
    return () => {
      alive = false; revision++; poller.stop(); window.removeEventListener('omd:features-state', changed);
      return queued.then(() => Promise.all([...fibers.values()].map(fiber => fiber.dispose())));
    };
  });
}
