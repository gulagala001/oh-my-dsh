/** OpenCU operations on explicit reservations; ordinary DSH guests retain their own policy. */
import { app, session, type DownloadItem, type Session, type WebContents } from 'electron'
import { captureOpenCUDownload, openCUDownloadOperation } from './opencu-downloads.ts'
import { OpenCUPermissions } from './opencu-permissions.ts'
import { cancelOpenCUUpload, openCUAutomation, releaseOpenCUInput, resolveOpenCUNavigation, settleDestroyedOpenCUInput } from './opencu-automation.ts'
import { cancelSiteTool } from './opencu-site-tools.ts'
import { prepareOpenCUExtensions, attachOpenCUExtensionGuest, operateOpenCUExtensions } from './opencu-extensions.ts'
import { operateOpenCUProfile } from './opencu-profile.ts'
import { openCUDialogs } from './opencu-dialogs.ts'

const partition = 'persist:opencu-browser-v1'
export interface OpenCUGuestState {
  readonly owner: WebContents
  downloads: Set<DownloadItem>
  downloadDirectory?: string
  exportDirectory?: string | undefined
  promptForDownload?: boolean
  initialNavigation?: ReturnType<typeof resolveOpenCUNavigation>
  navigationReady?: Promise<void>
  releasePreparedAttach?: () => void
  leaseId?: string
  nativeGuestId?: number
}
export interface OpenCUGuestLease {
  readonly owner: WebContents
  readonly partition: string
  attached: boolean
  guest?: WebContents
  openCU?: OpenCUGuestState
}
export class OpenCUGuests {
  private browserSession: Session | undefined
  private readonly permissions = new OpenCUPermissions()
  private readonly preparedGuests = new WeakMap<WebContents, string>()
  private readonly preparingOwners = new Set<WebContents>()
  private readonly closedGuests = new WeakMap<WebContents, Map<string, { guestId: number; guest?: WebContents; work?: Promise<object>; receipt?: object }>>()
  private recordClosed(owner: WebContents, id: string, guest: WebContents, guestId: number): void {
    if (!guest.isDestroyed()) throw new Error('The original guest is not confirmed destroyed')
    const entries = this.closedGuests.get(owner) ?? new Map()
    this.closedGuests.set(owner, entries)
    if (!entries.has(id)) entries.set(id, { guestId, guest })
  }
  private settleClosed(owner: WebContents, id: string): Promise<object> {
    const entries = this.closedGuests.get(owner)!, entry = entries.get(id)!
    if (entry.receipt) return Promise.resolve(entry.receipt)
    return entry.work ??= settleDestroyedOpenCUInput(entry.guest!).then(result => {
      entry.receipt = { ...result, closed: true, leaseId: id, webContentsId: entry.guestId }
      delete entry.guest
      // Bound completed duplicate receipts; failed cleanup remains owned.
      const completed = [...entries].filter(([, value]) => value.receipt)
      for (const [key] of completed.slice(0, Math.max(0, completed.length - 128))) entries.delete(key)
      return entry.receipt
    }).finally(() => { delete entry.work })
  }
  closedRelease(owner: WebContents, id: unknown, capability: string, operation: unknown, args: unknown): Promise<object> | undefined {
    if (capability !== 'automation' || !['closedState', 'releaseInput'].includes(String(operation)) || typeof id !== 'string' || owner.isDestroyed()) return
    if (!this.closedGuests.get(owner)?.has(id)) return
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid guest automation arguments')
    return this.settleClosed(owner, id)
  }
  reserve(owner: WebContents, configure: (value: Session) => void): OpenCUGuestLease {
    if (owner.isDestroyed()) throw new Error('The OpenCU browser owner is unavailable')
    if (!this.browserSession) {
      const value = session.fromPartition(partition)
      configure(value)
      prepareOpenCUExtensions(value)
      this.browserSession = value
    }
    return { owner, partition, attached: false, openCU: { owner, downloads: new Set() } }
  }
  private owned(owner: WebContents, lease: OpenCUGuestLease | undefined, attached: boolean): OpenCUGuestLease & { openCU: OpenCUGuestState } {
    if (!lease || lease.owner !== owner || owner.isDestroyed() || lease.partition !== partition || !lease.openCU
      || !this.browserSession || attached && (!lease.attached || !lease.guest || lease.guest.isDestroyed() || lease.guest.session !== this.browserSession)) {
      throw new Error('Invalid OpenCU browser lease or owner')
    }
    return { ...lease, openCU: lease.openCU }
  }
  operate(owner: WebContents, lease: OpenCUGuestLease | undefined, capability: string, operation: unknown, args: unknown, allowedNavigation: (url: string) => boolean): Promise<unknown> {
    const preparing = capability === 'automation' && operation === 'prepareNavigation'
    const checkingClosed = capability === 'automation' && operation === 'closedState'
    const current = this.owned(owner, lease, !checkingClosed && !preparing && !['downloads', 'profile'].includes(capability))
    if (checkingClosed) {
      if (!args || typeof args !== 'object' || Array.isArray(args) || ('waitForClose' in args && typeof args.waitForClose !== 'boolean')) throw new Error('Invalid closed-state arguments')
      const guest = current.guest, id = current.openCU.leaseId, guestId = current.openCU.nativeGuestId
      if (!current.attached || !guest || !id || guestId === undefined) throw new Error('The original guest attachment is unavailable')
      const closed = (): Promise<object> => { this.recordClosed(owner, id, guest, guestId); return this.settleClosed(owner, id) }
      if (guest.isDestroyed()) return closed()
      if (guest.session !== this.browserSession) throw new Error('Invalid OpenCU browser lease or owner')
      if (!('waitForClose' in args) || !args.waitForClose) return Promise.resolve({ closed: false })
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error): void => {
          if (settled) return
          settled = true
          clearTimeout(timer); guest.off('destroyed', destroyed); owner.off('destroyed', ownerDestroyed)
          error ? reject(error) : resolve()
        }
        const destroyed = (): void => finish()
        const ownerDestroyed = (): void => finish(Object.assign(new Error('The original guest owner was destroyed before closure confirmation'), { code: 'RELEASE_FAILED' }))
        const timer = setTimeout(() => finish(Object.assign(new Error('The original guest destruction is not confirmed'), { code: 'RELEASE_FAILED' })), 5000)
        guest.once('destroyed', destroyed); owner.once('destroyed', ownerDestroyed)
        if (owner.isDestroyed()) ownerDestroyed()
        else if (guest.isDestroyed()) destroyed()
      }).then(closed)
    }
    if (preparing) {
      if (current.attached || current.openCU.initialNavigation) throw new Error('Navigation must be prepared before attaching a new guest')
      current.openCU.initialNavigation = resolveOpenCUNavigation(args, url => allowedNavigation(url) || URL.canParse(url) && this.allowsExtension(this.browserSession!, new URL(url)))
      return Promise.resolve({ prepared: true })
    }
    if (capability === 'automation' && operation === 'finishNavigation') {
      if (!current.openCU.navigationReady) throw new Error('The guest has no prepared navigation')
      return current.openCU.navigationReady.then(() => ({ restored: true }))
    }
    if (capability === 'downloads') return openCUDownloadOperation(current.openCU, operation, args)
    if (capability === 'profile') return operateOpenCUProfile(this.browserSession!, operation, args)
    const guest = current.guest!
    if (capability === 'permissions') return this.permissions.operate(owner, guest, operation, args)
    if (capability === 'automation') return openCUAutomation(guest, operation, args, allowedNavigation)
    if (capability === 'extensions') return operateOpenCUExtensions(owner, guest, operation, args)
    throw new Error('Unknown OpenCU browser capability')
  }
  configure(value: Session): void {
    value.setPermissionRequestHandler(this.permissions.request)
    value.setPermissionCheckHandler(this.permissions.check)
  }
  /** Leave a prepared guest unloaded until its verified main-process attachment. */
  prepareAttach(lease: OpenCUGuestLease, id: string, params: Record<string, string>): void {
    if (!lease.openCU?.initialNavigation) return
    const current = this.owned(lease.owner, lease, false)
    if (this.preparingOwners.has(lease.owner)) throw new Error('Another history guest is being created for this owner')
    this.preparingOwners.add(lease.owner)
    const release = (): void => {
      app.off('web-contents-created', created)
      lease.owner.off('destroyed', release)
      this.preparingOwners.delete(lease.owner)
      delete current.openCU.releasePreparedAttach
    }
    const created = (_event: Electron.Event, guest: WebContents): void => {
      if (guest.getType() !== 'webview' || guest.hostWebContents !== lease.owner || guest.session !== this.browserSession) return
      release()
      this.preparedGuests.set(guest, id)
    }
    current.openCU.releasePreparedAttach = release
    lease.owner.once('destroyed', release)
    app.on('web-contents-created', created)
    params.src = ''
  }
  /** Match only a native guest created for the prepared reservation's owner and session. */
  preparedLease(guest: WebContents): string | undefined {
    const id = this.preparedGuests.get(guest)
    this.preparedGuests.delete(guest)
    return id
  }
  attach(lease: OpenCUGuestLease, guest: WebContents, id?: string): void {
    if (!lease.openCU) return
    this.owned(lease.owner, lease, true)
    if (id) {
      const owner = lease.owner
      lease.openCU.leaseId = id
      const guestId = lease.openCU.nativeGuestId = guest.id
      guest.once('destroyed', () => {
        this.recordClosed(owner, id, guest, guestId)
        void this.settleClosed(owner, id).catch(error => console.error('Destroyed OpenCU guest input remains pending', error))
      })
    }
    openCUDialogs(guest)
    guest.setBackgroundThrottling(false)
    attachOpenCUExtensionGuest(lease.owner, guest)
    if (lease.openCU.initialNavigation) {
      lease.openCU.navigationReady = guest.navigationHistory.restore(lease.openCU.initialNavigation)
      void lease.openCU.navigationReady.catch(() => undefined) // finishNavigation reports a failed load to the owning renderer.
    }
  }
  async release(lease: OpenCUGuestLease): Promise<void> {
    if (!lease.openCU) return
    const errors: unknown[] = []
    lease.openCU.releasePreparedAttach?.()
    if (lease.guest?.isDestroyed()) {
      try { await settleDestroyedOpenCUInput(lease.guest) } catch (error) { errors.push(error) }
    } else if (lease.guest) {
      cancelOpenCUUpload(lease.guest)
      // Site tools share the automation queue; cancel them before draining input.
      try { await cancelSiteTool(lease.guest) } catch (error) { errors.push(error) }
      try { await releaseOpenCUInput(lease.guest) } catch (error) { errors.push(error) }
    }
    for (const item of lease.openCU.downloads) { try { item.cancel() } catch (error) { errors.push(error) } }
    if (lease.guest) this.permissions.release(lease.owner, lease.guest)
    if (errors.length) throw new AggregateError(errors, 'OpenCU guest release failed')
  }
  download(lease: OpenCUGuestLease | undefined, item: DownloadItem): boolean {
    if (!lease?.openCU || !lease.guest) return false
    const current = this.owned(lease.owner, lease, true)
    return captureOpenCUDownload(current.openCU, item, current.guest!.id)
  }
  allowsExtension(value: Session, url: URL): boolean {
    return value === this.browserSession && url.protocol === 'chrome-extension:' && url.username === '' && url.password === ''
      && !!value.extensions.getExtension(url.hostname)
  }
}
