/** Display-only stack dynamics; no capture, input lease or tool-target state lives here.
 * Coefficients: REA sky.node 0x24d54 / 0x2069c / 0x20184 / 0x26090,
 * recorded in the read-only desktop-presentations/dynamics.mm research source.
 */
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export type Alignment = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export interface MotionAnchor { alignment: Alignment; point: Point }
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
interface Item { id: string; source: Size; size: Size; position: Point; velocity: Point; offset: Point }
interface Resize { id: string; pointer: Point; maximum: number; fixed: Point; fraction: Point; direction: Point }
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const length = (p: Point): number => Math.hypot(p.x, p.y)
const padding = 48

export class PresentationMotion {
  private items = new Map<string, Item>()
  private exits = new Map<string, Item>()
  private order: string[] = []
  private anchor: Point = { x: 0, y: 0 }
  private alignment: Alignment = 'bottom-right'
  private leader: string | null = null
  private grab: Point = { x: 0, y: 0 }
  private pointer: Point = { x: 0, y: 0 }
  private initialPointer: Point = { x: 0, y: 0 }
  private pointerTime = 0
  private velocity: Point = { x: 0, y: 0 }
  private lastTime = 0
  private initialized = false
  dragging = false
  moved = false
  reducedMotion = false
  private exitRevision = 0
  private resizeGesture: Resize | null = null
  private maximum: number | null = null
  get resizing(): boolean { return this.resizeGesture !== null }

