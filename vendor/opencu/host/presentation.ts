/** Owns REA monitoring windows as children of the DSH window that hosts the plugin. */
import { BrowserWindow, screen, type WebContents } from 'electron'
import { fileURLToPath } from 'node:url'
import { OpenCUCursors } from './opencu-cursor.ts'
import { PresentationTransfer, type TransferRect } from './opencu-presentation-transfer.ts'
import { PresentationMotion, type MotionAnchor, type ResizeEdge } from './opencu-presentation-motion.ts'

type Alignment = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
interface Anchor { alignment: Alignment; point: { x: number; y: number } }
interface Layout { anchors: Anchor[]; suppressed: boolean; alignment: Alignment }
interface HitRegion { x: number; y: number; width: number; height: number }
interface RecordEntry {
  owner: BrowserWindow; window: BrowserWindow; hidden: boolean; generation: number; ready: Promise<void>
  positioned: { x: number; y: number } | null; geometry: string; follow: () => void; dispose: () => void
  drag: (active: boolean, targetId?: string) => void; ignoreClickUntil: number
  hitRegions: HitRegion[]; syncPointer: () => void; floating: boolean | null
  motion: PresentationMotion; animate: () => void; frameIds: string[]
  resize: (active: boolean, targetId?: string, edge?: ResizeEdge) => void
  hide: (immediate?: boolean) => void; exitGeneration: number; finishHide: () => void
  transfer?: PresentationTransfer; renderMotion: () => void; stopMotion: () => void; pin: () => void
  contrast: { sequence: number; pending: boolean; sampledAt: number; changedAt: number; white: number; confirmations: number; rect: HitRegion | null; applied?: number }
}
const alignments: readonly string[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
function readLayout(value: unknown): Layout {
  if (typeof value !== 'object' || value === null || !('anchors' in value) || !Array.isArray(value.anchors)
    || !('alignment' in value) || typeof value.alignment !== 'string' || !alignments.includes(value.alignment)
    || !('suppressed' in value) || typeof value.suppressed !== 'boolean') throw new Error('Invalid monitoring layout')
  const anchors: Anchor[] = value.anchors.map((anchor: unknown) => {
    if (typeof anchor !== 'object' || anchor === null || !('alignment' in anchor) || typeof anchor.alignment !== 'string'
      || !alignments.includes(anchor.alignment) || !('point' in anchor) || typeof anchor.point !== 'object' || anchor.point === null
      || !('x' in anchor.point) || !('y' in anchor.point) || typeof anchor.point.x !== 'number' || typeof anchor.point.y !== 'number'
      || !Number.isFinite(anchor.point.x) || !Number.isFinite(anchor.point.y)) throw new Error('Invalid monitoring anchor')
    return { alignment: anchor.alignment as Alignment, point: { x: anchor.point.x, y: anchor.point.y } }
  })
  if (anchors.length !== 4 || new Set(anchors.map(anchor => anchor.alignment)).size !== 4) throw new Error('Missing monitoring anchors')
  return { anchors, alignment: value.alignment as Alignment, suppressed: value.suppressed }
}
export class OpenCUPresentations {
  private readonly cursors = new OpenCUCursors()
  private readonly records = new Map<WebContents, RecordEntry>()
  private readonly layouts = new Map<WebContents, Layout>()
  private readonly sessions = new Map<WebContents, string[]>()
  private create(sender: WebContents): RecordEntry {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) throw new Error('The monitoring owner is unavailable')
    const window = new BrowserWindow({ parent: owner, width: 340, height: 230, show: false, frame: false,
      transparent: true, hasShadow: false, resizable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, acceptFirstMouse: true, title: 'OpenCU',
      webPreferences: { preload: fileURLToPath(new URL('./preload-opencu-presentation.cjs', import.meta.url)),
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } })
    const motion = new PresentationMotion()
    const record: RecordEntry = { owner, window, hidden: true, generation: 0, positioned: null, geometry: '',
      ready: Promise.resolve(), follow: () => {}, dispose: () => {}, drag: () => {}, ignoreClickUntil: 0,
      hitRegions: [], syncPointer: () => {}, floating: null, motion, animate: () => {}, frameIds: [], resize: () => {},
      hide: () => {}, exitGeneration: 0, finishHide: () => {}, renderMotion: () => {}, stopMotion: () => {}, pin: () => {},
      contrast: { sequence: 0, pending: false, sampledAt: 0, changedAt: 0, white: 1, confirmations: 0, rect: null } }
    window.webContents.setZoomFactor(1)
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let motionTimer: ReturnType<typeof setInterval> | undefined
    let pointerTimer: ReturnType<typeof setInterval> | undefined, ignoringMouse: boolean | undefined
    // An ignored, inactive macOS window need not receive forwarded DOM mouse events.
    record.syncPointer = () => {
      if (window.isDestroyed()) return
      const point = screen.getCursorScreenPoint(), bounds = window.getContentBounds(), zoom = window.webContents.getZoomFactor()
      const x = (point.x - bounds.x) / zoom, y = (point.y - bounds.y) / zoom
      const interactive = !record.hidden && !record.transfer && window.isVisible() && (motion.dragging || motion.resizing || record.hitRegions.some(rect =>
        x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height))
      const contrast = record.contrast, now = performance.now()
      if (process.platform === 'darwin' && interactive && contrast.rect && motionTimer === undefined
        && !motion.resizing && !motion.dragging && !record.transfer && !contrast.pending && now - contrast.sampledAt >= 100) {
        contrast.pending = true; contrast.sampledAt = now; contrast.sequence++
        sender.send('dsh-desktop:opencu-presentation-event', { type: 'contrast-request', sequence: contrast.sequence, ownerPid: process.pid,
          rect: { x: bounds.x + contrast.rect.x * zoom, y: bounds.y + contrast.rect.y * zoom, width: contrast.rect.width * zoom, height: contrast.rect.height * zoom } })
      }
      if (contrast.pending && now - contrast.sampledAt > 2500) { contrast.pending = false; contrast.sequence++ }
      if (ignoringMouse === !interactive) return
      ignoringMouse = !interactive; window.setIgnoreMouseEvents(ignoringMouse, { forward: true })
    }
    const trackPointer = (): void => {
      record.syncPointer()
      if (pointerTimer === undefined) pointerTimer = setInterval(record.syncPointer, 16)
    }
    const untrackPointer = (): void => {
      clearInterval(pointerTimer); pointerTimer = undefined; record.syncPointer()
    }
    const anchors = (): MotionAnchor[] => {
      const bounds = owner.getContentBounds(), zoom = sender.getZoomFactor(), size = motion.restSize()
      const layout = this.layouts.get(sender)
      return (layout?.anchors ?? alignments.map(alignment => ({ alignment: alignment as Alignment,
        point: { x: (alignment.endsWith('right') ? bounds.width - 24 : 24) / zoom,
          y: (alignment.startsWith('bottom') ? bounds.height - 24 : 24) / zoom } }))).map(anchor => {
        const right = anchor.alignment.endsWith('right'), bottom = anchor.alignment.startsWith('bottom')
        const point = { x: bounds.x + anchor.point.x * zoom, y: bounds.y + anchor.point.y * zoom }
        const area = screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) }).workArea
        const x = Math.max(area.x, Math.min(area.x + area.width - size.width, point.x - (right ? size.width : 0)))
        const y = Math.max(area.y, Math.min(area.y + area.height - size.height, point.y - (bottom ? size.height : 0)))
        return { alignment: anchor.alignment, point: { x: x + (right ? size.width - 48 : 48), y: y + (bottom ? size.height - 48 : 48) } }
      })
    }
    const stopMotion = (): void => { clearInterval(motionTimer); motionTimer = undefined }
    const renderMotion = (): void => {
      if (window.isDestroyed() || owner.isDestroyed() || record.hidden || !record.frameIds.length) { stopMotion(); return }
      const now = performance.now()
      if (motion.dragging) motion.move(screen.getCursorScreenPoint(), now)
      if (motion.resizing) motion.resize(screen.getCursorScreenPoint())
      const settled = record.transfer ? record.transfer.step(now, motion.reducedMotion) : motion.step(now)
      const frame = record.transfer?.frame() ?? motion.frame(), previous = window.getContentBounds()
      record.positioned = { x: frame.bounds.x, y: frame.bounds.y }
      const changed = previous.x !== frame.bounds.x || previous.y !== frame.bounds.y || previous.width !== frame.bounds.width || previous.height !== frame.bounds.height
      if (!settled || changed) {
        record.contrast.pending = false; record.contrast.sequence++; record.contrast.confirmations = 0; record.contrast.sampledAt = now
      }
      if (changed) window.setBounds(frame.bounds, false)
      // The native window is just the envelope; each REA frame receives its own position.
      window.webContents.send('dsh-desktop:opencu-presentation-update', { motion: frame })
      record.syncPointer()
      if (settled) stopMotion()
    }
    record.renderMotion = renderMotion; record.stopMotion = stopMotion
    record.pin = () => {
      const available = anchors(), layout = this.layouts.get(sender)
      motion.place(available.find(anchor => anchor.alignment === layout?.alignment) ?? available[3]!, true)
    }
    record.animate = () => { if (motionTimer === undefined) motionTimer = setInterval(renderMotion, 1000 / 120) }
    record.drag = (active, targetId) => {
      if (active) {
        if (record.hidden || record.transfer || !window.isVisible() || !targetId || !record.frameIds.includes(targetId)) return
        if (!motion.begin(targetId, screen.getCursorScreenPoint(), performance.now())) return
        record.animate(); record.syncPointer()
      } else {
        if (!motion.dragging || window.isDestroyed() || owner.isDestroyed()) return
        motion.move(screen.getCursorScreenPoint(), performance.now())
        const selected = motion.end(anchors())
        if (selected) {
          record.ignoreClickUntil = Date.now() + 400
          const layout = this.layouts.get(sender)
          if (layout) layout.alignment = selected.alignment
          sender.send('dsh-desktop:opencu-presentation-event', { type: 'alignment', alignment: selected.alignment })
        }
        record.animate(); record.syncPointer()
      }
    }
    record.resize = (active, targetId, edge) => {
      if (active) {
        if (record.hidden || record.transfer || !window.isVisible() || !targetId || !edge || !record.frameIds.includes(targetId)) return
        if (!motion.beginResize(targetId, edge, screen.getCursorScreenPoint())) return
        record.animate(); record.syncPointer()
      } else {
        if (!motion.resizing || window.isDestroyed()) return
        motion.resize(screen.getCursorScreenPoint()); motion.endResize()
        record.ignoreClickUntil = Date.now() + 400
        const size = motion.restSize(), zoom = sender.getZoomFactor()
        sender.send('dsh-desktop:opencu-presentation-event', { type: 'geometry', width: size.width / zoom, height: size.height / zoom })
        record.follow()
      }
    }
    const follow = (): void => {
      if (owner.isDestroyed() || window.isDestroyed()) return
      const layout = this.layouts.get(sender)
      if (layout?.suppressed || !owner.isVisible() || owner.isMinimized()) { record.transfer?.cancel(); motion.cancel(); stopMotion(); window.hide(); return }
      if (record.hidden || record.transfer) return
      if (!motion.dragging && !motion.resizing) {
        const available = anchors(), anchor = available.find(anchor => anchor.alignment === layout?.alignment) ?? available[3]!
        motion.place(anchor, !window.isVisible()); renderMotion(); record.animate()
      }
      if (!window.isVisible()) { window.showInactive(); if (owner.isFocused()) window.moveTop() }
      record.syncPointer()
    }
    record.finishHide = () => {
      clearTimeout(hideTimer); hideTimer = undefined
      if (record.hidden && !window.isDestroyed()) { motion.finishExits(motion.frame().exitRevision); window.hide() }
    }
    record.hide = (immediate = false) => {
      if (window.isDestroyed()) return
      if (record.hidden && !immediate) return
      record.transfer?.cancel(); record.transfer = undefined
      motion.cancel(); stopMotion(); record.hidden = true; record.generation++; record.exitGeneration++
      record.frameIds = []; record.hitRegions = []; record.contrast.pending = false; record.contrast.sequence++; record.contrast.confirmations = 0
      motion.update([]); record.syncPointer()
      if (immediate || !window.isVisible()) {
        motion.finishExits(motion.frame().exitRevision); record.finishHide()
        window.webContents.send('dsh-desktop:opencu-presentation-update', { frames: [], motion: null, transferId: null, reset: record.exitGeneration })
      } else {
        window.webContents.send('dsh-desktop:opencu-presentation-update', { frames: [], motion: motion.frame(), exitGeneration: record.exitGeneration })
        // A dead renderer must not strand a transparent native window. Normal removal uses the REA completion callback.
        clearTimeout(hideTimer); hideTimer = setTimeout(record.finishHide, 1500)
      }
    }
    const hide = (event: Electron.Event): void => {
      event.preventDefault(); record.hide()
      if (!sender.isDestroyed()) sender.send('dsh-desktop:opencu-presentation-event', { type: 'hidden' })
    }
    const endDrag = (): void => { record.drag(false); record.resize(false) }
    const raise = (): void => { follow(); if (!window.isDestroyed() && window.isVisible()) window.moveTop() }
    window.on('close', hide)
    window.on('blur', endDrag)
    window.on('show', trackPointer); window.on('hide', untrackPointer)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => { event.preventDefault() })
    owner.on('move', follow); owner.on('resize', follow); owner.on('show', follow)
    owner.on('hide', follow); owner.on('minimize', follow); owner.on('restore', follow); owner.on('focus', raise)
    record.dispose = () => {
      record.transfer?.cancel(); record.transfer = undefined
      record.generation++; stopMotion(); clearTimeout(hideTimer); clearInterval(pointerTimer); motion.cancel()
      owner.removeListener('move', follow); owner.removeListener('resize', follow); owner.removeListener('show', follow)
      owner.removeListener('hide', follow); owner.removeListener('minimize', follow); owner.removeListener('restore', follow); owner.removeListener('focus', raise)
      sender.removeListener('destroyed', record.dispose)
      window.removeListener('closed', record.dispose)
      window.removeListener('close', hide)
      window.removeListener('blur', endDrag)
      window.removeListener('show', trackPointer); window.removeListener('hide', untrackPointer)
      this.records.delete(sender)
      if (!window.isDestroyed()) window.destroy()
    }
    sender.once('destroyed', record.dispose)
    window.once('closed', record.dispose)
    record.follow = follow
    record.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        record.dispose()
        reject(new Error('The monitoring window did not finish loading'))
      }, 15000)
      void window.loadURL('dsh-app://app/api/opencu/presentation').then(() => {
        clearTimeout(timer); resolve()
      }, (error: unknown) => {
        clearTimeout(timer); record.dispose(); reject(error)
      })
    })
    this.records.set(sender, record)
    return record
  }
  async operate(sender: WebContents, operation: unknown, payload: unknown): Promise<object> {
    if (operation === 'sessions') {
      if (!payload || typeof payload !== 'object' || !('sessionIds' in payload) || !Array.isArray(payload.sessionIds)
        || payload.sessionIds.some(id => typeof id !== 'string')) throw new Error('Invalid monitoring sessions')
      if (!this.sessions.has(sender)) sender.once('destroyed', () => { this.sessions.delete(sender) })
      this.sessions.set(sender, payload.sessionIds)
      const record = this.records.get(sender)
      if (record) record.hide(true)
      return { updated: true }
    }
    if (operation === 'cursor') return this.cursors.update(sender, payload)
    if (operation === 'contrast-result') {
      const record = this.records.get(sender), contrast = record?.contrast
      if (!record || !contrast || !payload || typeof payload !== 'object' || !('sequence' in payload) || payload.sequence !== contrast.sequence) return { ignored: true }
      contrast.pending = false
      if (record.hidden || record.transfer || record.motion.dragging || record.motion.resizing || !record.window.isVisible()
        || !('available' in payload) || payload.available !== true || !('luminance' in payload)
        || typeof payload.luminance !== 'number' || !Number.isFinite(payload.luminance) || payload.luminance < 0 || payload.luminance > 1) return { ignored: true }
      const now = performance.now()
      if (contrast.white && payload.luminance > .74) { contrast.white = 0; contrast.confirmations = 0; contrast.changedAt = now }
      else if (!contrast.white && payload.luminance < .56 && now - contrast.changedAt >= 240) {
        if (++contrast.confirmations >= 3) { contrast.white = 1; contrast.confirmations = 0; contrast.changedAt = now }
      } else contrast.confirmations = 0
      if (contrast.applied !== contrast.white) {
        contrast.applied = contrast.white
        record.window.webContents.send('dsh-desktop:opencu-presentation-update', { controlWhite: contrast.white })
      }
      return { updated: true }
    }
    if (operation === 'layout') {
      const layout = readLayout(payload)
      if (!this.layouts.has(sender)) sender.once('destroyed', () => { this.layouts.delete(sender) })
      this.layouts.set(sender, layout); this.records.get(sender)?.follow()
      return { updated: true }
    }
    if (operation === 'close') { this.cursors.close(sender); this.records.get(sender)?.dispose(); return { released: true } }
    if (operation === 'transfer-prepare') {
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string'
        || !('placement' in payload) || !['home', 'pinned'].includes(String(payload.placement))
        || !('frames' in payload) || !Array.isArray(payload.frames) || !payload.frames.length
        || !('rects' in payload) || !Array.isArray(payload.rects)) throw new Error('Invalid monitoring handoff')
      const frames = payload.frames, rawRects = payload.rects
      if (frames.length > 5 || frames.some(frame => !frame || typeof frame.presentationID !== 'string'
        || [frame.width, frame.height].some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0))
        || !this.sessions.get(sender)?.includes(frame.threadID))
        || new Set(frames.map(frame => frame.presentationID)).size !== frames.length) throw new Error('The handoff task is not active in this window')
      const owner = BrowserWindow.fromWebContents(sender), bounds = owner?.getContentBounds(), zoom = sender.getZoomFactor()
      if (!owner?.isVisible() || owner.isMinimized() || !bounds) throw new Error('The handoff owner is not visible')
      const rects: TransferRect[] = frames.map(frame => {
        const rect = rawRects.find(value => value?.id === frame.presentationID)
        if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(value => typeof value === 'number' && Number.isFinite(value))
          || rect.width <= 0 || rect.height <= 0 || rect.width > 2000 || rect.height > 2000) throw new Error('Invalid monitoring handoff geometry')
        return { id: rect.id, x: bounds.x + rect.x * zoom, y: bounds.y + rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }
      })
      const record = this.records.get(sender) ?? this.create(sender)
      await record.ready
      if (record.window.isDestroyed() || !owner.isVisible() || owner.isMinimized()
        || frames.some(frame => !this.sessions.get(sender)?.includes(frame.threadID))) throw new Error('The monitoring handoff owner changed')
      if (record.transfer) throw new Error('A monitoring handoff is already running')
      record.stopMotion(); record.motion.cancel()
      record.motion.update(frames); record.frameIds = frames.map(frame => frame.presentationID)
      if (payload.placement === 'pinned') record.pin()
      const pinned = record.motion.frame(), floating = pinned.items.filter(item => record.frameIds.includes(item.id))
        .map(item => ({ ...item, x: pinned.bounds.x + item.x, y: pinned.bounds.y + item.y }))
      const transfer = new PresentationTransfer(payload.id, payload.placement as 'home' | 'pinned',
        payload.placement === 'home' ? floating : rects, payload.placement === 'home' ? rects : floating)
      record.transfer = transfer; record.hidden = false
      record.renderMotion()
      record.window.webContents.send('dsh-desktop:opencu-presentation-update', { frames, motion: transfer.frame(), transferId: transfer.id })
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([transfer.ready, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('The handoff renderer did not become ready')), 2000) })])
        if (record.transfer !== transfer || record.window.isDestroyed() || !owner.isVisible() || owner.isMinimized()) throw new Error('The monitoring handoff owner changed')
        // Paint the ready copy before the dock conceals its source; never hand off through a blank frame.
        record.window.showInactive(); record.window.moveTop()
        return { prepared: true }
      } catch (error) {
        if (record.transfer === transfer) {
          record.transfer = undefined; transfer.cancel()
          if (payload.placement === 'pinned') record.hide(true)
          else { record.window.webContents.send('dsh-desktop:opencu-presentation-update', { transferId: null }); record.follow() }
        }
        throw error
      } finally { clearTimeout(timeout) }
    }
    if (operation === 'transfer-run' || operation === 'transfer-finish' || operation === 'transfer-cancel') {
      const record = this.records.get(sender), transfer = record?.transfer
      if (!record || !transfer || !payload || typeof payload !== 'object' || !('id' in payload) || payload.id !== transfer.id) throw new Error('The monitoring handoff is no longer current')
      if (operation === 'transfer-run') {
        if (record.hidden || record.window.isDestroyed() || record.owner.isDestroyed() || !record.owner.isVisible()
          || record.owner.isMinimized() || this.layouts.get(sender)?.suppressed) throw new Error('The monitoring handoff owner is not visible')
        record.window.showInactive(); record.window.moveTop()
        const flight = transfer.run(performance.now()); record.animate(); record.syncPointer()
        let timeout: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([flight, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('The monitoring handoff timed out')), 2000) })]) }
        finally { clearTimeout(timeout) }
      } else {
        record.stopMotion(); record.transfer = undefined
        if (operation === 'transfer-cancel') transfer.cancel()
        const home = operation === 'transfer-finish' ? transfer.placement === 'home' : transfer.placement === 'pinned'
        if (home) record.hide(true)
        else { record.window.webContents.send('dsh-desktop:opencu-presentation-update', { transferId: null }); record.follow() }
      }
      return { visible: record.window.isVisible() }
    }
    if (operation === 'hide') {
      const record = this.records.get(sender)
      if (record && !record.transfer) record.hide()
      return { visible: !!record?.transfer }
    }
    if (operation !== 'update' || typeof payload !== 'object' || payload === null || !('frames' in payload) || !Array.isArray(payload.frames)) throw new Error('Invalid monitoring update')
    const active = this.sessions.get(sender) ?? []
    let frames = payload.frames.filter(frame => frame && typeof frame === 'object' && 'threadID' in frame && typeof frame.threadID === 'string' && active.includes(frame.threadID))
    const record = this.records.get(sender) ?? this.create(sender)
    if (record.transfer) return { visible: record.window.isVisible(), transferring: true }
    const generation = ++record.generation
    await record.ready
    if (record.window.isDestroyed() || generation !== record.generation) return { visible: false }
    frames = frames.filter(frame => this.sessions.get(sender)?.includes(frame.threadID))
    const displayFrames = frames.map(frame => {
      if (typeof frame.presentationID !== 'string' || [frame.width, frame.height].some(value => value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0))) throw new Error('Invalid monitoring dimensions')
      return { presentationID: frame.presentationID, width: frame.width as number | undefined, height: frame.height as number | undefined }
    })
    if (!frames.length) { record.hide(); return { visible: false } }
    record.exitGeneration++
    record.frameIds = displayFrames.map(frame => frame.presentationID)
    record.motion.update(displayFrames)
    const size = record.motion.restSize()
    const zoom = sender.getZoomFactor(), geometry = `${size.width}:${size.height}:${zoom}`
    if (record.geometry !== geometry) {
      record.geometry = geometry
      sender.send('dsh-desktop:opencu-presentation-event', { type: 'geometry', width: size.width / zoom, height: size.height / zoom })
    }
    const floating = frames.some(frame => (frame.active === true || record.window.isFocused())
      && (frame.backend !== 'browser' || frame.provider !== 'dsh' || frame.isDetached === true))
    if (record.floating !== floating) {
      record.floating = floating; record.window.setAlwaysOnTop(floating, 'floating')
      if (record.owner.isFocused() && record.window.isVisible()) record.window.moveTop()
    }
    record.hidden = false
    record.follow()
    record.window.webContents.send('dsh-desktop:opencu-presentation-update', { ...payload, frames, motion: record.motion.frame(), exitGeneration: record.exitGeneration })
    return { visible: record.window.isVisible(), ownerWindow: record.owner.id, windowId: record.window.id, ownerPid: process.pid }
  }
  event(sender: WebContents, payload: unknown): void {
    const record = [...this.records.values()].find(item => item.window.webContents === sender)
    if (!record || typeof payload !== 'object' || payload === null || !('type' in payload)) return
    if (payload.type === 'transfer-rendered') {
      if ('id' in payload && payload.id === record.transfer?.id) record.transfer?.rendered()
      return
    }
    if (record.transfer && payload.type !== 'error' && payload.type !== 'motion-preference') return
    if (payload.type === 'drag-start' || payload.type === 'drag-end') {
      record.drag(payload.type === 'drag-start', 'targetId' in payload && typeof payload.targetId === 'string' ? payload.targetId : undefined); return
    }
    if (payload.type === 'resize-start' || payload.type === 'resize-end') {
      const edge = 'edge' in payload && typeof payload.edge === 'string' && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].includes(payload.edge) ? payload.edge as ResizeEdge : undefined
      record.resize(payload.type === 'resize-start', 'targetId' in payload && typeof payload.targetId === 'string' ? payload.targetId : undefined, edge); return
    }
    if (payload.type === 'promote' && 'targetId' in payload && typeof payload.targetId === 'string' && record.frameIds.includes(payload.targetId)) {
      record.motion.promote(payload.targetId); record.animate(); return
    }
    if (payload.type === 'motion-preference' && 'reducedMotion' in payload && typeof payload.reducedMotion === 'boolean') {
      record.motion.reducedMotion = payload.reducedMotion; record.animate(); return
    }
    if (payload.type === 'hit-regions' && 'regions' in payload && Array.isArray(payload.regions)) {
      record.hitRegions = payload.regions.slice(0, 16).filter((rect): rect is HitRegion => rect && typeof rect === 'object'
        && [rect.x, rect.y, rect.width, rect.height].every(value => typeof value === 'number' && Number.isFinite(value))
        && rect.width > 0 && rect.height > 0)
      record.syncPointer(); return
    }
    if (payload.type === 'contrast-region' && 'rect' in payload) {
      const rect = payload.rect as HitRegion | null
      record.contrast.rect = rect && [rect.x, rect.y, rect.width, rect.height].every(value => typeof value === 'number' && Number.isFinite(value))
        && rect.width > 0 && rect.height > 0 && rect.width <= 160 && rect.height <= 160 ? rect : null
      record.contrast.pending = false; record.contrast.sequence++; record.contrast.confirmations = 0
      return
    }
    if (payload.type === 'pointer') { record.syncPointer(); return }
    if (payload.type === 'focus' && Date.now() < record.ignoreClickUntil) return
    if (payload.type === 'exit-complete') {
      if ('revision' in payload && typeof payload.revision === 'number') { record.motion.finishExits(payload.revision); record.animate() }
      if (record.hidden && 'generation' in payload && payload.generation === record.exitGeneration) record.finishHide()
      return
    }
    if (payload.type === 'hidden') record.hide()
    record.owner.webContents.send('dsh-desktop:opencu-presentation-event', payload)
  }
}
