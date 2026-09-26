import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
