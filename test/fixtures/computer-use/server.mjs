import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

export async function startFixture() {
  const page = await readFile(new URL('./page.html', import.meta.url));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url === '/frame' ? '<label>框架输入<input aria-label="框架输入"></label>' : page);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
