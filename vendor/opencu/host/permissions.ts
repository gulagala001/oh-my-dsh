/** Website permission requests scoped to an authenticated OpenCU guest lease. */
import { randomUUID } from 'node:crypto'
import { BrowserWindow, Menu, type Session, type WebContents, type MenuItemConstructorOptions, type ContextMenuParams } from 'electron'
import { browserContextMenu } from './opencu-rea-context-menu.js'

type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
interface Identity { conversationId: string; browserTabId: string; mountGeneration: number }
interface Prompt extends Identity {
  id: string
  requestingOrigin: string
  embeddingOrigin: string
  permissions: { name: string }[]
  variant: 'ask'
  presentation: 'normal'
  availableActions: string[]
}
interface Pending { prompt: Prompt; permissions: string[]; callback: (allowed: boolean) => void; timer: ReturnType<typeof setTimeout> }
interface Guest {
  owner: WebContents
  contents: WebContents
  identity: Identity
  pending: Map<string, Pending>
  decisions: Map<string, boolean>
  dispose: () => void
}
const supported = new Set(['notifications', 'geolocation', 'geolocation-approximate', 'media', 'midi', 'midiSysex', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'keyboardLock', 'idle-detection', 'local-fonts', 'sensors', 'screen-wake-lock', 'persistent-storage'])
const mediaPermissions = ['camera', 'microphone', 'media']
function permissionNames(permission: string, mediaTypes?: string[]): string[] {
  if (permission !== 'media') return [permission]
  return [...new Set(mediaTypes?.length ? mediaTypes.map(type => type === 'video' ? 'camera' : type === 'audio' ? 'microphone' : 'media') : ['media'])]
}
function decision(guest: Guest, site: string, permissions: string[]): boolean | undefined {
  const values = permissions.map(permission => guest.decisions.get(site + '\n' + permission))
  if (values.some(value => value === false)) return false
  return values.every(value => value === true) ? true : undefined
}
function origin(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : null }
  catch { return null }
}
function fields(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid website permission arguments')
  return value as Record<string, unknown>
}

