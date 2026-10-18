import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceDiagnostics, resourcePrefix } from './resources.mjs';
import { createHash } from 'node:crypto';
import { assertLiveErrors, readSnapshotWithLiveErrors } from './live-errors.mjs';

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
test('OpenCU method enum follows its requestId through response and failure without retaining sensitive args', () => {
  const f = fixture(), secret = 'PRIVATE_ARGS_SESSION_RENDERER_HEADERS';
  for (const [origin, method] of [['dsh-app://app', 'events'], ['http://127.0.0.1:43210', 'browser/disconnect']]) {
    const key = {}, url = origin + '/api/opencu'; let reads = 0;
    f.value.mark('quit-issued-received');
    f.value.request({ key, url, method: 'POST', type: 'fetch', readBody: () => {
      reads++; return JSON.stringify({ method, args: [secret, { session: secret, rendererId: secret }], headers: { secret } });
    } });
    f.tick(2); f.value.mark('host-exit-received');
    f.value.response({ key, url, method: 'POST', type: 'fetch', status: 503 });
    f.value.failed({ key, url, method: 'POST', type: 'fetch', errorText: 'net::ERR_UNEXPECTED' });
    assert.equal(reads, 1);
  }
  assert.equal(JSON.stringify(f.value.snapshot()).includes(secret), false);
  f.value.flush(); const rows = f.rows().filter(row => row.requestId);
  assert.equal(rows.length, 6);
  for (let i = 0; i < rows.length; i += 3) {
    const group = rows.slice(i, i + 3);
    assert.deepEqual(group.map(row => row.kind), ['request', 'response', 'requestfailed']);
    assert.equal(new Set(group.map(row => row.requestId)).size, 1);
    assert.equal(new Set(group.map(row => row.opencuMethod)).size, 1);
    assert.equal(group[0].opencuMethod, i === 0 ? 'events' : 'browser/disconnect');
    assert(group.every(row => row.startedPhase === 'quit-issued-received'));
    assert.equal(group[1].phase, 'host-exit-received'); assert.equal(group[1].status, 503);
    assert.equal(group[2].errorText, 'net::ERR_UNEXPECTED');
  }
  assert.notEqual(rows[0].requestId, rows[3].requestId);
  assert.equal(f.lines.join('\n').includes(secret), false);
});
test('unknown and invalid OpenCU bodies retain only fixed classifications, never secrets or parse errors', () => {
  const f = fixture(), secret = 'PRIVATE_UNKNOWN_METHOD_AND_BODY';
  const cases = [
    [() => JSON.stringify({ method: secret, args: [secret] }), 'other'],
    [() => JSON.stringify({ method: 'events/' + secret }), 'other'],
    [() => '{' + secret, 'invalid'],
    [() => JSON.stringify({ args: [secret] }), 'invalid'],
    [() => JSON.stringify({ method: 42, args: [secret] }), 'invalid'],
    [() => '[]', 'invalid'], [() => 'null', 'invalid'], [() => null, 'invalid'],
    [() => secret.repeat(4000), 'invalid'],
    [() => { throw Error(secret); }, 'invalid'],
  ];
  for (const [readBody] of cases) f.value.request({ key: {}, url: 'dsh-app://app/api/opencu', method: 'POST', type: 'fetch', readBody });
  assert.equal(JSON.stringify(f.value.snapshot()).includes(secret), false);
  f.value.flush();
  assert.deepEqual(f.rows().filter(row => row.kind === 'request').map(row => row.opencuMethod), cases.map(row => row[1]));
  assert.equal(f.lines.join('\n').includes(secret), false);
});
test('non-exact OpenCU routes, origins and HTTP methods never read bodies or invent a method without a request', () => {
  const f = fixture(), secret = 'PRIVATE_NON_ROUTE', cases = [
    ['https://external.example/api/opencu', 'POST'], ['http://127.0.0.1:43211/api/opencu', 'POST'],
    ['http://localhost:43210/api/opencu', 'POST'], ['https://127.0.0.1:43210/api/opencu', 'POST'],
    ['dsh-app://other/api/opencu', 'POST'], ['dsh-app://app:123/api/opencu', 'POST'],
    ['dsh-app://user:PRIVATE@app/api/opencu', 'POST'],
    ['http://user:PRIVATE@127.0.0.1:43210/api/opencu', 'POST'],
    ['dsh-app://app/api/opencu/', 'POST'], ['dsh-app://app/api/opencu-extra', 'POST'],
    ['dsh-app://app/api/%6fpencu', 'POST'], ['dsh-app://app/api/opencu', 'GET'],
    ['invalid URL ' + secret, 'POST'],
  ];
  for (const [url, method] of cases) f.value.request({ key: {}, url, method, type: 'fetch',
    readBody() { assert.fail('body must remain unread for non-exact route/origin/method'); } });
  f.value.failed({ key: {}, url: 'dsh-app://app/api/opencu', method: 'POST', type: 'fetch', errorText: 'net::ERR_UNEXPECTED' });
  f.value.flush();
  assert(f.rows().every(row => !Object.hasOwn(row, 'opencuMethod')));
  assert.equal(f.rows().find(row => row.kind === 'requestfailed').startObserved, false);
  assert.equal(f.lines.join('\n').includes('PRIVATE'), false);
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
test('declared and actual packaged static files are exact matches, never wildcard paths', () => {
  const f = fixture();
  f.value.allowStaticPaths(['/assets/index-ab12cd34.js', '/assets/fonts/font-1122.woff2', '/assets/../PRIVATE.js']);
  for (const url of ['dsh-app://app/favicon-dark.svg?token=PRIVATE', 'dsh-app://app/manifest.webmanifest#PRIVATE',
    'dsh-app://app/assets/index-ab12cd34.js?PRIVATE', 'dsh-app://app/assets/fonts/font-1122.woff2',
    'dsh-app://app/assets/unknown-PRIVATE.js']) f.value.consoleError({ url, lineNumber: 0, columnNumber: 0 });
  f.value.flush(); const rows = f.rows().filter(row => row.kind === 'console-error');
  assert.deepEqual(rows.slice(0, 4).map(row => row.resource.category), Array(4).fill('known-static'));
  assert.equal(rows[4].resource.category, 'asset-redacted');
  assert.equal(rows[4].resource.pathnameSha256, createHash('sha256').update('/assets/unknown-PRIVATE.js').digest('hex'));
  assert.equal(f.lines.join('\n').includes('PRIVATE'), false);
});
test('fixed OMD and SDK methods discard session/query/fragment, unknown paths retain only pathname hash', () => {
  const f = fixture();
  for (const url of ['dsh-app://app/trisoul-x/api/version?refresh=PRIVATE',
    'dsh-app://app/trisoul-x/api/model-mode?session=PRIVATE',
    'dsh-app://app/api/session/create?token=PRIVATE', 'dsh-app://app/api/PRIVATE?token=PRIVATE#PRIVATE'])
    f.value.consoleError({ url, lineNumber: 0, columnNumber: 0 });
  f.value.flush(); const rows = f.rows().filter(row => row.kind === 'console-error');
  assert.equal(rows[0].resource.path, '/trisoul-x/api/version');
  assert.equal(rows[1].resource.path, '/trisoul-x/api/model-mode');
  assert.equal(rows[2].resource.method, 'session/create');
  assert.equal(rows[3].resource.category, 'api-redacted');
  assert.equal(rows[3].resource.pathnameSha256, createHash('sha256').update('/api/PRIVATE').digest('hex'));
  assert.equal(f.lines.join('\n').includes('PRIVATE'), false);
});
test('renderer error arriving during deferred snapshot reads rejects the actual live-error helper', async () => {
  const errors = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const reading = readSnapshotWithLiveErrors(async () => {
    const value = { errors: [...errors] }; await gate; return value;
  }, errors);
  errors.push('late asynchronous resource error'); release();
  await assert.rejects(reading, /snapshot-complete/);
  assert.deepEqual(errors, ['late asynchronous resource error']);
  assert.throws(() => assertLiveErrors(errors, 'before-quit'), /before-quit/);
});
test('clean asynchronous snapshot succeeds without replacing or clearing the shared errors array', async () => {
  const errors = [], value = { result: true };
  assert.equal(await readSnapshotWithLiveErrors(async () => value, errors), value);
  assertLiveErrors(errors, 'before-quit'); assert.deepEqual(errors, []);
});
