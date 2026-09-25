import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJsonBody, rejectUntrusted } from '../src/http.mjs';

test('JSON body preserves UTF-8 at every split and refuses oversized or malformed input', async () => {
  const value = { path: '中文路径/项目/😀.json', enabled: true }, bytes = Buffer.from(JSON.stringify(value));
  for (let i = 0; i <= bytes.length; i++) assert.deepEqual(await readJsonBody(Readable.from([bytes.subarray(0, i), bytes.subarray(i)])), value);
  await assert.rejects(readJsonBody(Readable.from([bytes]), { maxBytes: bytes.length - 1 }), e => e.statusCode === 413);
  await assert.rejects(readJsonBody(Readable.from([Buffer.from([0xff])])));
  await assert.rejects(readJsonBody(Readable.from(['{bad'])));
  assert.deepEqual(await readJsonBody(Readable.from([])), {});
});

test('body deadlines and absent authentication fail closed', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(readJsonBody((async function* () { await new Promise(() => {}); })(), { timeoutMs: 5 }), e => e.statusCode === 408); }
  finally { clearTimeout(keepAlive); }
  for (const rejection of [401, 403, undefined, 'missing']) {
    const ctx = { get: () => rejection === 'missing' ? undefined : { requestRejection: () => rejection } };
    let status, ended = false;
    const denied = rejectUntrusted(ctx, {}, { writeHead: s => { status = s; }, end: () => { ended = true; } });
    assert.equal(denied, rejection !== undefined); assert.equal(ended, denied);
    assert.equal(status, rejection === 'missing' ? 503 : rejection);
  }
});
