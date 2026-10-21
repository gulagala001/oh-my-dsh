export class ApiError extends Error {
  constructor(message, code = 'internal', params = {}) { super(message); this.code = code; this.params = params; }
}

/** Host routes are relative to the page, like every other DSH plugin endpoint. */
export async function api(path, input, signal) {
  let response;
  try {
    response = await fetch(`dsh-extensions/api${path}`, input === undefined ? { signal, cache: 'no-store' }
      : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(error?.message ?? String(error), 'network', { message: error?.message ?? '' });
  }
  if (response.status === 404 && !response.headers.get('content-type')?.includes('json')) throw new ApiError('Extensions service is not loaded', 'service-missing');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `HTTP ${response.status}`, data.code, data.params);
  return data;
}
export const query = (path, params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
  return `${path}?${search}`;
};

const FILE_MANAGERS = ['finder', 'explorer', 'filemanager'];
const EDITORS = { vscode: 'VS Code', cursor: 'Cursor', zed: 'Zed', windsurf: 'Windsurf', sublimetext: 'Sublime Text', vscodeinsiders: 'VS Code Insiders', xcode: 'Xcode' };
let apps;
/** DSH's own open-in-app routes; they accept directories only. */
export function openers() {
  apps ??= fetch('open-in-app/apps', { cache: 'no-store' }).then(response => response.ok ? response.json() : { apps: [] }).then(value => value.apps ?? [], () => []);
  return apps.then(list => ({ files: FILE_MANAGERS.find(id => list.includes(id)) ?? null, editor: Object.keys(EDITORS).find(id => list.includes(id)) ?? null, editorName: EDITORS[Object.keys(EDITORS).find(id => list.includes(id))] ?? '' }));
}
export async function openIn(app, path) {
  const response = await fetch('open-in-app/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app, path }) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.message || `HTTP ${response.status}`, 'open-failed', { message: data.message ?? '' }); }
}
