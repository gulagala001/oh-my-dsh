import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
export { readJsonBody, sendJson } from '#opencu/src/http.mjs';

export function rejectUntrusted(ctx, req, res) {
  const connection = ctx.get?.('connection');
  const status = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : 503;
  if (status === undefined) return false;
  res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); return true;
}

// The caller resolves the permitted record; this helper only serves its bytes.
export async function sendAttachment(ctx, res, block) {
  const ref = block?.attachment, store = ctx.get?.('attachments') || ctx.attachments;
  if (!ref) throw Error('附件没有可读取的原始引用');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (block.type === 'image') {
    if (!store?.readImage) throw Error('图片读取服务不可用');
    const image = await store.readImage(ref);
    res.setHeader('Content-Type', ref.mediaType || 'application/octet-stream');
    res.end(image.data);
  } else {
    if (!store?.readFileStream) throw Error('附件读取服务不可用');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(ref.name || 'attachment'));
    await streamPipeline(Readable.from(store.readFileStream(ref)), res);
  }
}
