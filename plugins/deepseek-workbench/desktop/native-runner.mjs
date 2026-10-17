/** Runs inside an isolated Electron process against synthetic official-origin pages. */
import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { DesktopBrowserGuests } from './browser-guests.mjs'
import { DESKTOP_IPC } from './ipc.mjs'

const root = process.env.DSW_TEST_ROOT
const phase = process.env.DSW_TEST_PHASE
const profile = 'deepseek-workbench'
const partition = 'persist:dsh-deepseek-workbench-v1'
app.setName('DSH DeepSeek Native Check')
app.setPath('userData', join(root, 'user-data'))
app.setPath('sessionData', join(root, 'session-data'))
app.commandLine.appendSwitch('password-store', 'basic')
app.commandLine.appendSwitch('use-mock-keychain')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('no-proxy-server')
app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,AutofillServerCommunication')

const identity = JSON.parse(process.env.DSW_TEST_IDENTITY)
assert.equal(process.versions.electron, identity.electron, 'Actual Electron matches the pinned archive/toolchain')
const report = { phase, identity, actualElectron: process.versions.electron, assertions: [], failures: [], requests: [], guests: [] }
const streamTimers = new Set()
const timeout = setTimeout(() => { report.failures.push('native check exceeded 40 seconds'); void finish(1) }, 40_000)
let window
let finished = false
async function finish(code) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  for (const timer of streamTimers) clearInterval(timer)
  await writeFile(join(root, `report-${phase}.json`), JSON.stringify(report, null, 2))
  window?.destroy()
  app.exit(code)
}
function record(message) { report.assertions.push(message) }
function once(emitter, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 8000)
    emitter.once(name, (...args) => { clearTimeout(timer); resolve(args) })
  })
}
async function load(guest, url) {
  const navigation = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Navigation did not commit: ${url}`)), 8000)
    const listener = (_event, observed) => {
      if (observed !== url) return
      guest.removeListener('did-navigate', listener)
      clearTimeout(timer)
      resolve()
    }
    guest.on('did-navigate', listener)
  })
  await guest.loadURL(url)
  await navigation
  if (guest.isLoading()) await once(guest, 'did-stop-loading')
  assert.equal(guest.getURL(), url)
  assert.equal(await guest.executeJavaScript('document.body.dataset.synthetic'), 'true')
}

async function main() {
try {
  await app.whenReady()
  app.dock?.hide()
  const manager = new DesktopBrowserGuests(() => 'http://127.0.0.1:44123')
  window = new BrowserWindow({ show: false, width: 600, height: 400, webPreferences: {
    preload: join(root, 'runtime', 'preload.cjs'), webviewTag: true, nodeIntegration: false, contextIsolation: true, sandbox: true,
  } })
  let disposed = 0
  manager.bind(window, () => () => { disposed++ })
  const configured = new Set()
  const acquire = (event, workspace, options) => {
    assert.equal(event.sender, window.webContents)
    assert.equal(event.senderFrame, window.webContents.mainFrame)
    return manager.acquire(event.sender, workspace, options)
  }
  ipcMain.handle(DESKTOP_IPC.browserAcquire, acquire)
  ipcMain.handle(DESKTOP_IPC.browserCapabilities, event => {
    assert.equal(event.sender, window.webContents)
    return { persistentProfiles: true, downloads: true }
  })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease) => manager.release(event.sender, lease))
  await window.loadURL('data:text/html,<html><body></body></html>')
  assert.deepEqual(await window.webContents.executeJavaScript('window.dshDesktop.browser.capabilities()'), { persistentProfiles: true, downloads: true })
  record('actual preload capability IPC executes in a sandboxed owner')

  const { session } = await import('electron')
  async function open(options) {
    const reservation = await window.webContents.executeJavaScript(`window.dshDesktop.browser.acquire('native-workspace', ${JSON.stringify(options)})`)
    const browserSession = session.fromPartition(reservation.partition)
    if (!configured.has(reservation.partition)) {
      configured.add(reservation.partition)
      await browserSession.protocol.handle('https', request => {
        report.requests.push(request.url)
        const url = new URL(request.url)
        if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
          return new Response('window.__nativeCaptchaResource = true;', { headers: { 'content-type': 'text/javascript' } })
        }
        if (!['chat.deepseek.com', 'platform.deepseek.com', 'files.deepseeksvc.com'].includes(url.hostname)) return new Response('', { status: 403 })
        if (url.pathname === '/slow-export.txt') {
          let timer
          const stream = new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('synthetic pending export\n'))
            timer = setInterval(() => controller.enqueue(new TextEncoder().encode('waiting\n')), 250)
            streamTimers.add(timer)
          }, cancel() { clearInterval(timer); streamTimers.delete(timer) } })
          return new Response(stream, { headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="slow-export.txt"' } })
        }
        if (url.pathname === '/export.txt' || url.pathname === '/api/native-export') return new Response('synthetic deepseek export\n', {
          headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="export.txt"' },
        })
        return new Response('<!doctype html><html><body data-synthetic="true"><a id="download" href="https://files.deepseeksvc.com/api/native-export?ty=r" download="export.txt">Export</a></body></html>', {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      })
    }
    const attached = once(window.webContents, 'did-attach-webview')
    await window.webContents.executeJavaScript(`(() => { const tag = document.createElement('webview'); tag.id = ${JSON.stringify(reservation.lease)};
      tag.setAttribute('partition', ${JSON.stringify(reservation.partition)}); tag.setAttribute('allowpopups','');
      tag.src = ${JSON.stringify(`about:blank#${reservation.lease}`)}; tag.style.width='500px'; tag.style.height='300px'; document.body.append(tag); })()`)
    const [, guest] = await attached
    assert.equal(guest.session, browserSession)
    for (const name of ['will-frame-navigate', 'did-start-navigation', 'did-fail-load', 'did-navigate']) guest.on(name, (_event, ...details) => {
      report.requests.push(`${name}: ${JSON.stringify(details)}`)
    })
    await once(guest, 'dom-ready')
    report.guests.push(guest.id)
    return { reservation, guest, browserSession }
  }
  async function close(tab) {
    await window.webContents.executeJavaScript(`window.dshDesktop.browser.release(${JSON.stringify(tab.reservation.lease)})`)
    assert.ok(tab.guest.isDestroyed())
    await window.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(tab.reservation.lease)})?.remove()`)
  }

  const chat = await open({ profile })
  assert.equal(chat.reservation.partition, partition)
  await load(chat.guest, 'https://chat.deepseek.com/')
  const old = phase === 'cold' ? 'chat-persisted' : null
  assert.equal(await chat.guest.executeJavaScript("localStorage.getItem('native-test')"), old)
  const cookies = await chat.browserSession.cookies.get({ name: 'native-session' })
  assert.equal(cookies.some(cookie => cookie.value === 'shared-persisted'), phase === 'cold')
  if (phase !== 'cold') {
    await chat.guest.executeJavaScript("localStorage.setItem('native-test','chat-persisted'); document.cookie='native-session=shared-persisted; Domain=.deepseek.com; Path=/; Max-Age=86400; Secure; SameSite=Lax'")
  }
  const platform = await open({ profile })
  assert.equal(platform.browserSession, chat.browserSession)
  await load(platform.guest, 'https://platform.deepseek.com/')
  assert.ok((await platform.guest.executeJavaScript('document.cookie')).includes('native-session=shared-persisted'))
  assert.equal(await platform.guest.executeJavaScript("localStorage.getItem('native-test')"), phase === 'cold' ? 'platform-persisted' : null)
  await platform.guest.executeJavaScript("localStorage.setItem('native-test','platform-persisted')")
  record('chat and platform share the persistent session/domain cookie and preserve independent origin localStorage')
  await close(chat)
  const rebuilt = await open({ profile })
  await load(rebuilt.guest, 'https://chat.deepseek.com/')
  assert.equal(await rebuilt.guest.executeJavaScript("localStorage.getItem('native-test')"), 'chat-persisted')
  record('guest release/rebuild preserves its profile web storage')
  assert.equal(await rebuilt.guest.executeJavaScript(`new Promise((resolve, reject) => { const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js'; script.onload=()=>resolve(window.__nativeCaptchaResource);
    script.onerror=()=>reject(new Error('synthetic captcha resource blocked')); document.head.append(script); })`), true)
  record('official-origin webview can load its whitelisted synthetic captcha SDK resource')
  await window.webContents.executeJavaScript(`(() => { window.__nativePopup = new Promise(resolve => {
    window.dshDesktop.browser.onOpenRequested(${JSON.stringify(rebuilt.reservation.lease)}, (url, request) => resolve({url, profile:request.profile}));
  }); return true; })()`)
  await rebuilt.guest.executeJavaScript("window.open('https://platform.deepseek.com/api_keys'); null", true)
  assert.deepEqual(await window.webContents.executeJavaScript('window.__nativePopup'), { url: 'https://platform.deepseek.com/api_keys', profile })
  record('real popup bridge propagates the approved profile without creating a native popup window')
  const nav = once(rebuilt.guest, 'will-frame-navigate')
  await rebuilt.guest.executeJavaScript("location.href='https://example.invalid/blocked'")
  await nav
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(rebuilt.guest.getURL(), 'https://chat.deepseek.com/')
  assert.ok(!report.requests.some(url => url.startsWith('https://example.invalid/')))
  record('real webview rejects external navigation before any synthetic request handler')

  if (phase !== 'cold') {
    const downloadPath = join(root, 'export.txt')
    let downloadItem
    const completion = new Promise((resolve, reject) => {
      rebuilt.browserSession.once('will-download', (event, item, contents) => {
        try {
          assert.equal(contents, rebuilt.guest)
          assert.ok(['', 'https://chat.deepseek.com'].includes(item.getInitiatorOrigin()))
          report.downloadInitiator = item.getInitiatorOrigin()
          assert.equal(item.getURLChain()[0], 'https://files.deepseeksvc.com/api/native-export?ty=r')
          assert.equal(item.getSaveDialogOptions().defaultPath.endsWith('export.txt'), true)
          // Test-only destination in owned tmp; production keeps its native save dialog.
          item.setSavePath(downloadPath)
          downloadItem = item
          item.once('done', (_event, state) => { if (state === 'completed') resolve(); else reject(new Error(`Download ${state}`)) })
        } catch (error) { event.preventDefault(); reject(error) }
      })
    })
    await rebuilt.guest.executeJavaScript("document.getElementById('download').click()", true)
    await Promise.race([completion, new Promise((_, reject) => setTimeout(() => reject(new Error('Native download timeout')), 8000))])
    assert.equal(await readFile(downloadPath, 'utf8'), 'synthetic deepseek export\n')
    assert.equal(downloadItem.getReceivedBytes(), Buffer.byteLength('synthetic deepseek export\n'))
    record('actual Chromium DownloadItem from the one-shot main-approved official file link reaches an owned destination with expected bytes; production save-dialog options retained')
  }
  const regular = await open(undefined)
  assert.equal(regular.reservation.partition.startsWith('persist:'), false)
  await load(regular.guest, 'https://chat.deepseek.com/')
  assert.equal(await regular.guest.executeJavaScript("localStorage.getItem('native-test')"), null)
  assert.equal(await regular.guest.executeJavaScript("localStorage.getItem('regular-test')"), null)
  await regular.guest.executeJavaScript("localStorage.setItem('regular-test','ephemeral')")
  record('ordinary real guest uses an isolated nonpersistent workspace partition')
  const ordinaryDownload = new Promise(resolve => regular.browserSession.once('will-download', event => resolve(event.defaultPrevented)))
  await regular.guest.executeJavaScript("document.getElementById('download').click()", true)
  assert.equal(await ordinaryDownload, true)
  record('ordinary real guest download is rejected by the production session policy')
  if (phase !== 'cold') {
    let cancelled
    const pending = new Promise(resolve => rebuilt.browserSession.once('will-download', (_event, item) => {
      item.setSavePath(join(root, 'pending-export.txt'))
      cancelled = new Promise(done => item.once('done', (_doneEvent, state) => done(state)))
      resolve()
    }))
    await rebuilt.guest.executeJavaScript("document.getElementById('download').href='/slow-export.txt'; document.getElementById('download').click()", true)
    await pending
    await close(rebuilt)
    assert.equal(await cancelled, 'cancelled')
    record('release cancels an actual in-progress Chromium DownloadItem and destroys the guest')
  } else await close(rebuilt)
  await close(regular); await close(platform)
  assert.ok(disposed >= 4)
  await chat.browserSession.cookies.flushStore()
  await chat.browserSession.flushStorageData()
  record(phase === 'cold' ? 'separate Electron cold-start process recovered cookies and both origins localStorage' : 'all real guests were destroyed before process exit')
  report.manualPicker = 'not tested'
  await finish(0)
} catch (error) {
  report.failures.push(error.stack ?? String(error))
  await finish(1)
}
}
void main()
