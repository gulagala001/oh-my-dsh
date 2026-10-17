/** Adapts the pinned Chromium extension runtime to authenticated DSH guest leases. */
import { BrowserWindow, dialog, Menu, nativeImage, type Extension, type Session, type WebContents, type MenuItem } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

interface Action { id: string; title?: string; popup?: string; enabled?: boolean; text?: string; color?: string | number[]; tabs?: Record<number, Partial<Action>> }
interface ActionAPI {
  getState(): { actions: Action[] }
  activate(event: { type: 'frame'; sender: WebContents }, details: object): void
}
interface Profile {
  runtime: ElectronChromeExtensions; actions: ActionAPI; session: Session; ready: Promise<void>
  restoring: boolean; restoreError: string | null; loadErrors: Map<string, string>
  directory: string; paths: string[]; pinned: string[]; recent: string[]; writes: Promise<void>
  guests: Map<WebContents, WebContents>; syncingTabs: Set<WebContents>; popup: { id: string; window: BrowserWindow } | null
}
interface PendingTab { owner: WebContents; profile: Profile; resolve: (value: [WebContents, BrowserWindow]) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
const profiles = new Map<Session, Profile>(), pendingTabs = new Map<string, PendingTab>()
const eventName = 'dsh-desktop:opencu-extension-event'
interface MenuEntry { owner: WebContents; guest: WebContents; commands: Map<string, MenuItem>; timer: ReturnType<typeof setTimeout> }
const menus = new Map<string, MenuEntry>()
function closeMenu(id: string): void { const entry = menus.get(id); if (entry) clearTimeout(entry.timer); menus.delete(id) }
function extensionMenu(profile: Profile, owner: WebContents, guest: WebContents, extension: Extension): Menu {
  const menu = new Menu()
  const store = Reflect.get(profile.runtime, 'ctx').store as { buildMenuItems(id: string, context: string): MenuItem[] }
  const items = store.buildMenuItems(extension.id, 'browser_action')
  for (const item of items) menu.append(item)
  const manifest = extension.manifest as { options_page?: string; options_ui?: { page: string } }
  const options = manifest.options_page ?? manifest.options_ui?.page
  const standard = Menu.buildFromTemplate([
    { label: '选项 / Options', enabled: !!options, click: () => { if (options) void openTab(profile, new URL(options, `chrome-extension://${extension.id}/`).href, owner).catch(error => console.error('Extension options', error)) } },
    { label: '移除扩展 / Remove extension', click: () => { void operateOpenCUExtensions(owner, guest, 'remove', { actionId: extension.id }).catch(error => console.error('Extension removal', error)) } },
  ])
  for (const item of standard.items) menu.append(item)
  return menu
}
function serializeMenu(menu: Menu, commands: Map<string, MenuItem>): object[] {
  return menu.items.filter(item => item.visible).map(item => {
    const commandId = String(commands.size + 1); commands.set(commandId, item)
    return { commandId, label: item.label, type: item.submenu ? 'submenu' : item.type, checked: item.checked,
      enabled: item.enabled, actionable: item.enabled && item.type !== 'separator', groupId: 'extension-menu',
      ...(item.submenu ? { submenu: serializeMenu(item.submenu, commands) } : {}) }
  })
}
function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid extension arguments')
  return value as Record<string, unknown>
}
function notify(profile: Profile, event: object): void {
  for (const owner of new Set(profile.guests.values())) if (!owner.isDestroyed()) owner.send(eventName, event)
}
function persist(profile: Profile): Promise<void> {
  const content = JSON.stringify({ paths: profile.paths, pinned: profile.pinned, recent: profile.recent })
  profile.writes = profile.writes.catch(() => undefined).then(async () => {
    await mkdir(profile.directory, { recursive: true })
    const path = join(profile.directory, 'opencu-extensions.json'), temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path)
  })
  return profile.writes
}
function openTab(profile: Profile, url: string, owner?: WebContents): Promise<[WebContents, BrowserWindow]> {
  owner ??= [...profile.guests.values()].find(item => !item.isDestroyed())
  if (!owner) return Promise.reject(new Error('No DSH window owns this browser profile'))
  const window = BrowserWindow.fromWebContents(owner)
  if (!window) return Promise.reject(new Error('The browser owner is no longer available'))
  const requestId = randomUUID(), sender = owner
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingTabs.delete(requestId); reject(new Error('Extension tab creation timed out')) }, 15000)
    pendingTabs.set(requestId, { owner: sender, profile, resolve, reject, timer })
    sender.send(eventName, { type: 'create-tab', requestId, url })
  })
}
function restoreProfile(profile: Profile): Promise<void> {
  if (profile.restoring) return profile.ready
  profile.restoring = true
  profile.ready = (async () => {
    await profile.writes.catch(() => undefined)
    let saved: Record<string, unknown>
    try { saved = fields(JSON.parse(await readFile(join(profile.directory, 'opencu-extensions.json'), 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; saved = { paths: [], pinned: [], recent: [] } }
    const next = { paths: [] as string[], pinned: [] as string[], recent: [] as string[] }
    for (const key of ['paths', 'pinned', 'recent'] as const) {
      const value = saved[key]
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('Invalid saved browser extension profile')
      next[key] = value
    }
    Object.assign(profile, next)
    profile.restoreError = null; profile.loadErrors.clear()
    for (const path of profile.paths) {
      if (profile.session.extensions.getAllExtensions().some(extension => resolve(extension.path) === resolve(path))) continue
      try { await profile.session.extensions.loadExtension(path) }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        profile.loadErrors.set(path, message); console.error('OpenCU extension restore', path, error)
      }
    }
  })().catch(error => {
    profile.restoreError = error instanceof Error ? error.message : String(error)
    throw error
  }).finally(() => { profile.restoring = false })
  void profile.ready.catch(error => console.error('OpenCU extension profile', error))
  return profile.ready
}
/** Initializes before guest attachment so the library's real frame/worker preloads run. */
export function prepareOpenCUExtensions(session: Session): void {
  if (profiles.has(session)) return
  const directory = session.storagePath
  if (!directory) throw new Error('Browser extensions require a persistent OpenCU partition')
  let profile: Profile
  const runtime = new ElectronChromeExtensions({ license: 'GPL-3.0', session,
    createTab: details => openTab(profile, details.url ?? 'about:blank'),
    selectTab: tab => { const owner = profile.guests.get(tab); if (!profile.syncingTabs.has(tab) && owner && !owner.isDestroyed()) owner.send(eventName, { type: 'select-tab', webContentsId: tab.id }) },
    removeTab: tab => { const owner = profile.guests.get(tab); if (!tab.isDestroyed() && owner && !owner.isDestroyed()) owner.send(eventName, { type: 'close-tab', webContentsId: tab.id }) },
    requestPermissions: async (extension, permissions) => {
      const owner = [...profile.guests.values()].find(item => !item.isDestroyed()), window = owner && BrowserWindow.fromWebContents(owner)
      if (!window) return false
      const reply = await dialog.showMessageBox(window, { type: 'question', message: extension.name,
        detail: JSON.stringify(permissions, null, 2), buttons: ['拒绝 / Deny', '允许 / Allow'], defaultId: 0, cancelId: 0 })
      return reply.response === 1
    },
  })
  // 4.9.0 exposes these concrete methods at runtime but omits them from its public type.
  const actions = Reflect.get(runtime, 'api')?.browserAction as ActionAPI | undefined
  if (!actions || typeof actions.getState !== 'function' || typeof actions.activate !== 'function') throw new Error('Unsupported electron-chrome-extensions action API')
  profile = { runtime, actions, session, directory, paths: [], pinned: [], recent: [], writes: Promise.resolve(), guests: new Map(), syncingTabs: new Set(), popup: null, ready: Promise.resolve(), restoring: false, restoreError: null, loadErrors: new Map() }
  profiles.set(session, profile)
  runtime.on('browser-action-popup-created', (popup: { extensionId: string; browserWindow?: BrowserWindow }) => {
    const window = popup.browserWindow
    if (!window) return
    // 4.9.0 otherwise waits at 25×25 for a preferred-size event before showing.
    // Its existing measurement path still yields to any native preferred-size event.
    Reflect.set(popup, 'usingPreferredSize', false)
    profile.popup = { id: popup.extensionId, window }
    notify(profile, { type: 'popup-opening', actionId: popup.extensionId })
    window.webContents.once('did-finish-load', () => notify(profile, { type: 'popup-opened', actionId: popup.extensionId }))
    window.webContents.once('did-fail-load', (_event, code, description) => notify(profile, { type: 'popup-failed', actionId: popup.extensionId, error: `${code}: ${description}` }))
    window.once('closed', () => { if (profile.popup?.window === window) profile.popup = null; notify(profile, { type: 'popup-closed', actionId: popup.extensionId }) })
  })
  void restoreProfile(profile)
}
function icon(extension: Extension): string | undefined {
  const icons = extension.manifest.icons as Record<string, string> | undefined
  const name = icons?.['32'] ?? icons?.['48'] ?? Object.values(icons ?? {})[0]
  if (!name) return undefined
  const path = resolve(extension.path, name)
  if (!path.startsWith(resolve(extension.path) + '/')) return undefined
  const image = nativeImage.createFromPath(path)
  return image.isEmpty() ? undefined : image.toDataURL()
}
/** Registers an actual guest without changing which target the AI selected. */
export function attachOpenCUExtensionGuest(owner: WebContents, guest: WebContents): void {
  const profile = profiles.get(guest.session), window = BrowserWindow.fromWebContents(owner)
  if (!profile || !window || profile.guests.has(guest)) return
  profile.guests.set(guest, owner)
  // Registration and native focus synchronize extension state, not sidebar intent.
  const sync = (action: () => void): void => {
    profile.syncingTabs.add(guest)
    try { action() } finally { profile.syncingTabs.delete(guest) }
  }
  sync(() => profile.runtime.addTab(guest, window))
  const focus = () => sync(() => profile.runtime.selectTab(guest))
  guest.on('focus', focus)
  guest.once('destroyed', () => {
    // The runtime already removes destroyed tabs through its own listener.
    profile.guests.delete(guest)
    for (const [id, entry] of menus) if (entry.guest === guest) closeMenu(id)
    if (!profile.guests.size && profile.popup && !profile.popup.window.isDestroyed()) profile.popup.window.destroy()
  })
}
/** Operates only after DesktopBrowserGuests checks the owner and opt-in profile. */
export async function operateOpenCUExtensions(owner: WebContents, guest: WebContents, operation: unknown, args: unknown): Promise<unknown> {
  const profile = profiles.get(guest.session), value = fields(args), window = BrowserWindow.fromWebContents(owner)
  if (!profile || profile.guests.get(guest) !== owner || !window) throw new Error('Extension browser guest is unavailable')
  const live = (): void => {
    if (owner.isDestroyed() || guest.isDestroyed() || window.isDestroyed() || profiles.get(guest.session) !== profile || profile.guests.get(guest) !== owner) throw new Error('Extension browser guest is unavailable')
  }
  live()
  try { await profile.ready }
  catch (error) { if (!['state', 'manage', 'created', 'closeMenu'].includes(String(operation))) throw error }
  live()
  if (operation === 'created') {
    const request = pendingTabs.get(String(value.requestId))
    if (!request || request.owner !== owner || request.profile !== profile) throw new Error('Extension tab request expired')
    clearTimeout(request.timer); pendingTabs.delete(String(value.requestId)); request.resolve([guest, window]); return true
  }
  if (operation === 'state') {
    const extensions = profile.session.extensions.getAllExtensions()
    // Share immutable icon strings only within this synchronous state query.
    // A later query must re-read files, including previously missing icons.
    const icons = new Map<Extension, string | undefined>()
    const readIcon = (extension: Extension): string | undefined => {
      if (!icons.has(extension)) icons.set(extension, icon(extension))
      return icons.get(extension)
    }
    const actions = profile.actions.getState().actions.map(action => {
      const current = { ...action, ...action.tabs?.[guest.id] }, extension = extensions.find(item => item.id === action.id)
      return { id: action.id, title: current.title ?? extension?.name, enabled: current.enabled !== false,
        hasPopup: !!current.popup, badgeText: current.text,
        badgeBackgroundColor: Array.isArray(current.color) ? `rgba(${current.color.slice(0, 3).join(',')},${(current.color[3] ?? 255) / 255})` : current.color,
        iconDataUrl: extension ? readIcon(extension) : undefined }
    })
    return { profile: { extensions: extensions.map(extension => ({ id: extension.id, name: extension.name, version: extension.version, iconDataUrl: readIcon(extension) })),
      recentlyUsedExtensionIds: profile.recent, toolbar: { ready: true, pinnedExtensionIds: profile.pinned, forcePinnedExtensionIds: [] } },
      actions: { status: 'available', supportsContextMenu: true, actions }, popupActionId: profile.popup?.id ?? null }
  }
  if (operation === 'install') {
    const selected = await dialog.showOpenDialog(window, { title: '选择已解压的浏览器扩展 / Load unpacked extension', properties: ['openDirectory'] })
    live()
    if (selected.canceled || !selected.filePaths[0]) return { cancelled: true }
    const path = selected.filePaths[0], manifest = fields(JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')))
    live()
    const answer = await dialog.showMessageBox(window, { type: 'question', message: String(manifest.name ?? 'Browser extension'),
      detail: JSON.stringify({ permissions: manifest.permissions, host_permissions: manifest.host_permissions }, null, 2),
      buttons: ['取消 / Cancel', '加载扩展 / Load extension'], defaultId: 0, cancelId: 0 })
    live()
    if (answer.response !== 1) return { cancelled: true }
    const extension = await profile.session.extensions.loadExtension(path)
    profile.paths = [...new Set([...profile.paths, path])]; await persist(profile); notify(profile, { type: 'changed' })
    return { id: extension.id }
  }
  if (operation === 'manage') {
    const extensions = profile.session.extensions.getAllExtensions()
    const errors = [...(profile.restoreError ? [profile.restoreError] : []), ...[...profile.loadErrors].map(([path, error]) => path + ': ' + error)]
    const detail = [extensions.map(item => `${item.name} ${item.version}`).join('\n') || '尚未安装扩展 / No extensions installed', ...errors].join('\n')
    const retryIndex = 2 + extensions.length
    const selected = await dialog.showMessageBox(window, { type: errors.length ? 'warning' : 'info', title: '浏览器扩展 / Browser extensions',
      message: '浏览器扩展 / Browser extensions', detail,
      buttons: ['完成 / Done', '加载已解压扩展 / Load unpacked', ...extensions.map(item => `移除 / Remove: ${item.name}`), ...(errors.length ? ['重试恢复 / Retry restore'] : [])], defaultId: 0, cancelId: 0 })
    live()
    if (errors.length && selected.response === retryIndex) {
      try { await restoreProfile(profile) } catch { /* The management dialog retains the specific configuration error. */ }
      notify(profile, { type: 'changed' })
      return operateOpenCUExtensions(owner, guest, 'manage', {})
    }
    if (selected.response === 1) return operateOpenCUExtensions(owner, guest, 'install', {})
    const extension = extensions[selected.response - 2]
    return extension ? operateOpenCUExtensions(owner, guest, 'remove', { actionId: extension.id }) : { closed: true }
  }
  if (operation === 'executeMenu' || operation === 'closeMenu') {
    const id = String(value.menuId), entry = menus.get(id)
    if (!entry || entry.owner !== owner || entry.guest !== guest) return false
    if (operation === 'closeMenu') { closeMenu(id); return true }
    const item = entry.commands.get(String(value.commandId))
    closeMenu(id)
    if (!item?.enabled || item.type === 'separator' || item.submenu) return false
    item.click(item, window, {} as Electron.KeyboardEvent)
    return true
  }
  const extension = profile.session.extensions.getExtension(String(value.actionId))
  if (!extension) throw new Error('The extension is no longer installed')
  if (operation === 'pin') {
    if (typeof value.pinned !== 'boolean') throw new Error('Invalid extension pin state')
    profile.pinned = value.pinned ? [...new Set([...profile.pinned, extension.id])] : profile.pinned.filter(id => id !== extension.id)
    await persist(profile); notify(profile, { type: 'changed' }); return 'updated'
  }
  if (operation === 'remove') {
    const answer = await dialog.showMessageBox(window, { type: 'question', message: `移除扩展 / Remove extension: ${extension.name}`, buttons: ['取消 / Cancel', '移除 / Remove'], defaultId: 0, cancelId: 0 })
    live()
    if (answer.response !== 1) return { cancelled: true }
    profile.session.extensions.removeExtension(extension.id)
    profile.paths = profile.paths.filter(path => path !== extension.path); profile.pinned = profile.pinned.filter(id => id !== extension.id)
    await persist(profile); notify(profile, { type: 'changed' }); return { removed: true }
  }
  if (operation === 'beginMenu') {
    const menuId = randomUUID(), commands = new Map<string, MenuItem>()
    const items = serializeMenu(extensionMenu(profile, owner, guest, extension), commands)
    const timer = setTimeout(() => closeMenu(menuId), 120_000)
    menus.set(menuId, { owner, guest, commands, timer }); return { status: 'opened', menuId, items }
  }
  if (operation === 'trigger' || operation === 'contextMenu') {
    const bounds = fields(value.anchorBounds ?? { x: 0, y: 0, width: 24, height: 24 })
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(item => typeof item === 'number' && Number.isFinite(item))) throw new Error('Invalid extension action anchor')
    const zoom = owner.getZoomFactor(), content = window.getContentBounds()
    const anchorRect = { x: Number(bounds.x) * zoom, y: Number(bounds.y) * zoom, width: Number(bounds.width) * zoom, height: Number(bounds.height) * zoom }
    profile.runtime.selectTab(guest)
    if (operation === 'contextMenu') {
      await new Promise<void>(resolve => extensionMenu(profile, owner, guest, extension).popup({ window, x: Math.round(content.x + anchorRect.x), y: Math.round(content.y + anchorRect.y + anchorRect.height), callback: resolve }))
      return 'closed'
    }
    profile.actions.activate({ type: 'frame', sender: owner }, { eventType: 'click', extensionId: extension.id, tabId: guest.id, anchorRect, alignment: 'bottom-left' })
    profile.recent = [extension.id, ...profile.recent.filter(id => id !== extension.id)].slice(0, 20)
    await persist(profile); notify(profile, { type: 'changed' }); return operation === 'trigger' ? 'triggered' : 'closed'
  }
  throw new Error('Unsupported extension operation')
}
