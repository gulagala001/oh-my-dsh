import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('opencuCursorHost', {
  hidden(revision: number) { ipcRenderer.send('dsh-desktop:opencu-cursor-hidden', revision) },
  subscribe(listener: (value: object) => void) {
    const receive = (_event: Electron.IpcRendererEvent, value: object): void => { listener(value) }
    ipcRenderer.on('dsh-desktop:opencu-cursor-update', receive)
    return () => { ipcRenderer.removeListener('dsh-desktop:opencu-cursor-update', receive) }
  },
})
