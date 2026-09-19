import type { Context } from '@deepseek-ai/cordis'

/** Switching the entire Conversation provider requires a fresh page assembly.
 * Session history and the original persisted text-draft store survive reload.
 * Ordinary OMD feature settings do not change this provider or reload the page.
 */
export function reloadOnProviderChange(ctx: Context): boolean {
  if (typeof window === 'undefined') return false
  const boot = (window as unknown as { __DSH_BOOT__?: { entries?: { id: string }[] } }).__DSH_BOOT__
  if (!boot?.entries) return false
  let leaving = false
  const reload = () => { if (!leaving) { leaving = true; window.location.reload() } }
  if (!boot.entries.some(row => row.id === 'trisoul_x')) {
    reload()
    return true
  }
  const onPageHide = () => { leaving = true }
  window.addEventListener('pagehide', onPageHide)
  ctx.effect(() => () => {
    window.removeEventListener('pagehide', onPageHide)
    reload()
  }, 'conversation provider change')
  return false
}
