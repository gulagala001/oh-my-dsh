import test from 'node:test';
import assert from 'node:assert/strict';
import { rejectUntrusted } from '../src/http.mjs';

test('HTTP authentication fails closed when the connection service is unavailable', () => {
  for (const rejection of [401, 403, undefined, 'missing']) {
    const ctx = { get: () => rejection === 'missing' ? undefined : { requestRejection: () => rejection } };
    let status, ended = false;
    const denied = rejectUntrusted(ctx, {}, { writeHead: s => { status = s; }, end: () => { ended = true; } });
    assert.equal(denied, rejection !== undefined); assert.equal(ended, denied);
    assert.equal(status, rejection === 'missing' ? 503 : rejection);
  }
});

test('attachment responses retain native bytes, isolation headers and download names', async () => {
  const { Writable } = await import('node:stream');
  const { sendAttachment } = await import('../src/http.mjs');
  for (const type of ['image', 'file']) {
    const bytes = Buffer.from([0, 255, 1, 128]), ref = { name: '中文 文件.html', mediaType: 'image/png' };
    const chunks = [], headers = {};
    const res = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    res.setHeader = (key, value) => { headers[key] = value; };
    const attachments = { async readImage(actual) { assert.equal(actual, ref); return { data: bytes }; },
      async *readFileStream(actual) { assert.equal(actual, ref); yield bytes; } };
    await sendAttachment({ attachments }, res, { type, attachment: ref });
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Security-Policy'], "default-src 'none'; sandbox");
    assert.equal(headers['Cache-Control'], 'private, max-age=3600');
    assert.equal(headers['Content-Type'], type === 'image' ? 'image/png' : 'application/octet-stream');
    assert.equal(headers['Content-Disposition'], type === 'file' ? "attachment; filename*=UTF-8''" + encodeURIComponent(ref.name) : undefined);
  }
  await assert.rejects(sendAttachment({}, {}, null), /原始引用/);
  const res = { setHeader() {} };
  await assert.rejects(sendAttachment({}, res, { type: 'image', attachment: {} }), /图片读取服务不可用/);
  await assert.rejects(sendAttachment({}, res, { type: 'file', attachment: {} }), /附件读取服务不可用/);
});
