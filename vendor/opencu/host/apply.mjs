import { readFile, writeFile, realpath, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { targetFor, adapterRevision, browserCapabilities } from './compatibility.mjs';
import { applyComposerReferences } from './composer-references.mjs';
import { applyToolVisibility } from './tool-visibility.mjs';

// Only an explicitly named source checkout; never an installed app or the read-only source cache.
if (!process.argv[2]) throw new Error('Usage: node host/apply.mjs /absolute/owned/dsh-source');
const root = await realpath(resolve(process.argv[2]));
if (root.includes('.app/') || root.endsWith('.app') || root.includes('/oh-my-dsh/.cache/dsh-source/')) throw new Error('OpenCU adapters require an independent owned source copy');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const target = targetFor(manifest.version);
for (const [name, version] of [['cordis', target.cordis], ['schemastery', target.schema]]) {
  const framework = JSON.parse(await readFile(join(root, 'vendor', name, 'package.json'), 'utf8'));
  if (framework.version !== version) throw new Error(`OpenCU ${target.id} framework mismatch: ${name}: ${framework.version}, expected ${version}`);
}
await access(join(root, 'apps/desktop/src/browser-guests.ts'));
const pending = new Map();
async function source(file) { return pending.get(file) ?? await readFile(join(root, file), 'utf8'); }
async function patch(file, replacements, marker) {
  let value = await source(file);
  if (marker && value.includes(marker)) return;
  for (const [before, after] of replacements) {
    if (value.split(before).length !== 2) throw new Error(`DSH ${target.id} adapter input changed: ${file}: ${before}`);
    value = value.replace(before, after);
  }
  pending.set(file, value);
}
const desktop = 'apps/desktop/src/';
const guests = desktop + 'browser-guests.ts';
const marker = `// opencu-host-adapter:${adapterRevision}`;
const original = await source(guests);
if (original.includes('opencu-') && !original.includes(marker)) throw new Error('Existing OpenCU host adapter must be rebased on the clean matching source, not layered');
await patch(guests, [
  ["import { DESKTOP_IPC } from './ipc.ts'", `import { DESKTOP_IPC } from './ipc.ts'\nimport { OpenCUGuests, type OpenCUGuestState } from './opencu-guest-adapter.ts'\n${marker}`],
  ['  releaseInput?: () => void', '  releaseInput?: () => void\n  openCU?: OpenCUGuestState'],
  ['  private readonly partitions =', '  private readonly openCU = new OpenCUGuests()\n  private readonly partitions ='],
  ['  acquire(owner: WebContents,', `  acquireOpenCU(owner: WebContents): DesktopBrowserReservation {
    const lease = randomUUID() as DesktopBrowserLeaseId
    const reservation = this.openCU.reserve(owner, value => this.configureSession(value, true))
    this.leases.set(lease, reservation)
    return { lease, partition: reservation.partition }
  }

  operateOpenCU(owner: WebContents, id: unknown, capability: string, operation: unknown, args: unknown): Promise<unknown> {
    const lease = typeof id === 'string' ? this.leases.get(id as DesktopBrowserLeaseId) : undefined
    return this.openCU.operate(owner, lease, capability, operation, args, url => lease?.guest !== undefined && this.allowedGuestNavigation(lease.guest, url))
  }

  acquire(owner: WebContents,`],
  ['    this.leases.delete(key)', '    this.openCU.release(lease)\n    this.leases.delete(key)'],
  ['        lease.guest = guest', '        lease.guest = guest\n        this.openCU.attach(lease, guest)'],
  ["guest.once('destroyed', () => { lease.releaseInput?.(); this.leases.delete(id) })", "guest.once('destroyed', () => { lease.releaseInput?.(); this.openCU.release(lease); this.leases.delete(id) })"],
  ['postBody === undefined && this.allowedNavigation(url)', 'postBody === undefined && this.allowedGuestNavigation(guest, url)'],
  ['!this.allowedNavigation(event.url)', '!this.allowedGuestNavigation(guest, event.url)'],
  ['!this.allowedNavigation(url)', '!this.allowedGuestNavigation(guest, url)'],
  ['  private configureSession(browserSession: Session): void {', '  private configureSession(browserSession: Session, openCU = false): void {'],
  ['    browserSession.setPermissionCheckHandler(() => false)', '    browserSession.setPermissionCheckHandler(() => false)\n    if (openCU) this.openCU.configure(browserSession)'],
  ["    browserSession.on('will-download', (event) => { event.preventDefault() })", `    browserSession.on('will-download', (event, item, contents) => {
      const lease = [...this.leases.values()].find(candidate => candidate.guest === contents && candidate.attached && candidate.openCU)
      if (lease && !contents.isDestroyed() && !lease.owner.isDestroyed()
        && !item.getURLChain().some(value => URL.canParse(value) && this.isApplicationHost(new URL(value)))) {
        try { if (this.openCU.download(lease, item)) return }
        catch (error) { console.error('OpenCU download failed', error) }
      }
      event.preventDefault()
    })`],
  [": !['about:', 'data:', 'blob:'].includes(url.protocol)", ": !['about:', 'data:', 'blob:'].includes(url.protocol) && !(openCU && this.openCU.allowsExtension(browserSession, url))"],
  ['  private allowedNavigation(value:', `  private allowedGuestNavigation(guest: WebContents, value: string): boolean {
    if (URL.canParse(value) && this.openCU.allowsExtension(guest.session, new URL(value))) return true
    return this.allowedNavigation(value)
  }

  private allowedNavigation(value:`],
], marker);
const navigationArgument = 'return this.openCU.operate(owner, lease, capability, operation, args)';
if ((await source(guests)).includes(navigationArgument)) await patch(guests, [[navigationArgument,
  'return this.openCU.operate(owner, lease, capability, operation, args, url => lease?.guest !== undefined && this.allowedGuestNavigation(lease.guest, url))']]);
const navigationMarker = '// opencu-initial-navigation:v1';
await patch(guests, [
  ['    return this.openCU.operate(owner, lease, capability, operation, args, url => lease?.guest !== undefined && this.allowedGuestNavigation(lease.guest, url))',
   '    return this.openCU.operate(owner, lease, capability, operation, args, url => lease?.guest ? this.allowedGuestNavigation(lease.guest, url) : this.allowedNavigation(url))'],
  ["      params.httpreferrer = ''", "      params.httpreferrer = ''\n      this.openCU.prepareAttach(lease, id, params)"],
  ["      guest.once('dom-ready', () => {\n        const url = guest.getURL()\n        const id = (url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '') as DesktopBrowserLeaseId",
   "      const preparedId = this.openCU.preparedLease(guest)\n      const bindGuest = (id: DesktopBrowserLeaseId): void => {"],
  ["      })\n      guest.setWindowOpenHandler", "      }\n      if (preparedId) bindGuest(preparedId as DesktopBrowserLeaseId)\n      else guest.once('dom-ready', () => {\n        const url = guest.getURL()\n        bindGuest((url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '') as DesktopBrowserLeaseId)\n      })\n      guest.setWindowOpenHandler"],
  ["      let attachedLease: DesktopBrowserLeaseId | undefined", "      " + navigationMarker + "\n      let attachedLease: DesktopBrowserLeaseId | undefined"],
], navigationMarker);
const bridgeType = `DesktopBrowserBridge & {
  readonly openCU: { readonly revision: number; readonly hostVersion: string; readonly capabilities: readonly string[] }
  acquireOpenCU(): Promise<DesktopBrowserReservation>
  ${browserCapabilities.map(name => `${name}(lease: DesktopBrowserLeaseId, operation: string, args: object): Promise<unknown>`).join('\n  ')}
  presentation(operation: string, payload: object): Promise<unknown>
  files(operation: string, args: object): Promise<unknown>
  onPresentationEvent(listener: (event: object) => void): () => void
  onExtensionEvent(listener: (event: object) => void): () => void
}`;
await patch(desktop + 'preload-browser.ts', [
  ['DesktopBrowserBridge, DesktopBrowserLeaseId', 'DesktopBrowserBridge, DesktopBrowserLeaseId, DesktopBrowserReservation'],
  ['export function createDesktopBrowserBridge(): DesktopBrowserBridge {', `export function createDesktopBrowserBridge(): ${bridgeType} {\n  ${marker}`],
  ['  return {', `  const subscribe = (channel: string, listener: (event: object) => void): (() => void) => {
    const receive = (_event: Electron.IpcRendererEvent, payload: object): void => { listener(payload) }
    ipcRenderer.on(channel, receive)
    return () => { ipcRenderer.removeListener(channel, receive) }
  }
  return {
    openCU: { revision: ${adapterRevision}, hostVersion: '${target.version}', capabilities: ${JSON.stringify([...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory'])} },
    acquireOpenCU: () => ipcRenderer.invoke('dsh-desktop:opencu-acquire'),
    ${browserCapabilities.map(name => `${name}: (lease, operation, args) => ipcRenderer.invoke('dsh-desktop:opencu-${name}', lease, operation, args),`).join('\n    ')}
    presentation: (operation, payload) => ipcRenderer.invoke('dsh-desktop:opencu-presentation', operation, payload),
    files: (operation, args) => ipcRenderer.invoke('dsh-desktop:opencu-files', operation, args),
    onPresentationEvent: listener => subscribe('dsh-desktop:opencu-presentation-event', listener),
    onExtensionEvent: listener => subscribe('dsh-desktop:opencu-extension-event', listener),`],
], marker);
await patch(desktop + 'main.ts', [
  ["import { DesktopBrowserGuests } from './browser-guests.ts'", "import { DesktopBrowserGuests } from './browser-guests.ts'\nimport { OpenCUPresentations } from './opencu-presentation.ts'\nimport { operateOpenCUFile } from './opencu-files.ts'"],
  ['  const browserGuests = new DesktopBrowserGuests(() => hostUrl)', '  const browserGuests = new DesktopBrowserGuests(() => hostUrl)\n  const openCUPresentations = new OpenCUPresentations()'],
  ['  ipcMain.handle(DESKTOP_IPC.browserAcquire,', `  ${marker}
  ipcMain.handle('dsh-desktop:opencu-acquire', event => {
    assertProductSender(event)
    return browserGuests.acquireOpenCU(event.sender)
  })
  ${browserCapabilities.map(name => `ipcMain.handle('dsh-desktop:opencu-${name}', (event, lease: unknown, operation: unknown, args: unknown) => {
    assertProductSender(event)
    return browserGuests.operateOpenCU(event.sender, lease, '${name}', operation, args)
  })`).join('\n  ')}
  ipcMain.handle('dsh-desktop:opencu-presentation', (event, operation: unknown, payload: unknown) => {
    assertProductSender(event)
    return openCUPresentations.operate(event.sender, operation, payload)
  })
  ipcMain.on('dsh-desktop:opencu-presentation-event', (event, payload: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) return
    openCUPresentations.event(event.sender, payload)
  })
  ipcMain.handle('dsh-desktop:opencu-files', (event, operation: unknown, args: unknown) => {
    assertProductSender(event)
    return operateOpenCUFile(event.sender, operation, args)
  })
  ipcMain.handle(DESKTOP_IPC.browserAcquire,`],
], marker);
await patch('apps/desktop/tsdown.config.ts', [["['preload-app', 'preload-welcome'", "['preload-opencu-cursor', 'preload-opencu-presentation', 'preload-app', 'preload-welcome'"]], "'preload-opencu-presentation'");
// Additive v2 upgrade: do not make the existing marker skip the surface hooks.
const surfaceMarker = '// opencu-browser-surfaces:v1';
const workbenchCleanup = (await source(guests)).includes('readonly requestedDownloads:')
  ? '    lease.requestedDownloads.clear()\n    for (const item of lease.downloads) item.cancel()\n    lease.downloads.clear()\n' : '';
const destroyedGuest = workbenchCleanup ? `guest.once('destroyed', () => {
          this.leases.delete(id)
          lease.requestedDownloads.clear()
          for (const item of lease.downloads) item.cancel()
          lease.downloads.clear()
          lease.releaseInput?.()
          this.openCU.release(lease)
        })` : "guest.once('destroyed', () => { lease.releaseInput?.(); this.openCU.release(lease); this.leases.delete(id) })";
await patch(guests, [
  ["import { DESKTOP_IPC } from './ipc.ts'", "import { DESKTOP_IPC } from './ipc.ts'\nimport { cancelSiteTool } from './opencu-site-tools.ts'"],
  ['  bind(window: BrowserWindow,', "  bind(window: Pick<BrowserWindow, 'webContents'>,"],
  ['  private readonly leases =', '  private readonly releasing = new Map<DesktopBrowserLeaseId, Promise<void>>()\n  private readonly leases ='],
  [`    lease.releaseInput?.()
    this.openCU.release(lease)
    this.leases.delete(key)
${workbenchCleanup}    const guest = lease.guest
    if (guest !== undefined && !guest.isDestroyed()) {
      const destroyed = new Promise<void>((resolve) => { guest.once('destroyed', resolve) })
      guest.close({ waitForBeforeUnload: false })
      await destroyed
    }`,
   `    const current = this.releasing.get(key)
    if (current) return current
    const work = Promise.resolve().then(async () => {
      const errors: unknown[] = []
      try { lease.releaseInput?.() } catch (error) { errors.push(error) }
      try { this.openCU.release(lease) } catch (error) { errors.push(error) }
${workbenchCleanup ? `      try {
${workbenchCleanup.replace(/^/gm, "    ")}      } catch (error) { errors.push(error) }
` : ""}      const guest = lease.guest
      if (guest !== undefined && !guest.isDestroyed()) {
        if (lease.openCU) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try { await Promise.race([cancelSiteTool(guest), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Browser guest cancellation timed out')), 5000) })]) }
          catch (error) { errors.push(error) }
          finally { clearTimeout(timer) }
        }
        try {
          await new Promise<void>((resolve, reject) => {
            const done = (): void => { clearTimeout(timer); resolve() }
            const timer = setTimeout(() => { guest.off('destroyed', done); reject(new Error('Browser guest close timed out')) }, 5000)
            guest.once('destroyed', done)
            try { guest.close({ waitForBeforeUnload: false }) }
            catch (error) { clearTimeout(timer); guest.off('destroyed', done); reject(error) }
          })
        } catch (error) { errors.push(error) }
      }
      if (errors.length) throw new AggregateError(errors, 'Browser guest release failed')
    })
    this.releasing.set(key, work)
    try { await work } finally { this.releasing.delete(key); this.leases.delete(key) }`],
  [destroyedGuest, "guest.once('destroyed', () => {\n          if (this.releasing.has(id)) return\n          const errors: unknown[] = []\n          try { lease.releaseInput?.() } catch (error) { errors.push(error) }\n          try { this.openCU.release(lease) } catch (error) { errors.push(error) }\n          this.leases.delete(id)\n" + (workbenchCleanup ? "          try {\n" + workbenchCleanup.replace(/^/gm, "        ") + "          } catch (error) { errors.push(error) }\n" : "") + "          if (errors.length) console.error(new AggregateError(errors, 'Destroyed browser guest release failed'))\n        })"],
  ['  private configureSession(', `  ${surfaceMarker}
  async releaseAll(owner: WebContents): Promise<void> {
    const results = await Promise.allSettled([...this.leases].filter(([, lease]) => lease.owner === owner).map(([id]) => this.release(owner, id)))
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length) throw new AggregateError(errors, 'Browser owner release failed')
  }

  private configureSession(`],
], surfaceMarker);
await patch(desktop + 'preload-browser.ts', [
  ['  onExtensionEvent(listener:', '  surface(operation: string, args: object): Promise<unknown>\n  onSurfaceEvent(listener: (event: object) => void): () => void\n  onExtensionEvent(listener:'],
  ['    onExtensionEvent: listener =>', "    surface: (operation, args) => ipcRenderer.invoke('dsh-desktop:opencu-surface', operation, args),\n    onSurfaceEvent: listener => subscribe('dsh-desktop:opencu-surface-event', listener),\n    onExtensionEvent: listener =>"],
], 'onSurfaceEvent:');
await patch(desktop + 'main.ts', [
  ["import { OpenCUPresentations } from './opencu-presentation.ts'", "import { OpenCUPresentations } from './opencu-presentation.ts'\nimport { OpenCUBrowserSurfaces, trackOpenCUGuestInput } from './opencu-browser-surfaces.ts'"],
  ['  const openCUPresentations = new OpenCUPresentations()', `  const openCUPresentations = new OpenCUPresentations()
  const openCUBrowserSurfaces: OpenCUBrowserSurfaces = new OpenCUBrowserSurfaces((contents, currentWindow) => {
    browserGuests.bind({ webContents: contents }, (guest, name) => {
      const unbind = shortcuts.attachGuest(currentWindow, guest, name, openCUBrowserSurfaces.owner(contents))
      const releaseInput = trackOpenCUGuestInput(guest)
      return () => { try { releaseInput() } finally { unbind() } }
    })
  }, contents => browserGuests.releaseAll(contents))`],
  ['  let navigation: { window: BrowserWindow;', `  ${surfaceMarker}
  const assertOpenCUSender = (event: IpcMainInvokeEvent): void => {
    if (!openCUBrowserSurfaces.accepts(event)) assertProductSender(event)
  }
  ipcMain.handle('dsh-desktop:opencu-surface', (event, operation: unknown, args: unknown) => {
    assertOpenCUSender(event)
    return openCUBrowserSurfaces.operate(event, operation, args)
  })
  let navigation: { window: BrowserWindow;`],
  ["ipcMain.handle('dsh-desktop:opencu-acquire', event => {\n    assertProductSender(event)", "ipcMain.handle('dsh-desktop:opencu-acquire', event => {\n    assertOpenCUSender(event)"],
  ...browserCapabilities.map(name => [`ipcMain.handle('dsh-desktop:opencu-${name}', (event, lease: unknown, operation: unknown, args: unknown) => {
    assertProductSender(event)`, `ipcMain.handle('dsh-desktop:opencu-${name}', (event, lease: unknown, operation: unknown, args: unknown) => {
    assertOpenCUSender(event)`]),
  ["ipcMain.handle('dsh-desktop:opencu-files', (event, operation: unknown, args: unknown) => {\n    assertProductSender(event)", "ipcMain.handle('dsh-desktop:opencu-files', (event, operation: unknown, args: unknown) => {\n    assertOpenCUSender(event)"],
  ["ipcMain.handle('dsh-desktop:opencu-presentation', (event, operation: unknown, payload: unknown) => {\n    assertProductSender(event)\n    return openCUPresentations.operate(event.sender, operation, payload)", "ipcMain.handle('dsh-desktop:opencu-presentation', (event, operation: unknown, payload: unknown) => {\n    assertOpenCUSender(event)\n    return openCUPresentations.operate(openCUBrowserSurfaces.owner(event.sender), operation, payload)"],
  ['ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease: unknown) => {\n    assertProductSender(event)', 'ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease: unknown) => {\n    assertOpenCUSender(event)'],
], surfaceMarker);
// Reuse the host's approved quit state; a pending or cancelled confirmation is not a quit.
const windowQuitMarker = '// opencu-window-quit-lifecycle:v1';
const mainSource = await source(desktop + 'main.ts');
for (const before of [
  '  let quitting = false\n',
  '  let shellInstallerOwnsQuit = false\n',
  '  let sessionEnding = false\n',
  "    window.on('close', (event) => {\n      if (quitting || shellInstallerOwnsQuit || sessionEnding) return\n      event.preventDefault()",
]) {
  if (mainSource.split(before).length !== 2) throw new Error(`DSH ${target.id} quit lifecycle changed: ${before}`);
}
const windowQuitHooks = [
  ['  const openCUPresentations = new OpenCUPresentations()', `  ${windowQuitMarker}
  const openCUHostIsQuitting = (): boolean => quitting || shellInstallerOwnsQuit || sessionEnding
  const openCUPresentations = new OpenCUPresentations(openCUHostIsQuitting)`],
  ['  }, contents => browserGuests.releaseAll(contents))', '  }, contents => browserGuests.releaseAll(contents), openCUHostIsQuitting)'],
];
if (mainSource.includes(windowQuitMarker)) {
  if (mainSource.split(windowQuitMarker).length !== 2 || windowQuitHooks.some(([, after]) => mainSource.split(after).length !== 2)) {
    throw new Error(`DSH ${target.id} OpenCU quit lifecycle hook changed`);
  }
} else {
  await patch(desktop + 'main.ts', windowQuitHooks);
}
await patch('apps/desktop/tsdown.config.ts', [["'preload-opencu-presentation',", "'preload-opencu-presentation', 'preload-opencu-surface',"]], "'preload-opencu-surface'");
await patch('apps/desktop/tsdown.config.ts', [["const manifest = JSON.parse(", `// opencu-plain-js-build:v1
const openCUCompilerFs = await import('node:fs/promises')
for (const name of await openCUCompilerFs.readdir(new URL('./src/', import.meta.url))) {
  if (/^opencu-.*\\.(?:js|mjs)$/.test(name)) await openCUCompilerFs.copyFile(new URL('./src/' + name, import.meta.url), new URL('./lib/types/' + name, import.meta.url))
}
const manifest = JSON.parse(`]], '// opencu-plain-js-build:v1');
await patch('apps/desktop/scripts/electron-builder-config.mjs', [["      'lib/preload-app.cjs',", "      'lib/preload-app.cjs',\n      'lib/preload-opencu-surface.cjs',"]], "'lib/preload-opencu-surface.cjs'");
// Input follows the current physical host; shortcut delivery still targets its DSH owner.
await patch(desktop + 'keyboard.ts', [
  ['name: DesktopBrowserLeaseId): () => void', 'name: DesktopBrowserLeaseId, shortcutOwner?: WebContents): () => void'],
  ['attachGuest(window: BrowserWindow,', 'attachGuest(window: BrowserWindow | (() => BrowserWindow | undefined),'],
  ['  function attachInput(window: BrowserWindow, contents: WebContents, guestName?: DesktopBrowserLeaseId): () => void {', `  ${surfaceMarker}
  function attachInput(windowSource: BrowserWindow | (() => BrowserWindow | undefined), contents: WebContents, guestName?: DesktopBrowserLeaseId, shortcutOwner?: WebContents): () => void {
    const currentWindow = (): BrowserWindow | undefined => typeof windowSource === 'function' ? windowSource() : windowSource
    const window = currentWindow()
    if (!window) throw new Error('Browser guest physical window is unavailable')`],
  ['guestInputs.set(contents, { window, reset: resetInput })', 'guestInputs.set(contents, { get window() { return currentWindow() ?? window }, reset: resetInput })'],
  ['    const beforeInput = (event: Electron.Event, input: Input): void => {\n      const overlay = overlayInput(window)', '    const beforeInput = (event: Electron.Event, input: Input): void => {\n      const window = currentWindow()\n      if (!window || window.isDestroyed()) { resetInput(); return }\n      const overlay = overlayInput(window)'],
  ['if (window !== getWindow() || !window.isFocused()', 'if ((guestName === undefined && window !== getWindow()) || !window.isFocused()'],
  ['      window.webContents.send(DESKTOP_IPC.shortcutsInput, { kind: guestName', '      ;(shortcutOwner ?? window.webContents).send(DESKTOP_IPC.shortcutsInput, { kind: guestName'],
], surfaceMarker);
const sidebar = 'packages/client/ui-sidebar-right/src/client/';
await patch(sidebar + 'tab-registry.ts', [
  ["import type { ShortcutCommandId }", "import type { TabRecord } from '@deepseek-ai/dsh-client-ui-dockkit'\nimport type { ShortcutCommandId }"],
  ['  readonly keepMounted?: boolean', '  readonly keepMounted?: boolean | ((tab: TabRecord) => boolean)'],
], 'keepMounted?: boolean |');
await patch(sidebar + 'shell/SidebarRight.tsx', [
  ["const retained = seat === 'sidebar.right.pane.tab' && definition?.keepMounted === true", "const retained = seat === 'sidebar.right.pane.tab' && (typeof definition?.keepMounted === 'function' ? definition.keepMounted(tab) : definition?.keepMounted === true)"],
  ['keepMounted={tab => types.find(type => type.kind === tab.kind)?.keepMounted === true}', "keepMounted={tab => { const keep = types.find(type => type.kind === tab.kind)?.keepMounted; return typeof keep === 'function' ? keep(tab) : keep === true }}"],
], "typeof definition?.keepMounted === 'function'");
await patch('packages/client/ui-sidebar-documentpreview/src/client/definition.ts', [[
  '    kind: TEXTPREVIEW_KIND,', "    kind: TEXTPREVIEW_KIND,\n    keepMounted: tab => /\\.(xlsx|pptx)$/i.test(tab.contentId),",
]], 'keepMounted: tab =>');
pending.set(sidebar + 'tab-close-guards.ts', await readFile(new URL('./tab-close-guards.ts', import.meta.url), 'utf8'));
await patch(sidebar + 'contract/slots.ts', [[
  '  bindCommands(commands: SidebarRightTabCommands): () => void',
  '  bindCommands(commands: SidebarRightTabCommands): () => void\n  /** Bind an additive save check until unmount; false or rejection preserves the tab. */\n  bindCloseGuard(guard: () => Promise<boolean>): () => void',
]], 'bindCloseGuard(');
await patch(sidebar + 'tab-domain.ts', [
  ["import type { Branded }", "import { TabCloseGuards } from './tab-close-guards.ts'\nimport type { Branded }"],
  ['  readonly commands: SidebarRightTabCommands', '  readonly commands: SidebarRightTabCommands\n  readonly closeGuards: TabCloseGuards'],
  ['      commands: {},', '      commands: {},\n      closeGuards: new TabCloseGuards(controller.signal),'],
  ['      tabActions: {', '      tabActions: {\n        bindCloseGuard: guard => held.closeGuards.bind(guard),'],
], 'bindCloseGuard:');
await patch(sidebar + 'service.ts', [[
  '    this.closeHandlers.get(tab.kind)?.(sessionId, tab)\n    commit()',
  `    const occurrence = this.tabDomain.occurrence(sessionId, tab)
    occurrence.closeGuards.close(() => {
      const current = this.adopted.get(sessionId)?.store.getSnapshot().bySession[sessionId]?.layout.tabs[tab.id]
      if (occurrence.signal.aborted || current?.contentId !== tab.contentId || current?.kind !== tab.kind) return
      this.closeHandlers.get(tab.kind)?.(sessionId, tab)
      commit()
    })`,
]], 'occurrence.closeGuards.close(');
await patch(sidebar + 'contract/slots.ts', [["    /** Session content selected by the root-scoped right Sidebar controller. */", "    /** Session-owned accessories; no contributor changes the docking surface. */\n    'sidebar.right.accessory': { kind: 'list'; scope: 'session'; owner: { readonly visible: boolean } }\n    /** Session content selected by the root-scoped right Sidebar controller. */"]], 'sidebar.right.accessory');
await patch(sidebar + 'index.ts', [["          'sidebar.right.tab.menu.item': { kind: 'list', scope: 'session' },", "          'sidebar.right.tab.menu.item': { kind: 'list', scope: 'session' },\n          'sidebar.right.accessory': { kind: 'list', scope: 'session' },"]], 'sidebar.right.accessory');
await patch(sidebar + 'shell/SidebarRight.tsx', [
  ["'sidebar.right.pane.tab.title' | 'sidebar.right.tab.menu.item'>", "'sidebar.right.pane.tab.title' | 'sidebar.right.tab.menu.item' | 'sidebar.right.accessory'>"],
  ['      <div className={css.panelBody}>', "      <div className={css.accessory} hidden={!expanded || !panel.active}>\n        {renderSlot('sidebar.right.accessory', { visible: expanded && panel.active })}\n      </div>\n      <div className={css.panelBody}>"],
], 'sidebar.right.accessory');
await patch(sidebar + 'shell/SidebarRight.module.css', [['.panelBody {', '.accessory {\n  flex: none;\n  min-height: 0;\n  pointer-events: auto;\n}\n\n.accessory[hidden], .accessory:empty {\n  display: none;\n}\n\n.panelBody {']], '.accessory {');
const packagePath = 'apps/desktop/package.json';
const desktopManifest = JSON.parse(await source(packagePath));
desktopManifest.dependencies['electron-chrome-extensions'] = '4.9.0';
pending.set(packagePath, JSON.stringify(desktopManifest, null, 2) + '\n');
const oldCapabilities = JSON.stringify([...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory']);
const documentCapabilities = JSON.stringify([...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory', 'artifactDocuments', 'tabCloseGuards']);
const newCapabilities = JSON.stringify([...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory', 'artifactDocuments', 'tabCloseGuards', 'browserSurfaces']);
if (!(await source(desktop + 'preload-browser.ts')).includes('"browserSurfaces"')) {
  const currentCapabilities = (await source(desktop + 'preload-browser.ts')).includes('"tabCloseGuards"') ? documentCapabilities : oldCapabilities;
  await patch(desktop + 'preload-browser.ts', [[`capabilities: ${currentCapabilities}`, `capabilities: ${newCapabilities}`]]);
}
if ((await source(guests)).includes('devTools: !app.isPackaged,')) await patch(guests, [['devTools: !app.isPackaged,', 'devTools: !!lease.openCU || !app.isPackaged,']]);
if (!(await source(desktop + 'preload-browser.ts')).includes('"presentationSessions"')) {
  await patch(desktop + 'preload-browser.ts', [[`capabilities: ${newCapabilities}`, `capabilities: ${JSON.stringify([...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory', 'artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions'])}`]]);
}
if (!(await source(desktop + 'preload-browser.ts')).includes('"presentationHitRegions"')) {
  const capabilities = [...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory', 'artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions'];
  await patch(desktop + 'preload-browser.ts', [[`capabilities: ${JSON.stringify(capabilities)}`, `capabilities: ${JSON.stringify([...capabilities, 'presentationHitRegions'])}`]]);
}
const ipcResultMarker = '// opencu-ipc-result:v1';
await patch(desktop + 'main.ts', [
  ["import { OpenCUPresentations } from './opencu-presentation.ts'", "import { OpenCUPresentations } from './opencu-presentation.ts'\nimport { replyOpenCU } from './opencu-ipc-result.ts'\n" + ipcResultMarker],
  ["return browserGuests.operateOpenCU(event.sender, lease, 'automation', operation, args)", "return replyOpenCU(() => browserGuests.operateOpenCU(event.sender, lease, 'automation', operation, args))"],
  ['return openCUBrowserSurfaces.operate(event, operation, args)', 'return replyOpenCU(() => openCUBrowserSurfaces.operate(event, operation, args))'],
], ipcResultMarker);
for (const [from, to] of [
  ['ipc-result', 'opencu-ipc-result'],
  ['page-image', 'opencu-page-image'], ['artifact-documents', 'opencu-artifact-documents'],
  ['guest-adapter', 'opencu-guest-adapter'], ['downloads', 'opencu-downloads'], ['permissions', 'opencu-permissions'],
  ['presentation', 'opencu-presentation'], ['preload-presentation', 'preload-opencu-presentation'],
  ['presentation-motion', 'opencu-presentation-motion'], ['presentation-transfer', 'opencu-presentation-transfer'],
  ['browser-surfaces', 'opencu-browser-surfaces'], ['preload-surface', 'preload-opencu-surface'],
  ['cursor', 'opencu-cursor'], ['preload-cursor', 'preload-opencu-cursor'], ['automation', 'opencu-automation'],
  ['dialogs', 'opencu-dialogs'],
  ['site-tools', 'opencu-site-tools'], ['extensions', 'opencu-extensions'], ['files', 'opencu-files'], ['profile', 'opencu-profile'],
]) pending.set(desktop + to + '.ts', await readFile(new URL(`./${from}.ts`, import.meta.url), 'utf8'));
for (const extension of ['mjs', 'd.mts']) pending.set(desktop + 'opencu-presentation-images.' + extension,
  await readFile(new URL('../src/presentation-images.' + extension, import.meta.url), 'utf8'));
// Locators, AX observation and the real frame-session router serve all three browser backends.
for (const file of ['dom-locator.js','cdp-locator.js','cdp-locator.d.ts','select-options.js','select-options.d.ts','file-input.js','file-input.d.ts','frame-router.js','frame-router.d.ts','ax-tree.js','ax-tree.d.ts','keyboard.js','keyboard.d.ts','text-edit.js','text-edit.d.ts']) {
  const value = await readFile(new URL(`../extension/${file}`, import.meta.url), 'utf8');
  pending.set(desktop + 'opencu-' + file, value.replaceAll("'./dom-locator.js'", "'./opencu-dom-locator.js'").replaceAll("'./frame-router.js'", "'./opencu-frame-router.js'").replaceAll("'./select-options.js'", "'./opencu-select-options.js'"));
}
// Copied modules keep lease ownership; only native window lookup and anchors follow placement.
await patch(desktop + 'opencu-permissions.ts', [
  ["import { BrowserWindow, Menu,", "import { openCUBrowserWindow, openCUBrowserBounds } from './opencu-browser-surfaces.ts'\nimport { Menu,"],
  ["    if (operation === 'contextMenu') {\n      const window = BrowserWindow.fromWebContents(owner)", "    if (operation === 'contextMenu') {\n      const window = openCUBrowserWindow(owner)"],
  ['      const window = BrowserWindow.fromWebContents(owner)', '      const window = openCUBrowserWindow(owner)'],
  ["      return new Promise<boolean>(resolve => Menu.buildFromTemplate(template).popup({ window, x: Math.round(Number(bounds.x)), y: Math.round(Number(bounds.y) + Number(bounds.height)), callback: () => resolve(false) }))", "      const anchor = openCUBrowserBounds(owner, { x: Number(bounds.x), y: Number(bounds.y), width: 0, height: Number(bounds.height) })\n      return new Promise<boolean>(resolve => Menu.buildFromTemplate(template).popup({ window, x: anchor.x, y: anchor.y + anchor.height, callback: () => resolve(false) }))"],
]);
await patch(desktop + 'opencu-files.ts', [
  ["import { app, BrowserWindow, dialog,", "import { openCUBrowserWindow } from './opencu-browser-surfaces.ts'\nimport { app, dialog,"],
  ['BrowserWindow.fromWebContents(owner)', 'openCUBrowserWindow(owner)'],
]);
await patch(desktop + 'opencu-extensions.ts', [
  ["import { BrowserWindow, dialog,", "import { openCUBrowserWindow, openCUBrowserBounds, openCUBrowserOwner, onOpenCUBrowserPlacement } from './opencu-browser-surfaces.ts'\nimport { webContents, type BrowserWindow, dialog,"],
  ['  const window = BrowserWindow.fromWebContents(owner)', '  const window = openCUBrowserWindow(owner)'],
  ['window = owner && BrowserWindow.fromWebContents(owner)', 'window = owner && openCUBrowserWindow(owner)'],
  ['const profile = profiles.get(guest.session), window = BrowserWindow.fromWebContents(owner)', 'const profile = profiles.get(guest.session), window = openCUBrowserWindow(owner)'],
  ['const profile = profiles.get(guest.session), value = fields(args), window = BrowserWindow.fromWebContents(owner)', 'const profile = profiles.get(guest.session), value = fields(args), window = openCUBrowserWindow(owner)'],
  [`    const zoom = owner.getZoomFactor(), content = window.getContentBounds()
    const anchorRect = { x: Number(bounds.x) * zoom, y: Number(bounds.y) * zoom, width: Number(bounds.width) * zoom, height: Number(bounds.height) * zoom }`,
   `    const content = window.getContentBounds()
    const anchorRect = openCUBrowserBounds(owner, { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) })`],
  [`    clearTimeout(request.timer); pendingTabs.delete(String(value.requestId)); request.resolve([guest, window]); return true`,
   `    const created = value.webContentsId === undefined ? guest : Number.isSafeInteger(value.webContentsId) ? webContents.fromId(Number(value.webContentsId)) : undefined
    const createdOwner = created && profile.guests.get(created), createdWindow = createdOwner && openCUBrowserWindow(createdOwner)
    if (!created || !createdOwner || !createdWindow || openCUBrowserOwner(createdOwner) !== openCUBrowserOwner(owner)) throw new Error('Extension tab reply belongs to another owner')
    clearTimeout(request.timer); pendingTabs.delete(String(value.requestId)); request.resolve([created, createdWindow]); return true`],
  ['    profile.guests.delete(guest)', `    profile.guests.delete(guest)
    if (![...profile.guests.values()].includes(owner)) {
      for (const [id, request] of pendingTabs) if (request.owner === owner) {
        clearTimeout(request.timer); pendingTabs.delete(id); request.reject(new Error('Extension tab owner closed'))
      }
    }`],
  ['  sync(() => profile.runtime.addTab(guest, window))', `  sync(() => profile.runtime.addTab(guest, window))
  // The pinned runtime stores a tab's window separately; changing that map preserves the tab and its extension state.
  const store = Reflect.get(profile.runtime, 'ctx').store as {
    tabToWindow: WeakMap<WebContents, BrowserWindow>; windowToActiveTab: WeakMap<BrowserWindow, WebContents>
    tabDetailsCache: Map<number, object>; addWindow(window: BrowserWindow): void
  }
  const unbindPlacement = onOpenCUBrowserPlacement(owner, () => {
    const next = openCUBrowserWindow(owner)
    if (!next || guest.isDestroyed()) throw new Error('Extension guest physical window is unavailable')
    const previous = store.tabToWindow.get(guest)
    if (previous === next) return
    if (previous && store.windowToActiveTab.get(previous) === guest) store.windowToActiveTab.delete(previous)
    store.tabToWindow.set(guest, next); store.addWindow(next); store.tabDetailsCache.delete(guest.id)
    sync(() => profile.runtime.selectTab(guest))
    if (profile.popup && !profile.popup.window.isDestroyed()) profile.popup.window.close()
  })`],
  ["  guest.once('destroyed', () => {", "  guest.once('destroyed', () => {\n    unbindPlacement()"],
]);
for (const extension of ['js', 'd.ts']) pending.set(desktop + `opencu-rea-context-menu.${extension}`, await readFile(new URL(`./rea-context-menu.${extension}`, import.meta.url), 'utf8'));
await applyComposerReferences(patch, 'packages/client/ui-conversation/src/client/');
await applyToolVisibility(patch, 'packages/client/ui-chat/src/client/conversation-nodes/');
const backgroundMarker = '// opencu-background-input:v1';
await patch(guests, [
  ["import { cancelSiteTool } from './opencu-site-tools.ts'", `import { cancelSiteTool } from './opencu-site-tools.ts'\n${backgroundMarker}`],
  ['\n      try { this.openCU.release(lease) } catch (error) { errors.push(error) }\n', '\n      try { await this.openCU.release(lease) } catch (error) { errors.push(error) }\n'],
  ["          try { this.openCU.release(lease) } catch (error) { errors.push(error) }", "          void this.openCU.release(lease).catch(error => console.error('Destroyed guest input release failed', error))"],
], backgroundMarker);
await patch(desktop + 'main.ts', [
  ["import { OpenCUBrowserSurfaces, trackOpenCUGuestInput } from './opencu-browser-surfaces.ts'", "import { OpenCUBrowserSurfaces } from './opencu-browser-surfaces.ts'"],
  ['      const releaseInput = trackOpenCUGuestInput(guest)\n      return () => { try { releaseInput() } finally { unbind() } }', '      // CDP-held input is released by OpenCUGuests, independently of user input.\n      return unbind'],
], 'CDP-held input is released');
if (!(await source(desktop + 'preload-browser.ts')).includes('"backgroundInput"')) {
  const capabilities = [...browserCapabilities, 'presentation', 'files', 'cursor', 'accessory', 'artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions', 'presentationHitRegions'];
  await patch(desktop + 'preload-browser.ts', [[`capabilities: ${JSON.stringify(capabilities)}`, `capabilities: ${JSON.stringify([...capabilities, 'backgroundInput'])}`]]);
}
if (!(await source(desktop + 'preload-browser.ts')).includes('"structuredErrors"')) {
  const value = await source(desktop + 'preload-browser.ts');
  const capabilities = value.match(/capabilities: (\[[^\n]+?\])/);
  if (!capabilities) throw new Error('OpenCU desktop capability declaration is missing');
  await patch(desktop + 'preload-browser.ts', [[capabilities[0], 'capabilities: ' + JSON.stringify([...JSON.parse(capabilities[1]), 'structuredErrors'])]]);
}
if (!(await source(desktop + 'preload-browser.ts')).includes('"initialNavigation"')) {
  const value = await source(desktop + 'preload-browser.ts');
  const capabilities = value.match(/capabilities: (\[[^\n]+?\])/);
  if (!capabilities) throw new Error('OpenCU desktop capability declaration is missing');
  await patch(desktop + 'preload-browser.ts', [[capabilities[0], 'capabilities: ' + JSON.stringify([...JSON.parse(capabilities[1]), 'initialNavigation'])]]);
}
// Background tab creation preserves the visible pane selection in the same layout transaction.
for (const file of ['service.ts', 'contract/slots.ts', 'stores.ts']) {
  await patch(sidebar + file, [['  readonly revealIfOpened?: boolean', '  readonly revealIfOpened?: boolean\n  /** False creates without revealing or selecting the tab. */\n  readonly active?: boolean']], 'readonly active?: boolean');
}
await patch(sidebar + 'tab-domain.ts', [
  ['      ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },', '      ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },\n      ...placement.active === undefined ? {} : { active: placement.active },'],
], 'active: placement.active');
await patch(sidebar + 'service.ts', [
  ['      ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },', '      ...placement.revealIfOpened === undefined ? {} : { revealIfOpened: placement.revealIfOpened },\n      ...placement.active === undefined ? {} : { active: placement.active },'],
], 'active: placement.active');
await patch(sidebar + 'stores.ts', [
  ['          const ops: LayoutOp[] = [...planSetExpanded(state, true)]', '          if (intent.active === false && (intent.replaceTab !== undefined || intent.preferNewPane)) throw new Error(\'Background opens cannot replace or split the visible pane\')\n          const ops: LayoutOp[] = intent.active === false ? [] : [...planSetExpanded(state, true)]'],
  ['          ops.push(...planned.ops)', `          ops.push(...(intent.active === false
            ? planned.ops.filter(op => op.type !== 'focusTab').map(op => op.type === 'openTab' ? { ...op, type: 'insertTab' as const } : op)
            : planned.ops))`],
], 'Background opens cannot replace');
// Validate every edit before writing any source. Reapplication updates owned adapter modules without duplicating hooks.
for (const [file, value] of pending) {
  let current;
  try { current = await readFile(join(root, file), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== value) await writeFile(join(root, file), value);
}
console.log(JSON.stringify({ adapterRevision, target, root, files: [...pending.keys()], dependency: 'electron-chrome-extensions@4.9.0', next: 'Install matching dependencies, rebuild Host + Client + Web + desktop preloads, then package the existing host.' }, null, 2));
