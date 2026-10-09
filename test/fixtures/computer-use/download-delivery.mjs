import { createServer } from 'node:http';

// A real browser download endpoint. No host attachment or tool result is seeded.
export async function downloadDeliveryFixture() {
  const bytes = Buffer.from('OMD_DOWNLOAD_DELIVERY\n中文与文件字节必须保持一致。\n');
  const pending = new Set();
  let releaseSlow, failBroken, brokenFailed = false;
  const server = createServer((req, res) => {
    // Chromium may retry an interrupted download. The source remains gone,
    // rather than accidentally creating another never-ending partial body.
    if (req.url === '/broken' && brokenFailed) { res.writeHead(410); res.end('download source unavailable'); return; }
    if (req.url === '/download') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="fixture.txt"', 'Content-Length': bytes.length });
      res.end(bytes);
    } else if (req.url === '/slow' || req.url === '/broken') {
      const slowBytes = Buffer.alloc(128 * 1024, 0x61);
      slowBytes.write('CANCELLED_DOWNLOAD_MUST_NOT_BE_DELIVERED\n');
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': `attachment; filename="${req.url === '/slow' ? 'slow' : 'broken'}.txt"`, 'Content-Length': slowBytes.length });
      // Send a substantial first chunk so Chromium starts the real download
      // before its body is complete; a tiny chunk may remain in MIME sniffing.
      res.write(slowBytes.subarray(0, 64 * 1024)); pending.add(res);
      res.on('close', () => pending.delete(res));
      if (req.url === '/slow') releaseSlow = () => { res.end(slowBytes.subarray(64 * 1024)); };
      else failBroken = () => { brokenFailed = true; res.destroy(); };
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>OMD 下载交付测试</title><h1>真实下载交付样本</h1><a href="/download" download="fixture.txt">下载交付样本</a><a href="/slow" download="slow.txt">下载取消样本</a><a href="/broken" download="broken.txt">下载失败样本</a>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    bytes, url: `http://127.0.0.1:${server.address().port}`,
    releaseSlow: () => releaseSlow?.(),
    failBroken: () => failBroken?.(),
    close: () => new Promise(resolve => { for (const res of pending) res.destroy(); server.closeAllConnections(); server.close(resolve); }),
  };
}
