import { screenshotGeometry, withViewportTransaction } from './browser-screenshot.mjs';

const fields = new Set(['deviceScaleFactor', 'userAgent', 'hasTouch', 'isMobile']);
const owns = (value, key) => Object.hasOwn(value ?? {}, key);

export function validateEmulation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Emulation settings must be an object.');
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new TypeError('Unknown emulation setting: ' + key);
  if (owns(value, 'deviceScaleFactor') && (!Number.isFinite(value.deviceScaleFactor) || value.deviceScaleFactor < 0.1 || value.deviceScaleFactor > 10)) throw new TypeError('deviceScaleFactor must be between 0.1 and 10.');
  if (owns(value, 'userAgent') && (typeof value.userAgent !== 'string' || !value.userAgent.trim() || value.userAgent.length > 2048 || /[\x00-\x1f\x7f]/.test(value.userAgent))) throw new TypeError('userAgent must be a nonempty string of at most 2048 characters without control characters.');
  for (const key of ['hasTouch', 'isMobile']) if (owns(value, key) && typeof value[key] !== 'boolean') throw new TypeError(key + ' must be a boolean.');
  return { ...value };
}

export const emulationSettings = (host, id) => host.emulations.get(id)?.settings ?? null;

export async function applyMetrics(host, record, size, entry = host.emulations.get(record.id)) {
  const geometry = await screenshotGeometry(record);
  const settings = entry?.settings ?? {};
  await record.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: Math.round(size.width * geometry.zoom), height: Math.round(size.height * geometry.zoom),
    deviceScaleFactor: settings.deviceScaleFactor ?? entry?.nativeDpr ?? geometry.devicePixelRatio / geometry.zoom,
    mobile: settings.isMobile ?? false,
  });
}

async function apply(host, record, entry, previous) {
  const settings = entry?.settings ?? {}, before = previous?.settings ?? {};
  const viewport = host.viewportOwners.get(record.id);
  if (['deviceScaleFactor', 'isMobile'].some(key => owns(settings, key) || owns(before, key))) {
    if (viewport?.viewportSize || owns(settings, 'deviceScaleFactor') || owns(settings, 'isMobile')) {
      await applyMetrics(host, entry ? record : viewport ?? record, viewport?.viewportSize ?? entry.nativeSize, entry ?? { ...previous, settings: {} });
    } else await record.cdp.send('Emulation.clearDeviceMetricsOverride');
  }
  if (owns(settings, 'userAgent') || owns(before, 'userAgent')) await record.cdp.send('Emulation.setUserAgentOverride', { userAgent: settings.userAgent ?? '' });
  if (owns(settings, 'hasTouch') || owns(before, 'hasTouch')) {
    await record.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: settings.hasTouch ?? false, ...(settings.hasTouch ? { maxTouchPoints: 1 } : {}) });
  }
  record.screenshotFrame = null;
}

export async function setEmulation(host, record, input, signal, { ownedOnly = false } = {}) {
  const settings = input === null ? null : validateEmulation(input);
  if (ownedOnly && !record.pendingEmulationSets && host.emulations.get(record.id)?.record !== record) return;
  record.pendingEmulationSets = (record.pendingEmulationSets ?? 0) + 1;
  try {
    return await withViewportTransaction(record, async () => {
      signal?.throwIfAborted();
      const previous = host.emulations.get(record.id);
      if (ownedOnly && previous?.record !== record) return;
      if (!settings && !previous) return;
      if (record.page.isClosed()) { host.emulations.delete(record.id); return; }
      if (record.dialog || record.nativeDialog) throw new Error('Answer the open JavaScript dialog before changing device emulation.');
      const geometry = await screenshotGeometry(record), viewport = host.viewportOwners.get(record.id);
      const next = settings && Object.keys(settings).length ? {
        record, settings,
        nativeDpr: previous?.nativeDpr ?? viewport?.viewportNativeDpr ?? geometry.devicePixelRatio / geometry.zoom,
        nativeSize: previous?.nativeSize ?? viewport?.viewportNativeSize ?? { width: Math.round(geometry.width * geometry.scale), height: Math.round(geometry.height * geometry.scale) },
      } : null;
      try {
        await apply(host, record, next, previous);
        signal?.throwIfAborted();
        if (next) host.emulations.set(record.id, next); else host.emulations.delete(record.id);
      } catch (error) {
        try { await apply(host, record, previous, next); }
        catch (cleanup) {
          // Retain every potentially modified field so a later stop retries it.
          host.emulations.set(record.id, { ...(previous ?? next), record, settings: { ...next?.settings, ...previous?.settings } });
          throw Object.assign(new AggregateError([error, cleanup], 'Device emulation restoration failed: ' + cleanup.message), {code:'EMULATION_RESTORE_FAILED'});
        }
        throw error;
      }
    });
  } finally { record.pendingEmulationSets--; }
}
