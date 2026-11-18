export const AUTO_OVERVIEW_KEY = 'omd.overview.autoOpen.v1';
const changed = 'omd:overview-auto-open';
export function autoOverviewEnabled() {
  try { return localStorage.getItem(AUTO_OVERVIEW_KEY) !== 'off'; } catch { return true; }
}
export function setAutoOverview(enabled) {
  localStorage.setItem(AUTO_OVERVIEW_KEY, enabled ? 'on' : 'off');
  window.dispatchEvent(new Event(changed));
}
export function subscribeAutoOverview(listener) {
  const storage = event => { if (event.key === AUTO_OVERVIEW_KEY || event.key === null) listener(); };
  window.addEventListener('storage', storage);
  window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(changed, listener); };
}
