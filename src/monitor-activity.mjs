import { createHash } from 'node:crypto';

const fingerprints = new WeakMap();

// Only detached archive data is immutable. Live rings keep content-based checks.
export function readonlyMonitorActivity(activity) {
  if (!activity || typeof activity !== 'object') return activity;
  const pending = [activity];
  while (pending.length) {
    const value = pending.pop();
    for (const child of Object.values(value)) if (child && typeof child === 'object') pending.push(child);
    Object.freeze(value);
  }
  fingerprints.set(activity, null);
  return activity;
}

export function monitorActivityFingerprint(activity) {
  const cached = fingerprints.get(activity);
  if (cached) return cached;
  const signature = createHash('sha256').update(JSON.stringify(activity)).digest('hex');
  if (fingerprints.has(activity)) fingerprints.set(activity, signature);
  return signature;
}
