/** Visible isolated demo shell; loads the user's authorized local DSH Web frontend. */
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DesktopBrowserGuests } from './browser-guests.mjs'
import { DESKTOP_IPC } from './ipc.mjs'

const identity = JSON.parse(process.env.DSW_TEST_IDENTITY)
if (process.versions.electron !== identity.electron) throw new Error('Actual demo Electron differs from the pinned archive')
const root = process.env.DSW_TEST_ROOT
const url = process.env.DSW_DEMO_URL
const parsed = new URL(url)
if (!['http:', 'https:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
  || parsed.username !== '' || parsed.password !== '') {
  throw new Error('The demo shell accepts only the authorized local DSH Web URL')
}
app.setName('DeepSeek Workbench Demo')
const storage = process.env.DSW_DEMO_STORAGE || root
app.setPath('userData', join(storage, 'user-data'))
app.setPath('sessionData', join(storage, 'session-data'))
app.commandLine.appendSwitch('password-store', 'basic')
app.commandLine.appendSwitch('use-mock-keychain')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('no-proxy-server')
app.whenReady().then(async () => {
  if (process.env.DSW_DEMO_COOKIE_FILE) {
    const text = (await readFile(process.env.DSW_DEMO_COOKIE_FILE, 'utf8')).trim()
    const cookies = text.startsWith('[') ? JSON.parse(text) : text.split(';').map(value => {
      const index = value.indexOf('='); return { name: value.slice(0, index).trim(), value: value.slice(index + 1).trim() }
    })
    for (const cookie of cookies) await session.defaultSession.cookies.set({ url: parsed.origin, name: cookie.name, value: cookie.value,
      path: '/', httpOnly: true, secure: parsed.protocol === 'https:', sameSite: 'lax' })
  }
  const window = new BrowserWindow({ show: false, width: 1320, height: 880, title: 'DeepSeek Workbench Demo', webPreferences: {
    preload: join(root, 'runtime/preload.cjs'), webviewTag: true, nodeIntegration: false, contextIsolation: true, sandbox: true,
  } })
  const guests = new DesktopBrowserGuests(() => url)
  guests.bind(window, () => () => {})
  function owner(event) {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Rejected non-owner demo IPC')
  }
  ipcMain.handle(DESKTOP_IPC.browserCapabilities, event => { owner(event); return { persistentProfiles: true, downloads: true } })
  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace, options) => { owner(event); return guests.acquire(event.sender, workspace, options) })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease) => { owner(event); return guests.release(event.sender, lease) })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  await window.loadURL(url)
  window.show()
  window.on('closed', () => app.quit())
}).catch(error => { console.error(error); app.exit(1) })
app.on('window-all-closed', () => app.quit())
