const labelText = value => typeof value === 'string' ? value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 160) : '';

// A display-only snapshot of the tool's target. Never retain a control handle,
// application path, URL credentials, query string or fragment in this cache.
export function computerPresentationTarget(target) {
  if (!target || !['app', 'tab'].includes(target.kind)) return null;
  let origin;
  if (target.kind === 'tab' && typeof target.url === 'string') {
    try { const url = new URL(target.url); if (['https:', 'http:'].includes(url.protocol)) origin = url.origin; } catch {}
  }
  return { kind: target.kind, label: labelText(target.kind === 'app' ? target.name : target.title) || (origin ? new URL(origin).hostname : target.kind === 'app' ? '应用' : '网页'), ...(origin ? { origin } : {}) };
}

export function validComputerPresentationTarget(target) {
  if (!target || !['app', 'tab'].includes(target.kind) || typeof target.label !== 'string'
    || !target.label || target.label !== labelText(target.label)
    || Object.keys(target).some(key => !['kind', 'label', 'origin'].includes(key))) return false;
  if (target.origin === undefined) return true;
  if (target.kind !== 'tab' || typeof target.origin !== 'string') return false;
  try { const url = new URL(target.origin); return ['http:', 'https:'].includes(url.protocol) && url.origin === target.origin; } catch { return false; }
}
