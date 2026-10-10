import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareVersions, parseVersion, hostAlignedVersion, validateManifest, versionStatus, createVersionService, handleVersionApi, CHECK_INTERVAL_MS, UPDATE_SOURCES, INSTALLED_VERSION, releaseHostVersion } from '../src/version.mjs';

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
  assert.ok(feed.releases.some(r => r.version === pkg.version)); assert.equal(INSTALLED_VERSION, pkg.version);
  assert.equal(feed.versionPolicy, 'dsh-aligned');
  assert.ok(pkg.files.includes('release-manifest.json'));
  assert.equal(feed.releases.find(r => r.version === '1.3.0-alpha.4').severity, 'required');
  const previous = versionStatus('0.1.6-alpha.2.2', feed);
  assert.equal(previous.status, 'update'); assert.equal(previous.latestVersion, previous.releases[0].version);
  assert.equal(previous.severity, 'required');
  assert.equal(versionStatus(pkg.version, feed, { hostVersion: releaseHostVersion(pkg.version) }).severity, 'none');
});


test('DSH-aligned numbering migrates the archived OMD series without reversing SemVer', () => {
  const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release('1.3.0-alpha.9', 'required'), release('0.1.6-alpha.2.1', 'required'), release('1.3.0-alpha.4', 'required'),
  ] });
  assert.equal(compareVersions('1.3.0-alpha.9', '0.1.6-alpha.2.1'), 1);
  assert.equal(feed.releases[0].version, '0.1.6-alpha.2.1');
  assert.equal(versionStatus('1.3.0-alpha.9', feed).status, 'update');
  assert.equal(versionStatus('1.3.0-alpha.9', feed).severity, 'required');
  assert.equal(versionStatus('0.1.6-alpha.2.1', feed).status, 'current');
  assert.deepEqual(versionStatus('0.1.6-alpha.2.1', feed).releases, []);
  assert.equal(versionStatus('0.1.6-alpha.2.2', feed).status, 'ahead');
  const next = validateManifest({ ...feed, releases: [...feed.releases, release('0.1.6-alpha.3.1')] });
  assert.equal(versionStatus('0.1.6-alpha.2.1', next).latestVersion, '0.1.6-alpha.3.1');
  assert.equal(versionStatus('0.1.6-alpha.2.1', next).severity, 'normal');
  assert.throws(() => validateManifest({ ...feed, versionPolicy: 'arbitrary' }));
});

test('host-bound patch numbering succeeds the retired 1.x series and orders host upgrades', () => {
  const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release('1.7.4'), release('0.1.7-rc.2.1'), release('1.6.1'),
  ] });
  assert.equal(compareVersions('1.7.4', '0.1.7-rc.2.1'), 1, 'general SemVer is unchanged');
  assert.equal(feed.releases[0].version, '0.1.7-rc.2.1');
  assert.equal(versionStatus('1.7.4', feed).latestVersion, '0.1.7-rc.2.1');
  assert.equal(versionStatus('1.7.4', feed).status, 'update');
  assert.equal(versionStatus('0.1.7-rc.2.1', feed).status, 'current');
  assert.equal(versionStatus('0.1.7-rc.2.1', feed).severity, 'none');
  assert.equal(versionStatus('0.1.7-rc.2.2', feed).status, 'ahead');
  const next = validateManifest({ ...feed, releases: [...feed.releases,
    release('0.1.7-rc.2.2', 'required'), release('0.1.7-rc.2.10'), release('0.1.7-rc.3.1'),
  ] });
  assert.deepEqual(next.releases.slice(0, 4).map(r => r.version), ['0.1.7-rc.3.1', '0.1.7-rc.2.10', '0.1.7-rc.2.2', '0.1.7-rc.2.1']);
  assert.equal(versionStatus('0.1.7-rc.2.1', next).severity, 'required');
  assert.equal(versionStatus('0.1.7-rc.2.2', next).severity, 'normal');
  assert.equal(versionStatus('0.1.7', next).status, 'ahead');
});

