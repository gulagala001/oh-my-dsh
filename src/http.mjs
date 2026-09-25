// Read transport bytes once; chunk boundaries need not align with UTF-8 characters.
export async function readJsonBody(req, { maxBytes = 768000, timeoutMs = 30000 } = {}) {
  const iterator = req.iterator?.({ destroyOnReturn: false }) ?? req[Symbol.asyncIterator]();
  const chunks = []; let bytes = 0, ended = false, timer;
  const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure('读取请求超时', 408)), timeoutMs); timer.unref?.();
  });
  try {
    for (;;) {
      const part = await Promise.race([iterator.next(), deadline]);
      if (part.done) { ended = true; break; }
      const chunk = Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value);
      bytes += chunk.length;
      if (bytes > maxBytes) throw failure('请求正文过大', 413);
      chunks.push(chunk);
    }
    const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    return body.trim() ? JSON.parse(body) : {};
  } finally {
    clearTimeout(timer);
    if (!ended) { try { void iterator.return?.()?.catch?.(() => {}); } catch {} }
  }
}

export function rejectUntrusted(ctx, req, res) {
  const connection = ctx.get?.('connection');
  const status = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : 503;
  if (status === undefined) return false;
  res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); return true;
}
