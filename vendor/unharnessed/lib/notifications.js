/** Retractable tool notifications. Stage during a cell, then use the nearest
 * native step boundary; steer also wakes an idle agent without a status race. */
export class Notifications {
  constructor(agent, allowed, busy) {
    this.agent = agent
    this.allowed = allowed
    this.busy = busy
    this.entries = new Map()
  }
  put(key, message, { wake = true, retain = true } = {}) {
    this.remove(key)
    if (!this.allowed()) return
    this.entries.set(key, { message, wake, retain, phase: 'staged' })
    this.flush()
  }
  flush() {
    if (!this.allowed()) { this.clear(); return }
    if (this.busy()) return
    for (const [key, entry] of this.entries) {
      if (entry.phase !== 'staged') continue
      if (!this.allowed()) { this.clear(); return }
      entry.phase = 'delivering'
      try {
        if (entry.wake) this.agent.steer(entry.message)
        else this.agent.inject(entry.message)
        entry.phase = 'sent'
      } catch (error) {
        // Native inbox admission is synchronous. Inspect both queues before
        // authorizing a retry if a downstream notification listener threw.
        const queued = [...this.agent.inbox.nextStep, ...this.agent.inbox.nextTurn]
        entry.phase = queued.some(message => message.id === entry.message.id) ? 'sent' : 'staged'
        if (entry.phase === 'sent' && !entry.retain && this.entries.get(key) === entry) this.entries.delete(key)
        throw error
      }
      if (!entry.retain && this.entries.get(key) === entry) this.entries.delete(key)
    }
  }
  remove(key) {
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.phase !== 'staged') {
      entry.phase = 'withdrawing'
      this.agent.inbox.remove(entry.message.id)
    }
    if (this.entries.get(key) === entry) this.entries.delete(key)
  }
  forget(message) {
    for (const [key, entry] of this.entries) if (entry.message.id === message.id) this.entries.delete(key)
  }
  clear() {
    const errors = []
    for (const key of this.entries.keys()) { try { this.remove(key) } catch (error) { errors.push(error) } }
    if (errors.length) throw new AggregateError(errors, 'Could not withdraw pending Unharnessed notifications')
  }
}

/** Persisted notices referring to a previous process cannot be consumed after
 * a kernel/session reload. Preserve human messages, attachments and goal results. */
export function clearObsoleteNotifications(agent) {
  const obsolete = new Map([...agent.inbox.nextStep, ...agent.inbox.nextTurn]
    .filter(message => message.source.kind === 'unharnessed-notice'
      && message.content.some(item => item.type === 'text' && /^\[(?:bash-done\b|Python kernel stopped\])/.test(item.text)))
    .map(message => [message.id, JSON.stringify(message.content)]))
  if (!obsolete.size) return
  // Native queue editing preserves both ID and source. A changed body belongs
  // to the human now, including after reload; never retract that edited input.
  for (const event of agent.session.snapshotEvents(0)) {
    if (event.type !== 'agent/inbox/spliced') continue
    for (const message of event.data.inserted) {
      if (obsolete.has(message.id) && obsolete.get(message.id) !== JSON.stringify(message.content)) obsolete.delete(message.id)
    }
  }
  for (const id of obsolete.keys()) agent.inbox.remove(id)
}
