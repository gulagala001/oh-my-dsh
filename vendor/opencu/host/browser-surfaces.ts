/** A tab's renderer and webview move together; its DSH owner never changes. */
import { app, BrowserWindow, WebContentsView, type IpcMainInvokeEvent, type Rectangle, type WebContents, type WebFrameMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Hidden nested guests need compositor frames even when their parking window is occluded.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

const surfaceUrl = 'dsh-app://app/api/opencu/browser-surface'
const eventChannel = 'dsh-desktop:opencu-surface-event'
interface Identity { sessionId: string; tabId: string }
interface Surface extends Identity {
  key: string; owner: WebContents; view: WebContentsView; initialUrl: string; initialNavigation?: unknown; locale: string; theme: string
  parent: BrowserWindow | undefined; detached: BrowserWindow | undefined; bounds: Rectangle; visible: boolean
  initialized: boolean; loaded: boolean; ready: Promise<void>; resolveReady: () => void; rejectReady: (error: Error) => void
  closing: Promise<void> | undefined; dead: boolean; dispose: () => void
}
interface Pending {
  surface: Surface; recipient: WebContents; frame: WebFrameMain | undefined
  resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>
}
const surfaces = new Map<WebContents, Surface>()
const placementListeners = new Map<WebContents, Set<() => void>>()

/** Subscribe native integrations without moving or replacing the lease owner. */
export function onOpenCUBrowserPlacement(owner: WebContents, listener: () => void): () => void {
  let listeners = placementListeners.get(owner)
  if (!listeners) { listeners = new Set(); placementListeners.set(owner, listeners) }
  listeners.add(listener)
  return () => { listeners.delete(listener); if (!listeners.size) placementListeners.delete(owner) }
}

/** Resolve the permanent DSH owner for cross-surface extension replies. */
export function openCUBrowserOwner(contents: WebContents): WebContents { return surfaces.get(contents)?.owner ?? contents }

/** Resolve the physical window without changing the guest lease's renderer owner. */
export function openCUBrowserWindow(owner: WebContents): BrowserWindow | null {
  const surface = surfaces.get(owner)
  const window = surface?.detached ?? (surface ? BrowserWindow.fromWebContents(surface.owner) : BrowserWindow.fromWebContents(owner))
  return window && !window.isDestroyed() ? window : null
}

/** Convert surface CSS anchors to its current window's native content coordinates. */
export function openCUBrowserBounds(owner: WebContents, bounds: Rectangle): Rectangle {
  const surface = surfaces.get(owner), zoom = owner.getZoomFactor()
  const offset = surface && !surface.detached ? surface.view.getBounds() : { x: 0, y: 0 }
  return { x: Math.round(offset.x + bounds.x * zoom), y: Math.round(offset.y + bounds.y * zoom),
    width: Math.round(bounds.width * zoom), height: Math.round(bounds.height * zoom) }
}
function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid browser surface arguments')
  return value as Record<string, unknown>
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value || value.length > 8192 || value.includes('\0')) throw new Error('Invalid browser surface ' + name)
  return value
}
function identity(value: Record<string, unknown>): Identity {
  return { sessionId: text(value.sessionId, 'sessionId'), tabId: text(value.tabId, 'tabId') }
}
function keyOf(value: Identity): string { return value.sessionId + '\0' + value.tabId }
function failure(value: unknown): Error {
  if (value instanceof Error) return value
  if (value && typeof value === 'object' && 'message' in value) {
    const error = new Error(String(value.message))
    if ('code' in value && typeof value.code === 'string') Object.assign(error, { code: value.code })
    if ('details' in value && value.details !== null && typeof value.details === 'object') Object.assign(error, { details: value.details })
    return error
  }
  return new Error(typeof value === 'string' ? value : 'Browser surface failed')
}

export class OpenCUBrowserSurfaces {
  private readonly records = new Map<string, Surface>()
  private readonly pending = new Map<string, Pending>()
  private readonly backgroundWindows = new WeakMap<WebContents, BrowserWindow>()

  constructor(
    private readonly setup: (contents: WebContents, window: () => BrowserWindow | undefined) => void,
    private readonly release: (contents: WebContents) => Promise<void>,
  ) {}

