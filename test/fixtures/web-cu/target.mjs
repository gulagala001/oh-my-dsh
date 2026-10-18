import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { closeFixtureServer } from '../process.mjs';

// Independent server ledger: the driver never evaluates or controls target B.
// This ledger is supporting evidence; it cannot manufacture a Host tool result.
export async function createWebCuTarget() {
  const nonce = randomBytes(16).toString('hex'), events = [], errors = [];
  let count = 0, value = '';
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/' + nonce) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self'" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Web CU ${nonce}</title>
<style>body{font:20px system-ui;padding:40px}input,button{font:inherit;margin:12px;padding:12px}</style>
<h1>Owned synthetic ${nonce}</h1><label>Proof input<input aria-label="Proof input"></label>
<button>Record proof</button><p id="count">Count 0</p><p id="value">No value</p>
<script>
let n=0, queue=Promise.resolve();
function record(e){ const row={nonce:${JSON.stringify(nonce)},type:e.type,key:e.key||'',trusted:e.isTrusted,value:document.querySelector('input').value,count:n};
queue=queue.then(()=>fetch('/${nonce}/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)})).then(r=>{if(!r.ok)throw Error('Ledger rejected input')}); }
document.querySelector('button').addEventListener('click',e=>{n++;document.querySelector('#count').textContent='Count '+n;document.querySelector('#value').textContent=document.querySelector('input').value;record(e)});
for(const name of ['input','keydown','keyup','mousedown','mouseup'])document.addEventListener(name,record);
</script>`); return;
      }
      if (req.method !== 'POST' || req.url !== '/' + nonce + '/event') { res.writeHead(404); res.end(); return; }
      assert.equal(req.headers.origin, `http://127.0.0.1:${server.address().port}`);
      let body = ''; for await (const chunk of req) { body += chunk; assert(Buffer.byteLength(body) <= 4096); }
      const event = JSON.parse(body);
      assert.equal(event.nonce, nonce); assert.equal(event.trusted, true);
      assert(['click','input','keydown','keyup','mousedown','mouseup'].includes(event.type));
      assert(Number.isSafeInteger(event.count) && event.count >= 0 && event.count <= 2);
      assert.equal(typeof event.value, 'string'); assert(event.value.length <= 100);
      assert.equal(event.count, event.type === 'click' ? count + 1 : count);
      count = event.count; value = event.value; events.push(Object.freeze({ ...event, sequence: events.length + 1 }));
      assert(events.length <= 256, 'Bounded target event budget exceeded');
      res.writeHead(204); res.end();
    } catch (error) { errors.push(error.message); res.writeHead(400); res.end('Invalid synthetic event'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { nonce, url: `http://127.0.0.1:${server.address().port}/${nonce}`, port: server.address().port,
    snapshot: () => structuredClone({ nonce, count, value, events, errors }), close: () => closeFixtureServer(server) };
}
