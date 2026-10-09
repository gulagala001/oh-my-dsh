import { readFileSync } from 'node:fs';

export const RELEASE_NOTES_URL = 'https://github.com/gulagala001/oh-my-dsh/releases';
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
// Stable host versions need a named suffix: a fourth numeric core is not SemVer.
export function hostAlignedVersion(hostVersion, omdVersion = alignedRelease(INSTALLED_VERSION)?.omd) {
  const host = parseVersion(hostVersion);
  if (typeof omdVersion !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(omdVersion)) throw Error('OMD version must contain major, feature and patch numbers');
  const [base, build] = hostVersion.replace(/^v/, '').split('+');
  return base + (host.pre.length ? '.omd.' : '-omd.') + omdVersion + (build ? '+' + build : '');
}
function alignedRelease(version) {
  const parsed = parseVersion(version), parts = [...parsed.pre];
  let patch;
  const marker = parts.lastIndexOf('omd');
  if (marker >= 0 && parts.length - marker === 4 && parts.slice(marker + 1).every(x => /^(0|[1-9]\d*)$/.test(x))) {
    const omd = parts.splice(marker + 1).join('.'); parts.pop();
    return { host: parsed.core.join('.') + (parts.length ? '-' + parts.join('.') : ''), omd, patch: 0n, preview: parts.length > 0 };
  }
  if (parts.length >= 2 && parts.at(-2) === 'omd' && /^[1-9]\d*$/.test(parts.at(-1))) {
    patch = parts.pop(); parts.pop();
  } else if (parsed.core[0] === 0n && parts.length >= 3 && /^(alpha|beta|rc)$/.test(parts[0]) && /^[1-9]\d*$/.test(parts.at(-1))) {
    patch = parts.pop();
  } else return null;
  return { host: parsed.core.join('.') + (parts.length ? '-' + parts.join('.') : ''), patch: BigInt(patch), preview: parts.length > 0 };
}
export const releaseHostVersion = version => alignedRelease(version)?.host || null;
export function updateHostRequirement(currentVersion, targetVersion, hostVersion = releaseHostVersion(currentVersion)) {
  const required = releaseHostVersion(targetVersion);
  return hostVersion && required && compareVersions(hostVersion, required) !== 0
    ? { hostVersion, requiredHostVersion: required } : null;
}
const releaseIsPreview = (version, policy) => policy === 'dsh-aligned'
  ? (alignedRelease(version)?.preview ?? parseVersion(version).pre.length > 0)
  : parseVersion(version).pre.length > 0;
// OMD's historical 1.3.0-alpha.N series predates the DSH-aligned release
// numbering. Reserve that archived series only; general SemVer stays unchanged.
const legacyPreview = version => /^v?1\.3\.0-alpha\.\d+(?:\+[^ ]+)?$/.test(version);
// After 1.7.4, OMD follows the full host version plus a patch suffix, starting
// at 0.1.7-rc.2.1. Only release-feed ordering crosses this numbering boundary.
const retiredIndependentVersions = new Set(['0.2.0', '0.2.1', '0.2.2', '0.3.0']);
const retiredIndependent = version => {
  const parsed = parseVersion(version);
  return !alignedRelease(version) && !parsed.pre.length && retiredIndependentVersions.has(parsed.core.join('.'));
};
const legacyIndependent = version => !alignedRelease(version) && parseVersion(version).core[0] === 1n && compareVersions(version, '1.7.4') <= 0;
const hostBound = version => alignedRelease(version) !== null
  ? compareVersions(alignedRelease(version).host, '0.1.7-rc.2') >= 0
  : !retiredIndependent(version) && parseVersion(version).core[0] === 0n && compareVersions(version, '0.1.7-rc.2.1') >= 0;
// These are historical numbering transitions, not supported-host boundaries.
// Compare one family key before host/revision keys so archived formats cannot
// create a comparison cycle or turn a migration into an older release.
function releaseEra(version, aligned) {
  if (legacyPreview(version)) return 0;
  if (aligned) return compareVersions(aligned.host, '0.1.7-rc.2') < 0 ? 1
    : compareVersions(aligned.host, '0.2.0-rc.2') < 0 ? 3 : 5;
  const parsed = parseVersion(version);
  if (legacyIndependent(version)) return 2;
  if (parsed.core[0] === 0n) return parsed.core[1] < 2n
    ? compareVersions(version, '0.1.7-rc.2') < 0 ? 1 : 3
    : parsed.core[1] < 4n ? 4 : 6;
  return 6;
}
function releaseCompare(a, b, policy) {
  if (policy === 'dsh-aligned') {
    const left = alignedRelease(a), right = alignedRelease(b);
    const era = releaseEra(a, left) - releaseEra(b, right);
    if (era) return Math.sign(era);
    const hostOrder = compareVersions(left?.host || a, right?.host || b);
    if (hostOrder) return hostOrder;
    if (left && right) {
      if (Boolean(left.omd) !== Boolean(right.omd)) return left.omd ? 1 : -1;
      return (left.omd && right.omd ? compareVersions(left.omd, right.omd) : 0) || (left.patch < right.patch ? -1 : left.patch > right.patch ? 1 : 0);
    }
    if (Boolean(left) !== Boolean(right)) return left ? 1 : -1;
  }
  return compareVersions(a, b);
}