/** Retains only visit-lifetime choices; navigation and lease disposal revoke them. */
export class OpenCUPermissions {
  private readonly guests = new Map<WebContents, Guest>()
  configure(owner: WebContents, contents: WebContents, args: unknown): void {
    const value = fields(args)
    if (typeof value.conversationId !== 'string' || !value.conversationId || typeof value.browserTabId !== 'string' || !value.browserTabId || !Number.isSafeInteger(value.mountGeneration) || Number(value.mountGeneration) < 0) throw new Error('Invalid website permission identity')
    const identity = { conversationId: value.conversationId, browserTabId: value.browserTabId, mountGeneration: Number(value.mountGeneration) }
    const previous = this.guests.get(contents)
    if (previous) {
      if (previous.owner !== owner) throw new Error('Website permission guest belongs to another window')
      if (previous.identity.conversationId !== identity.conversationId || previous.identity.browserTabId !== identity.browserTabId) throw new Error('Website permission target identity changed')
      previous.identity = identity
      for (const request of previous.pending.values()) request.prompt.mountGeneration = identity.mountGeneration
      return
    }
    const pending = new Map<string, Pending>(), decisions = new Map<string, boolean>()
    const clear = () => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.callback(false) }
      pending.clear(); decisions.clear()
    }
    const navigate = (_event: Electron.Event, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) clear() }
    const dispose = () => { clear(); this.guests.delete(contents); contents.removeListener('did-start-navigation', navigate) }
    this.guests.set(contents, { owner, contents, identity, pending, decisions, dispose })
    contents.on('did-start-navigation', navigate)
    contents.once('destroyed', dispose)
  }
  release(owner: WebContents, contents: WebContents): void {
    const guest = this.guests.get(contents)
    if (guest?.owner === owner) guest.dispose()
  }
  readonly request: RequestHandler = (contents, permission, callback, details) => {
    const guest = this.guests.get(contents), requestingOrigin = origin(details.requestingUrl), embeddingOrigin = origin(contents.getURL())
    if (!guest || guest.owner.isDestroyed() || !requestingOrigin || !embeddingOrigin || !supported.has(permission)) { callback(false); return }
    const permissions = permissionNames(permission, 'mediaTypes' in details ? details.mediaTypes : undefined)
    const saved = decision(guest, requestingOrigin, permissions)
    if (saved !== undefined) { callback(saved); return }
    const id = randomUUID()
    const names = permissions.map(name => name === 'geolocation-approximate' ? 'geolocation' : name)
    const prompt: Prompt = { ...guest.identity, id, requestingOrigin, embeddingOrigin, permissions: names.map(name => ({ name })), variant: 'ask', presentation: 'normal', availableActions: ['allow-this-time', 'deny', 'dismiss'] }
    const timer = setTimeout(() => { guest.pending.delete(id); callback(false) }, 120_000)
    guest.pending.set(id, { prompt, permissions, callback, timer })
  }
  readonly check: CheckHandler = (contents, permission, requestingOrigin, details) => {
    const guest = contents && this.guests.get(contents), site = origin(requestingOrigin)
    return !!guest && !!site && decision(guest, site, permissionNames(permission, details.mediaType ? [details.mediaType] : undefined)) === true
  }
  async operate(owner: WebContents, contents: WebContents, operation: unknown, args: unknown): Promise<unknown> {
    if (operation === 'configure') { this.configure(owner, contents, args); return true }
    const guest = this.guests.get(contents)
    if (!guest || guest.owner !== owner) throw new Error('Website permission guest is no longer available')
    if (operation === 'settings') return [...this.guests.values()].filter(item => item.owner === owner && !item.contents.isDestroyed()).flatMap(item => {
      const site = origin(item.contents.getURL())
      return site ? [{ ...item.identity, origin: site, permissions: [...supported].map(name => {
        const values = (name === 'media' ? mediaPermissions : [name]).map(permission => item.decisions.get(site + '\n' + permission))
        return { name, value: values.every(value => value === true) ? true : values.every(value => value === false) ? false : null }
      }) }] : []
    })
    if (operation === 'setSitePermission') {
      const value = fields(args), site = origin(String(value.origin)), permission = String(value.permission)
      if (!site || !supported.has(permission) || ![true, false, null].includes(value.value as boolean | null)) throw new Error('Invalid website permission setting')
      const targets = [...this.guests.values()].filter(item => item.owner === owner && !item.contents.isDestroyed() && origin(item.contents.getURL()) === site)
      if (!targets.length) throw new Error('The website is no longer open')
      for (const target of targets) for (const name of permission === 'media' ? mediaPermissions : [permission]) {
        const key = site + '\n' + name
        if (value.value === null) target.decisions.delete(key)
        else target.decisions.set(key, value.value as boolean)
      }
      return { updated: true }
    }
    if (operation === 'list') return [...guest.pending.values()].map(request => request.prompt)
    const value = fields(args)
    if (operation === 'respond') {
      if (typeof value.id !== 'string') throw new Error('Invalid website permission request')
      const request = guest.pending.get(value.id)
      if (!request || request.prompt.mountGeneration !== value.mountGeneration || request.prompt.conversationId !== value.conversationId || request.prompt.browserTabId !== value.browserTabId) return false
      if (!request.prompt.availableActions.includes(String(value.action))) throw new Error('Invalid website permission choice')
      guest.pending.delete(value.id); clearTimeout(request.timer)
      const allowed = value.action === 'allow-this-time'
      if (value.action !== 'dismiss') for (const name of request.permissions) guest.decisions.set(request.prompt.requestingOrigin + '\n' + name, allowed)
      request.callback(allowed)
      return true
    }
    if (operation === 'contextMenu') {
      const window = BrowserWindow.fromWebContents(owner)
      if (!window || value.pageUrl !== contents.getURL()) return null
      const raw = fields(value.params), labels = fields(value.labels), flags = fields(raw.editFlags)
      if (typeof raw.x !== 'number' || typeof raw.y !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)
        || ['formControlType', 'mediaType', 'linkURL', 'srcURL', 'selectionText'].some(key => typeof raw[key] !== 'string')) throw new Error('Invalid browser context menu')
      const params = { ...raw, isEditable: raw.isEditable === true, hasImageContents: raw.hasImageContents === true,
        editFlags: { canCut: flags.canCut === true, canCopy: flags.canCopy === true, canPaste: flags.canPaste === true } } as ContextMenuParams
      let action: object | null = null
      const select = (type: string, extra: object = {}): void => { if (!contents.isDestroyed() && contents.getURL() === value.pageUrl) action = { type, ...extra } }
      const template = browserContextMenu({ canAttachImage: true, canReload: true, isAnnotationModeEnabled: /^https?:/.test(contents.getURL()),
        isDefaultBrowser: false, snapshot: { tabType: 'web' }, params, webContents: contents, window,
        intl: { formatMessage: message => typeof labels[message.messageId] === 'string' ? String(labels[message.messageId]) : message.defaultMessage },
        onBack: () => select('go-back'), onForward: () => select('go-forward'), onReload: () => select('reload'),
        onInspect: point => { if (!contents.isDestroyed()) contents.inspectElement(point.x, point.y) },
        onAttachImage: url => select('attach-image', { url }),
        onComment: (point, flow, selectedText) => select('annotate', { point, flow, selectedText }),
        onOpenInBrowser: url => select('new-tab', { url }), onOpenExternal: url => select('open-external', { url }),
      })
      // Electron roles otherwise target the owner window, not its webview guest.
      for (const item of template) if (item.role === 'cut' || item.role === 'copy' || item.role === 'paste') {
        const role = item.role
        delete item.role; item.label = String(labels[role] ?? role)
        item.click = () => { if (!contents.isDestroyed()) contents[role]() }
      }
      return new Promise(resolve => Menu.buildFromTemplate(template).popup({ window, callback: () => resolve(action) }))
    }
    if (operation === 'siteInfo') {
      const url = contents.getURL(), site = origin(url), bounds = fields(value.anchorBounds)
      if (!site || url !== value.siteUrl) return false
      if (![bounds.x, bounds.y, bounds.height].every(item => typeof item === 'number' && Number.isFinite(item))) throw new Error('Invalid site information anchor')
      const window = BrowserWindow.fromWebContents(owner)
      if (!window) return false
      const chinese = typeof value.locale === 'string' && value.locale.startsWith('zh')
      const choices = [...guest.decisions].filter(([key]) => key.startsWith(`${site}\n`))
      const template: MenuItemConstructorOptions[] = [{ label: site, enabled: false }, { type: 'separator' }]
      if (!choices.length) template.push({ label: chinese ? '此页面尚未授予网站权限' : 'No website permissions granted on this page', enabled: false })
      for (const [key, allowed] of choices) template.push({ label: `${key.split('\n')[1]} — ${chinese ? (allowed ? '本次访问允许' : '已阻止') : (allowed ? 'Allowed for this visit' : 'Blocked')}`, enabled: false })
      if (choices.length) template.push({ label: chinese ? '重置本次访问的网站权限' : 'Reset website permissions for this visit', click: () => { for (const [key] of choices) guest.decisions.delete(key) } })
      return new Promise<boolean>(resolve => Menu.buildFromTemplate(template).popup({ window, x: Math.round(Number(bounds.x)), y: Math.round(Number(bounds.y) + Number(bounds.height)), callback: () => resolve(false) }))
    }
    throw new Error('Unsupported website permission operation')
  }
}