  private displaySize(source: Size): Size {
    const scale = this.maximum === null ? Math.min(300 / source.width, 210 / source.height, 1)
      : this.maximum / Math.max(source.width, source.height)
    return { width: Math.max(1, source.width * scale), height: Math.max(1, source.height * scale) }
  }
  private offsets(): void {
    this.order.forEach((id, index) => {
      const item = this.items.get(id)!
      // Native source uses a bottom-left origin; Electron uses top-left DIP.
      item.offset = { x: this.alignment.endsWith('right') ? -item.size.width - index * 28 : index * 28,
        y: this.alignment.startsWith('bottom') ? -item.size.height - index * 22 : index * 22 }
    })
  }
  update(frames: { presentationID: string; width?: number; height?: number }[]): void {
    const ids = frames.map(frame => frame.presentationID)
    this.order = [...this.order.filter(id => ids.includes(id)), ...ids.filter(id => !this.order.includes(id))]
    for (const [id, item] of this.items) if (!ids.includes(id)) { this.exits.set(id, item); this.items.delete(id); this.exitRevision++ }
    const added: string[] = []
    for (const frame of frames) {
      const source = { width: frame.width || 300, height: frame.height || 180 }, size = this.displaySize(source)
      const item = this.items.get(frame.presentationID) ?? this.exits.get(frame.presentationID)
      if (this.exits.delete(frame.presentationID)) this.exitRevision++
      if (item) { item.source = source; if (!this.resizing) item.size = size; this.items.set(frame.presentationID, item) }
      else {
        added.push(frame.presentationID)
        this.items.set(frame.presentationID, { id: frame.presentationID, source, size, position: { ...this.anchor }, velocity: { x: 0, y: 0 }, offset: { x: 0, y: 0 } })
      }
    }
    this.offsets()
    for (const id of this.initialized ? added : ids) {
      const item = this.items.get(id)!; item.position = add(this.anchor, item.offset)
    }
    if (this.leader && !this.items.has(this.leader)) this.cancel()
  }
  place(anchor: MotionAnchor, immediate = false): void {
    if (this.dragging || this.resizing) return
    this.anchor = { ...anchor.point }; this.alignment = anchor.alignment; this.offsets()
    if (!this.initialized || immediate || this.reducedMotion) {
      for (const item of this.items.values()) { item.position = add(this.anchor, item.offset); item.velocity = { x: 0, y: 0 } }
    }
    this.initialized = true
  }
  begin(id: string, pointer: Point, timestamp: number): boolean {
    const item = this.items.get(id)
    if (!item || this.dragging || this.resizing) return false
    this.leader = id; this.dragging = true; this.moved = false
    this.pointer = this.initialPointer = { ...pointer }; this.pointerTime = timestamp
    this.grab = subtract(pointer, item.position); this.velocity = { x: 0, y: 0 }
    this.lastTime = timestamp
    return true
  }
  move(pointer: Point, timestamp: number): void {
    if (!this.dragging || !this.leader) return
    this.moved ||= length(subtract(pointer, this.initialPointer)) >= 4
    const dt = Math.max((timestamp - this.pointerTime) / 1000, 1 / 240), delta = subtract(pointer, this.pointer)
    this.velocity = { x: this.velocity.x * .72 + delta.x / dt * .28, y: this.velocity.y * .72 + delta.y / dt * .28 }
    this.pointer = { ...pointer }; this.pointerTime = timestamp
    if (this.moved) this.anchor = subtract(subtract(pointer, this.grab), this.items.get(this.leader)!.offset)
  }
  end(candidates: MotionAnchor[]): MotionAnchor | null {
    if (!this.dragging || !this.leader) return null
    const leader = this.leader
    this.dragging = false
    if (!this.moved) { this.leader = null; return null }
    const current = this.currentAnchor(), velocity = { x: this.velocity.x * .55, y: this.velocity.y * .55 }
    const speed = length(velocity), projection = Math.min(.45, Math.max(.18, speed / 5000 + .18))
    const projected = { x: current.x + velocity.x * projection, y: current.y + velocity.y * projection }
    let selected = { alignment: this.alignment, point: current }, best = Infinity
    for (const candidate of candidates) {
      const delta = subtract(candidate.point, current), distance = length(delta)
      const reward = speed && distance ? speed * Math.max(0, (velocity.x * delta.x + velocity.y * delta.y) / speed / distance) * .12 : 0
      const score = length(subtract(candidate.point, projected)) - reward
      if (score < best) { selected = candidate; best = score }
    }
    this.order = [leader, ...this.order.filter(id => id !== leader)]
    this.leader = leader; this.anchor = { ...selected.point }; this.alignment = selected.alignment; this.offsets()
    this.order.forEach((id, index) => {
      const weight = length(this.velocity) < 120 ? 0 : .25 / (1 + index * .45)
      this.items.get(id)!.velocity = { x: this.velocity.x * weight, y: this.velocity.y * weight }
    })
    return selected
  }
  beginResize(id: string, edge: ResizeEdge, pointer: Point): boolean {
    const item = this.items.get(id)
    if (!item || this.dragging || this.resizing) return false
    const direction = { x: edge.includes('e') ? 1 : edge.includes('w') ? -1 : 0,
      y: edge.includes('s') ? 1 : edge.includes('n') ? -1 : 0 }
    const fraction = { x: (1 - direction.x) / 2, y: (1 - direction.y) / 2 }
    this.resizeGesture = { id, pointer, maximum: Math.max(item.size.width, item.size.height), direction, fraction,
      fixed: { x: item.position.x + item.size.width * fraction.x, y: item.position.y + item.size.height * fraction.y } }
    this.leader = id; this.anchor = this.currentAnchor()
    return true
  }
  resize(pointer: Point): void {
    const gesture = this.resizeGesture
    if (!gesture) return
    const item = this.items.get(gesture.id)
    if (!item) { this.cancel(); return }
    const aspect = Math.max(item.source.width, item.source.height)
    const axis = { x: gesture.direction.x * item.source.width / aspect, y: gesture.direction.y * item.source.height / aspect }
    const delta = subtract(pointer, gesture.pointer)
    // Project onto the aspect-preserving resize direction, keeping the opposite edge fixed.
    this.maximum = Math.min(400, Math.max(100, gesture.maximum + (delta.x * axis.x + delta.y * axis.y) / (axis.x * axis.x + axis.y * axis.y)))
    for (const value of this.items.values()) value.size = this.displaySize(value.source)
    this.offsets()
    this.anchor = { x: gesture.fixed.x - item.size.width * gesture.fraction.x - item.offset.x,
      y: gesture.fixed.y - item.size.height * gesture.fraction.y - item.offset.y }
    for (const value of this.items.values()) { value.position = add(this.anchor, value.offset); value.velocity = { x: 0, y: 0 } }
  }
  endResize(): void { this.resizeGesture = null }
  cancel(): void { this.dragging = false; this.resizeGesture = null; this.leader = null; this.velocity = { x: 0, y: 0 } }
  promote(id: string): void {
    if (!this.items.has(id) || this.dragging || this.resizing) return
    this.order = [id, ...this.order.filter(value => value !== id)]; this.leader = id; this.offsets()
  }
  currentAnchor(): Point {
    const values = [...this.items.values()]
    return values.length ? values.reduce((point, item) => ({ x: point.x + (item.position.x - item.offset.x) / values.length,
      y: point.y + (item.position.y - item.offset.y) / values.length }), { x: 0, y: 0 }) : this.anchor
  }
  step(timestamp: number): boolean {
    const dt = Math.min(1 / 30, Math.max(1 / 120, (timestamp - (this.lastTime || timestamp - 1000 / 60)) / 1000))
    this.lastTime = timestamp
    const lead = this.leader ? this.order.indexOf(this.leader) : 0
    // Keep the stiff drag spring stable when the host misses a frame.
    const steps = Math.ceil(dt / (1 / 120)), step = dt / steps
    let settled = true
    this.order.forEach((id, index) => {
      const item = this.items.get(id)!, distance = Math.abs(index - lead), leading = index === lead
      const stiffness = leading ? this.dragging ? 900 : 320 : (this.dragging ? 260 : 150) / (1 + distance * .18)
      const damping = leading ? this.dragging ? 55 : 42 : (this.dragging ? 32 : 30) / (1 + distance * .08)
      const target = add(this.anchor, item.offset)
      if (this.reducedMotion) { item.position = target; item.velocity = { x: 0, y: 0 }; return }
      for (let tick = 0; tick < steps; tick++) {
        const error = subtract(target, item.position)
        item.velocity.x += step * (error.x * stiffness - item.velocity.x * damping)
        item.velocity.y += step * (error.y * stiffness - item.velocity.y * damping)
        item.position.x += step * item.velocity.x; item.position.y += step * item.velocity.y
      }
      settled &&= length(subtract(target, item.position)) <= .5 && length(item.velocity) <= 2
    })
    return settled && !this.dragging && !this.resizing
  }
  restSize(): Size {
    if (!this.order.length) return { width: 340, height: 230 }
    const items = [...this.items.values()]
    return { width: Math.ceil(Math.max(...items.map(item => item.offset.x + item.size.width)) - Math.min(...items.map(item => item.offset.x)) + padding * 2),
      height: Math.ceil(Math.max(...items.map(item => item.offset.y + item.size.height)) - Math.min(...items.map(item => item.offset.y)) + padding * 2) }
  }
  finishExits(revision: number): void { if (revision === this.exitRevision) this.exits.clear() }
  frame(): { bounds: Point & Size; items: (Point & Size & { id: string; index: number })[]; dragging: boolean; leader: string | null; exitRevision: number } {
    const active = this.order.map(id => this.items.get(id)!), values = [...active, ...this.exits.values()]
    if (!values.length) return { bounds: { ...this.anchor, width: 1, height: 1 }, items: [], dragging: false, leader: null, exitRevision: this.exitRevision }
    const x = Math.floor(Math.min(...values.map(item => item.position.x)) - padding)
    const y = Math.floor(Math.min(...values.map(item => item.position.y)) - padding)
    const right = Math.ceil(Math.max(...values.map(item => item.position.x + item.size.width)) + padding)
    const bottom = Math.ceil(Math.max(...values.map(item => item.position.y + item.size.height)) + padding)
    return { bounds: { x, y, width: right - x, height: bottom - y },
      items: values.map((item, index) => ({ id: item.id, index, x: item.position.x - x, y: item.position.y - y, ...item.size })),
      dragging: this.dragging && this.moved, leader: this.leader, exitRevision: this.exitRevision }
  }
}
