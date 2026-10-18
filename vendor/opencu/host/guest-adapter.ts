/** OpenCU operations on explicit reservations; ordinary DSH guests retain their own policy. */
import { app, session, type DownloadItem, type Session, type WebContents } from 'electron'
import { captureOpenCUDownload, openCUDownloadOperation } from './opencu-downloads.ts'
import { OpenCUPermissions } from './opencu-permissions.ts'
import { cancelOpenCUUpload, openCUAutomation, releaseOpenCUInput, resolveOpenCUNavigation } from './opencu-automation.ts'
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
    const current = this.owned(owner, lease, !preparing && !['downloads', 'profile'].includes(capability))
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
  attach(lease: OpenCUGuestLease, guest: WebContents): void {
    if (!lease.openCU) return
    this.owned(lease.owner, lease, true)
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
    if (lease.guest && !lease.guest.isDestroyed()) {
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
    return captureOpenCUDownload(current.openCU, item)
  }
  allowsExtension(value: Session, url: URL): boolean {
    return value === this.browserSession && url.protocol === 'chrome-extension:' && url.username === '' && url.password === ''
      && !!value.extensions.getExtension(url.hostname)
  }
}