test('stable host releases use valid plugin versions and sort above the same host previews', () => {
  assert.throws(() => parseVersion('0.2.0.1'), /Invalid version/);
  assert.equal(hostAlignedVersion('0.2.0'), '0.2.0-omd.' + INSTALLED_VERSION.split('.omd.')[1]);
  assert.equal(hostAlignedVersion('v0.2.0-rc.1', '1.3.0'), '0.2.0-rc.1.omd.1.3.0');
  assert.equal(hostAlignedVersion('0.2.0+build.1', '1.3.1'), '0.2.0-omd.1.3.1+build.1');
  for (const patch of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => hostAlignedVersion('0.2.0', patch));
  const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release('0.1.7-rc.2.19'), release('0.2.0-rc.1.omd.9'), release('0.2.0-omd.1'),
    release('0.2.0-omd.10'), release('0.2.0-omd.2'), release('0.2.1-rc.1.omd.1'),
  ] });
  assert.deepEqual(feed.releases.map(row => row.version), [
    '0.2.1-rc.1.omd.1', '0.2.0-omd.10', '0.2.0-omd.2', '0.2.0-omd.1', '0.2.0-rc.1.omd.9', '0.1.7-rc.2.19',
  ]);
  const stable = versionStatus('0.2.0-omd.1', feed);
  assert.equal(stable.latestVersion, '0.2.0-omd.10');
  assert.deepEqual(stable.releases.map(row => row.version), ['0.2.0-omd.10', '0.2.0-omd.2']);
  assert.equal(versionStatus('0.2.0-rc.1.omd.9', feed).latestVersion, '0.2.1-rc.1.omd.1');
  assert.equal(versionStatus('0.1.7-rc.2.19', feed).latestVersion, '0.2.1-rc.1.omd.1');
  const final = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [release('0.2.0-rc.1.omd.9'), release('0.2.0-omd.1')] });
  assert.equal(versionStatus('0.2.0-rc.1.omd.9', final).latestVersion, '0.2.0-omd.1');
  assert.equal(versionStatus('0.2.0-rc.1.omd.9', final).status, 'update');
  const major = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [release('1.7.4'), release('0.2.0-omd.1'), release('1.0.0-omd.1')] });
  assert.equal(major.releases[0].version, '1.0.0-omd.1');
  assert.equal(versionStatus('1.7.4', major).latestVersion, '1.0.0-omd.1');
});

 test('prerelease notes remain available when the stable feed does not list this build', async () => {
  const currentVersion = '1.7.0-rc.1', current = release(currentVersion);
  const service = createVersionService({ currentVersion, bundledManifest: manifest(current),
    fetchImpl: async () => jsonResponse(manifest(release('1.6.1'))) });
  const result = await service.check();
  assert.equal(result.status, 'ahead');
  assert.deepEqual(result.currentRelease, current);
  assert.equal(result.releaseNotesUrl, 'https://github.com/gulagala001/oh-my-dsh/releases');
  service.dispose();
});


test('full OMD versions migrate independent 0.3.0 and order feature, patch and host upgrades', () => {
 const versions=['0.2.0-rc.2.omd.0.4.0','0.2.0-rc.2.omd.0.4.1','0.2.0-rc.2.omd.0.5.0','0.2.0-omd.0.5.0'];
 const feed=validateManifest({schema:1,versionPolicy:'dsh-aligned',releases:[release('0.3.0'),...versions.map(v=>release(v))]});
 assert.equal(versionStatus('0.3.0',feed).status,'update');assert.equal(feed.releases[0].version,versions.at(-1));
 assert.deepEqual(feed.releases.slice(0,4).map(r=>r.version),versions.toReversed());
 assert.equal(versionStatus(versions[0],feed).status,'update');
 assert.equal(versionStatus(versions.at(-1),feed).status,'current');
 assert.equal(versionStatus('0.2.1-omd.0.1.0',feed).status,'ahead');
 const bundled=validateManifest(JSON.parse(readFileSync(new URL('../release-manifest.json',import.meta.url))));
 assert.equal(versionStatus('0.3.0',bundled).latestVersion,bundled.releases[0].version);
});

