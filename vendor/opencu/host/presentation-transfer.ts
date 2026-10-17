/** Screen-DIP handoff geometry; the existing REA renderer stays the only visible frame owner. */
export interface TransferRect { id: string; x: number; y: number; width: number; height: number }
export class PresentationTransfer {
  private started: number | null = null
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private resolveFlight!: () => void
  private rejectFlight!: (error: Error) => void
  readonly ready = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
  private flight: Promise<void> | null = null
  private progress = 0
  private cancelled: Error | null = null
  constructor(readonly id: string, readonly placement: 'home' | 'pinned', private from: TransferRect[], private to: TransferRect[]) {}
  rendered(): void { this.resolveReady() }
  run(now: number): Promise<void> {
    if (this.cancelled) return Promise.reject(this.cancelled)
    if (!this.flight) {
      this.started = now
      this.flight = new Promise<void>((resolve, reject) => { this.resolveFlight = resolve; this.rejectFlight = reject })
    }
    return this.flight
  }
  step(now: number, reduced: boolean): boolean {
    if (this.started === null || this.cancelled) return true
    this.progress = reduced ? 1 : Math.min(1, Math.max(0, (now - this.started) / 320))
    if (this.progress === 1) this.resolveFlight()
    return this.progress === 1
  }
  cancel(): void {
    this.cancelled ??= new Error('The monitoring handoff was interrupted')
    this.rejectReady(this.cancelled); this.rejectFlight?.(this.cancelled)
  }
  frame() {
    const t = this.progress * this.progress * (3 - 2 * this.progress), u = 1 - t
    const values = this.from.map((start, index) => {
      const end = this.to.find(item => item.id === start.id)!
      // sky.node 0x21264 / 0x20bd4: quadratic arc, converted from bottom-left to top-left.
      const top = Math.min(start.y, end.y), controlY = this.placement === 'home' ? top : 2 * (top - 72) - (start.y + end.y) / 2
      return { id: start.id, index, x: u * u * start.x + 2 * u * t * (start.x + end.x) / 2 + t * t * end.x,
        y: u * u * start.y + 2 * u * t * controlY + t * t * end.y,
        width: start.width + (end.width - start.width) * t, height: start.height + (end.height - start.height) * t }
    })
    const x = Math.floor(Math.min(...values.map(item => item.x)) - 48), y = Math.floor(Math.min(...values.map(item => item.y)) - 48)
    const right = Math.ceil(Math.max(...values.map(item => item.x + item.width)) + 48), bottom = Math.ceil(Math.max(...values.map(item => item.y + item.height)) + 48)
    return { bounds: { x, y, width: right - x, height: bottom - y }, items: values.map(item => ({ ...item, x: item.x - x, y: item.y - y })),
      dragging: false, leader: null, exitRevision: 0 }
  }
}
