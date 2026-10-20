import { createElement } from 'react';

// Rebind presentation adapters when the host live-loads/replaces a renderer.
// Layer metadata prevents two adapters from recursively wrapping each other.
const decoration = Symbol.for('opencu.slot-decoration.v1');
export function decorateSlot(slots, name, accepts, decorate) {
  const layer = Symbol(), installed = new Map();
  let reconciling = false, dirty = false, stopped = false;
  function reconcile() {
    // Cordis deactivates the owner before its queued slot notifications drain.
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        // Inspect the full ledger, not just shadowing winners: our own
        // renderer winning must not look like its host was unregistered.
        const entries = slots.entries(name), live = new Set(entries), originals = new Map();
        for (const entry of entries) {
          const meta = entry.component[decoration], key = entry.options.key;
          if (!accepts(key) || entry.component[refreshEntry] || meta && (meta.layers.includes(layer) || !live.has(meta.root))) continue;
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

const componentDecoration = Symbol.for('opencu.slot-component-decoration.v1');
const refreshEntry = Symbol.for('opencu.slot-refresh.v1');
const unwrapInactive = component => {
  while (component?.[componentDecoration]?.active === false) component = component[componentDecoration].previous;
  return component;
};

// Pinned to DSH 0.2.1-alpha.2: SlotCore.register records a StoredEntry with a
// writable component; inject/store/locale/children live on that SAME entry.
// The renderer caches inject and renderSlot authority by entry identity. A
// shadow registration cannot inherit children (exclusive declarations), and
// would mint a different authority/store lifetime even without children.
// There is no public update API: register/dispose a non-winning keyed/single/
// list probe to bump the public version, never mutate renderer private fields.
export function decorateSlotComponent(slots, name, accepts, decorate) {
  const installed = new Map();
  let reconciling = false, dirty = false, stopped = false;
  function publish() {
    const entries = slots.entries(name);
    // An abdicated ledger row no longer occupies its cell: probing that cell
    // would elect the probe. Anchor to a real winner, even an unaccepted sibling;
    // the slot-wide version is shared. With no winner there is no live outlet.
    const original = slots.entriesOfSlot(name).find(entry => !entry.component?.[refreshEntry]);
    if (!original) return;
    // Cordis deactivates the receiver BEFORE effect cleanup. Only the live
    // root can register during unload; the probe's effect is disposed inline.
    const publisher = slots.ctx?.fiber?.uid === null ? slots.ctx.root?.get('slots') : slots;
    if (!publisher || publisher.ctx?.fiber?.uid === null) return;
    const priority = Math.max(...entries.map(entry => entry.options.priority ?? 0)) + 1;
    if (!Number.isFinite(priority) || entries.some(entry => (entry.options.priority ?? 0) === priority)) {
      throw new Error('Cannot publish slot decoration at a finite non-winning priority');
    }
    const Probe = () => null;
    Probe[refreshEntry] = true;
    // Lowest priority wins in alpha.2. No children/store/inject/locale are
    // re-declared, and observers can identify this transient ledger entry.
    publisher.register({ name, key: original.options.key, id: original.options.id, priority }, Probe)();
  }
  function release(entry, state) {
    if (!state.active) return false;
    state.active = false;
    if (entry.component === state.wrapper) entry.component = unwrapInactive(state.previous);
    // A later consumer (including an opaque third-party wrapper) may retain
    // us underneath it. Do not clobber it; our inactive bridge is transparent.
    // Its visible output still changed, so publish even if we were not on top.
    return true;
  }
  function reconcile() {
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entries(name), live = new Set(entries);
        for (const [entry, state] of installed) if (!live.has(entry)) {
          installed.delete(entry); release(entry, state);
        }
        let changed = false;
        for (const entry of entries) {
          // An entry's registration lifetime is the rebind axis. Rewrapping
          // merely because its component changed would recurse into an opaque
          // later wrapper; the pinned SDK replaces entries via dispose/register.
          if (!accepts(entry.options.key, entry) || entry.component?.[refreshEntry] || installed.has(entry)) continue;
          const previous = entry.component, component = decorate(entry);
          const state = { previous, active: true, wrapper: null };
          function Decorated(props) { return createElement(state.active ? component : unwrapInactive(state.previous), props); }
          state.wrapper = Decorated; Decorated[componentDecoration] = state;
          // Shared with older plugins: an in-place wrapper must not turn an
          // existing decorateSlot shadow into a seemingly new root owner.
          if (previous?.[decoration]) Decorated[decoration] = previous[decoration];
          entry.component = Decorated; installed.set(entry, state); changed = true;
        }
        if (changed) publish();
      } while (dirty && !stopped);
    } finally { reconciling = false; }
  }
  const unsubscribe = slots.subscribe(name, reconcile);
  function stop() {
    if (stopped) return;
    stopped = true; unsubscribe();
    const live = new Set(slots.entries(name));
    let changed = false;
    for (const [entry, state] of [...installed].reverse()) {
      if (release(entry, state) && live.has(entry)) changed = true;
    }
    installed.clear();
    if (changed) publish();
  }
  try { reconcile(); }
  catch (error) {
    // Setup failures must not strand a subscription or a partial layer. A
    // failed probe cannot be republished, but its original cause must survive.
    try { stop(); } catch {}
    throw error;
  }
  return stop;
}
