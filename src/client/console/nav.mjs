// Deep links into the console. The native right sidebar delivers `params`
// as the tab's navigation record (also for an already-open tab); the window
// event is a same-document fallback for hosts that keep the old record.
export const CONSOLE_KIND = 'omd-console';
export const NAV_EVENT = 'omd:console-navigate';
let sidebar = null;
export const bindSidebar = service => { sidebar = service; return () => { if (sidebar === service) sidebar = null; }; };

export function openConsole(section = 'overview', extra = {}) {
  const params = { section, ...extra, nonce: Date.now() };
  try { sidebar?.openTab(CONSOLE_KIND, { params }); } catch {}
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: params }));
}
