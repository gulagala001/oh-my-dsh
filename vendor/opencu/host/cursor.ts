/** Display-only REA cursor; native helpers remain the sole input owners. */
import { BrowserWindow, screen, type WebContents } from 'electron'
import { fileURLToPath } from 'node:url'

interface CursorRecord {
  window: BrowserWindow; ready: Promise<void>; revision: number; dispose: () => void
  hideTimer?: ReturnType<typeof setTimeout>; hiding?: number
}
interface CursorPoint { x: number; y: number; space: 'physical' | 'logical'; origin?: { x: number; y: number }; size?: { width: number; height: number } }
function point(value: unknown): CursorPoint {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)
    || typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y)
    || !('space' in value) || (value.space !== 'physical' && value.space !== 'logical')) throw new Error('Invalid native cursor coordinates')
  return value as CursorPoint
}
export class OpenCUCursors {
  private readonly records = new Map<WebContents, CursorRecord>()
  private create(sender: WebContents): CursorRecord {
    if (!BrowserWindow.fromWebContents(sender)) throw new Error('The native cursor owner is unavailable')
    const window = new BrowserWindow({ show: false, frame: false, transparent: true, hasShadow: false,
      focusable: false, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
      title: 'OpenCU Cursor', webPreferences: {
        preload: fileURLToPath(new URL('./preload-opencu-cursor.cjs', import.meta.url)),
        nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false,
      } })
    window.setIgnoreMouseEvents(true)
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setContentProtection(true)
    const record: CursorRecord = { window, ready: Promise.resolve(), revision: 0, dispose: () => {} }
    const hidden = (_event: Electron.IpcMainEvent, revision: unknown): void => {
      if (revision !== record.hiding || revision !== record.revision) return
      record.dispose()
    }
    const ipc = window.webContents.ipc
    ipc.on('dsh-desktop:opencu-cursor-hidden', hidden)
    record.dispose = () => {
      record.revision++; clearTimeout(record.hideTimer)
      ipc.removeListener('dsh-desktop:opencu-cursor-hidden', hidden)
      if (this.records.get(sender) === record) this.records.delete(sender)
      sender.removeListener('destroyed', record.dispose)
      sender.removeListener('render-process-gone', record.dispose)
      window.removeListener('closed', record.dispose)
      if (!window.isDestroyed()) window.destroy()
    }
    sender.once('destroyed', record.dispose)
    sender.once('render-process-gone', record.dispose)
    window.once('closed', record.dispose)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => { event.preventDefault() })
    record.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { record.dispose(); reject(new Error('The native cursor did not finish loading')) }, 15000)
      void window.loadURL('dsh-app://app/api/opencu/cursor').then(() => { clearTimeout(timer); resolve() }, (error: unknown) => {
        clearTimeout(timer); record.dispose(); reject(error)
      })
    })
    this.records.set(sender, record)
    return record
  }
  close(sender: WebContents): object { this.records.get(sender)?.dispose(); return { released: true } }
  async update(sender: WebContents, payload: unknown): Promise<object> {
    if (!payload || typeof payload !== 'object' || !('visible' in payload) || typeof payload.visible !== 'boolean') throw new Error('Invalid native cursor update')
    if (!payload.visible) {
      const record = this.records.get(sender)
      if (!record || record.hiding !== undefined) return { visible: false }
      const revision = ++record.revision
      record.hiding = revision
      await record.ready
      if (record.window.isDestroyed() || revision !== record.revision) return { visible: false }
      record.window.webContents.send('dsh-desktop:opencu-cursor-update', { visible: false, revision })
      record.hideTimer = setTimeout(() => { if (revision === record.revision) record.dispose() }, 2000)
      return { visible: false }
    }
    const at = point(payload), displays = screen.getAllDisplays()
    let location = { x: at.x, y: at.y }
    if (at.space === 'physical') {
      if (process.platform === 'win32') location = screen.screenToDipPoint(location)
      else {
        if (displays.length !== 1) throw new Error('Physical native cursor mapping requires a single Linux display')
        const display = displays[0]!
        location = { x: display.bounds.x + at.x / display.scaleFactor, y: display.bounds.y + at.y / display.scaleFactor }
      }
    } else if (at.origin) location = { x: at.origin.x + at.x, y: at.origin.y + at.y }
    else {
      const display = displays[0]
      if (displays.length !== 1 || !display || at.size?.width !== display.bounds.width || at.size.height !== display.bounds.height) throw new Error('The portal did not supply a usable cursor origin')
      location = { x: display.bounds.x + at.x, y: display.bounds.y + at.y }
    }
    if (![location.x, location.y].every(Number.isFinite)) throw new Error('Invalid native cursor origin')
    const display = screen.getDisplayNearestPoint({ x: Math.round(location.x), y: Math.round(location.y) })
    const bounds = display.bounds
    if (location.x < bounds.x || location.y < bounds.y || location.x >= bounds.x + bounds.width || location.y >= bounds.y + bounds.height) throw new Error('The cursor lies outside the connected display')
    const record = this.records.get(sender) ?? this.create(sender), revision = ++record.revision
    clearTimeout(record.hideTimer); delete record.hideTimer; delete record.hiding
    await record.ready
    if (record.window.isDestroyed() || revision !== record.revision) return { visible: false }
    record.window.setBounds(bounds, false)
    record.window.webContents.setZoomFactor(1)
    record.window.webContents.send('dsh-desktop:opencu-cursor-update', { x: location.x - bounds.x, y: location.y - bounds.y,
      visible: true, animateMovement: true, glowColor: '#000' })
    record.window.showInactive()
    return { visible: true, windowId: record.window.id }
  }
}
