import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';
import { openNativeGuide, workbenchProvider } from './fixtures/workbench.mjs';

const peerName = 'omd-workbench-provider';
const observerName = 'omd-upload-lifecycle-observer';
const observerPath = '/upload-lifecycle-observer';
const origins = new WeakMap();
const endpoint = (page, path) => new URL(path, origins.get(page)).href;

// This observer never resolves/resumes an Agent, patches a host method, or
// installs a replacement upload callback. All admission uses the native HTTP
// route and SessionController; the only extra route reads their actual state.
async function observerPlugin(root) {
  const directory = join(root, observerName);
  await mkdir(directory);
  // Leave profile creation and its patch layers entirely to frontendFixture.
  // Its source + plugins branch creates the profile after setupWorkspace.
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    name: observerName, version: '1.0.0', type: 'module', exports: { '.': './index.mjs' },
    dsh: { bundle: { patch: ['./cordis.patch.yml'] } },
  }));
  await writeFile(join(directory, 'cordis.patch.yml'), JSON.stringify([
    { insert: [{ id: observerName, name: observerName }] },
  ]));
  await writeFile(join(directory, 'index.mjs'), `export const inject = ['webServer', 'connection', 'agents', 'sessions'];
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ${JSON.stringify(observerPath)}, async handler(req, res) {
    const rejected = ctx.connection.requestRejection(req);
    if (rejected !== undefined) { res.writeHead(rejected); res.end(); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const id = params.get('session'), receiptId = params.get('receipt');
      const agent = ctx.agents.get(id), session = agent?.session ?? ctx.sessions.get(id);
      const staged = agent && receiptId ? ctx.get('fileUploads')?.resolve(agent, receiptId) : undefined;
      const filePath = staged ? await ctx.get('attachments')?.fileHostPath(staged) : undefined;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ live: agent !== undefined, attached: session !== undefined,
        status: agent?.status ?? null, receipt: staged ?? null, filePath: filePath ?? null,
        events: session?.snapshotEvents() ?? [] }));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
    }
  } }));
}
`);
  return 'file:' + directory;
}

async function nativeResult(page, method, args) {
  const response = await page.request.post(endpoint(page, '/api/' + method), {
    data: { type: 'client-request', rpcId: randomUUID(), method, payload: { args } },
  });
  assert.equal(response.status(), 200, method);
  const body = await response.json();
  assert.ok(body.result && typeof body.result.ok === 'boolean', JSON.stringify(body));
  return body.result;
}

async function nativeCall(page, method, args = {}) {
  const result = await nativeResult(page, method, args);
  assert.equal(result.ok, true, method + ': ' + JSON.stringify(result));
  return result.value;
}

async function observe(page, sessionId, receiptId) {
  const url = new URL(endpoint(page, observerPath));
  url.search = new URLSearchParams({ session: sessionId, ...(receiptId ? { receipt: receiptId } : {}) });
  const response = await page.request.get(url.href);
  assert.equal(response.status(), 200, 'read-only native upload observer');
  return response.json();
}

async function showPeer(page, { retained = false } = {}) {
  const surface = page.getByText('第三方页面保留', { exact: true });
  // OMD owns the shared fixture's workbench toolbar/DOM markers. After OMD
  // removal, prove the native host restores the already-open foreign tab;
  // do not require controls that the removed plugin contributed.
  if (retained) { await surface.waitFor(); return; }
  if (await surface.isVisible()) return;
  const guide = await openNativeGuide(page);
  await guide.locator('[data-sidebar-right-guide-entry="fixture-provider"]').click();
  await surface.waitFor();
}

async function changeOmd(page, enabled) {
  const value = await nativeCall(page, 'pluginManager/setBundleEnabled', { name: 'trisoul_x', enabled });
  assert.ok(['applied', 'restart-required'].includes(value.application), JSON.stringify(value));
  return value;
}

const messageFor = (events, requestId) => events.filter(event => event.type === 'user/message' && event.data.source?.rpcId === requestId);

