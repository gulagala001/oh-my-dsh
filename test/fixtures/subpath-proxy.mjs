import { createServer, request } from 'node:http';
// Model a reverse proxy that strips its public prefix. Browser requests outside
// that prefix fail, so a root-absolute URL cannot accidentally pass this fixture.
export async function subpathProxy(t, origin, prefix) {
  const sockets = new Set(), escaped = [];
  const headers = incoming => ({ ...incoming, host: new URL(origin).host, ...(incoming.origin ? { origin } : {}) });
  const server = createServer((req, res) => {
    if (!req.url.startsWith(prefix)) { escaped.push(req.url); res.writeHead(404).end(); return; }
    const upstream = request(new URL(req.url.slice(prefix.length - 1), origin), { method: req.method, headers: headers(req.headers) }, response => {
      const next = { ...response.headers };
      if (next.location?.startsWith('/')) next.location = prefix.slice(0, -1) + next.location;
      res.writeHead(response.statusCode, next); response.pipe(res);
    });
    upstream.on('error', () => res.destroy()); req.on('aborted', () => upstream.destroy()); res.on('close', () => upstream.destroy()); req.pipe(upstream);
  });
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith(prefix)) { escaped.push(req.url); socket.destroy(); return; }
    const upstream = request(new URL(req.url.slice(prefix.length - 1), origin), { headers: headers(req.headers) });
    upstream.on('upgrade', (res, target, targetHead) => {
      socket.write(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n` + Object.entries(res.headers).map(([k,v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (targetHead.length) socket.write(targetHead); if (head.length) target.write(head);
      socket.on('error', () => target.destroy()); target.on('error', () => socket.destroy()); socket.on('close', () => target.destroy());
      target.pipe(socket); socket.pipe(target);
    });
    upstream.on('error', () => socket.destroy()); upstream.end();
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return { url: `http://127.0.0.1:${server.address().port}${prefix}`, escaped };
}
