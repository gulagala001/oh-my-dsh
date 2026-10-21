// Open the Oh My DSH settings section, optionally scrolled to one group.
let bound = null, pending = '';
const listeners = new Set();

export function bindSettingsNavigation(ctx) {
  bound = ctx;
  return () => { if (bound === ctx) bound = null; };
}

export function openOmdSettings(anchor = '') {
  const actions = bound?.slots.entries('sidebar.settings').find(entry => entry.store)?.store.create().actions;
  if (!actions?.openSection) throw new Error('DSH 设置暂时无法打开');
  pending = anchor;
  listeners.forEach(listener => listener());
  actions.openSection('oh-my-dsh');
}

// The settings page consumes the requested anchor once it has rendered.
export function takeSettingsAnchor() { const value = pending; pending = ''; return value; }
export function subscribeSettingsAnchor(listener) { listeners.add(listener); return () => listeners.delete(listener); }
