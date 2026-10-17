/** Additive close checks owned by one tab occurrence; unbinding cancels an in-flight close. */
export class TabCloseGuards {
  private readonly guards = new Set<() => Promise<boolean>>()
  private pending: Promise<void> | undefined

  constructor(private readonly signal: AbortSignal) {}

  /** Register a mounted editor's save check without replacing page commands. */
  bind(guard: () => Promise<boolean>): () => void {
    if (this.signal.aborted) return () => {}
    this.guards.add(guard)
    const release = (): void => { this.guards.delete(guard); this.signal.removeEventListener('abort', release) }
    this.signal.addEventListener('abort', release, { once: true })
    return release
  }

  /** Keep unguarded closes synchronous; guarded closes commit once after all checks accept. */
  close(commit: () => void): void {
    if (this.signal.aborted || this.pending) return
    if (!this.guards.size) { commit(); return }
    const guards = [...this.guards]
    this.pending = Promise.resolve().then(async () => {
      for (const guard of guards) {
        if (this.signal.aborted || !this.guards.has(guard) || !await guard()) return
      }
      if (!this.signal.aborted && guards.length === this.guards.size && guards.every(guard => this.guards.has(guard))) commit()
    }).catch(error => { console.error('Sidebar tab close check failed; tab remains open', error) })
      .finally(() => { this.pending = undefined })
  }
}
