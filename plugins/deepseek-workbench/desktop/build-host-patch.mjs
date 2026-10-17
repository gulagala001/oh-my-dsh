/** Generate a reviewable source patch without changing the supplied host checkout. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { HOST_PATHS, PATCH_SHA256, PATCHED_HASHES, sha256, assertSourceBaseline } from './source-baseline.mjs'

const directory = fileURLToPath(new URL('.', import.meta.url))
const source = process.argv[2]
if (!source) throw new Error('Usage: node desktop/build-host-patch.mjs /path/to/dsh-source')
const identity = await assertSourceBaseline(source)
const fixture = await mkdtemp(join(tmpdir(), 'deepseek-desktop-patch-'))
const paths = HOST_PATHS
const clientConfigPath = 'tsconfig.client.json'
try {
const originals = new Map()
for (const path of paths) originals.set(path, await readFile(join(source, path), 'utf8'))
const changed = new Map(originals)
function replace(path, before, after) {
  const text = changed.get(path)
  if (text.split(before).length !== 2) throw new Error(`Host source does not uniquely match ${path}: ${before.slice(0, 100)}`)
  changed.set(path, text.replace(before, after))
}
const guests = paths[0]
replace(guests, "import { randomUUID } from 'node:crypto'", "import { randomUUID } from 'node:crypto'\nimport { join } from 'node:path'\nimport { DEEPSEEK_PROFILE, DEEPSEEK_PARTITION, resolveDeepSeekProfile, allowsDeepSeekNavigation, allowsDeepSeekResource, allowsDeepSeekDownload, allowsDeepSeekFileDownloadRequest, safeDownloadFilename } from './deepseek-browser-policy.ts'")
replace(guests, 'type BrowserWindow, type Session, type WebContents', 'type BrowserWindow, type Session, type WebContents, type DownloadItem')
replace(guests, '  attached: boolean', "  readonly profile?: typeof DEEPSEEK_PROFILE\n  readonly downloads: Set<DownloadItem>\n  readonly requestedDownloads: Map<string, { source: string; expires: number }>\n  attached: boolean")
replace(guests, '  private readonly leases =', '  private persistentSession: Session | undefined\n  private readonly leases =')
replace(guests, "acquire(owner: WebContents, workspace: unknown): DesktopBrowserReservation", "acquire(owner: WebContents, workspace: unknown, options?: unknown): DesktopBrowserReservation")
replace(guests, '    let partition = this.partitions.get(workspace)', `    const profile = resolveDeepSeekProfile(options)
    let partition = profile === DEEPSEEK_PROFILE ? DEEPSEEK_PARTITION : this.partitions.get(workspace)
    if (profile === DEEPSEEK_PROFILE && this.persistentSession === undefined) {
      const persistentSession = session.fromPartition(DEEPSEEK_PARTITION)
      this.configureSession(persistentSession, profile)
      this.persistentSession = persistentSession
    }`)
replace(guests, 'this.leases.set(lease, { owner, partition, attached: false })', 'this.leases.set(lease, { owner, partition, attached: false, downloads: new Set(), requestedDownloads: new Map(), ...(profile === undefined ? {} : { profile }) })')
replace(guests, '        devTools: !app.isPackaged,', '        devTools: !app.isPackaged,\n        backgroundThrottling: lease.profile !== DEEPSEEK_PROFILE,')
replace(guests, '    lease.releaseInput?.()\n    this.leases.delete(key)', '    this.leases.delete(key)\n    lease.requestedDownloads.clear()\n    for (const item of lease.downloads) item.cancel()\n    lease.downloads.clear()\n    lease.releaseInput?.()')
replace(guests, '      let attachedLease: DesktopBrowserLeaseId | undefined', `      const profile = guest.session === this.persistentSession ? DEEPSEEK_PROFILE : undefined
      let attachedLease: DesktopBrowserLeaseId | undefined`)
replace(guests, "guest.once('destroyed', () => { lease.releaseInput?.(); this.leases.delete(id) })", "guest.once('destroyed', () => {\n          this.leases.delete(id)\n          lease.requestedDownloads.clear()\n          for (const item of lease.downloads) item.cancel()\n          lease.downloads.clear()\n          lease.releaseInput?.()\n        })")
replace(guests, 'postBody === undefined && this.allowedNavigation(url)', 'postBody === undefined && this.allowedNavigation(url, profile)')
replace(guests, "        if (attachedLease !== undefined && lease?.guest === guest", "        if (profile === DEEPSEEK_PROFILE && lease?.guest === guest && lease.owner === owner\n          && !owner.isDestroyed() && postBody === undefined && this.requestFileDownload(lease, url)) return { action: 'deny' }\n        if (attachedLease !== undefined && lease?.guest === guest")
replace(guests, "{ lease: attachedLease, url: new URL(url).href }", "{ lease: attachedLease, url: new URL(url).href, ...(profile === undefined ? {} : { profile }) }")
replace(guests, '!this.allowedNavigation(event.url)', '!this.allowedNavigation(event.url, profile)')
replace(guests, "      guest.on('will-frame-navigate', (event) => {", "      guest.on('will-frame-navigate', (event) => {\n        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease)\n        if (event.isMainFrame && profile === DEEPSEEK_PROFILE && lease?.guest === guest\n          && this.requestFileDownload(lease, event.url)) { event.preventDefault(); return }")
replace(guests, '!this.allowedNavigation(url)) event.preventDefault()', '!this.allowedNavigation(url, profile)) event.preventDefault()')
replace(guests, 'private configureSession(browserSession: Session): void', 'private configureSession(browserSession: Session, profile?: typeof DEEPSEEK_PROFILE): void')
replace(guests, "    browserSession.on('will-download', (event) => { event.preventDefault() })", `    browserSession.on('will-download', (event, item, contents) => {
      const lease = [...this.leases.values()].find(candidate => candidate.guest === contents
        && candidate.attached && candidate.profile === DEEPSEEK_PROFILE && !candidate.owner.isDestroyed())
      const firstUrl = item.getURLChain()[0]
      const request = firstUrl === undefined ? undefined : lease?.requestedDownloads.get(firstUrl)
      if (firstUrl !== undefined) lease?.requestedDownloads.delete(firstUrl)
      const initiator = item.getInitiatorOrigin()
      const approvedSource = initiator === '' && request !== undefined && request.expires >= Date.now() ? request.source : initiator
      if (profile !== DEEPSEEK_PROFILE || lease === undefined || contents.isDestroyed()
        || !allowsDeepSeekDownload(contents.getURL(), item.getURLChain(), approvedSource)
        || item.getURLChain().some(value => URL.canParse(value) && this.isApplicationHost(new URL(value)))) {
        event.preventDefault()
        return
      }
      try {
        item.setSaveDialogOptions({
          defaultPath: join(app.getPath('downloads'), safeDownloadFilename(item.getFilename())),
          properties: ['createDirectory', 'showOverwriteConfirmation'],
        })
      } catch (error) {
        event.preventDefault()
        console.error('Desktop browser download dialog failed', error)
        return
      }
      // Omitting setSavePath preserves Electron's native save/cancel dialog.
      lease.downloads.add(item)
      item.once('done', () => { lease.downloads.delete(item) })
    })`)
replace(guests, "? url.username !== '' || url.password !== '' || this.isApplicationHost(url)", "? url.username !== '' || url.password !== '' || this.isApplicationHost(url)\n          || (profile === DEEPSEEK_PROFILE && !allowsDeepSeekResource(details.url))")
replace(guests, 'private allowedNavigation(value: string): boolean', 'private allowedNavigation(value: string, profile?: typeof DEEPSEEK_PROFILE): boolean')
replace(guests, '  private allowedNavigation(', `  private requestFileDownload(lease: GuestLease, value: string): boolean {
    const guest = lease.guest
    if (guest === undefined || guest.isDestroyed() || lease.owner.isDestroyed()
      || !allowsDeepSeekNavigation(guest.getURL()) || !allowsDeepSeekFileDownloadRequest(value)) return false
    const url = new URL(value).href
    for (const [key, request] of lease.requestedDownloads) {
      if (request.expires < Date.now()) lease.requestedDownloads.delete(key)
    }
    // Bound unfulfilled requests, and bind main-issued downloads to this live lease and exact URL.
    if (lease.requestedDownloads.size >= 32) return true
    lease.requestedDownloads.set(url, { source: guest.getURL(), expires: Date.now() + 30_000 })
    queueMicrotask(() => {
      if (!lease.requestedDownloads.has(url) || guest.isDestroyed() || lease.owner.isDestroyed()) return
      try { guest.downloadURL(url) }
      catch (error) {
        lease.requestedDownloads.delete(url)
        console.error('Desktop browser attachment download failed', error instanceof Error ? error.name : 'Error')
      }
    })
    return true
  }

  private allowedNavigation(`)
replace(guests, "    const url = new URL(value)\n    return ['http:'", "    const url = new URL(value)\n    if (profile === DEEPSEEK_PROFILE) return allowsDeepSeekNavigation(value) && !this.isApplicationHost(url)\n    return ['http:'")
replace(guests, '   * @returns opaque lease', '   * @param options - opt-in persistent product profile, validated at IPC entry.\n   * @returns opaque lease')
const preload = paths[1]
replace(preload, 'DesktopBrowserBridge, DesktopBrowserLeaseId', 'DesktopBrowserBridge, DesktopBrowserLeaseId, DesktopBrowserOpenRequest')
replace(preload, 'Set<(url: string) => void>', "Set<(url: string, request: DesktopBrowserOpenRequest) => void>")
replace(preload, "    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)", "    if ('profile' in request && request.profile !== 'deepseek-workbench') return\n    const approved: DesktopBrowserOpenRequest = { lease: request.lease as DesktopBrowserLeaseId, url: request.url,\n      ...('profile' in request ? { profile: 'deepseek-workbench' as const } : {}) }\n    const callbacks = listeners.get(approved.lease)")
replace(preload, 'callback(request.url)', 'callback(approved.url, approved)')
replace(preload, "    acquire: workspace => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace)", "    capabilities: () => ipcRenderer.invoke(DESKTOP_IPC.browserCapabilities) as ReturnType<NonNullable<DesktopBrowserBridge['capabilities']>>,\n    acquire: (workspace, options) => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace, options)")
replace(paths[2], "  browserAcquire: 'dsh-desktop:browser-acquire',", "  browserCapabilities: 'dsh-desktop:browser-capabilities',\n  browserAcquire: 'dsh-desktop:browser-acquire',")
replace(paths[3], "  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown) => {", "  ipcMain.handle(DESKTOP_IPC.browserCapabilities, (event) => {\n    assertProductSender(event)\n    return { persistentProfiles: true, downloads: true }\n  })\n  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown, options?: unknown) => {")
replace(paths[3], 'return browserGuests.acquire(event.sender, workspace)', 'return browserGuests.acquire(event.sender, workspace, options)')
replace(paths[3], "if (page !== 'usage' && page !== 'top-up')", "if (page !== 'usage' && page !== 'top-up' && page !== 'api-keys')")
replace(paths[5], "open: (page: 'usage' | 'top-up',", "pages: ['usage', 'top-up', 'api-keys'],\n    open: (page: 'usage' | 'top-up' | 'api-keys',")
replace(paths[6], "page: 'usage' | 'top-up',", "page: 'usage' | 'top-up' | 'api-keys',")
replace(paths[6], "page === 'usage' ? '/usage' : '/top_up'", "page === 'usage' ? '/usage' : page === 'api-keys' ? '/api_keys' : '/top_up'")
const types = paths[4]
replace(types, "A guest's approved, process-local storage partition.", "A guest's approved storage partition; persistence requires an explicit product profile.")
replace(types, 'export interface DesktopBrowserOpenRequest {\n', "export interface DesktopBrowserOpenRequest {\n  readonly profile?: 'deepseek-workbench'\n")
replace(types, 'export interface DesktopBrowserBridge {\n', `export interface DesktopBrowserBridge {
  /** @returns opt-in profile/download support; absence means an older shell. */
  capabilities?(): Promise<{ readonly persistentProfiles: boolean; readonly downloads: boolean }>
