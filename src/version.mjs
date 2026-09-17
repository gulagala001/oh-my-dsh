import { readFileSync } from 'node:fs';

export const RELEASE_NOTES_URL = 'https://github.com/gulagala001/oh-my-dsh/blob/main/CHANGELOG.md';
export const UPDATE_SOURCES = Object.freeze([
  'https://raw.githubusercontent.com/gulagala001/oh-my-dsh/main/release-manifest.json',
  'https://api.github.com/repos/gulagala001/oh-my-dsh/contents/release-manifest.json?ref=main',
]);
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 5 * 60 * 1000, MANUAL_GAP_MS = 30000, MAX_BYTES = 256 * 1024;

export function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 128) throw Error('Invalid version');
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!m) throw Error('Invalid version');
  const pre = m[4]?.split('.') || [];
  if (pre.some(x => /^\d+$/.test(x) && x.length > 1 && x.startsWith('0'))) throw Error('Invalid prerelease');
  return { core: m.slice(1, 4).map(BigInt), pre };
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b), cmp = (u, v) => u < v ? -1 : u > v ? 1 : 0;
  for (let i = 0; i < 3; i++) { const c = cmp(x.core[i], y.core[i]); if (c) return c; }
  if (!x.pre.length || !y.pre.length) return cmp(!x.pre.length, !y.pre.length);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const u = x.pre[i], v = y.pre[i];
    if (u === undefined || v === undefined) return cmp(u !== undefined, v !== undefined);
    const un = /^\d+$/.test(u), vn = /^\d+$/.test(v);
    const c = un && vn ? cmp(BigInt(u), BigInt(v)) : un !== vn ? (un ? -1 : 1) : cmp(u, v);
    if (c) return c;
  }
  return 0;
}
export function validateManifest(value) {
  if (value?.schema !== 1 || !Array.isArray(value.releases) || !value.releases.length || value.releases.length > 500) throw Error('Invalid release manifest');
  const releases = value.releases.map(r => {
    parseVersion(r.version);
    if (!['normal', 'required'].includes(r.severity) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 200
      || !Array.isArray(r.notes) || r.notes.length > 20 || r.notes.some(n => typeof n !== 'string' || n.length > 2000)) throw Error('Invalid release entry');
    return { version: r.version, severity: r.severity, title: r.title, notes: [...r.notes] };
  }).sort((a, b) => compareVersions(b.version, a.version));
  if (releases.some((r, i) => i && compareVersions(releases[i - 1].version, r.version) === 0)) throw Error('Duplicate release version');
  return { schema: 1, releases };
}
export function versionStatus(currentVersion, manifest) {
  const preview = parseVersion(currentVersion).pre.length > 0;
  const eligible = manifest.releases.filter(r => preview || !parseVersion(r.version).pre.length);
  const updates = eligible.filter(r => compareVersions(r.version, currentVersion) > 0);
  return { currentVersion, latestVersion: eligible[0]?.version || null,
    status: updates.length ? 'update' : !eligible.length ? 'unknown' : compareVersions(currentVersion, eligible[0].version) > 0 ? 'ahead' : 'current',
    severity: updates.some(r => r.severity === 'required') ? 'required' : updates.length ? 'normal' : 'none',
    releases: updates, currentRelease: manifest.releases.find(r => compareVersions(r.version, currentVersion) === 0) || null };
}

async function readManifest(response) {
  if (!response.ok) { await response.body?.cancel(); throw Error('Release check failed'); }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw Error('Manifest too large'); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.byteLength;
    if (bytes > MAX_BYTES) throw Error('Manifest too large');
    chunks.push(chunk);
  }
  return validateManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
// Capture the running package, not a file that git pull might change before restart.
export const INSTALLED_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const BUNDLED_MANIFEST = validateManifest(JSON.parse(readFileSync(new URL('../release-manifest.json', import.meta.url), 'utf8')));

export function createVersionService({ currentVersion = INSTALLED_VERSION, bundledManifest = BUNDLED_MANIFEST,
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 3000 } = {}) {
  parseVersion(currentVersion);
  let cached = null, checkedAt = null, lastAttemptAt = null, nextCheckAt = 0, error = null, pending = null;
  const shutdown = new AbortController();
  const snapshot = () => ({ ...(cached ? versionStatus(currentVersion, cached) : {
    currentVersion, latestVersion: null, status: 'unknown', severity: 'none', releases: [],
    currentRelease: bundledManifest.releases.find(r => compareVersions(r.version, currentVersion) === 0) || null,
  }), checkedAt, lastAttemptAt, nextCheckAt, stale: Boolean(error && cached), error, releaseNotesUrl: RELEASE_NOTES_URL });
  function check(force = false) {
    if (pending) return pending;
    const at = now();
    if (shutdown.signal.aborted || (lastAttemptAt !== null && (force ? at - lastAttemptAt < MANUAL_GAP_MS : at < nextCheckAt))) return Promise.resolve(snapshot());
    lastAttemptAt = at;
    pending = (async () => {
      for (const url of UPDATE_SOURCES) {
        try {
          const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'OhMyDSH-UpdateCheck' },
            redirect: 'error', signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeoutMs)]) });
          const manifest = await readManifest(response);
          shutdown.signal.throwIfAborted();
          cached = manifest; checkedAt = now(); nextCheckAt = checkedAt + CHECK_INTERVAL_MS; error = null;
          return snapshot();
        } catch {
          if (shutdown.signal.aborted) return snapshot();
        }
      }
      error = '暂时无法检查更新，请检查网络后重试。'; nextCheckAt = now() + RETRY_INTERVAL_MS;
      return snapshot();
    })().finally(() => { pending = null; });
    return pending;
  }
  return { check, snapshot, dispose: () => shutdown.abort() };
}

export async function handleVersionApi({ req, res, url, service, send }) {
  if (url.pathname !== '/trisoul-x/api/version') return false;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { send(res, 405, { error: '版本信息仅支持读取' }); return true; }
  const result = await service.check(url.searchParams.get('refresh') === '1');
  send(res, 200, result); return true;
}
