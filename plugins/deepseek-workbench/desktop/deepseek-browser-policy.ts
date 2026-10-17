/** Opt-in DeepSeek guest policy; ordinary Sidebar guests keep their existing policy. */
export const DEEPSEEK_PROFILE = 'deepseek-workbench' as const
/** Application-wide Chromium storage survives tab release and application restart. */
export const DEEPSEEK_PARTITION = 'persist:dsh-deepseek-workbench-v1'
/** Navigation stays on the two product entry points, including their local sign-in pages. */
const PAGE_HOSTS = new Set(['chat.deepseek.com', 'platform.deepseek.com'])
/** Official page SDKs require these captcha service origins; they never become navigable pages. */
const CAPTCHA_HOSTS = new Set(['challenges.cloudflare.com', 'castatic.fengkongcloud.cn',
  'castatic-xjp.fengkongcloud.cn', 'tracker.fengkongcloud.com', 'captcha.fengkongcloud.com', 'captcha1.fengkongcloud.cn',
  'a0fea896111e.edge.captcha-sdk.awswaf.com', 'a0fea896111e.edge.sdk.awswaf.com'])

/** @param options - untrusted acquire IPC options. @returns the supported opt-in profile. */
export function resolveDeepSeekProfile(options: unknown): typeof DEEPSEEK_PROFILE | undefined {
  if (options === undefined) return undefined
  if (typeof options !== 'object' || options === null || Array.isArray(options)
    || Object.keys(options).length !== 1 || !('profile' in options) || options.profile !== DEEPSEEK_PROFILE) {
    throw new Error('desktop browser: unsupported browser profile')
  }
  return DEEPSEEK_PROFILE
}

/** @param value - untrusted URL. @returns an HTTPS URL without credentials or custom ports. */
function officialUrl(value: string): URL | undefined {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return undefined
  return url
}

/** @param value - requested top-level URL. @returns whether the official product may navigate there. */
export function allowsDeepSeekNavigation(value: string): boolean {
  const url = officialUrl(value)
  return url !== undefined && PAGE_HOSTS.has(url.hostname)
}

/** @param value - requested attachment link. @returns whether the shell may download it without page navigation. */
export function allowsDeepSeekFileDownloadRequest(value: string): boolean {
  const url = officialUrl(value)
  return url !== undefined && url.hostname === 'files.deepseeksvc.com' && url.pathname.startsWith('/api/')
}

/** @param value - network request URL. @returns whether it is a product resource or required login/captcha SDK. */
export function allowsDeepSeekResource(value: string): boolean {
  // Chromium's secure WebSocket transport shares the same site restrictions.
  const normalized = value.startsWith('wss:') ? `https:${value.slice(4)}` : value
  const url = officialUrl(normalized)
  if (url === undefined) return false
  if (url.hostname === 'deepseek.com' || url.hostname.endsWith('.deepseek.com')) return true
  if (value.startsWith('wss:')) return false
  if (url.hostname === 'files.deepseeksvc.com') return true
  // hCaptcha documents rotating asset hosts, so its own site is deliberately suffix-scoped.
  if (url.hostname === 'hcaptcha.com' || url.hostname.endsWith('.hcaptcha.com')) return true
  if (CAPTCHA_HOSTS.has(url.hostname)) return true
  if (url.hostname === 'captcha.awswaf.com' || url.hostname.endsWith('.captcha.awswaf.com')) return true
  return url.hostname === 'appleid.cdn-apple.com' && url.pathname.startsWith('/appleauth/static/')
}

/** @param pageUrl - guest document. @param chain - download redirects. @param initiator - Chromium's initiating origin. @returns whether every source is approved. */
export function allowsDeepSeekDownload(pageUrl: string, chain: readonly string[], initiator: string): boolean {
  return allowsDeepSeekNavigation(pageUrl) && allowsDeepSeekNavigation(initiator) && chain.length > 0 && chain.every(value => {
    if (value.startsWith('blob:')) return allowsDeepSeekNavigation(value.slice(5))
    const url = officialUrl(value)
    return url !== undefined && (url.hostname === 'deepseek.com' || url.hostname.endsWith('.deepseek.com')
      || url.hostname === 'files.deepseeksvc.com')
  })
}

/** @param value - server-supplied filename. @returns a portable filename for the native save dialog. */
export function safeDownloadFilename(value: string): string {
  const cleaned = value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/gu, '_')
    .replace(/[. ]+$/u, '').replace(/^\.+/u, '')
  let result = '', bytes = 0
  for (const character of cleaned) {
    bytes += new TextEncoder().encode(character).length
    if (bytes > 180) break
    result += character
  }
  result = result.replace(/[. ]+$/u, '')
  if (result.length === 0) return 'deepseek-download'
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(result)) return `_${result}`
  return result
}
