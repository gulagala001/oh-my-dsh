/** Additive close checks owned by one tab occurrence; unbinding cancels an in-flight close. */
export class TabCloseGuards {
  private readonly guards = new Set<() => Promise<boolean>>()
  private pending: Promise<boolean> | undefined

  private readonly signal: AbortSignal
  constructor(signal: AbortSignal) { this.signal = signal }

  /** Register a mounted editor's save check without replacing page commands. */
  bind(guard: () => Promise<boolean>): () => void {
    if (this.signal.aborted) return () => {}
    this.guards.add(guard)
    const release = (): void => { this.guards.delete(guard); this.signal.removeEventListener('abort', release) }
    this.signal.addEventListener('abort', release, { once: true })
    return release
  }

  /** Keep unguarded closes synchronous; guarded closes commit once after all checks accept. */
  close(commit: () => boolean): boolean | Promise<boolean> {
    if (this.signal.aborted) return false
    if (this.pending) return this.pending
    if (!this.guards.size) return commit()
    const guards = [...this.guards]
    this.pending = Promise.resolve().then(async () => {
      for (const guard of guards) {
        if (this.signal.aborted || !this.guards.has(guard) || !await guard()) return false
      }
      if (!this.signal.aborted && guards.length === this.guards.size && guards.every(guard => this.guards.has(guard))) return commit()
      return false
    }).catch(error => { console.error('Sidebar tab close check failed; tab remains open', error); return false })
      .finally(() => { this.pending = undefined })
    return this.pending
  }
}
