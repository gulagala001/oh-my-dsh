import { desktopResourcePath } from '../desktop-resource.mjs';

const workerURL = 'chrome-extension://jccenaenegoalonkjagkdfnbekhijegf/worker.js';
const siteData = { cookies: true, cacheStorage: true, fileSystems: true, indexedDB: true,
  localStorage: true, serviceWorkers: true, webSQL: true };
const timeRanges = { lastHour: 3600000, lastDay: 86400000, lastWeek: 604800000, lastMonth: 2419200000, allTime: 0 };

export function managedProfileLaunch(options) {
  const directory = desktopResourcePath(new URL('./profile-extension/', import.meta.url));
  return { ...options, args: [...options.args ?? [], '--enable-blink-features=WebMCP',
    `--disable-extensions-except=${directory}`, `--load-extension=${directory}`] };
}

export async function clearManagedBrowserData(context, { dataTypes, timeRange = 'allTime' }) {
  if (!Array.isArray(dataTypes) || !dataTypes.length || dataTypes.some(type => !['siteData', 'cache'].includes(type))
    || !Object.hasOwn(timeRanges, timeRange)) throw new Error('Invalid managed browser data selection');
  const age = timeRanges[timeRange];
  if (age && dataTypes.includes('siteData')) throw new Error('Select All time to remove site data, including storage that has no timestamps.');
  const worker = context.serviceWorkers().find(value => value.url() === workerURL)
    ?? await context.waitForEvent('serviceworker', { predicate: value => value.url() === workerURL, timeout: 2500 }).catch(() => null);
  if (!worker) throw Object.assign(new Error('Install the managed Chromium component and restart the independent browser to clear its data.'), {
    code: 'MANAGED_PROFILE_UNAVAILABLE',
  });
  const types = { ...(dataTypes.includes('siteData') ? siteData : {}), ...(dataTypes.includes('cache') ? { cache: true } : {}) };
  await worker.evaluate(({ since, types }) => chrome.browsingData.remove({ since, originTypes: { unprotectedWeb: true } }, types),
    { since: age ? Math.max(0, Date.now() - age) : 0, types });
  return { cleared: true };
}
