/** Only the registered browser-surface document receives this bridge. */
import { contextBridge, ipcRenderer } from 'electron'
import { createDesktopBrowserBridge } from './preload-browser.ts'

const browser = createDesktopBrowserBridge()
contextBridge.exposeInMainWorld('opencuSurface', {
  call: (operation: string, args: object = {}) => ipcRenderer.invoke('dsh-desktop:opencu-surface', operation, args),
  subscribe: (listener: (event: object) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, event: object): void => { listener(event) }
    ipcRenderer.on('dsh-desktop:opencu-surface-event', receive)
    return () => { ipcRenderer.removeListener('dsh-desktop:opencu-surface-event', receive) }
  },
})
contextBridge.exposeInMainWorld('dshDesktop', { browser })