  /** Only the registered main frame at the exact surface document receives OpenCU IPC. */
  accepts(event: IpcMainInvokeEvent): boolean {
    const record = surfaces.get(event.sender)
    return !!record && !record.dead && this.records.get(record.key) === record && !record.owner.isDestroyed()
      && event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === surfaceUrl && event.sender.getURL() === surfaceUrl
  }

  /** Presentations remain grouped under the original DSH renderer. */
  owner(contents: WebContents): WebContents { return openCUBrowserOwner(contents) }

  private live(record: Surface): void {
    if (record.dead || record.owner.isDestroyed() || record.view.webContents.isDestroyed() || this.records.get(record.key) !== record) {
      throw new Error('Browser surface is no longer available')
    }
  }
  private send(contents: WebContents, record: Surface, event: object): void {
    if (contents.isDestroyed()) throw new Error('Browser surface event recipient is unavailable')
    contents.send(eventChannel, { ...event, sessionId: record.sessionId, tabId: record.tabId })
  }
  private placement(record: Surface): void {
    for (const listener of placementListeners.get(record.view.webContents) ?? []) listener()
    const event = { type: 'placement', detached: !!record.detached }
    this.send(record.owner, record, event)
    this.send(record.view.webContents, record, event)
  }
  private move(record: Surface, window: BrowserWindow | undefined): void {
    if (record.parent === window) return
    if (record.parent && !record.parent.isDestroyed()) record.parent.contentView.removeChildView(record.view)
    record.parent = undefined
    if (window) {
      window.contentView.addChildView(record.view); record.parent = window
      record.view.webContents.setBackgroundThrottling(false)
      record.view.webContents.invalidate()
    }
  }
  private backgroundWindow(owner: WebContents): BrowserWindow {
    const existing = this.backgroundWindows.get(owner)
    if (existing && !existing.isDestroyed()) return existing
    // An unparented WebContentsView cannot composite its nested <webview>.
    // Keep the same surface attached offscreen, never shown or focusable.
    const window = new BrowserWindow({ show: false, width: 1280, height: 800, focusable: false,
      skipTaskbar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
    window.setIgnoreMouseEvents(true)
    this.backgroundWindows.set(owner, window)
    return window
  }
  private layout(record: Surface): void {
    this.live(record)
    const ownerWindow = BrowserWindow.fromWebContents(record.owner)
    if (!ownerWindow || ownerWindow.isDestroyed()) throw new Error('Browser surface owner window is unavailable')
    const zoom = record.owner.getZoomFactor()
    if (record.view.webContents.getZoomFactor() !== zoom) record.view.webContents.setZoomFactor(zoom)
    if (record.detached) {
      const { width, height } = record.detached.getContentBounds()
      this.move(record, record.detached)
      record.view.setBounds({ x: 0, y: 0, width, height })
    } else {
      const { x, y, width, height } = record.bounds
      const visible = record.visible && width > 0 && height > 0
      record.view.setBounds(visible
        ? { x: Math.round(x * zoom), y: Math.round(y * zoom), width: Math.round(width * zoom), height: Math.round(height * zoom) }
        : { x: 0, y: 0, width: Math.max(1, Math.round((width || 1280) * zoom)), height: Math.max(1, Math.round((height || 800) * zoom)) })
      this.move(record, visible ? ownerWindow : this.backgroundWindow(record.owner))
    }
  }
  private fault(record: Surface, error: unknown): void {
    const reason = failure(error)
    console.error('OpenCU browser surface failed', record.key, reason)
    if (record.dead) return
    try { this.send(record.owner, record, { type: 'fault', error: reason.message }) }
    catch (notifyError) { console.error('OpenCU browser surface fault notification failed', notifyError) }
    void this.close(record, reason).catch(cleanupError => console.error('OpenCU browser surface cleanup failed', cleanupError))
  }
  private async create(owner: WebContents, args: Record<string, unknown>): Promise<object> {
    const id = identity(args), key = keyOf(id), existing = this.records.get(key)
    if (existing) {
      if (existing.owner !== owner) throw new Error('Browser surface belongs to another owner')
      await existing.ready; this.live(existing)
      return { key, webContentsId: existing.view.webContents.id }
    }
    const window = BrowserWindow.fromWebContents(owner)
    if (!window || window.isDestroyed()) throw new Error('Browser surface owner window is unavailable')
    const initialUrl = text(args.initialUrl, 'initialUrl'), locale = text(args.locale, 'locale'), theme = text(args.theme, 'theme')
    const view = new WebContentsView({ webPreferences: {
      preload: fileURLToPath(new URL('./preload-opencu-surface.cjs', import.meta.url)),
      session: owner.session, nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true,
      sandbox: true, webSecurity: true, webviewTag: true, backgroundThrottling: false,
    } })
    let resolveReady!: () => void, rejectReady!: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    // Creation and requests also await ready; lifecycle rejection must be handled before either attaches.
    void ready.catch(() => undefined)
    const record: Surface = { ...id, key, owner, view, initialUrl, initialNavigation: args.initialNavigation, locale, theme, parent: undefined, detached: undefined,
      bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false, loaded: false, initialized: false,
      ready, resolveReady, rejectReady, closing: undefined, dead: false, dispose: () => {} }
    this.records.set(key, record); surfaces.set(view.webContents, record)
    const child = view.webContents
    const onOwnerExit = () => this.fault(record, new Error('Browser surface owner exited'))
    const onOwnerNavigate = (_event: Electron.Event, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) this.fault(record, new Error('Browser surface owner reloaded'))
    }
    let navigated = false
    const onNavigate = (_event: Electron.Event, url: string, inPlace: boolean, mainFrame: boolean) => {
      if (!mainFrame) return
      if (!navigated && !inPlace && url === surfaceUrl) { navigated = true; return }
      this.fault(record, new Error('Browser surface document navigated or reloaded'))
    }
    const onGone = (_event: Electron.Event, details: Electron.RenderProcessGoneDetails) => this.fault(record, new Error('Browser surface renderer: ' + details.reason))
    const onDestroyed = () => this.fault(record, new Error('Browser surface renderer was destroyed'))
    const onLoadFailed = (_event: Electron.Event, code: number, description: string, _url: string, mainFrame: boolean) => {
      if (mainFrame) this.fault(record, new Error('Browser surface load failed: ' + code + ' ' + description))
    }
    const onZoom = () => { try { this.layout(record) } catch (error) { this.fault(record, error) } }
    const preventNavigation = (event: Electron.Event) => { event.preventDefault(); this.fault(record, new Error('Browser surface navigation was blocked')) }
    const timer = setTimeout(() => this.fault(record, new Error('Browser surface initialization timed out')), 30_000)
    let zoom = owner.getZoomFactor()
    // Programmatic renderer zoom does not emit Electron's gesture-only zoom-changed event.
    const zoomTimer = setInterval(() => {
      if (owner.isDestroyed()) return
      const next = owner.getZoomFactor()
      if (next !== zoom) { zoom = next; onZoom() }
    }, 250)
    record.dispose = () => {
      clearTimeout(timer); clearInterval(zoomTimer)
      owner.off('destroyed', onOwnerExit); owner.off('render-process-gone', onOwnerExit); owner.off('did-start-navigation', onOwnerNavigate)
      owner.off('zoom-changed', onZoom); window.off('resize', onZoom); window.off('closed', onOwnerExit)
      child.off('did-start-navigation', onNavigate); child.off('render-process-gone', onGone); child.off('destroyed', onDestroyed)
      child.off('did-fail-load', onLoadFailed); child.off('will-navigate', preventNavigation); child.off('will-redirect', preventNavigation)
    }
    owner.once('destroyed', onOwnerExit); owner.on('render-process-gone', onOwnerExit); owner.on('did-start-navigation', onOwnerNavigate)
    owner.on('zoom-changed', onZoom); window.on('resize', onZoom); window.once('closed', onOwnerExit)
    child.on('did-start-navigation', onNavigate); child.on('render-process-gone', onGone); child.once('destroyed', onDestroyed)
    child.on('did-fail-load', onLoadFailed); child.on('will-navigate', preventNavigation); child.on('will-redirect', preventNavigation)
    child.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      this.setup(child, () => openCUBrowserWindow(child) ?? undefined)
      this.layout(record)
      void child.loadURL(surfaceUrl).then(() => {
        this.live(record); record.loaded = true
        if (record.initialized) record.resolveReady()
      }).catch(error => this.fault(record, error))
      await ready; clearTimeout(timer); this.live(record)
      return { key, webContentsId: child.id }
    } catch (error) {
      this.fault(record, error)
      if (record.closing) await record.closing
      throw error
    }
  }
  private detach(record: Surface): void {
    this.live(record)
    if (record.detached) { record.detached.show(); record.detached.focus(); return }
    const zoom = record.owner.getZoomFactor()
    const window = new BrowserWindow({ show: false, width: Math.max(640, Math.round(record.bounds.width * zoom)),
      height: Math.max(480, Math.round(record.bounds.height * zoom)), title: 'OpenCU',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } })
    record.detached = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('close', event => {
      if (record.dead || record.detached !== window) return
      event.preventDefault()
      try { this.dock(record) } catch (error) { this.fault(record, error) }
    })
    window.on('closed', () => {
      if (record.dead || record.detached !== window) return
      record.detached = undefined; record.parent = undefined
      try { this.layout(record); this.placement(record) } catch (error) { this.fault(record, error) }
    })
    window.on('resize', () => { if (!record.dead) { try { this.layout(record) } catch (error) { this.fault(record, error) } } })
    this.layout(record); window.show(); window.focus(); record.view.webContents.focus(); this.placement(record)
  }
  private dock(record: Surface): void {
    this.live(record)
    const detached = record.detached
    if (!detached) return
    this.move(record, undefined); record.detached = undefined
    try { this.layout(record); this.placement(record) }
    finally { if (!detached.isDestroyed()) detached.destroy() }
  }
  private close(record: Surface, reason = new Error('Browser surface closed')): Promise<void> {
    if (record.closing) return record.closing
    record.dead = true; record.rejectReady(reason)
    const errors: unknown[] = []
    try { record.dispose() } catch (error) { errors.push(error) }
    for (const [id, request] of this.pending) if (request.surface === record) {
      clearTimeout(request.timer); this.pending.delete(id); request.reject(reason)
    }
    // Guest input/leases are released before either the child renderer or its window is destroyed.
    record.closing = Promise.resolve().then(async () => {
      try { await this.release(record.view.webContents) } catch (error) { errors.push(error) }
      try { this.move(record, undefined) } catch (error) { errors.push(error) }
      if (!record.view.webContents.isDestroyed()) {
        try {
          await new Promise<void>((resolve, reject) => {
            const contents = record.view.webContents
            const done = (): void => { clearTimeout(timer); resolve() }
            const timer = setTimeout(() => { contents.off('destroyed', done); reject(new Error('Browser surface close timed out')) }, 5000)
            contents.once('destroyed', done)
            try { contents.close({ waitForBeforeUnload: false }) }
            catch (error) { clearTimeout(timer); contents.off('destroyed', done); reject(error) }
          })
        } catch (error) { errors.push(error) }
      }
      try { if (record.detached && !record.detached.isDestroyed()) record.detached.destroy() } catch (error) { errors.push(error) }
      surfaces.delete(record.view.webContents); placementListeners.delete(record.view.webContents)
      if (this.records.get(record.key) === record) this.records.delete(record.key)
      if (![...this.records.values()].some(value => value.owner === record.owner)) {
        const window = this.backgroundWindows.get(record.owner)
        this.backgroundWindows.delete(record.owner)
        try { if (window && !window.isDestroyed()) window.destroy() } catch (error) { errors.push(error) }
      }
      if (errors.length) throw new AggregateError(errors, 'Browser surface release failed')
    })
    return record.closing
  }
  private request(record: Surface, recipient: WebContents, args: Record<string, unknown>): Promise<unknown> {
    this.live(record)
    const method = text(args.method, 'method'), id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Browser surface RPC timed out: ' + method)) }, 30_000)
      const request: Pending = { surface: record, recipient, frame: undefined, resolve, reject, timer }
      this.pending.set(id, request)
      const send = () => {
        if (this.pending.get(id) !== request) return
        this.live(record)
        request.frame = recipient.mainFrame
        this.send(recipient, record, { type: 'request', id, method, args: args.args })
      }
      void (recipient === record.view.webContents ? record.ready : Promise.resolve()).then(send).catch(error => {
        if (this.pending.get(id) !== request) return
        clearTimeout(timer); this.pending.delete(id); reject(error)
      })
    })
  }
  private reply(event: IpcMainInvokeEvent, args: Record<string, unknown>): boolean {
    const id = text(args.id, 'reply id'), request = this.pending.get(id)
    if (!request || request.recipient !== event.sender || request.frame !== event.senderFrame) throw new Error('Expired or mismatched browser surface reply')
    const record = request.surface
    this.live(record); this.checkIdentity(record, args)
    clearTimeout(request.timer); this.pending.delete(id)
    if (args.error !== undefined && args.error !== null) request.reject(failure(args.error))
    else request.resolve(args.result)
    return true
  }
  private checkIdentity(record: Surface, args: Record<string, unknown>): void {
    if ((args.sessionId !== undefined && args.sessionId !== record.sessionId) || (args.tabId !== undefined && args.tabId !== record.tabId)
      || (args.key !== undefined && args.key !== record.key)) throw new Error('Mismatched browser surface identity')
  }
  /** Product senders are checked by main.ts; child senders are checked again here. */
  async operate(event: IpcMainInvokeEvent, operation: unknown, input: unknown): Promise<unknown> {
    const args = fields(input ?? {}), child = surfaces.get(event.sender)
    if (child && !this.accepts(event)) throw new Error('Rejected browser surface sender')
    if (operation === 'reply') return this.reply(event, args)
    if (child) {
      this.checkIdentity(child, args); this.live(child)
      if (operation === 'init') {
        child.initialized = true
        if (child.loaded) child.resolveReady()
        return { sessionId: child.sessionId, tabId: child.tabId, key: child.key, initialUrl: child.initialUrl, initialNavigation: child.initialNavigation, locale: child.locale, theme: child.theme }
      }
      if (operation === 'requestOwner') return this.request(child, child.owner, args)
      if (operation === 'publish') {
        const value = fields(args.event)
        this.send(child.owner, child, { type: 'page', event: value })
        if (value.type === 'fault') { const error = failure(value.error ?? value.message); this.fault(child, error); throw error }
        return true
      }
      if (!['detach', 'dock', 'focus', 'close'].includes(String(operation))) throw new Error('Browser surface operation requires its DSH owner')
    } else {
      if (operation === 'create') return this.create(event.sender, args)
      if (operation === 'closeAll') {
        const sessionId = args.sessionId === undefined ? undefined : text(args.sessionId, 'sessionId')
        const results = await Promise.allSettled([...this.records.values()].filter(record => record.owner === event.sender
          && (sessionId === undefined || record.sessionId === sessionId)).map(record => this.close(record)))
        const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
        if (errors.length) throw new AggregateError(errors, 'Browser surfaces could not all be released')
        return true
      }
    }
    const record = child ?? this.records.get(keyOf(identity(args)))
    if (!record && operation === 'close' && !child) return true
    if (!record || (!child && record.owner !== event.sender)) throw new Error('Browser surface is not owned by this renderer')
    if (operation === 'close') { await this.close(record); return true }
    this.live(record)
    if (operation === 'requestPage') return this.request(record, record.view.webContents, args)
    if (operation === 'bounds') {
      const bounds = fields(args.bounds)
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(value => typeof value === 'number' && Number.isFinite(value))
        || Number(bounds.width) < 0 || Number(bounds.height) < 0 || typeof args.visible !== 'boolean') throw new Error('Invalid browser surface bounds')
      record.bounds = { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) }; record.visible = args.visible
      this.layout(record); return true
    }
    if (operation === 'detach' || operation === 'dock') {
      try { operation === 'detach' ? this.detach(record) : this.dock(record); return true }
      catch (error) { this.fault(record, error); throw error }
    }
    if (operation === 'focus') {
      const window = openCUBrowserWindow(record.view.webContents)
      if (!window || (!record.detached && (!record.visible || record.parent !== window))) throw new Error('Browser surface must be visible before focus')
      if (window.isMinimized()) window.restore()
      window.show(); window.focus(); record.view.webContents.focus(); return true
    }
    throw new Error('Unknown browser surface operation')
  }
}
