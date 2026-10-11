const { contextBridge, ipcRenderer } = require('electron');

const REQUEST = 'opencu-site-information:request';
const STATE = 'opencu-site-information:state';
const CHANGES = new Set(['removeCookie', 'clearCookies', 'clearData', 'setPermission', 'resetPermission', 'resetPermissions', 'reload', 'close']);
let dialogId, gesture = 0, consumed = 0, gestureTime = 0;
const listeners = new Set();

for (const type of ['pointerup', 'click', 'keydown', 'change']) {
  window.addEventListener(type, event => {
    if (!event.isTrusted || type === 'keydown' && event.repeat) return;
    gesture++; gestureTime = performance.now();
  }, true);
}

function snapshot(value) {
  if (!value || typeof value.dialogId !== 'string' || value.dialogId.length > 128
    || typeof value.origin !== 'string' || typeof value.siteUrl !== 'string'
    || !['overview', 'certificate', 'cookies', 'settings'].includes(value.view)) return null;
  if (dialogId && value.dialogId !== dialogId) return null;
  dialogId = value.dialogId;
  return value;
}

ipcRenderer.on(STATE, (_event, value) => {
  const current = snapshot(value);
  if (current) for (const listener of listeners) { try { listener(current); } catch {} }
});

async function invoke(op, input = {}) {
  if (!['read', 'refresh', 'view', ...CHANGES].includes(op)) throw new Error('站点信息操作无效。');
  if (CHANGES.has(op)) {
    if (!dialogId || gesture <= consumed || performance.now() - gestureTime > 1500) throw new Error('请在站点信息窗口中确认此操作。');
    consumed = gesture;
  }
  const payload = { op, ...(dialogId ? { dialogId } : {}) };
  if (op === 'view') payload.view = input.view;
  if (op === 'removeCookie') payload.cookieId = input.cookieId;
  if (['setPermission', 'resetPermission'].includes(op)) payload.type = input.type;
  if (op === 'setPermission') payload.setting = input.setting;
  const result = await ipcRenderer.invoke(REQUEST, payload);
  if (result?.ok !== true) {
    const error = new Error(typeof result?.error?.message === 'string' ? result.error.message : '无法完成站点信息操作。');
    error.code = result?.error?.code; throw error;
  }
  return result.result?.dialogId ? snapshot(result.result) : result.result;
}

contextBridge.exposeInMainWorld('opencuSiteInformation', {
  read: () => invoke('read'),
  refresh: () => invoke('refresh'),
  view: view => invoke('view', { view }),
  action: (op, input) => invoke(op, input),
  onState: listener => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener); return () => listeners.delete(listener);
  }
});
