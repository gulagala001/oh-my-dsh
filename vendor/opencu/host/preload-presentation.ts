/** Only the monitoring document receives this display-only bridge. */
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('opencuPresentationHost', {
  postMessage: (event: object) => ipcRenderer.send('dsh-desktop:opencu-presentation-event', event),
  subscribe: (listener: (payload: object) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, payload: object): void => { listener(payload) }
    ipcRenderer.on('dsh-desktop:opencu-presentation-update', receive)
    return () => { ipcRenderer.removeListener('dsh-desktop:opencu-presentation-update', receive) }
  },
})
