export const siteToolsPolicyKey = 'browser-site-tools-policy';
export const defaultSiteToolsPolicy = Object.freeze({ enabled: true, rules: {} });

export function parseSitePattern(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const wildcard = /^https?:\/\/\*\./.test(value);
    const url = new URL(wildcard ? value.replace('://*.', '://') : value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || url.hostname.includes('*')) return null;
    return `${url.protocol}//${wildcard ? '*.' : ''}${url.host}`;
  } catch { return null; }
}

export function validSiteToolsPolicy(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && typeof value.enabled === 'boolean' &&
    value.rules != null && typeof value.rules === 'object' && !Array.isArray(value.rules) && Object.keys(value.rules).length <= 1000 &&
    Object.entries(value.rules).every(([pattern, allowed]) => parseSitePattern(pattern) === pattern && typeof allowed === 'boolean');
}

export function siteToolsAllowed(policy = defaultSiteToolsPolicy, value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  let allowed = false;
  for (const [pattern, decision] of Object.entries(policy.rules ?? {})) {
    const wildcard = pattern.includes('://*.');
    const rule = new URL(pattern.replace('://*.', '://'));
    const matches = url.protocol === rule.protocol && url.port === rule.port &&
      (url.hostname === rule.hostname || wildcard && url.hostname.endsWith(`.${rule.hostname}`));
    if (!matches) continue;
    if (!decision) return false;
    allowed = true;
  }
  return allowed || policy.enabled !== false;
}
