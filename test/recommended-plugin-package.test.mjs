import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReviewedPackage } from '../src/recommended-plugin-package.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'omd-reviewed-package-'));
  const bytes = Buffer.from('reviewed package'), sha256 = createHash('sha256').update(bytes).digest('hex');
  const original = globalThis.fetch, controller = new AbortController(); let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(bytes); };
  t.after(async () => { globalThis.fetch = original; await rm(directory, { recursive: true, force: true }); });
  return { directory, bytes, sha256, controller, get requests() { return requests; },
    prepare: () => prepareReviewedPackage('https://example.com/plugin.tgz', sha256, directory, controller.signal) };
}

test('reviewed archive is pinned, retained and reverified before reuse', async t => {
  const f = await fixture(t), spec = await f.prepare();
  assert.equal(spec, 'file:' + join(f.directory, f.sha256 + '.tgz'));
  assert.deepEqual(await readFile(spec.slice(5)), f.bytes);
  assert.equal(await f.prepare(), spec); assert.equal(f.requests, 1);
  await writeFile(spec.slice(5), 'damaged cache');
  assert.equal(await f.prepare(), spec); assert.equal(f.requests, 2);
  assert.deepEqual(await readFile(spec.slice(5)), f.bytes);
  assert.deepEqual(await readdir(f.directory), [f.sha256 + '.tgz']);
});

test('checksum mismatch, HTTP failure and cancellation never save an installable archive', async t => {
  const f = await fixture(t);
  globalThis.fetch = async () => new Response('different bytes');
  await assert.rejects(f.prepare(), /SHA-256/);
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(f.prepare(), /HTTP 404/);
  globalThis.fetch = async () => { f.controller.abort(); return new Response(f.bytes); };
  await assert.rejects(f.prepare(), { name: 'AbortError' });
  assert.deepEqual(await readdir(f.directory), []);
  await assert.rejects(f.prepare(), { name: 'AbortError' });
});

test('oversized responses and invalid review configuration are refused', async t => {
  const f = await fixture(t);
  globalThis.fetch = async () => new Response(Buffer.alloc(32 * 1024 * 1024 + 1));
  await assert.rejects(f.prepare(), /大小限制/);
  await assert.rejects(prepareReviewedPackage('https://example.com', '../bad', f.directory, f.controller.signal), /无效/);
  await assert.rejects(prepareReviewedPackage('https://example.com', f.sha256, undefined, f.controller.signal), /无效/);
  assert.deepEqual(await readdir(f.directory), []);
});

test('HTTP download failures release the response stream so retry does not leave an active transfer', async t => {
  const realFetch = globalThis.fetch;
  const f = await fixture(t);
  let cancelled = false;
  // Keep a real HTTP error body open: only cancellation ends this response.
  const server = createServer((req, res) => {
    res.on('close', () => { cancelled = true; });
    res.writeHead(503); res.write('fixture unavailable');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  // The fixture installed a deterministic fetch stub; use the real transport
  // only for this local server, with the same signal passed by production.
  globalThis.fetch = realFetch;
  await assert.rejects(prepareReviewedPackage(`http://127.0.0.1:${server.address().port}/plugin.tgz`, f.sha256, f.directory, f.controller.signal), /HTTP 503/);
  const deadline = Date.now() + 1000;
  while (!cancelled && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(cancelled, true, 'the failed request must not keep its response body running until timeout');
  assert.deepEqual(await readdir(f.directory), []);
  globalThis.fetch = async () => new Response(f.bytes);
  const recovered = await f.prepare();
  assert.deepEqual(await readFile(recovered.slice(5)), f.bytes);
});
