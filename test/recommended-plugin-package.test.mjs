import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReviewedPackage } from '../src/recommended-plugin-package.mjs';

const asset = 'https://github.com/example/plugin/releases/download/v1.0.0/plugin.tgz';
const api = 'https://api.github.com/repos/example/plugin/releases';
const metadata = { tag_name: 'v1.0.0', assets: [{ id: 17, name: 'plugin.tgz', browser_download_url: asset }] };
const bytes = Buffer.from('reviewed archive');
const sha = createHash('sha256').update(bytes).digest('hex');
const reset = () => new TypeError('fetch failed', { cause: Object.assign(Error('reset'), { code: 'ECONNRESET' }) });

async function fixture(t, respond) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-reviewed-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    return respond(url, options, requests.length);
  });
  return { requests, dir, prepare: (url = asset, signal = new AbortController().signal) => prepareReviewedPackage(url, sha, dir, signal) };
}

test('a reset release download recovers the exact tagged asset and caches verified bytes', async t => {
  const f = await fixture(t, (url, options) => {
    if (url === asset) throw reset();
    if (url === api + '/tags/v1.0.0') return Response.json(metadata);
    assert.equal(url, api + '/assets/17');
    assert.equal(options.headers.Accept, 'application/octet-stream');
    return new Response(bytes);
  });
  const spec = await f.prepare();
  assert.deepEqual(await readFile(spec.slice(5)), bytes);
  assert.equal(await f.prepare(), spec);
  assert.deepEqual(f.requests, [asset, asset, api + '/tags/v1.0.0', api + '/assets/17']);
});

test('a broken npm response body retries from byte zero at the same pinned URL', async t => {
  const npm = 'https://registry.npmjs.org/plugin/-/plugin-1.0.0.tgz';
  const f = await fixture(t, (_url, _options, count) => count === 2 ? new Response(bytes) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(Buffer.from('partial')); },
    pull(controller) { controller.error(reset()); },
  })));
  assert.deepEqual(await readFile((await f.prepare(npm)).slice(5)), bytes);
  assert.deepEqual(f.requests, [npm, npm]);
});

test('foreign metadata, unverifiable bytes and permanent HTTP errors never enter the cache', async t => {
  for (const [name, responses, error] of [
    ['wrong tag', [reset(), reset(), Response.json({ ...metadata, tag_name: 'v2.0.0' })], /固定发行/],
    ['wrong asset', [reset(), reset(), Response.json({ ...metadata, assets: [{ ...metadata.assets[0], browser_download_url: asset + '.other' }] })], /固定发行/],
    ['corrupt fallback', [reset(), reset(), Response.json(metadata), new Response('wrong bytes')], /SHA-256/],
    ['missing direct asset', [new Response(null, { status: 404 })], /github\.com.*HTTP 404/],
    ['unreachable API', [reset(), reset(), reset(), reset()], /api\.github\.com.*ECONNRESET/],
  ]) await t.test(name, async t => {
    const f = await fixture(t, (_url, _options, count) => {
      const result = responses[count - 1];
      assert.ok(result, 'unexpected extra request');
      if (result instanceof Error) throw result;
      return result;
    });
    await assert.rejects(f.prepare(), error);
    assert.equal(f.requests.length, responses.length);
    assert.deepEqual(await readdir(f.dir), []);
  });
});

test('cancelling a failed download prevents any recovery request', async t => {
  const abort = new AbortController();
  const f = await fixture(t, () => { abort.abort(Error('stop install')); throw reset(); });
  await assert.rejects(f.prepare(asset, abort.signal), /stop install/);
  assert.deepEqual(f.requests, [asset]);
});
