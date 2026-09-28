import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const inside = (root, file) => { const part = relative(root, file); return !part || (!part.startsWith('..') && !isAbsolute(part)); };

// A plain static origin: no Markdown middleware, host runtime, browser profile, or credentials.
export async function staticSite(t, root, { basePath = '/' } = {}) {
  root = await realpath(resolve(root));
  if (!/^\/(?:[^/?#%]+\/)*$/.test(basePath) || basePath.split('/').some(part => part === '.' || part === '..')) throw new Error('Static basePath must be an absolute directory path');
  const mount = basePath.slice(0, -1);
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end('Method not allowed'); return; }
      const url = new URL(request.url, 'http://localhost');
      if (mount && url.pathname === mount) { response.writeHead(301, { location: basePath + url.search }).end(); return; }
      if (!url.pathname.startsWith(basePath)) { response.writeHead(404).end('Not found'); return; }
      const pathname = '/' + decodeURIComponent(url.pathname.slice(basePath.length));
      if (pathname.includes('\0')) { response.writeHead(400).end('Invalid path'); return; }
      let file = resolve(root, '.' + pathname);
      if (!inside(root, file)) { response.writeHead(404).end('Not found'); return; }
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith('/')) { response.writeHead(301, { location: url.pathname + '/' + url.search }).end(); return; }
        file = join(file, 'index.html');
      }
      file = await realpath(file);
      if (!inside(root, file)) { response.writeHead(404).end('Not found'); return; }
      const content = await readFile(file);
      response.writeHead(200, { 'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': content.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) { response.writeHead(error instanceof URIError ? 400 : 404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}${mount}`;
}