export function validateManifest(value) {
  if (value?.schema !== 1 || !Array.isArray(value.releases) || !value.releases.length || value.releases.length > 500) throw Error('Invalid release manifest');
  if (value.versionPolicy !== undefined && value.versionPolicy !== 'dsh-aligned') throw Error('Invalid version policy');
  const policy = value.versionPolicy;
  const identities = new Set();
  const releases = value.releases.map(r => {
    const parsed = parseVersion(r.version);
    const identity = parsed.core.join('.') + (parsed.pre.length ? '-' + parsed.pre.join('.') : '');
    if (identities.has(identity)) throw Error('Duplicate release version');
    identities.add(identity);
    if (!['normal', 'required'].includes(r.severity) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 200
      || !Array.isArray(r.notes) || r.notes.length > 20 || r.notes.some(n => typeof n !== 'string' || n.length > 2000)) throw Error('Invalid release entry');
    return { version: r.version, severity: r.severity, title: r.title, notes: [...r.notes] };
  }).sort((a, b) => releaseCompare(b.version, a.version, policy));
  return { schema: 1, ...(policy ? { versionPolicy: policy } : {}), releases };
}
export function versionStatus(currentVersion, manifest, { hostVersion } = {}) {
  const preview = releaseIsPreview(currentVersion, manifest.versionPolicy);
  const compare = (a, b) => releaseCompare(a, b, manifest.versionPolicy);
  const migrate = manifest.versionPolicy === 'dsh-aligned' && (legacyIndependent(currentVersion) || retiredIndependent(currentVersion));
  const channel = manifest.releases.filter(r => preview || !releaseIsPreview(r.version, manifest.versionPolicy) || migrate && hostBound(r.version));
  const eligible = hostVersion ? channel.filter(r => releaseHostVersion(r.version) && !updateHostRequirement(currentVersion, r.version, hostVersion)) : channel;
  const newerHost = hostVersion && channel.find(r => compare(r.version, currentVersion) > 0 && updateHostRequirement(currentVersion, r.version, hostVersion));
  const updates = eligible.filter(r => compare(r.version, currentVersion) > 0);
  return { currentVersion, latestVersion: eligible[0]?.version || null,
    status: updates.length ? 'update' : !eligible.length ? (channel.length && compare(currentVersion, channel[0].version) > 0 ? 'ahead' : 'unknown') : compare(currentVersion, eligible[0].version) > 0 ? 'ahead' : 'current',
    severity: updates.some(r => r.severity === 'required') ? 'required' : updates.length ? 'normal' : 'none',
    releases: updates, currentRelease: manifest.releases.find(r => compareVersions(r.version, currentVersion) === 0) || null,
    ...(hostVersion ? { hostVersion } : {}),
    ...(newerHost ? { hostUpgrade: { ...newerHost, requiredHostVersion: releaseHostVersion(newerHost.version) } } : {}) };
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
  hostVersion = releaseHostVersion(currentVersion),
  fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 3000 } = {}) {
  parseVersion(currentVersion);
  let cached = null, checkedAt = null, lastAttemptAt = null, nextCheckAt = 0, error = null, pending = null;
  const shutdown = new AbortController();
  const bundledRelease = bundledManifest.releases.find(r => compareVersions(r.version, currentVersion) === 0) || null;
  const snapshot = () => {
    const status = cached ? versionStatus(currentVersion, cached, { hostVersion }) : {
      currentVersion, latestVersion: null, status: 'unknown', severity: 'none', releases: [],
    };
    return { ...status, currentRelease: status.currentRelease ?? bundledRelease,
      checkedAt, lastAttemptAt, nextCheckAt, stale: Boolean(error && cached), error,
      releaseNotesUrl: RELEASE_NOTES_URL };
  };
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