// The repository's independently installed native workbench provider represents
// the public extension seam used by IUI. This is not qualification of a real
// IUI release, renderer, preset or its package/SDK dependencies.
for (const omdFirst of [false, true]) {
  const order = omdFirst ? 'OMD then independent provider' : 'independent provider then OMD';
  test(`native cold/live file uploads survive OMD re-enable, restart and removal (${order})`, { timeout: 300000 }, async t => {
    const peer = await workbenchProvider(t);
    const plugins = [peer];
    const f = await frontendFixture(t, {
      installedPackage: omdFirst, plugins,
      async setupWorkspace({ root }) { plugins.push(await observerPlugin(root)); },
      // Keep the normal product switches. The synthetic provider ends each
      // attachment prompt without introducing another business tool call.
      modelReply(payload) {
        if (JSON.stringify(payload.messages).includes('UPLOAD_LIFECYCLE_'))
          return { delta: { role: 'assistant', content: 'UPLOAD_LIFECYCLE_COMPLETE' }, finish_reason: 'stop' };
      },
    });
    const { page } = f;
    const origin = new URL(page.url()).origin;
    origins.set(page, origin);
    const reloadWeb = async () => {
      // Native bundle changes can emit their own HMR navigation concurrently.
      // Retry only that navigation interruption, never a host startup error.
      let interrupted;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await page.goto(origin + '/', { waitUntil: 'domcontentloaded' }); return; }
        catch (error) {
          if (!/interrupted by another navigation|net::ERR_ABORTED/.test(error.message)) throw error;
          interrupted = error;
        }
      }
      throw interrupted;
    };
    // The fixture waits for its owned native API before browser navigation;
    // API URLs remain pinned even if a disconnected browser shows chrome-error.
    const restart = async () => { await f.restart(); await reloadWeb(); };
    const profile = JSON.parse(await readFile(join(f.home, 'profiles', 'trisoul-x', 'package.json'), 'utf8'));
    const configured = profile.dsh.profile.bundles;
    const omdPosition = configured.indexOf('trisoul_x'), peerPosition = configured.indexOf(peerName);
    assert.ok(omdPosition >= 0 && peerPosition >= 0, 'both real bundle layers are selected');
    assert.equal(omdPosition < peerPosition, omdFirst, 'the fixture must actually install the requested bundle order');
    const registered = await f.rpc('workspace/create', { path: f.workspace });
    const create = () => f.rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'standard' });
    const cold = await create();
    assert.equal((await observe(page, cold.sessionId)).live, true, 'the ordinary session is created by the native controller');
    const bundles = await nativeCall(page, 'pluginManager/listBundles');
    for (const name of ['trisoul_x', peerName])
      assert.ok(bundles.some(bundle => bundle.name === name && bundle.installed && bundle.enabled), name);
    await showPeer(page);

    await changeOmd(page, false);
    await restart();
    const disabled = await nativeCall(page, 'pluginManager/listBundles');
    assert.ok(disabled.some(bundle => bundle.name === 'trisoul_x' && bundle.installed && !bundle.enabled));
    assert.ok(disabled.some(bundle => bundle.name === peerName && bundle.installed && bundle.enabled));
    assert.equal((await observe(page, cold.sessionId)).live, false, 'cold restart leaves the unselected ordinary session without a live Agent');

    const enabled = await changeOmd(page, true);
    if (enabled.application === 'restart-required') await restart();
    const active = await nativeCall(page, 'pluginManager/listBundles');
    assert.ok(active.some(bundle => bundle.name === 'trisoul_x' && bundle.installed && bundle.enabled));
    const version = await page.request.get(endpoint(page, '/trisoul-x/api/version'));
    assert.equal(version.status(), 200, 'OMD actually resumes after the native bundle enable operation');
    await reloadWeb();
    await showPeer(page);
    const live = await create(), foreign = await create();
    const admitted = [];

    const uploadAndSubmit = async (sessionId, label, expectedLive) => {
      assert.equal((await observe(page, sessionId)).live, expectedLive, label + ': check Agent presence before touching any resolving API');
      const bytes = Buffer.from(`UPLOAD_LIFECYCLE_${label}\nSynthetic native upload bytes only.\n`);
      const name = `upload-${label}.txt`;
      const url = new URL(endpoint(page, '/api/session/uploadFileBinary'));
      url.search = new URLSearchParams({ sessionId, name });
      const response = await page.request.post(url.href, { headers: { 'content-type': 'application/octet-stream' }, data: bytes });
      assert.equal(response.status(), 200);
      const result = await response.json();
      assert.equal(result.ok, true, JSON.stringify(result));
      const upload = result.value;
      assert.equal(typeof upload.receiptId, 'string');
      assert.equal(upload.file.attachmentId, 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
      assert.equal(upload.file.name, name);
      assert.equal(upload.file.bytes, bytes.length);
      const staged = await observe(page, sessionId, upload.receiptId);
      assert.equal(staged.live, true, label + ': native streamed upload resolves the receiving Agent');
      assert.deepEqual(staged.receipt, upload.file, 'the receipt belongs to the actual receiving Session');
      assert.equal(typeof staged.filePath, 'string', 'the native file-backed attachment provider returns its durable object');
      const storedPath = await realpath(staged.filePath), boundary = relative(await realpath(f.root), storedPath);
      assert.ok(boundary && boundary !== '..' && !boundary.startsWith('..' + sep) && !isAbsolute(boundary), 'read only the test-owned native attachment');
      assert.deepEqual(await readFile(storedPath), bytes, 'streamed attachment preserves the submitted bytes');

      const deniedRequest = randomUUID();
      assert.equal((await observe(page, foreign.sessionId, upload.receiptId)).receipt, null);
      const denied = await nativeResult(page, 'session/prompt', { request: {
        requestId: deniedRequest, sessionId: foreign.sessionId, mode: 'queue',
        content: [{ type: 'text', text: 'FOREIGN_UPLOAD_RECEIPT_MUST_FAIL' }, { type: 'file', receiptId: upload.receiptId }],
      } });
      assert.equal(denied.ok, false, 'another Session must not submit the uploaded receipt');
      assert.equal(denied.error.code, 'session/attachment-invalid');
      assert.equal(denied.error.details.reason, 'FILE_NOT_STAGED');
      assert.equal(messageFor((await observe(page, foreign.sessionId)).events, deniedRequest).length, 0, 'rejected admission writes no user message');
      assert.deepEqual((await observe(page, sessionId, upload.receiptId)).receipt, upload.file, 'foreign rejection does not consume the owner receipt');

      const requestId = randomUUID();
      const accepted = await nativeCall(page, 'session/prompt', { request: {
        requestId, sessionId, mode: 'queue',
        content: [{ type: 'text', text: `UPLOAD_LIFECYCLE_${label}` }, { type: 'file', receiptId: upload.receiptId }],
      } });
      assert.equal(accepted.accepted, true);
      await until(async () => {
        const state = await observe(page, sessionId);
        return state.status === 'idle' && messageFor(state.events, requestId).length === 1;
      });
      const log = await until(async () => {
        const value = await restoreFixtureLog(f.home, sessionId);
        return messageFor(value.events, requestId).length === 1 && value;
      });
      const message = messageFor(log.events, requestId)[0];
      assert.deepEqual(message.data.content.filter(part => part.type === 'file'), [{ type: 'file', attachment: upload.file }], 'the unmodified native persistence backend contains the admitted file reference');
      assert.equal((await observe(page, sessionId, upload.receiptId)).receipt, null, 'delivery retires the staged receipt');
      const other = await restoreFixtureLog(f.home, foreign.sessionId);
      assert.ok(!other.events.some(event => JSON.stringify(event).includes(upload.file.attachmentId)), 'foreign durable history contains no uploaded attachment');
      admitted.push({ sessionId, requestId, file: upload.file, path: storedPath, bytes });
    };

    await uploadAndSubmit(cold.sessionId, 'cold', false);
    await uploadAndSubmit(live.sessionId, 'live', true);
    await restart();
    for (const item of admitted) {
      assert.equal((await observe(page, item.sessionId)).live, false, 'reading the probe after restart does not hydrate either ordinary Session');
      const log = await restoreFixtureLog(f.home, item.sessionId);
      assert.deepEqual(messageFor(log.events, item.requestId)[0].data.content.filter(part => part.type === 'file'), [{ type: 'file', attachment: item.file }]);
      assert.deepEqual(await readFile(item.path), item.bytes, 'the native attachment survives the cold host restart');
    }

    // Native removal requires stopping a selected bundle in non-HMR hosts.
    // Disable and cold-restart first using the fixture's owned host lifecycle;
    // remove through the public manager, without changing its safety checks.
    await changeOmd(page, false);
    await restart();
    const removed = await nativeCall(page, 'pluginManager/removeBundle', { name: 'trisoul_x' });
    assert.ok(['applied', 'restart-required'].includes(removed.application), JSON.stringify(removed));
    await restart();
    const remaining = await nativeCall(page, 'pluginManager/listBundles');
    assert.ok(!remaining.some(bundle => bundle.name === 'trisoul_x' && bundle.installed));
    assert.ok(remaining.some(bundle => bundle.name === peerName && bundle.installed && bundle.enabled), 'uninstalling OMD preserves the independent provider');
    await reloadWeb();
    await showPeer(page, { retained: true });
    await uploadAndSubmit(cold.sessionId, 'after-uninstall', false);
    assert.deepEqual(f.errors, []);
    if (process.env.TRISOUL_UI_ARTIFACTS)
      await page.screenshot({ path: join(f.root, `native-upload-${omdFirst ? 'omd-first' : 'provider-first'}.png`), fullPage: true });
  });
}
