export const HOST_BROWSER_ID = '@deepseek-ai/dsh-client-ui-sidebar-browser';

// A host Browser tab is a separate preview, not the browser CU controls.
export function hostPreviewUrl(target, navigation) {
  if (target?.kind !== 'tab') return null;
  const value = navigation && navigation.tabId === target.id ? navigation.url : target.url;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null; }
  catch { return null; }
}
export function openHostBrowserPreview(actions, url) {
  if (!hostPreviewUrl({ kind: 'tab', url }) || typeof actions?.openTab !== 'function') return false;
  actions.openTab('browser', { params: { url } }); return true;
}
