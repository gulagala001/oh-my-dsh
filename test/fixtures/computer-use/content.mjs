import { createServer } from 'node:http';
import sharp from 'sharp';

export async function contentFixture() {
  const image = await sharp({ create: { width: 8, height: 6, channels: 4, background: '#2864da' } }).png().toBuffer();
  const stylesheet = '/* 中文样式 */ .hero { background-image: url("/background.png"); width:80px; height:60px }';
  const server = createServer((req, res) => {
    if (['/picture.png', '/background.png', '/lazy.png'].includes(req.url)) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(image); }
    else if (req.url === '/theme.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); res.end(stylesheet); }
    else if (req.url === '/missing.png') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
    else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>页面素材验收</title><link rel="stylesheet" href="/theme.css"><h1>导出页面 中文</h1><img alt="原始素材" src="/picture.png"><img alt="坏图" src="/missing.png"><div class="hero"></div><svg aria-label="矢量图" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg><button onclick="document.querySelector('#lazy').src='/lazy.png'">加载素材</button><img id="lazy" alt="后加载素材"><output>初始状态</output><button onclick="document.querySelector('output').textContent='已更新的页面内容'">更新页面</button><script>document.querySelector('.hero').attachShadow({mode:'open'}).innerHTML='<img alt="影子图片" src="/picture.png">';</script>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, image, stylesheet, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
