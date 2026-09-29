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

export function sendJson(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    ...(status === 413 || status === 408 ? { Connection: 'close' } : {}) });
  res.end(body);
}
