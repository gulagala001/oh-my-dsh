/** Browsing data operations on the dedicated OpenCU Chromium partition. */
import type { Session } from 'electron'

/** Inspect or clear explicitly selected categories without touching delivered files. */
export async function operateOpenCUProfile(profile: Session, operation: unknown, args: unknown): Promise<unknown> {
  if (operation === 'summary') {
    const [cookies, sizeBytes] = await Promise.all([profile.cookies.get({}), profile.getCacheSize()])
    return { siteData: { siteCount: new Set(cookies.map(cookie => cookie.domain)).size }, cache: { sizeBytes } }
  }
  if (operation !== 'clear' || !args || typeof args !== 'object' || !('dataTypes' in args) || !Array.isArray(args.dataTypes)
    || args.dataTypes.some(type => type !== 'siteData' && type !== 'cache')) throw new Error('Unsupported browser data operation')
  if (!('timeRange' in args) || args.timeRange !== 'allTime') throw new Error('Permission: this Chromium host can clear cookies, site data and cache only for All time')
  const dataTypes: NonNullable<Electron.ClearDataOptions['dataTypes']> = []
  if (args.dataTypes.includes('siteData')) dataTypes.push('cookies', 'fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL', 'backgroundFetch')
  if (args.dataTypes.includes('cache')) dataTypes.push('cache')
  if (dataTypes.length) await profile.clearData({ dataTypes })
  return { cleared: true }
}
