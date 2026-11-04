import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const nativePath = host.resolve('@deepseek-ai/dsh-web-fetch-http'), resolver = createRequire(nativePath);
const { HttpFetchProvider } = await import(nativePath);
const { Agent, getGlobalDispatcher, setGlobalDispatcher } = await import(resolver.resolve('undici'));
const limits = { maxResponseBytes: 1024, maxBodyChars: 1000, timeoutMs: 3000, maxRedirects: 2, userAgent: 'native-fetch-fixture' };

test('native shared transport reuses connections and retains redirect, cancellation and size policies', async t => {
  let connections = 0;
  const server = createServer((req, res) => {
    assert.equal(req.headers['user-agent'], limits.userAgent);
    if (req.url === '/slow') return;
    if (req.url === '/cross') { res.writeHead(302, { location: 'http://other.invalid/' }); res.end(); return; }
    if (req.url === '/redirect') { res.writeHead(302, { location: '/' }); res.end(); return; }
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(req.url === '/large' ? 'x'.repeat(2048) : '完整 source 😀');
  });
  server.on('connection', () => connections++);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = getGlobalDispatcher(), dispatcher = new Agent();
  setGlobalDispatcher(dispatcher);
  t.after(async () => { setGlobalDispatcher(previous); await dispatcher.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const provider = new HttpFetchProvider(limits), url = `http://127.0.0.1:${server.address().port}`;
  const first = await provider.fetch({ url });
  for (let i = 0; i < 5; i++) assert.deepEqual(await provider.fetch({ url }), first);
  assert.equal(first.body.content, '完整 source 😀'); assert.ok(connections < 6);
  assert.deepEqual(await provider.fetch({ url: url + '/redirect' }), first);
  await assert.rejects(provider.fetch({ url: url + '/cross' }), error => error.code === 'WEB_REDIRECT_BLOCKED');
  await assert.rejects(provider.fetch({ url: url.replace('http://', 'http://user:password@') }), error => error.code === 'WEB_BLOCKED_URL');
  await assert.rejects(provider.fetch({ url: url + '/large' }), error => error.code === 'WEB_FETCH_TOO_LARGE');
  const large = await new HttpFetchProvider({ ...limits, maxResponseBytes: 4096 }).fetch({ url: url + '/large' });
  assert.equal(large.truncated, true); assert.equal(large.body.content.length, limits.maxBodyChars);
  const controller = new AbortController(), pending = provider.fetch({ url: url + '/slow' }, controller.signal);
  controller.abort(); await assert.rejects(pending, error => error.code === 'WEB_ABORTED');
  const bounded = new HttpFetchProvider({ ...limits, timeoutMs: 30 });
  await assert.rejects(bounded.fetch({ url: url + '/slow' }), error => error.code === 'WEB_FETCH_TIMEOUT');
  assert.equal(Object.hasOwn(provider, 'requestOnce'), false, 'OMD does not replace the native transport');
});
