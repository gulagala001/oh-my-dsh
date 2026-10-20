import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';

const hostTargets = { '0.2.1-rc.2': { cordisVersion: '4.0.5', schemaVersion: '3.18.5' } };

if (!process.argv[2]) throw new Error('Usage: node desktop/apply-host.mjs /absolute/owned/dsh-source');
const root = await realpath(resolve(process.argv[2]));
if (root.includes('.app/') || root.endsWith('.app') || root.includes('/oh-my-dsh/.cache/dsh-source/')) throw new Error('Workbench requires an independent owned source copy');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const target = hostTargets[manifest.version];
if (!target || manifest.name !== '@deepseek-ai/dsh-root') throw new Error('Workbench requires the actual DSH 0.2.1-rc.2 source');
for (const [name, version] of [['cordis', target.cordisVersion], ['schemastery', target.schemaVersion]]) {
  if (JSON.parse(await readFile(join(root, 'vendor', name, 'package.json'), 'utf8')).version !== version) throw new Error(`Workbench framework mismatch: ${name}`);
}
const marker = '// deepseek-workbench-host:rc2-v3';
const p = 'apps/desktop/src/';
const pending = new Map();
async function patch(file, replacements) {
  let value = await readFile(join(root, file), 'utf8');
  for (const [before, after] of replacements) {
    if (value.split(before).length !== 2) throw new Error(`Workbench anchor mismatch: ${file}: ${before}`);
    value = value.replace(before, after);
  }
  pending.set(file, value);
}
const guests = await readFile(join(root, p + 'browser-guests.ts'), 'utf8');
if (guests.includes(marker) || guests.includes('// deepseek-workbench-host:rc2-a3-rc1-v2')) {
  const policy = await readFile(join(root, p + 'deepseek-browser-policy.ts'), 'utf8');
  if (policy !== await readFile(new URL('./deepseek-browser-policy.ts', import.meta.url), 'utf8')) throw new Error('Workbench policy differs; refresh through an owned build');
  console.log('Workbench host adapter already applied');
  process.exit(0);
}
const withOpenCU = guests.includes('// opencu-host-adapter:2');
if (withOpenCU && !guests.includes('try { await work } finally { this.releasing.delete(key); this.leases.delete(key) }')) throw new Error('Unrecognized browser guest release transaction');
await patch(p + 'browser-guests.ts', [
  ["import { randomUUID } from 'node:crypto'", "import { randomUUID } from 'node:crypto'\nimport { join } from 'node:path'\nimport { DEEPSEEK_PROFILE, DEEPSEEK_PARTITION, resolveDeepSeekProfile, allowsDeepSeekNavigation, allowsDeepSeekResource, allowsDeepSeekDownload, allowsDeepSeekFileDownloadRequest, safeDownloadFilename } from './deepseek-browser-policy.ts'\n" + marker],
  ['type Session, type WebContents', 'type Session, type WebContents, type DownloadItem'],
  ['  attached: boolean', '  readonly profile?: typeof DEEPSEEK_PROFILE\n  readonly downloads: Set<DownloadItem>\n  readonly requestedDownloads: Map<string, { source: string; expires: number }>\n  attached: boolean'],
  ['  private readonly leases =', '  private persistentSession: Session | undefined\n  private readonly leases ='],
  ...(withOpenCU ? [['this.leases.set(lease, reservation)', 'this.leases.set(lease, { ...reservation, downloads: new Set(), requestedDownloads: new Map() })']] : []),
  ['acquire(owner: WebContents, workspace: unknown): DesktopBrowserReservation', 'acquire(owner: WebContents, workspace: unknown, options?: unknown): DesktopBrowserReservation'],
  ['    let partition = this.partitions.get(workspace)', `    const profile = resolveDeepSeekProfile(options)
    let partition = profile === DEEPSEEK_PROFILE ? DEEPSEEK_PARTITION : this.partitions.get(workspace)
    if (profile === DEEPSEEK_PROFILE && this.persistentSession === undefined) {
      const persistentSession = session.fromPartition(DEEPSEEK_PARTITION)
      this.configureSession(persistentSession, false, profile)
      this.persistentSession = persistentSession
    }`],
  ['this.leases.set(lease, { owner, partition, attached: false })', 'this.leases.set(lease, { owner, partition, attached: false, downloads: new Set(), requestedDownloads: new Map(), ...(profile === undefined ? {} : { profile }) })'],
  ...(withOpenCU ? [
    ['\n      const errors: unknown[] = []', `\n      const errors: unknown[] = []
      lease.requestedDownloads.clear()
      for (const item of lease.downloads) {
        try { item.cancel() } catch (error) { errors.push(error) }
      }
      lease.downloads.clear()`],
    ['        devTools: !!lease.openCU || !app.isPackaged,', '        devTools: !!lease.openCU || !app.isPackaged,\n        backgroundThrottling: lease.profile !== DEEPSEEK_PROFILE,'],
    ['\n          const errors: unknown[] = []', `\n          const errors: unknown[] = []
          lease.requestedDownloads.clear()
          for (const item of lease.downloads) {
            try { item.cancel() } catch (error) { errors.push(error) }
          }
          lease.downloads.clear()`],
  ] : [
    ['    lease.releaseInput?.()\n', '    this.cancelDownloads(lease)\n    lease.releaseInput?.()\n'],
    ['        devTools: !app.isPackaged,', '        devTools: !app.isPackaged,\n        backgroundThrottling: lease.profile !== DEEPSEEK_PROFILE,'],
    ["guest.once('destroyed', () => { lease.releaseInput?.(); this.leases.delete(id) })", "guest.once('destroyed', () => { this.cancelDownloads(lease); lease.releaseInput?.(); this.leases.delete(id) })"],
    ['&& postBody === undefined && this.allowedNavigation(url)', '&& postBody === undefined && this.allowedGuestNavigation(guest, url)'],
    ['if (mainFrame && !this.allowedNavigation(url))', 'if (mainFrame && !this.allowedGuestNavigation(guest, url))'],
    ['this.allowedNavigation(event.url)', 'this.allowedGuestNavigation(guest, event.url)'],
  ]),
  ['        if (attachedLease !== undefined && lease?.guest === guest', `        if (lease?.profile === DEEPSEEK_PROFILE && lease.guest === guest && lease.owner === owner
          && !owner.isDestroyed() && postBody === undefined && this.requestFileDownload(lease, url)) return { action: 'deny' }
        if (attachedLease !== undefined && lease?.guest === guest`],
  ['{ lease: attachedLease, url: new URL(url).href }', '{ lease: attachedLease, url: new URL(url).href, ...(lease.profile === undefined ? {} : { profile: lease.profile }) }'],
  ["      guest.on('will-frame-navigate', (event) => {", `      guest.on('will-frame-navigate', (event) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease)
        if (event.isMainFrame && lease?.profile === DEEPSEEK_PROFILE && lease.guest === guest
          && this.requestFileDownload(lease, event.url)) { event.preventDefault(); return }`],
  [withOpenCU ? 'private configureSession(browserSession: Session, openCU = false): void' : 'private configureSession(browserSession: Session): void', withOpenCU ? 'private configureSession(browserSession: Session, openCU = false, profile?: typeof DEEPSEEK_PROFILE): void' : 'private configureSession(browserSession: Session, _openCU = false, profile?: typeof DEEPSEEK_PROFILE): void'],
  [withOpenCU ? '      event.preventDefault()\n    })\n    browserSession.webRequest' : "    browserSession.on('will-download', (event) => { event.preventDefault() })\n    browserSession.webRequest", `${withOpenCU ? '' : "    browserSession.on('will-download', (event, item, contents) => {\n"}      const deepSeekLease = [...this.leases.values()].find(candidate => candidate.guest === contents
        && candidate.attached && candidate.profile === DEEPSEEK_PROFILE && !candidate.owner.isDestroyed())
      const firstUrl = item.getURLChain()[0]
      const request = firstUrl === undefined ? undefined : deepSeekLease?.requestedDownloads.get(firstUrl)
      if (firstUrl !== undefined) deepSeekLease?.requestedDownloads.delete(firstUrl)
      const initiator = item.getInitiatorOrigin()
      const approvedSource = initiator === '' && request !== undefined && request.expires >= Date.now() ? request.source : initiator
      if (profile !== DEEPSEEK_PROFILE || deepSeekLease === undefined || contents.isDestroyed()
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
      deepSeekLease.downloads.add(item)
      item.once('done', () => { deepSeekLease.downloads.delete(item) })
    })
    browserSession.webRequest`],
  ["? url.username !== '' || url.password !== '' || this.isApplicationHost(url)", "? url.username !== '' || url.password !== '' || this.isApplicationHost(url)\n          || (profile === DEEPSEEK_PROFILE && !allowsDeepSeekResource(details.url))"],
  [withOpenCU ? '  private allowedGuestNavigation(guest: WebContents, value: string): boolean {' : '  private allowedNavigation(value: string): boolean {', `  private requestFileDownload(lease: GuestLease, value: string): boolean {
    const guest = lease.guest
    if (guest === undefined || guest.isDestroyed() || lease.owner.isDestroyed()
      || !allowsDeepSeekNavigation(guest.getURL()) || !allowsDeepSeekFileDownloadRequest(value)) return false
    const url = new URL(value).href
    for (const [key, request] of lease.requestedDownloads) {
      if (request.expires < Date.now()) lease.requestedDownloads.delete(key)
    }
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

  private allowedGuestNavigation(guest: WebContents, value: string): boolean {
    if (guest.session === this.persistentSession) return allowsDeepSeekNavigation(value)
      && URL.canParse(value) && !this.isApplicationHost(new URL(value))${withOpenCU ? '' : `
    return this.allowedNavigation(value)
  }

  private cancelDownloads(lease: GuestLease): void {
    lease.requestedDownloads.clear()
    for (const item of lease.downloads) {
      try { item.cancel() } catch (error) { console.error('Browser guest download cancellation failed', error) }
    }
    lease.downloads.clear()
  }

  private allowedNavigation(value: string): boolean {`}`],
]);
await patch(p + 'preload-browser.ts', [
  [withOpenCU ? 'DesktopBrowserLeaseId, DesktopBrowserReservation' : 'DesktopBrowserBridge, DesktopBrowserLeaseId }', withOpenCU ? 'DesktopBrowserLeaseId, DesktopBrowserReservation, DesktopBrowserOpenRequest' : 'DesktopBrowserBridge, DesktopBrowserLeaseId, DesktopBrowserOpenRequest }'],
  ['Set<(url: string) => void>', 'Set<(url: string, request: DesktopBrowserOpenRequest) => void>'],
  ['    const callbacks = listeners.get(request.lease as DesktopBrowserLeaseId)', `    if ('profile' in request && request.profile !== 'deepseek-workbench') return
    const approved: DesktopBrowserOpenRequest = { lease: request.lease as DesktopBrowserLeaseId, url: request.url,
      ...('profile' in request ? { profile: 'deepseek-workbench' as const } : {}) }
    const callbacks = listeners.get(approved.lease)`],
  ['callback(request.url)', 'callback(approved.url, approved)'],
  ['    acquire: workspace => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace)', "    capabilities: () => ipcRenderer.invoke(DESKTOP_IPC.browserCapabilities) as ReturnType<NonNullable<DesktopBrowserBridge['capabilities']>>,\n    acquire: (workspace, options) => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace, options)"],
]);
await patch(p + 'ipc.ts', [["  browserAcquire: 'dsh-desktop:browser-acquire',", "  browserCapabilities: 'dsh-desktop:browser-capabilities',\n  browserAcquire: 'dsh-desktop:browser-acquire',"]]);
await patch(p + 'main.ts', [
  ['  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown) => {', `  ipcMain.handle(DESKTOP_IPC.browserCapabilities, (event) => {
    assertProductSender(event)
    return { persistentProfiles: true, downloads: true }
  })
  ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace: unknown, options?: unknown) => {`],
  ['return browserGuests.acquire(event.sender, workspace)', 'return browserGuests.acquire(event.sender, workspace, options)'],
  ["if (page !== 'usage' && page !== 'top-up')", "if (page !== 'usage' && page !== 'top-up' && page !== 'api-keys')"],
]);
await patch('packages/client/ui-sidebar-browser/src/types.ts', [
  ["A guest's approved, process-local storage partition.", "A guest's approved storage partition; persistence requires an explicit product profile."],
  ['export interface DesktopBrowserOpenRequest {\n', "export interface DesktopBrowserOpenRequest {\n  readonly profile?: 'deepseek-workbench'\n"],
  ['export interface DesktopBrowserBridge {\n', 'export interface DesktopBrowserBridge {\n  /** @returns opt-in profile/download support; absence means an older shell. */\n  capabilities?(): Promise<{ readonly persistentProfiles: boolean; readonly downloads: boolean }>\n'],
  ['acquire(workspace: string)', "acquire(workspace: string, options?: { readonly profile: 'deepseek-workbench' })"],
  ['listener: (url: string) => void', 'listener: (url: string, request: DesktopBrowserOpenRequest) => void'],
]);
await patch(p + 'preload-app.ts', [["open: (page: 'usage' | 'top-up',", "pages: ['usage', 'top-up', 'api-keys'],\n    open: (page: 'usage' | 'top-up' | 'api-keys',"]]);
await patch(p + 'platform-view.ts', [
  ["page: 'usage' | 'top-up',", "page: 'usage' | 'top-up' | 'api-keys',"],
  ["page === 'usage' ? '/usage' : '/top_up'", "page === 'usage' ? '/usage' : page === 'api-keys' ? '/api_keys' : '/top_up'"],
]);
await patch('tsconfig.client.json', [['    \"apps/desktop/src/browser-guests.ts\",', '    \"apps/desktop/src/browser-guests.ts\",\n    \"apps/desktop/src/deepseek-browser-policy.ts\",']]);
pending.set(p + 'deepseek-browser-policy.ts', await readFile(new URL('./deepseek-browser-policy.ts', import.meta.url), 'utf8'));
for (const file of pending.keys()) {
  const target = join(root, file);
  const actual = await realpath(target).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (actual !== undefined ? actual !== target : await realpath(dirname(target)) !== dirname(target)) throw new Error(`Refusing non-owned adapter target: ${file}`);
}
for (const [file, text] of pending) await writeFile(join(root, file), text);
console.log(JSON.stringify({ root, host: manifest.version, files: [...pending.keys()], revision: 'rc2-v3', strategy: withOpenCU ? 'Product profile added; existing release transaction retained' : 'Native rc.2 product profile; ordinary guest policy retained' }, null, 2));
