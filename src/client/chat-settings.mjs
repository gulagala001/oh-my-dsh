// Native ConfigForm writes are queued. Hold explicit choices over describe
// refreshes until the owner's entire queue settles, without changing its data.
export function createChatSettings(currentForm, subscribeOwner) {
  const pending = new WeakMap(), subscribers = new Set();
  let owner = currentForm(), disposed = false;
  const notify = () => {
    if (disposed) return;
    for (const subscriber of subscribers) {
      try { subscriber(); } catch (error) { console.error('Chat settings subscriber failed:', error); }
    }
  };
  let stopForm = owner.subscribe(notify);
  const stopOwner = subscribeOwner(() => {
    const next = currentForm();
    if (next === owner || disposed) return;
    stopForm(); owner = next; stopForm = owner.subscribe(notify); notify();
  });
  return {
    getSnapshot() {
      const form = currentForm(), source = form.getSnapshot(), queue = pending.get(form);
      if (!queue?.count || source.mode === 'memory') return source;
      if (queue.source !== source || queue.cachedRevision !== queue.revision) {
        queue.source = source; queue.cachedRevision = queue.revision;
        queue.snapshot = { ...source, value: { ...source.value, ...Object.fromEntries(queue.edits) } };
      }
      return queue.snapshot;
    },
    async set(field, value) {
      const form = currentForm();
      if (form.getSnapshot().mode === 'memory') return form.set(field, value);
      let queue = pending.get(form);
      if (!queue) { queue = { count: 0, revision: 0, edits: new Map() }; pending.set(form, queue); }
      const selected = structuredClone(value);
      queue.count++; queue.revision++; queue.edits.set(field, selected);
      try {
        const writing = form.set(field, selected);
        notify();
        return await writing;
      } finally {
        if (--queue.count === 0) {
          queue.edits.clear(); queue.revision++;
          if (currentForm() === form) notify();
        }
      }
    },
    subscribe(subscriber) { subscribers.add(subscriber); return () => subscribers.delete(subscriber); },
    dispose() {
      if (disposed) return;
      disposed = true; stopOwner(); stopForm(); subscribers.clear();
    },
  };
}
