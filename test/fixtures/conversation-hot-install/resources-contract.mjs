import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceDiagnostics, resourcePrefix } from './resources.mjs';

function fixture() {
  let time = 500;
  const lines = [], value = createResourceDiagnostics({ now: () => time, write: line => lines.push(line) });
  value.setLoopback('http://127.0.0.1:43210');
  return { value, lines, tick: n => { time += n; }, rows: () => lines.map(line => JSON.parse(line.slice(resourcePrefix.length))) };
}
test('resource stdout excludes credentials, private paths, bodies and all unknown queries', () => {
  const f = fixture(), secret = 'PRIVATE_SECRET_42';
  for (const url of ['https://external.example/' + secret, 'file:///Users/' + secret,
    'dsh-app://app/api/session/' + secret + '?token=' + secret,
    'http://127.0.0.1:43211/' + secret, 'dsh-app://app/assets/' + secret,
    'http://user:' + secret + '@127.0.0.1:43210/favicon.ico',
    'dsh-app://app/favicon.ico?cookie=' + secret]) {
    f.value.response({ url, status: 404, method: secret, type: secret, body: secret });
    f.value.failed({ url, errorText: 'net::ERR_FAILED ' + secret, method: secret, type: secret });
    f.value.consoleError({ url, lineNumber: secret, columnNumber: secret, text: secret });
  }
  f.value.mark(secret, { token: secret }); f.value.flush();
  assert.equal(f.lines.join('\n').includes(secret), false);
  assert.equal(f.lines.join('\n').includes('external.example'), false);
  assert(f.rows().some(row => row.resource?.path === '/favicon.ico'));
  assert(f.rows().some(row => row.resource?.category === 'credentials-redacted'));
});
test('only graph-verified allowlisted module identity and revision enter stdout', () => {
  const f = fixture(), rev = 'a'.repeat(12), base = 'dsh-app://app/plugins/??trisoul_x/client.js&rev=' + rev;
  const response = url => f.value.response({ url, status: 404, method: 'GET', type: 'script' });
  response(base);
  f.value.allowModules([{ id: 'trisoul_x', rev, url: `plugins/??trisoul_x/client.js&rev=${rev}` }]);
  response(base); response(base + '&token=PRIVATE_QUERY');
  response('dsh-app://app/plugins/??PRIVATE_PACKAGE/client.js&rev=' + rev);
  response('dsh-app://app/plugins/??trisoul_x/client.js&rev=' + 'b'.repeat(12));
  f.value.flush(); const rows = f.rows().filter(row => row.kind === 'response');
  assert.equal(rows[0].resource.category, 'module-redacted');
  assert.equal(rows[1].resource.module, 'trisoul_x'); assert.equal(rows[1].resource.rev, rev);
  assert(rows.slice(2).every(row => row.resource.category === 'module-redacted'));
  assert.equal(f.lines.join('\n').includes('PRIVATE_'), false);
});
test('same request retains initiation phase while response and failure retain their own later phases', () => {
  const f = fixture(), key = {}, url = 'dsh-app://app/plugins/events?token=SECRET';
  f.value.mark('screenshot-before');
  f.value.request({ key, url, method: 'GET', type: 'eventsource' }); f.tick(8);
  f.value.mark('quit-before'); f.value.response({ key, url, status: 404, method: 'GET', type: 'eventsource' }); f.tick(3);
  f.value.mark('electron-exit', { pid: 42 }); f.value.failed({ key, url, errorText: 'net::ERR_UNEXPECTED', method: 'GET', type: 'eventsource' });
  f.value.mark('host-exit-received', { pid: 24 }); f.value.flush();
  const rows = f.rows(), response = rows.find(row => row.kind === 'response'), failed = rows.find(row => row.kind === 'requestfailed');
  assert.equal(response.startedPhase, 'screenshot-before'); assert.equal(response.phase, 'quit-before');
  assert.equal(failed.startedPhase, 'screenshot-before'); assert.equal(failed.phase, 'electron-exit');
  assert.equal(response.requestId, failed.requestId); assert.equal(failed.ms, 11);
  assert.equal(failed.errorText, 'net::ERR_UNEXPECTED'); assert.equal(response.resource.origin, 'dsh-app');
  assert.equal(response.resource.category, 'module-events'); assert.equal(f.lines.join('\n').includes('SECRET'), false);
  assert(rows.filter(row => row.kind === 'mark').every(row => row.clock === 'test-receive-monotonic'));
});
test('unknown resource events cannot fabricate successful phases or a known clock', () => {
  const f = fixture(); f.value.mark('installed-snapshot-ok'); f.value.mark('PRIVATE_PHASE');
  f.value.failed({ url: 'unknown:PRIVATE_URL', errorText: 'PRIVATE_ERROR', method: 'PRIVATE_METHOD', type: 'PRIVATE_TYPE' });
  f.value.flush(); const row = f.rows().find(row => row.kind === 'requestfailed');
  assert.equal(row.phase, 'installed-snapshot-ok'); assert.equal(row.errorText, 'other');
  assert.equal(row.startObserved, false); assert.equal(f.lines.join('\n').includes('PRIVATE_'), false);
});
test('bounded stdout retains first critical failure despite a flood and flushes only once', () => {
  const f = fixture();
  f.value.failed({ url: 'http://127.0.0.1:43210/plugins/events', errorText: 'net::ERR_FAILED', method: 'GET', type: 'eventsource' });
  for (let n = 0; n < 2000; n++) f.value.response({ url: 'dsh-app://app/favicon.ico', status: 200, method: 'GET', type: 'image' });
  for (let n = 0; n < 100; n++) f.value.failed({ url: 'https://unknown/PRIVATE', errorText: 'net::ERR_ABORTED', method: 'GET', type: 'fetch' });
  f.value.flush(); const count = f.lines.length; f.value.flush(); assert.equal(f.lines.length, count);
  assert(f.lines.every(line => Buffer.byteLength(line + '\n') <= 1200));
  assert(Buffer.byteLength(f.lines.join('\n') + '\n') <= 65536);
  assert(f.rows().some(row => row.errorText === 'net::ERR_FAILED')); assert(f.rows().at(-1).droppedOrOmitted > 0);
});