test('running installations select same-host patches and separately explain newer-host releases', async () => {
  const currentVersion = '0.2.0-rc.2.omd.0.5.0';
  const compatible = '0.2.0-rc.2.omd.0.5.1', alpha = '0.2.1-alpha.1.omd.0.5.2';
  const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [release(alpha, 'required'), release(compatible), release(currentVersion)] });
  const service = createVersionService({ currentVersion, bundledManifest: feed, fetchImpl: async () => jsonResponse(feed) });
  const result = await service.check();
  assert.equal(result.latestVersion, compatible);
  assert.equal(result.status, 'update'); assert.equal(result.severity, 'normal');
  assert.deepEqual(result.releases.map(r => r.version), [compatible]);
  assert.equal(result.hostVersion, '0.2.0-rc.2');
  assert.equal(result.hostUpgrade.version, alpha);
  assert.equal(result.hostUpgrade.requiredHostVersion, '0.2.1-alpha.1');
  service.dispose();
  const installed = versionStatus(compatible, feed, { hostVersion: '0.2.0-rc.2' });
  assert.equal(installed.status, 'current'); assert.equal(installed.latestVersion, compatible);
  assert.equal(installed.severity, 'none'); assert.deepEqual(installed.releases, []);
  const nativeAlpha = createVersionService({ currentVersion: '0.2.1-alpha.1.omd.0.5.1', bundledManifest: feed, fetchImpl: async () => jsonResponse(feed) });
  const newer = await nativeAlpha.check(); assert.equal(newer.latestVersion, alpha); assert.equal(newer.status, 'update');
  assert.equal(newer.hostUpgrade, undefined); nativeAlpha.dispose();
});

test('mixed OMD numbering compares the host before the revision format', () => {
  const olderHost = '0.2.0-rc.2.omd.0.11.0';
  const newerLegacyHost = '0.2.1-omd.1';
  const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release(olderHost), release(newerLegacyHost, 'required'),
  ] });
  assert.deepEqual(feed.releases.map(row => row.version), [newerLegacyHost, olderHost]);
  const installed = versionStatus(olderHost, feed, { hostVersion: '0.2.0-rc.2' });
  assert.equal(installed.status, 'current');
  assert.equal(installed.latestVersion, olderHost);
  assert.equal(installed.severity, 'none');
  assert.equal(installed.hostUpgrade.version, newerLegacyHost);
  assert.equal(installed.hostUpgrade.requiredHostVersion, '0.2.1');
  assert.equal(versionStatus(newerLegacyHost, feed, { hostVersion: '0.2.1' }).hostUpgrade, undefined);

  const sameHost = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release('0.2.0-rc.2.omd.20'), release(olderHost),
    release('0.2.0-rc.2.omd.0.11.1'), release('0.2.0-rc.2.omd.0.12.0'),
  ] });
  assert.deepEqual(sameHost.releases.map(row => row.version), [
    '0.2.0-rc.2.omd.0.12.0', '0.2.0-rc.2.omd.0.11.1', olderHost, '0.2.0-rc.2.omd.20',
  ]);
  assert.equal(versionStatus('0.2.0-rc.2.omd.20', sameHost).latestVersion, '0.2.0-rc.2.omd.0.12.0');
});

test('archived independent versions and mixed host formats have a consistent migration order', () => {
  const expected = ['0.2.1-omd.1', '0.2.0-rc.2.omd.0.11.0', '0.3.0'];
  for (const a of expected) for (const b of expected) for (const c of expected) {
    if (new Set([a, b, c]).size !== 3) continue;
    const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [a, b, c].map(v => release(v)) });
    assert.deepEqual(feed.releases.map(r => r.version), expected);
    const status = versionStatus('0.3.0', feed);
    assert.equal(status.status, 'update');
    assert.equal(status.latestVersion, expected[0]);
    assert.equal(status.releases[0].version, status.latestVersion);
  }
  for (const retired of ['0.2.0', '0.2.1', '0.2.2', 'v0.3.0+build.2']) {
    const feed = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
      release(retired), release(expected[1]), release(expected[0]),
    ] });
    assert.equal(feed.releases[0].version, expected[0]);
    assert.equal(versionStatus(retired, feed).latestVersion, expected[0]);
    const historical = validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
      release('0.1.7-rc.2.20', 'required'), release('1.7.4', 'required'), release(retired),
    ] });
    const archived = versionStatus(retired, historical);
    assert.equal(archived.status, 'current');
    assert.equal(archived.latestVersion, retired);
    assert.equal(archived.severity, 'none');
    assert.deepEqual(archived.releases, []);
  }
  assert.throws(() => validateManifest({ schema: 1, versionPolicy: 'dsh-aligned', releases: [
    release('0.3.0'), release(expected[1]), release(expected[0]), release('v0.3.0+build.2'),
  ] }), /Duplicate release version/);
});
