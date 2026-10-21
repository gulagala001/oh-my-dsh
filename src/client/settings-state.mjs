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
          if (!closed) onError?.('保存失败：' + error.message + (restored ? '' : '；无法重新读取设置，请重试。'));
          return false;
        } finally { pending.splice(pending.indexOf(item), 1); publish(); }
      });
    },
    dispose() { closed = true; }, // Already accepted writes still finish.
  };
}
