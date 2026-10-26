import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bindWebFetchPooling } from '../src/web-fetch-pool.mjs';

const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const nativePath = host.resolve('@deepseek-ai/dsh-web-fetch-http'), resolver = createRequire(nativePath);
const load = name => import(pathToFileURL(resolver.resolve(name)).href);
const [{ HttpFetchProvider }, { WebError }, { timeoutOf }, transport] = await Promise.all([
  import(pathToFileURL(nativePath).href), load('@deepseek-ai/dsh-web'), load('@deepseek-ai/dsh-timeout'), load('undici'),
]);
const limits = { maxResponseBytes: 1024 * 1024, maxBodyChars: 100_000, timeoutMs: 3000, maxRedirects: 2, userAgent: 'native-pool-fixture' };
function registry(provider) { return { fetchProviders: new Map([[provider.id, provider]]), registerFetchProvider(value) { this.fetchProviders.set(value.id, value); return () => this.fetchProviders.delete(value.id); } }; }
function bind(web) { return bindWebFetchPooling(web, { HttpFetchProvider, WebError, timeoutOf, proxyRouteFor: () => ({ proxied: false }), ...transport }); }

test('native HTTP provider revalidates DNS, preserves output and restores its methods', async t => {
  let connections = 0, lookups = 0, denied = false, changed = false;
  const server = createServer((req, res) => {
    assert.equal(req.headers['user-agent'], limits.userAgent);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('完整 source 😀');
  });
  server.on('connection', () => connections++);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const provider = new HttpFetchProvider(limits, async () => {
    lookups++;
    if (denied) throw new WebError('blocked by native resolver', 'WEB_URL_BLOCKED');
    return [{ address: changed ? '::1' : '127.0.0.1', family: changed ? 6 : 4 }];
  });
  const web = registry(provider), original = provider.requestOnce, release = bind(web);
  t.after(async () => { await release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const request = { url: `http://fixture.invalid:${server.address().port}/` };
  const signal = new AbortController().signal;
  const first = await provider.fetch(request, signal);
  for (let i = 0; i < 5; i++) assert.deepEqual(await provider.fetch(request, signal), first);
  assert.equal(first.body.content, '完整 source 😀'); assert.equal(lookups, 6); assert.ok(connections < 6);
  const before = connections; denied = true;
  await assert.rejects(provider.fetch(request, signal), error => error.code === 'WEB_URL_BLOCKED');
  assert.equal(connections, before, 'a warm socket cannot bypass native denial');
  denied = false; changed = true;
  await assert.rejects(provider.fetch(request, signal), error => ['WEB_PROVIDER_ERROR', 'WEB_FETCH_TIMEOUT'].includes(error.code));
  changed = false;
  assert.deepEqual(await provider.fetch(request, signal), first);
  await release(); assert.equal(provider.requestOnce, original);
});

test('pooling keeps native private-address rejection and custom providers untouched', async () => {
  const provider = new HttpFetchProvider(limits), web = registry(provider), release = bind(web);
  try { await assert.rejects(provider.fetch({ url: 'http://127.0.0.1/' }, new AbortController().signal), error => error.code === 'WEB_BLOCKED_URL'); }
  finally { await release(); }
  class CustomProvider extends HttpFetchProvider { requestOnce() { throw Error('custom'); } }
  const custom = new CustomProvider(limits), original = custom.requestOnce, customWeb = registry(custom), done = bind(customWeb);
  assert.equal(custom.requestOnce, original); await done();
});
