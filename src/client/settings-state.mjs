const sameSetting = (a, b) => Object.is(a, b) || a != null && b != null && typeof a === 'object' && typeof b === 'object'
  && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every(key => Object.hasOwn(b, key) && sameSetting(a[key], b[key]));

// The server owns confirmed settings. Pending edits are an ordered overlay,
// so an older read or a failed write cannot erase a newer user's edit.
export function createSettingsState({ read, write, onChange, onSaved, onError }) {
  let confirmed = { config: null, directory: [], error: '' }, queue = Promise.resolve(), closed = false;
  const pending = [];
  const publish = () => {
    if (!closed) onChange({ ...confirmed, config: confirmed.config || pending.length
      ? Object.assign({}, confirmed.config, ...pending.map(item => item.patch)) : null });
  };
  const enqueue = run => queue = queue.then(run, run);
  async function reload() {
    try { confirmed = { ...await read(), error: '' }; return true; }
    catch (error) { confirmed = { ...confirmed, error: error.message }; return false; }
    finally { publish(); }
  }
  return {
    load: () => enqueue(() => closed ? false : reload()),
    commit(patch) {
      if (closed) return Promise.resolve(false);
      if (!patch || !Object.keys(patch).length) return queue.then(() => true);
      const item = { patch: structuredClone(patch) }; pending.push(item); publish();
      return enqueue(async () => {
        try {
          const config = await write(item.patch);
          confirmed = { ...confirmed, config, error: '' };
          onSaved?.(config);
          return true;
        } catch (error) {
          // A lost response can follow a completed server write. Read its
          // actual state before rolling back only this failed edit.
          const restored = !closed && await reload();
          if (restored && Object.entries(item.patch).every(([key, value]) => sameSetting(confirmed.config?.[key], value))) {
            onSaved?.(confirmed.config);
            return true;
          }
          if (!closed) onError?.(restored ? '设置未应用：' + error.message : '无法确认设置是否已保存；请先重新读取设置。');
          return false;
        } finally { pending.splice(pending.indexOf(item), 1); publish(); }
      });
    },
    dispose() { closed = true; }, // Already accepted writes still finish.
  };
}
