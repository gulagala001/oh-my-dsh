import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseTarget, catalogEntry, marketState, inspectMarketRelease } from '../scripts/check-market-release.mjs';

const pkg = { name: 'oh-my-dsh', version: '0.2.1-rc.5.omd.1.3.0', repository: { url: 'git+https://github.com/example/oh-my-dsh.git' }, engines: { dsh: '0.2.1-rc.5' } };
const target = releaseTarget(pkg);
const old = target.url.replaceAll('1.3.0', '1.2.2');
const source = `url: https://github.com/${target.repository}\nname: example/oh-my-dsh\ncategory: workflow\ndescription:\n  en: "Useful plugin."\ntarball: ${old}\n`;
const metadata = { schema: 1, name: pkg.name, version: pkg.version, hostVersion: pkg.engines.dsh, file: target.filename, filename: target.filename, sha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40) };

test('the proposal changes only the existing fixed tarball and rejects foreign/drifting sources', () => {
  const entry = catalogEntry(source, target);
  assert.equal(entry.proposedEntry, source.replace(old, target.url));
  for (const value of [source.replace('/example/oh-my-dsh/releases/', '/other/plugin/releases/'), source.replace('/download/v0.2.1-rc.5.omd.1.2.2/', '/latest/download/'), source + `tarball: ${old}\n`])
    assert.throws(() => catalogEntry(value, target));
  assert.throws(() => catalogEntry(source.replace('url: https://github.com/example/', 'url: https://github.com/other/'), target));
});

test('released, submitted, merged and publicly effective are separate facts', () => {
  const entry = catalogEntry(source, target), args = { target, entry, previousHost: target.hostVersion, liveEntry: { tarball: old } };
  assert.equal(marketState(args), 'needs-entry-update');
  assert.equal(marketState({ ...args, pending: [{ number: 1 }] }), 'awaiting-review');
  assert.equal(marketState({ ...args, entry: { tarball: target.url } }), 'awaiting-catalog');
  assert.equal(marketState({ ...args, entry: { tarball: target.url }, liveEntry: { tarball: target.url } }), 'installation-synced');
  assert.equal(marketState({ ...args, entry: { tarball: target.url }, catalogAvailable: false }), 'catalog-unavailable');
  for (const previousHost of [null, '0.2.1-rc.3']) assert.equal(marketState({ ...args, previousHost }), 'needs-host-review');
});

function fixture({ pending = false, digest = 'sha256:' + metadata.sha256, previousHost = target.hostVersion, unavailable = false } = {}) {
  const reads = [];
  return { reads, now: () => '2026-10-31T00:00:00.000Z',
    async json(url) {
      reads.push(url);
      if (url.includes('/releases/tags/')) return { draft: false, prerelease: false, tag_name: target.tag, html_url: 'https://github.com/example/oh-my-dsh/releases/tag/' + target.tag,
        assets: [{ name: target.filename, state: 'uploaded', browser_download_url: target.url, digest }] };
      if (url.endsWith('/metadata.json')) return url.includes('1.3.0') ? metadata : { hostVersion: previousHost };
      if (url.includes('/search/issues')) return { total_count: pending ? 1 : 0, items: pending ? [{ number: 42, html_url: 'https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/42' }] : [] };
      if (url.endsWith('/pulls/42')) return { head: { repo: { full_name: 'example/awesome-dsh-plugin' }, ref: 'update-own-entry', sha: 'c'.repeat(40) } };
      if (unavailable) throw Error('catalog offline');
      return { updated: '2026-10-30', plugins: [{ url: 'https://github.com/' + target.repository, tarball: old, version: null }] };
    },
    async text(url) { reads.push(url); return url.includes('c'.repeat(40)) ? source.replace(old, target.url) : source; },
  };
}

test('checks the published asset digest and preserves a reusable pending pull request', async () => {
  const first = fixture(), result = await inspectMarketRelease(pkg, first);
  assert.equal(result.status, 'needs-entry-update');
  assert.equal(result.proposedEntry, source.replace(old, target.url));
  const waiting = await inspectMarketRelease(pkg, fixture({ pending: true }));
  assert.equal(waiting.status, 'awaiting-review');
  assert.equal(waiting.pending[0].head, 'update-own-entry');
  await assert.rejects(inspectMarketRelease(pkg, fixture({ digest: 'sha256:' + 'd'.repeat(64) })), /digest/);
});

test('a host change cannot silently replace a fixed install entry; a read failure is not synchronization', async () => {
  const different = await inspectMarketRelease(pkg, fixture({ previousHost: '0.2.1-rc.3' }));
  assert.equal(different.status, 'needs-host-review'); assert.equal(different.proposedEntry, null);
  const failed = await inspectMarketRelease(pkg, fixture({ unavailable: true }));
  assert.equal(failed.catalog.error, 'catalog offline'); assert.equal(failed.catalog.tarball, null);
});
