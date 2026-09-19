/** Observe the active top-level wait; never reinterpret an explicitly queued message. */
import { useEffect, useState } from 'react'
export function useBackgroundWait(sessionId: string | undefined, running: boolean): boolean {
  const [observed, setObserved] = useState<{ id: string; waiting: boolean } | null>(null)
  useEffect(() => {
    setObserved(null)
    if (!sessionId || !running) return
    const id = sessionId
    let active = true, generation = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const visible = (): boolean => document.visibilityState !== 'hidden'
    const poll = async (): Promise<void> => {
      if (!active || !visible()) return
      const ticket = ++generation, own = controller = new AbortController()
      const timeout = setTimeout(() => own.abort(), 5000)
      try {
        const response = await fetch(`/trisoul-x/api/background-wait?session=${encodeURIComponent(id)}`, { signal: own.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const value: unknown = await response.json()
        if (active && ticket === generation) setObserved({ id, waiting: typeof value === 'object' && value !== null && 'waiting' in value && value.waiting === true })
      } catch (error) {
        // Missing/disconnected OMD never changes the host's saved input preference.
        if (active && ticket === generation) setObserved(null)
      } finally {
        clearTimeout(timeout)
        if (active && ticket === generation && visible()) timer = setTimeout(() => { void poll() }, 500)
      }
    }
    const visibility = (): void => { generation++; clearTimeout(timer); controller?.abort(); if (visible()) void poll() }
    document.addEventListener('visibilitychange', visibility)
    void poll()
    return () => { active = false; generation++; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility) }
  }, [sessionId, running])
  return running && observed?.id === sessionId && observed?.waiting === true
}
