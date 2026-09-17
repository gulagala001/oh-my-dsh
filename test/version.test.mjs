import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareVersions, parseVersion, validateManifest, versionStatus, createVersionService, handleVersionApi, CHECK_INTERVAL_MS, UPDATE_SOURCES, INSTALLED_VERSION } from '../src/version.mjs';

const release = (version, severity = 'normal') => ({ version, severity, title: 'Release ' + version, notes: ['Verified release notes.'] });
const manifest = (...rows) => validateManifest({ schema: 1, releases: rows });
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('version ordering handles numeric prereleases, stable versions, v-prefix and build metadata', () => {
  const ordered = ['1.3.0-alpha.4', '1.3.0-alpha.9', '1.3.0-alpha.10', '1.3.0-beta', '1.3.0-beta.2', '1.3.0-rc.1', '1.3.0', '1.10.0', '2.0.0'];
  for (let i = 1; i < ordered.length; i++) assert.equal(compareVersions(ordered[i-1], ordered[i]), -1);
  assert.equal(compareVersions('v1.3.0+build.1', '1.3.0+build.20'), 0);
  assert.equal(compareVersions('9007199254740993.0.0', '9007199254740992.0.0'), 1);
  for (const bad of ['1.2', '01.2.3', '1.2.3-alpha.01', '1.2.3-', '1.2.3+']) assert.throws(() => parseVersion(bad));
});

test('uninstalled required fixes remain red even when the newest release is normal', () => {
  const m = manifest(release('1.3.0-alpha.6'), release('1.3.0-alpha.4', 'required'), release('1.3.0-alpha.5'));
  const old = versionStatus('1.3.0-alpha.3', m); assert.equal(old.severity, 'required'); assert.equal(old.latestVersion, '1.3.0-alpha.6');
  assert.equal(versionStatus('1.3.0-alpha.4', m).severity, 'normal');
  assert.equal(versionStatus('1.3.0-alpha.6', m).severity, 'none');
  assert.equal(versionStatus('1.3.0-alpha.7', m).status, 'ahead');
});

test('stable installations are not prompted to upgrade to a preview version', () => {
  const m = manifest(release('1.4.0-alpha.1', 'required'), release('1.3.0'));
  assert.equal(versionStatus('1.3.0', m).status, 'current');
  assert.equal(versionStatus('1.3.0-alpha.4', m).severity, 'required');
});

test('manifest validation rejects malformed entries and strips untrusted navigation fields', () => {
  for (const value of [{ schema: 2, releases: [] }, { schema: 1, releases: [release('bad')] }, { schema: 1, releases: [release('1.0.0', 'urgent')] }, { schema: 1, releases: [release('1.0.0'), release('1.0.0+other')] }]) assert.throws(() => validateManifest(value));
  const value = validateManifest({ schema: 1, releases: [{ ...release('1.0.0'), url: 'javascript:alert(1)' }] });
  assert.equal(value.releases[0].url, undefined);
});

test('background checks are cached, refresh is rate-limited and concurrent reads share one request', async () => {
  let clock = 100, count = 0, finish;
  const m = manifest(release('1.3.0-alpha.6'));
  const service = createVersionService({ currentVersion: '1.3.0-alpha.5', now: () => clock, fetchImpl: () => { count++; return new Promise(resolve => { finish = () => resolve(jsonResponse(m)); }); } });
  const a = service.check(), b = service.check(true); assert.equal(count, 1); finish(); await Promise.all([a, b]);
  assert.equal((await service.check()).severity, 'normal'); await service.check(true); assert.equal(count, 1);
  clock += 30001; const c = service.check(true); finish(); await c; assert.equal(count, 2);
  clock += CHECK_INTERVAL_MS + 1; const d = service.check(); finish(); await d; assert.equal(count, 3); service.dispose();
});

test('network failure is unknown initially and preserves a known required update as stale', async () => {
  let clock = 100, failed = true;
  const service = createVersionService({ currentVersion: '1.3.0-alpha.3', now: () => clock, fetchImpl: async () => { if (failed) throw Error('Offline'); return jsonResponse(manifest(release('1.3.0-alpha.4', 'required'))); } });
  const unknown = await service.check(); assert.equal(unknown.status, 'unknown'); assert.equal(unknown.latestVersion, null); assert.ok(unknown.error); assert.equal(unknown.checkedAt, null);
  clock += 30001; failed = false; const good = await service.check(true); assert.equal(good.severity, 'required');
  clock += 30001; failed = true; const stale = await service.check(true); assert.equal(stale.severity, 'required'); assert.equal(stale.stale, true); assert.equal(stale.checkedAt, good.checkedAt); service.dispose();
});

test('fallback uses only fixed official URLs without session content or credentials', async () => {
  const requests = [];
  const service = createVersionService({ currentVersion: '1.3.0-alpha.5', fetchImpl: async (url, options) => {
    requests.push({ url, options }); return requests.length === 1 ? new Response('Not found', { status: 404 }) : jsonResponse(manifest(release('1.3.0-alpha.5')));
  } });
  assert.equal((await service.check()).status, 'current'); assert.deepEqual(requests.map(r => r.url), UPDATE_SOURCES);
  assert.ok(requests.every(r => r.options.redirect === 'error' && !r.options.body && !r.options.headers.Authorization && !r.options.headers.Cookie)); service.dispose();
});

test('oversized manifests and invalid JSON fail without pretending to be current', async () => {
  for (const content of ['x'.repeat(270000), '{not-json']) {
    const service = createVersionService({ fetchImpl: async () => new Response(content) });
    const result = await service.check(); assert.equal(result.status, 'unknown'); assert.ok(result.error); service.dispose();
  }
});

test('disposal aborts in-flight checks and never retries after unload', async () => {
  let count = 0;
  const service = createVersionService({ fetchImpl: (url, { signal }) => { count++; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  const promise = service.check(); service.dispose(); await promise; await service.check(true); assert.equal(count, 1);
});

test('version API is read-only, bypasses no caches on ordinary read and disables browser caching', async () => {
  const flags = [], headers = {}, sendCalls = [];
  const common = { res: { setHeader: (k,v) => { headers[k] = v; } }, service: { check: async force => { flags.push(force); return { currentVersion: '1.2.3' }; } }, send: (...args) => sendCalls.push(args) };
  assert.equal(await handleVersionApi({ ...common, req: { method: 'GET' }, url: new URL('http://local/other') }), false);
  await handleVersionApi({ ...common, req: { method: 'POST' }, url: new URL('http://local/trisoul-x/api/version') }); assert.equal(sendCalls.at(-1)[1], 405);
  await handleVersionApi({ ...common, req: { method: 'GET' }, url: new URL('http://local/trisoul-x/api/version') });
  await handleVersionApi({ ...common, req: { method: 'GET' }, url: new URL('http://local/trisoul-x/api/version?refresh=1') });
  assert.deepEqual(flags, [false, true]); assert.equal(headers['Cache-Control'], 'no-store');
});

test('published manifest matches the installed package and retains the major-fix marker', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const feed = validateManifest(JSON.parse(readFileSync(new URL('../release-manifest.json', import.meta.url))));
  assert.equal(feed.releases[0].version, pkg.version); assert.equal(INSTALLED_VERSION, pkg.version);
  assert.ok(pkg.files.includes('release-manifest.json'));
  assert.equal(feed.releases.find(r => r.version === '1.3.0-alpha.4').severity, 'required');
});
