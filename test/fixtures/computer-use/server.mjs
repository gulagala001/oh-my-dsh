import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function startFixture(port = 0) {
  const page = await readFile(new URL('./page.html', import.meta.url)), visual = await readFile(new URL('./visual.html', import.meta.url)), geometry = await readFile(new URL('./geometry.html', import.meta.url));
  const navigationRequests = [];
  const server = createServer((req, res) => {
    if (req.url === '/geometry') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(geometry);
    } else if (req.url === '/visual') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(visual);
    } else if (req.url === '/slow-navigation' || req.url === '/slow-navigation?replace') {
      const request = { state: 'started' }; navigationRequests.push(request);
      const timer = setTimeout(() => { request.state = 'completed'; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>Delayed navigation committed</h1>'); }, req.url.includes('?') ? 5000 : 1500);
      timer.unref(); res.once('close', () => { clearTimeout(timer); if (request.state === 'started') request.state = 'cancelled'; });
    } else if (req.url === '/download') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="fixture.txt"' });
      res.end('TRISOUL_COMPUTER_USE_FIXTURE\n');
    } else if (req.url === '/cross-frames') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Cross frame fixture</title><iframe title="跨源外层" src="http://localhost:'+server.address().port+'/cross-middle"></iframe>');
    } else if (req.url === '/cross-middle') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><label>外层输入<input aria-label="外层输入"></label><iframe title="跨源内层" src="http://127.0.0.1:'+server.address().port+'/frame"></iframe>');
    } else if (req.url === '/frame') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<label>框架输入<input aria-label="框架输入"></label><button onclick="this.textContent=\'框架完成\'">框架按钮</button>');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const extra = req.url === '/unsaved' ? '<script>window.onbeforeunload=e=>{e.preventDefault();e.returnValue=""}</script>' : req.url === '/chained-dialog' ? '<script>document.querySelector("#dialog").onclick=()=>{const a=prompt("First","");const b=prompt("Second","");record("chain",[a,b])}</script>' : req.url === '/mousedown-dialog' ? '<script>document.querySelector("#dialog").onclick=null;document.querySelector("#dialog").onmousedown=()=>{const v=prompt("On down","");record("down-dialog",v)}</script>' : '';
      res.end(extra ? Buffer.concat([page, Buffer.from(extra)]) : page);
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, navigationRequests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startFixture(Number(process.env.PORT || 0));
  console.log(fixture.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => fixture.close().then(() => process.exit()));
}
