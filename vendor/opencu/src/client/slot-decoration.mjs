// Rebind presentation adapters when the host live-loads/replaces a renderer.
// Layer metadata prevents two adapters from recursively wrapping each other.
const decoration = Symbol.for('opencu.slot-decoration.v1');
export function decorateSlot(slots, name, accepts, decorate) {
  const layer = Symbol(), installed = new Map();
  let reconciling = false, dirty = false, stopped = false;
  function reconcile() {
    if (stopped) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entriesOfSlot(name), live = new Set(entries), originals = new Map();
        for (const entry of entries) {
          const meta = entry.component[decoration], key = entry.options.key;
          if (!accepts(key) || meta && (meta.layers.includes(layer) || !live.has(meta.root))) continue;
          if (!originals.has(key)) originals.set(key, entry);
        }
        for (const [key, current] of installed) if (originals.get(key) !== current.original) {
          installed.delete(key); current.dispose();
        }
        for (const [key, original] of originals) if (!installed.has(key)) {
          const { options, component } = decorate(original);
          const meta = original.component[decoration];
          component[decoration] = { root: meta?.root || original, layers: [...(meta?.layers || []), layer] };
          const dispose = slots.register(options, component);
          installed.set(key, { original, dispose });
        }
      } while (dirty && !stopped);
    } finally { reconciling = false; }
  }
  const unsubscribe = slots.subscribe(name, reconcile); reconcile();
  return () => { stopped = true; unsubscribe(); for (const value of [...installed.values()].reverse()) value.dispose(); installed.clear(); };
}
