const { contextBridge, ipcRenderer } = require('electron');
const invoke = (method, values = {}) => ipcRenderer.invoke('opencu:browser-detached', { method, ...values });
contextBridge.exposeInMainWorld('opencuBrowserDetached', {
  getContentKind: () => invoke('getContentKind'),
  getRequest: () => invoke('getRequest'),
  focusSource: () => invoke('focusSource'),
  setAlwaysOnTop: value => invoke('setAlwaysOnTop', { value }),
  restore: () => invoke('restore'),
  setContentBounds: bounds => invoke('setContentBounds', { bounds }),
  recordTitleBarAction: kind => invoke('recordTitleBarAction', { kind }),
  subscribeChromeState(listener) {
    if (typeof listener !== 'function') throw new TypeError('Browser chrome subscription requires a function');
    const receive = (_event, state) => listener(state);
    ipcRenderer.on('opencu:browser-detached-state', receive);
    ipcRenderer.send('opencu:browser-detached-state-request');
    return () => ipcRenderer.removeListener('opencu:browser-detached-state', receive);
  },
});
