// Keep an explicit choice visible until its native write queue settles. A
// describe refresh from another settings section may still contain older values.
export function createChatSettings(currentForm, subscribeOwner) {
  const states = new WeakMap(), listeners = new Set();
  let form = currentForm(), disposed = false;
  const emit = () => {
    if (disposed) return;
    for (const listener of listeners) {
      try { listener(); } catch (error) { console.error('Chat settings subscriber failed:', error); }
    }
  };
  let unsubscribe = form.subscribe(emit);
  const stopOwner = subscribeOwner(() => {
    const next = currentForm();
    if (next === form) return;
    unsubscribe(); form = next; unsubscribe = form.subscribe(emit); emit();
  });
  return {
    getSnapshot() {
      const owner = currentForm(), source = owner.getSnapshot(), state = states.get(owner);
      if (!state?.pending || source.mode === 'memory') return source;
      if (state.source !== source || state.cachedVersion !== state.version) {
        state.source = source; state.cachedVersion = state.version;
        state.snapshot = { ...source, value: { ...source.value, ...Object.fromEntries(state.values) } };
      }
      return state.snapshot;
    },
    async set(field, value) {
      const owner = currentForm();
      if (owner.getSnapshot().mode === 'memory') return owner.set(field, value);
      let state = states.get(owner);
      if (!state) { state = { pending: 0, version: 0, values: new Map() }; states.set(owner, state); }
      const selected = structuredClone(value);
      state.pending++; state.version++; state.values.set(field, selected);
      try {
        const writing = owner.set(field, selected);
        emit();
        return await writing;
      }
      finally {
        // ConfigForm publishes only its latest write settlement. An earlier
        // field's success must not expose a stale namespace while others queue.
        if (--state.pending === 0) {
          state.values.clear(); state.version++;
          if (!disposed && currentForm() === owner) emit();
        }
      }
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; stopOwner(); unsubscribe(); listeners.clear(); },
  };
}