`)
replace(types, 'acquire(workspace: string)', "acquire(workspace: string, options?: { readonly profile: 'deepseek-workbench' })")
replace(types, 'listener: (url: string) => void', 'listener: (url: string, request: DesktopBrowserOpenRequest) => void')
replace(types, '/** @param workspace - resolved storage account. @returns', '/** @param workspace - resolved storage account. @param options - explicit persistent profile. @returns')
const policy = await readFile(join(directory, 'deepseek-browser-policy.ts'), 'utf8')
changed.set('apps/desktop/src/deepseek-browser-policy.ts', policy)
// The reviewed root-config diff follows the new policy file; HOST_PATHS remains TypeScript-only.
const clientConfig = await readFile(join(source, clientConfigPath), 'utf8')
originals.set(clientConfigPath, clientConfig)
changed.set(clientConfigPath, clientConfig)
replace(clientConfigPath, '    "apps/desktop/src/browser-guests.ts",\n    "apps/desktop/src/ipc.ts",',
  '    "apps/desktop/src/browser-guests.ts",\n    "apps/desktop/src/deepseek-browser-policy.ts",\n    "apps/desktop/src/ipc.ts",')
const javascriptPolicy = stripTypeScriptTypes(policy, { mode: 'strip' })
let patch = ''
for (const [path, content] of changed) {
  for (const name of ['before', 'after']) await mkdir(join(fixture, name, path, '..'), { recursive: true })
  const before = join(fixture, 'before', path), after = join(fixture, 'after', path)
  await writeFile(before, originals.get(path) ?? '')
  await writeFile(after, content)
  const result = spawnSync('diff', ['-u', '--label', originals.has(path) ? `a/${path}` : '/dev/null', '--label', `b/${path}`, before, after], { encoding: 'utf8' })
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr)
  patch += result.stdout
}
for (const [path, expected] of Object.entries(PATCHED_HASHES)) {
  if (sha256(changed.get(path)) !== expected) throw new Error(`Generator differs from reviewed alpha.2 patch: ${path}`)
}
if (sha256(patch) !== PATCH_SHA256) throw new Error('Generator diff differs from the reviewed alpha.2 patch')
await writeFile(join(directory, 'deepseek-browser-policy.mjs'), javascriptPolicy)
await writeFile(join(directory, 'deepseek-workbench-host.patch'), patch)
console.log(JSON.stringify({ patch: join(directory, 'deepseek-workbench-host.patch'), files: changed.size, identity }))
} finally {
  // fixture was allocated by mkdtemp above, never supplied by the caller.
  await rm(fixture, { recursive: true, force: true })
}
