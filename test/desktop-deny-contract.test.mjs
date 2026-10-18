import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer, request as nodeRequest } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createApprovalHttpObserver } from './fixtures/desktop-deny/http-observer.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { markAgentLoopRequest, isAgentLoopRequest, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { acquireOpenCU } from '../vendor/opencu/src/dsh/shared.mjs';
import { defaultApprovalCard } from './fixtures/desktop-deny/navigation.mjs';
import { assertDenyReport } from './fixtures/desktop-deny/gate.mjs';
import { installToolDefinitions } from '../vendor/opencu/src/dsh/tools.mjs';
import { syntheticBackend, acquireBeforeStart, warmTargets, createModelGuard, createWireProtocol,
  credentialFiles, disabledBackends, forbiddenMethods, provider, model, callId, targetId, appName, declinedText, assertPending, assertWaitingApproval, assertDenied } from './fixtures/desktop-deny/protocol.mjs';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'omd-deny-contract-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
async function until(fn) {
  for (let n = 0; n < 200; n++) { const value = await fn(); if (value) return value; await delay(5); }
  throw Error('Synthetic contract did not settle');
}
const firstRequest = () => ({ model, stream: true, tools: [{ type: 'function', function: { name: 'opencu_select' } }], messages: [{ role: 'user', content: 'unit-only' }] });
const secondRequest = () => ({ ...firstRequest(), messages: [
  ...firstRequest().messages,
  { role: 'assistant', tool_calls: [{ id: callId, type: 'function', function: { name: 'opencu_select', arguments: JSON.stringify({ reference: targetId }) } }] },
  { role: 'tool', tool_call_id: callId, content: declinedText },
] });
const cardEvidence = requestId => ({ sessionId: 'unit-session', boundSessionId: 'unit-session', requestId,
  appDisplayName: appName, title: `允许 OpenCU 使用 ${appName}？`, cardCount: 1, matchingCardCount: 1, titleCount: 1,
  defaultApprovalVisible: true, denyCount: 1, denyVisible: true,
  bounds: { x: 100, y: 200, width: 600, height: 300 }, denyBounds: { x: 120, y: 440, width: 80, height: 30 },
  viewport: { width: 1280, height: 900 } });

test('model guard permits only two armed official Agent-loop requests and preserves next()', () => {
  const legal = () => markAgentLoopRequest({ provider, model, sessionId: 'actual-returned-id' });
  let session, continued = 0;
  const guard = createModelGuard(() => session, isAgentLoopRequest);
  assert.throws(() => guard.intercept(legal(), () => continued++), /unexpected model/);
  assert.equal(continued, 0);
  for (const change of [{ provider: 'external' }, { model: 'other' }, { sessionId: 'other' }, { purpose: 'session-title' }, { purpose: null }]) {
    const current = createModelGuard(() => 'actual-returned-id', isAgentLoopRequest);
    assert.throws(() => current.intercept(markAgentLoopRequest({ ...legal(), ...change }), () => continued++), /unexpected model/);
    assert.equal(current.rejected.length, 1);
  }
  const current = createModelGuard(() => 'actual-returned-id', isAgentLoopRequest), stream = { [Symbol.asyncIterator]() {} };
  assert.equal(current.intercept(legal(), () => stream), stream);
  assert.equal(current.intercept(legal(), () => stream), stream);
  assert.throws(() => current.intercept(legal(), () => continued++), /unexpected model/);
  const forged = createModelGuard(() => 'actual-returned-id', isAgentLoopRequest);
  assert.throws(() => forged.intercept({ ...legal() }, () => continued++), /unexpected model/);
  assert.equal(continued, 0);
});

test('SSE protocol emits one selection and stops only after its matching declined history', () => {
  const wire = createWireProtocol();
  const first = wire.respond(firstRequest());
  assert(first.includes('opencu_select') && first.endsWith('data: [DONE]\n\n'));
  assert(!first.includes(declinedText), 'Provider never synthesizes a tool result');
  const second = wire.respond(secondRequest()); assert(second.includes('"finish_reason":"stop"'));
  assert.throws(() => wire.respond(secondRequest()), /Only two/);
  for (const change of [body => { body.model = 'other'; }, body => { body.stream = false; }, body => { body.tools = []; },
    body => { body.messages[2].tool_call_id = 'wrong'; }, body => { body.messages[2].content = 'granted'; },
    body => { body.messages[1].tool_calls[0].function.name = 'computer_use'; }, body => { body.messages.pop(); }]) {
    const rejected = createWireProtocol(); rejected.respond(firstRequest()); const body = secondRequest(); change(body);
    assert.throws(() => rejected.respond(body)); assert.equal(rejected.failures.length, 1);
  }
});

test('synthetic backend has one nonexistent executable and refuses every physical method', async t => {
  const root = await directory(t), synthetic = syntheticBackend(root);
  assert.equal(existsSync(synthetic.target.identity.executable), false);
  assert(!('pid' in synthetic.target.identity)); assert(!('windowId' in synthetic.target.identity));
  assert.equal((await synthetic.backend.listTargets()).length, 1);
  for (const method of forbiddenMethods) { await assert.rejects(synthetic.backend[method](), /forbids backend/); assert.equal(synthetic.calls[method], 1); }
});

test('real OpenCU controller and official ToolRuntime reject before any synthetic physical dispatch', async t => {
  // This unit contract drives the public approval API without a UI. Only the
  // separate Electron acceptance's real REA locator.click attests user Deny.
  const root = await directory(t), dataDir = join(root, 'opencu'); await mkdir(dataDir);
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  ctx.reflect.provide('systemPrompt', { tools() {}, section() {}, getSectionOrder() { return 0; } });
  await ctx.plugin(ToolRuntime);
  acquireOpenCU(ctx, { namespace: 'omd-opencu', config: { ...disabledBackends, dataDir } });
  const synthetic = syntheticBackend(root), lease = acquireBeforeStart(ctx, { dataDir }, synthetic);
  await warmTargets(lease, synthetic);
  assert.equal(existsSync(join(dataDir, 'controller.lock')), true);
  assert.throws(() => acquireBeforeStart(ctx, { dataDir }, syntheticBackend(root)), /too late/);
  // A controller already started elsewhere cannot pass merely because the new
  // lease points at a different directory: actual inventory must use injection.
  await assert.rejects(warmTargets({ request: () => Promise.resolve({ ok: true, targets: [], errors: [] }) }, synthetic));
  installToolDefinitions(ctx, lease, 'unit-session');
  const resultPromise = ctx.tools.execute({ callId, name: 'opencu_select', arguments: { reference: targetId }, signal: new AbortController().signal });
  const pending = await until(async () => { const value = await lease.request('appApprovals/pending', { conversationId: 'unit-session' }); return value.requests[0]; });
  const snapshot = {
    pending: [pending], approvals: (await lease.request('appApprovals/read')).approvals,
    selected: (await lease.request('state')).state.targets, calls: synthetic.calls, credentialFiles: credentialFiles(dataDir),
    authorizationFiles: { persisted: existsSync(join(dataDir, 'app-approvals.json')), pending: existsSync(join(dataDir, 'app-approvals.json.pending')) },
  };
  assertPending(snapshot, 'unit-session');
  const response = { source: 'host-http', requestComplete: true, readableEnded: true, responseFinished: true, responseBytes: 26, responseSha256: 'a'.repeat(64), args: { conversationId: 'unit-session', requestId: pending.id, action: 'decline', persist: null } };
  response.value = await lease.request('appApprovals/respond', response.args);
  const result = await resultPromise;
  assert.equal(result.isError, true); assert(result.content.some(row => row.type === 'text' && row.text.includes(declinedText)));
  const events = [
    { type: 'tool/call', data: { callId, name: 'opencu_select', arguments: JSON.stringify({ reference: targetId }) } },
    { type: 'tool/result', data: { message: createToolResultMessage({ callId, content: result.content, isError: result.isError }) } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ];
  const activity = (await lease.request('events')).sessions[0];
  assert.equal(activity.latest.error.code, 'APP_ACCESS_DENIED');
  const wire = createWireProtocol(); wire.respond(firstRequest()); wire.respond(secondRequest());
  // Synthetic event envelopes below exercise the acceptance predicate only;
  // they never represent Agent or UI completion evidence.
  const value = { ...snapshot, pending: [], events, activity, agent: { id: 'unit-session', status: 'idle' }, header: { agentPreset: 'trisoul-x' },
    nativeToolRuntime: ctx.tools instanceof ToolRuntime, nativeAgentRegistry: true, agentOwnsSession: true,
    modelCalls: [{ provider, model, sessionId: 'unit-session' }, { provider, model, sessionId: 'unit-session' }], rejectedModels: [] };
  assertDenied(value, { sessionId: 'unit-session', requestId: pending.id, response, wire });
  for (const mutate of [v => { v.events[1].data.message = { ...v.events[1].data.message, toolCallId: 'wrong' }; },
    v => { v.events[1].data.message = { ...v.events[1].data.message, isError: false }; },
    v => { v.events[2].data.reason.kind = 'cancelled'; }, v => { v.pending = [pending]; }, v => { v.selected = [synthetic.target]; },
    v => { v.approvals = { approvedApps: [{}] }; }, v => { v.authorizationFiles.persisted = true; },
    v => { v.credentialFiles.bridge = true; }, v => { v.credentialFiles.pairings = true; },
    v => { v.modelCalls.pop(); }, v => { v.calls.act = 1; }, v => { v.nativeToolRuntime = false; }]) {
    const negative = structuredClone(value); mutate(negative);
    assert.throws(() => assertDenied(negative, { sessionId: 'unit-session', requestId: pending.id, response, wire }));
  }
  const waiting = { deny: snapshot, modelCalls: [value.modelCalls[0]], rejectedModels: [] };
  assert.deepEqual(assertWaitingApproval(waiting, { sessionId: 'unit-session', pending, localModelRequests: 1 }), { requestId: pending.id, sessionId: 'unit-session', localModelRequests: 1, physicalInputs: 0 });
  for (const mutate of [s => { s.deny.pending[0].id = 'another-request'; }, s => { s.modelCalls.push(s.modelCalls[0]); }, s => { s.deny.calls.act = 1; }]) {
    const invalid = structuredClone(waiting); mutate(invalid);
    assert.throws(() => assertWaitingApproval(invalid, { sessionId: 'unit-session', pending, localModelRequests: 1 }));
  }
  const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';
  const report = { status: 'passed', executed: 1, skipped: 0, phase: 'checks-complete', cancelledForCleanup: false,
    launches: [{ pid: 1 }, { pid: 2 }], shutdowns: [1, 2].map(() => ({ naturalExit: true, exitCode: 0, signalCode: null })),
    approvalDisplay: { manualGroupExpansion: false, scrolledIntoView: false, apiApproval: false,
      beforeCard: cardEvidence(pending.id), afterCard: cardEvidence(pending.id),
      before: { requestId: pending.id, sessionId: 'unit-session', localModelRequests: 1, physicalInputs: 0 },
      after: { requestId: pending.id, sessionId: 'unit-session', localModelRequests: 1, physicalInputs: 0 } },
    counts: { localModelRequests: 2, toolCalls: 1, externalModelRequests: 0, physicalInputs: 0 }, errors: [], approvalResponses: [response],
    pending: { deny: snapshot }, denied: { deny: value, modelCalls: value.modelCalls, rejectedModels: [] }, providerRequests: wire.requests, providerFailures: [] };
  assertDenyReport(tap, report);
  for (const invalid of ['', tap.replace('# tests 1', '# tests 0'), tap.replace('# skipped 0', '# skipped 1'), tap.replace('# pass 1', '# pass 0')]) assert.throws(() => assertDenyReport(invalid, report));
  for (const mutate of [r => { r.approvalResponses[0].source = 'renderer-requestfinished'; }, r => { r.approvalResponses[0].responseFinished = false; }, r => { r.cancelledForCleanup = true; }, r => { r.shutdowns[1].naturalExit = false; }, r => { r.counts.localModelRequests = 1; },
    r => { r.approvalDisplay.after.requestId = 'another-request'; }, r => { r.approvalDisplay.after.localModelRequests = 2; },
    r => { r.approvalDisplay.manualGroupExpansion = true; }, r => { r.approvalDisplay.scrolledIntoView = true; }, r => { r.approvalDisplay.apiApproval = true; },
    r => { r.approvalDisplay.after.physicalInputs = 1; }, r => { r.approvalDisplay.beforeCard.defaultApprovalVisible = false; },
    r => { r.approvalDisplay.afterCard.cardCount = 2; }, r => { r.approvalDisplay.afterCard.matchingCardCount = 0; },
    r => { r.approvalDisplay.afterCard.sessionId = 'other-session'; }, r => { r.approvalDisplay.afterCard.boundSessionId = 'other-session'; },
    r => { r.approvalDisplay.afterCard.requestId = 'other-request'; }, r => { r.approvalDisplay.afterCard.title = `允许 DSH 使用 ${appName}？`; },
    r => { r.approvalDisplay.afterCard.bounds.y = -1; }, r => { r.approvalDisplay.afterCard.bounds.x = 1280; },
    r => { r.approvalDisplay.afterCard.bounds.height = 901; }, r => { r.approvalDisplay.afterCard.denyBounds.y = 900; },
    r => { r.counts.externalModelRequests = 1; }, r => { r.counts.physicalInputs = 1; }, r => { r.launches[1].pid = 1; }]) {
    const invalid = structuredClone(report); mutate(invalid); assert.throws(() => assertDenyReport(tap, invalid));
  }
  for (const method of forbiddenMethods) assert.equal(synthetic.calls[method], 0);
  assert.deepEqual((await lease.request('state')).state.targets, []);
  assert.deepEqual((await lease.request('appApprovals/pending', { conversationId: 'unit-session' })).requests, []);
  assert.deepEqual(credentialFiles(dataDir), { bridge: false, pairings: false });
  assert.equal(existsSync(join(dataDir, 'app-approvals.json')), false); assert.equal(existsSync(join(dataDir, 'app-approvals.json.pending')), false);
});

test('default-card inspection rejects hidden, duplicated, wrong-session and clipped approvals without UI actions', async () => {
  function fixture(change = {}) {
    const state = { ...cardEvidence('unit-pending'), ...change }, actions = [];
    const pending = { id: 'unit-pending', conversationId: 'unit-session', request: { appDisplayName: appName } };
    const title = { count: async () => state.titleCount, innerText: async () => state.title };
    const deny = { count: async () => state.denyCount, isVisible: async () => state.denyVisible,
      boundingBox: async () => state.denyBounds };
    const card = { count: async () => state.matchingCardCount,
      waitFor: async options => { assert.deepEqual(options, { state: 'attached' }); assert(state.matchingCardCount > 0); },
      isVisible: async () => state.defaultApprovalVisible, boundingBox: async () => state.bounds,
      getByText(value, options) { assert.equal(value, `允许 OpenCU 使用 ${appName}？`); assert.deepEqual(options, { exact: true }); return title; },
      getByRole(role, options) { assert.equal(role, 'button'); assert(options.name.test('拒绝')); return deny; },
    };
    const surfaces = { count: async () => state.cardCount,
      filter(options) { assert.deepEqual(options, { hasText: appName }); return card; } };
    const page = { locator(selector) { assert.equal(selector, '[data-codex-approval-surface]'); return surfaces; },
      evaluate: async () => ({ sessionId: state.sessionId, boundSessionId: state.boundSessionId, viewport: state.viewport }) };
    const options = { sessionId: 'unit-session', pending,
      beforeObservation: async () => { actions.push('before'); },
      afterObservation: async () => { actions.push('after'); },
    };
    // No locator click, scrollIntoView, DOM mutation or approval API mock exists.
    return { state, actions, options, page, card };
  }
  const visible = fixture(), result = await defaultApprovalCard(visible.page, visible.options);
  assert.equal(result.card, visible.card); assert.deepEqual(visible.actions, ['before', 'after']);
  assert.deepEqual(result.evidence, { beforeCard: cardEvidence('unit-pending'), afterCard: cardEvidence('unit-pending'),
    manualGroupExpansion: false, scrolledIntoView: false, apiApproval: false });
  for (const change of [
    { defaultApprovalVisible: false }, { cardCount: 0 }, { cardCount: 2 }, { matchingCardCount: 0 }, { matchingCardCount: 2 },
    { titleCount: 2 }, { title: `允许 DSH 使用 ${appName}？` }, { denyCount: 2 }, { denyVisible: false },
    { sessionId: 'other-session' }, { boundSessionId: 'other-session' }, { viewport: null }, { bounds: null },
    { bounds: { x: -1, y: 0, width: 600, height: 300 } }, { bounds: { x: 800, y: 0, width: 600, height: 300 } },
    { bounds: { x: 0, y: 800, width: 600, height: 300 } }, { denyBounds: { x: 0, y: 900, width: 80, height: 30 } },
  ]) {
    const invalid = fixture(change); await assert.rejects(defaultApprovalCard(invalid.page, invalid.options));
  }
  const wrongSession = fixture(); wrongSession.options.pending.conversationId = 'other-session';
  await assert.rejects(defaultApprovalCard(wrongSession.page, wrongSession.options));
  const wrongRequest = fixture(); wrongRequest.options.beforeObservation = async () => { wrongRequest.options.pending.id = 'other-request'; };
  await assert.rejects(defaultApprovalCard(wrongRequest.page, wrongRequest.options));
  assert.deepEqual(wrongRequest.actions, []);
  const changed = fixture(); changed.options.afterObservation = async () => { changed.state.defaultApprovalVisible = false; };
  await assert.rejects(defaultApprovalCard(changed.page, changed.options));
});

const httpScope = { sessionId: 'unit-session-验收', requestId: 'unit-pending-1' };
const responseBody = '{"ok":true,"settled":true}';
const requestBody = () => Buffer.from(JSON.stringify({ method: 'appApprovals/respond', args: {
  conversationId: httpScope.sessionId, requestId: httpScope.requestId, action: 'decline', persist: null,
} }));
const shaHttp = bytes => createHash('sha256').update(bytes).digest('hex');
async function httpHarness(t, observer, handler, prepare) {
  const entries = [], errors = [];
  const server = createServer((req, res) => {
    const entry = { req, res, nextCalls: 0, received: [], dataEvents: [] }; entries.push(entry);
    prepare?.(req, res, entry);
    entry.methods = [[req, 'emit'], [res, 'write'], [res, 'end']].map(([object, key]) => ({ object, key,
      descriptor: Object.getOwnPropertyDescriptor(object, key), method: object[key] }));
    const flow = req.readableFlowing, dataListeners = req.listenerCount('data');
    try {
      let original;
      const returned = observer.intercept(req, res, () => {
        entry.nextCalls++;
        assert.equal(req.readableFlowing, flow, 'Installing the observer never changes flow mode');
        assert.equal(req.listenerCount('data'), dataListeners, 'No extra data consumer');
        original = handler(req, res, entry); return original;
      });
      assert.equal(returned, original, 'Original next return/promise identity');
      Promise.resolve(returned).catch(error => { errors.push(error); res.destroy(); });
    } catch (error) { entry.thrown = error; res.end('downstream handled its own error'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { observer.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const send = (body = requestBody(), { path = '/api/opencu', method = 'POST' } = {}) => new Promise((resolve, reject) => {
    const req = nodeRequest({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { 'content-length': body.length, cookie: 'SYNTHETIC_DO_NOT_RECORD', authorization: 'SYNTHETIC_DO_NOT_RECORD' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.once('error', reject);
      res.once('end', () => resolve({ bytes: Buffer.concat(chunks), status: res.statusCode }));
    });
    req.once('error', reject);
    req.write(body.subarray(0, 7)); setImmediate(() => { req.write(body.subarray(7, 29)); req.end(body.subarray(29)); });
  });
  const restored = () => {
    assert.equal(observer.snapshot().active, 0);
    for (const entry of entries) {
      assert.equal(entry.nextCalls, 1);
      for (const { object, key, descriptor, method } of entry.methods) {
        assert.equal(object[key], method); assert.deepEqual(Object.getOwnPropertyDescriptor(object, key), descriptor);
      }
      assert(!entry.res.listeners('finish').some(fn => fn.name === 'onFinish'));
      assert(!entry.res.listeners('close').some(fn => fn.name === 'onClose'));
    }
    assert.deepEqual(errors, []);
  };
  return { server, entries, errors, send, restored };
}
async function consumeHttp(req, entry) {
  // This deliberate await would lose body bytes with an active data listener.
  await delay(15);
  for await (const chunk of req) entry.received.push(chunk);
  return Buffer.concat(entry.received);
}

test('host-http observes actual delayed Node consumption, multiple response chunks and transparent own descriptors', async t => {
  const observer = createApprovalHttpObserver({ expected: () => httpScope });
  let writeCallbacks = 0, endCallbacks = 0;
  const callback1 = () => writeCallbacks++, callback2 = () => writeCallbacks++, callbackEnd = () => endCallbacks++;
  const h = await httpHarness(t, observer, async (req, res, entry) => {
    assert.equal(req.emit('unit-no-listener', 1, callback1), false);
    let delivered = 0; const object = {};
    req.once('unit-arguments', (a, b, c) => { delivered++; assert.equal(a, object); assert.equal(b, callback1); assert.equal(c, 7); });
    assert.equal(req.emit('unit-arguments', object, callback1, 7), true); assert.equal(delivered, 1);
    const bytes = await consumeHttp(req, entry); assert(bytes.equals(requestBody()));
    const first = res.write(Buffer.from('{"ok":'), callback1);
    const second = res.write(new Uint8Array(Buffer.from('true,')), 'utf8', callback2);
    assert.equal(first, entry.writeReturns[0]); assert.equal(second, entry.writeReturns[1]);
    assert.equal(res.end('"settled":true}', 'utf8', callbackEnd), res);
  }, (req, res, entry) => {
    entry.writeReturns = []; entry.writeArgs = []; entry.endArgs = [];
    for (const [object, key] of [[req, 'emit'], [res, 'write'], [res, 'end']]) {
      const original = object[key];
      Object.defineProperty(object, key, { enumerable: true, configurable: true, writable: true, value: function (...args) {
        assert.equal(this, object, 'Original receiver is preserved');
        if (key === 'emit' && args[0] === 'data') entry.dataEvents.push(args[1]);
        if (key === 'write') entry.writeArgs.push(args);
        if (key === 'end') entry.endArgs.push(args);
        const result = Reflect.apply(original, this, args);
        if (key === 'write') entry.writeReturns.push(result);
        return result;
      } });
    }
  });
  const wire = await h.send(); await delay(0); h.restored();
  assert.equal(wire.bytes.toString(), responseBody); assert.equal(writeCallbacks, 2); assert.equal(endCallbacks, 1);
  const entry = h.entries[0];
  assert.equal(entry.writeArgs[0][1], callback1); assert.equal(entry.writeArgs[1][2], callback2); assert.equal(entry.endArgs[0][2], callbackEnd);
  assert.equal(entry.dataEvents.length, entry.received.length);
  entry.received.forEach((chunk, i) => assert.equal(chunk, entry.dataEvents[i], 'Original chunk reference reaches downstream'));
  const snapshot = observer.snapshot(); assert.deepEqual(snapshot.failures, []); assert.equal(snapshot.matches, 1); assert.equal(snapshot.records.length, 1);
  const record = snapshot.records[0];
  assert.equal(record.source, 'host-http'); assert.equal(record.responseSha256, shaHttp(wire.bytes));
  assert.equal(record.responseBytes, wire.bytes.length, 'end(chunk) is counted once');
  assert.equal(record.requestComplete, true); assert.equal(record.readableEnded, true); assert.equal(record.responseFinished, true);
  assert.deepEqual(record.args, JSON.parse(requestBody()).args); assert.deepEqual(record.value, { ok: true, settled: true });
  assert.doesNotMatch(JSON.stringify(snapshot), /cookie|headers|authorization|SYNTHETIC_DO_NOT_RECORD/);
});

test('host-http preserves genuine write false/drain and waits for finish rather than next resolution', async t => {
  const observer = createApprovalHttpObserver({ expected: () => httpScope, responseLimit: 2 * 1024 * 1024 });
  let nextResolvedBeforeFinish = false, drained = false;
  const spaces = Buffer.alloc(1024 * 1024, 32);
  const h = await httpHarness(t, observer, async (req, res, entry) => {
    assert((await consumeHttp(req, entry)).equals(requestBody()));
    assert.equal(res.write(spaces), false, 'Real Node backpressure is not changed to true');
    await once(res, 'drain'); drained = true;
    // End deliberately occurs after next's Promise resolves.
    setTimeout(() => res.end(responseBody), 15);
    nextResolvedBeforeFinish = true;
    assert.equal(observer.snapshot().records.length, 0);
  });
  const wire = await h.send(); h.restored();
  assert(drained && nextResolvedBeforeFinish); assert.equal(wire.bytes.length, spaces.length + Buffer.byteLength(responseBody));
  const record = observer.snapshot().records[0]; assert.equal(record.responseSha256, shaHttp(wire.bytes)); assert.equal(record.responseBytes, wire.bytes.length);
});

test('host-http ignores wrong path/method/scope/action and discards other method bodies', async t => {
  const observer = createApprovalHttpObserver({ expected: () => httpScope });
  const h = await httpHarness(t, observer, async (req, res, entry) => { await consumeHttp(req, entry); res.end(responseBody); });
  const cases = [{ options: { path: '/api/other' } }, { options: { path: '/api/opencu?query=1' } }, { options: { method: 'GET' } },
    { mutate: value => { value.method = 'state'; } }, { mutate: value => { value.args.conversationId = 'other-session'; } },
    { mutate: value => { value.args.requestId = 'other-pending'; } }, { mutate: value => { value.args.action = 'accept'; } },
    { mutate: value => { value.args.persist = 'always'; } }, { mutate: value => { delete value.args.persist; } }];
  for (const value of cases) {
    const body = JSON.parse(requestBody()); value.mutate?.(body); const bytes = Buffer.from(JSON.stringify(body));
    assert.equal((await h.send(bytes, value.options)).bytes.toString(), responseBody);
    assert(Buffer.concat(h.entries.at(-1).received).equals(bytes));
  }
  h.restored(); assert.deepEqual(observer.snapshot(), { source: 'host-http', records: [], failures: [], matches: 0, active: 0 });
});

test('host-http bounded malformed/oversize request and response failures never alter downstream bytes', async t => {
  for (const scenario of ['bad-request-json', 'request-limit', 'bad-response-json', 'response-limit']) {
    const observer = createApprovalHttpObserver({ expected: () => httpScope, requestLimit: scenario === 'request-limit' ? 16 : 4096,
      responseLimit: scenario === 'response-limit' ? 8 : 4096 });
    const reply = scenario === 'bad-response-json' ? 'malformed-original-response' : responseBody;
    const body = scenario === 'bad-request-json' ? Buffer.from('{malformed') : requestBody();
    const h = await httpHarness(t, observer, async (req, res, entry) => { await consumeHttp(req, entry); res.end(reply); });
    const wire = await h.send(body); h.restored();
    assert(Buffer.concat(h.entries[0].received).equals(body)); assert.equal(wire.bytes.toString(), reply);
    assert.equal(observer.snapshot().records.length, 0); assert(observer.snapshot().failures.length > 0);
  }
});

test('host-http duplicate matching responses remain detectable and unarmed requests remain untouched', async t => {
  let armed = false;
  const observer = createApprovalHttpObserver({ expected: () => armed ? httpScope : undefined });
  const h = await httpHarness(t, observer, async (req, res, entry) => { await consumeHttp(req, entry); res.end(responseBody); });
  await h.send(); assert.equal(observer.snapshot().matches, 0);
  armed = true; await h.send(); await h.send(); h.restored();
  assert.equal(observer.snapshot().matches, 2); assert.equal(observer.snapshot().records.length, 2);
  assert(observer.snapshot().failures.includes('duplicate-response'));
});

test('host-http restores prototype methods on request abort, close-before-finish and disposal', async t => {
  for (const scenario of ['request-abort', 'response-close', 'dispose']) {
    const observer = createApprovalHttpObserver({ expected: () => httpScope });
    const h = await httpHarness(t, observer, async (req, res, entry) => {
      if (scenario === 'request-abort') {
        try { for await (const chunk of req) entry.received.push(chunk); } catch { entry.expectedAbort = true; }
        return;
      }
      await consumeHttp(req, entry);
      if (scenario === 'dispose') observer.dispose();
      res.write('{"ok":true'); res.destroy();
    });
    if (scenario === 'request-abort') {
      const req = nodeRequest({ hostname: '127.0.0.1', port: h.server.address().port, path: '/api/opencu', method: 'POST', headers: { 'content-length': 999 } });
      req.on('error', () => {}); req.write(Buffer.from('partial'));
      await until(() => h.entries[0]?.received.length > 0); req.destroy();
      await until(() => observer.snapshot().active === 0);
      assert.equal(Buffer.concat(h.entries[0].received).toString(), 'partial');
    } else await assert.rejects(h.send());
    await delay(0); h.restored(); assert.equal(observer.snapshot().records.length, 0);
    if (scenario !== 'dispose') assert(observer.snapshot().failures.length > 0);
    for (const { object, key, descriptor } of h.entries[0].methods) assert.equal(Object.hasOwn(object, key), descriptor !== undefined);
  }
});

test('host-http forwards original emit/write/end exceptions and next throws without compensation', async t => {
  for (const scenario of ['emit', 'write', 'end', 'next']) {
    const observer = createApprovalHttpObserver({ expected: () => httpScope });
    const marker = Error('exact-original-error'); let originalError;
    const h = await httpHarness(t, observer, (req, res, entry) => {
      if (scenario === 'next') throw marker;
      if (scenario === 'emit') { req.on('unit-throw', () => { throw marker; }); req.emit('unit-throw', marker); }
      return (async () => {
        await consumeHttp(req, entry);
        try { res[scenario]({ invalidNodeChunk: true }); }
        catch (error) { assert.equal(error, originalError); entry.caught = error; res.end('original downstream recovery'); }
      })();
    }, (_req, res) => {
      if (!['write', 'end'].includes(scenario)) return;
      const original = res[scenario];
      Object.defineProperty(res, scenario, { configurable: true, enumerable: false, writable: true, value: function (...args) {
        try { return Reflect.apply(original, this, args); } catch (error) { originalError = error; throw error; }
      } });
    });
    const wire = await h.send(); h.restored(); assert.equal(observer.snapshot().records.length, 0);
    if (scenario === 'next' || scenario === 'emit') { assert.equal(h.entries[0].thrown, marker); assert.equal(wire.bytes.toString(), 'downstream handled its own error'); }
    else { assert(h.entries[0].caught); assert.equal(wire.bytes.toString(), 'original downstream recovery'); }
  }
});

test('host-http preserves an asynchronously rejected next Promise without swallowing its error', async t => {
  const observer = createApprovalHttpObserver({ expected: () => httpScope }), marker = Error('original-next-rejection');
  const h = await httpHarness(t, observer, () => Promise.reject(marker));
  await assert.rejects(h.send()); await until(() => observer.snapshot().active === 0);
  assert.equal(h.errors.shift(), marker); h.restored(); assert.equal(observer.snapshot().records.length, 0);
});

test('host-http rejects changed scope and caps active copies without changing either original request', async t => {
  let scope = httpScope;
  const observer = createApprovalHttpObserver({ expected: () => scope });
  const h = await httpHarness(t, observer, async (req, res, entry) => {
    await consumeHttp(req, entry); scope = { ...httpScope, requestId: 'another-request' }; res.end(responseBody);
  });
  assert.equal((await h.send()).bytes.toString(), responseBody); h.restored();
  assert.equal(observer.snapshot().records.length, 0); assert(observer.snapshot().failures.includes('scope-changed'));
  const bounded = createApprovalHttpObserver({ expected: () => httpScope, maxActive: 1 });
  const parallel = await httpHarness(t, bounded, async (req, res, entry) => { await consumeHttp(req, entry); await delay(20); res.end(responseBody); });
  const both = await Promise.all([parallel.send(), parallel.send()]); parallel.restored();
  both.forEach(value => assert.equal(value.bytes.toString(), responseBody));
  parallel.entries.forEach(entry => assert(Buffer.concat(entry.received).equals(requestBody())));
  assert(bounded.snapshot().failures.includes('active-limit')); assert.equal(bounded.snapshot().records.length, 1);
  for (const options of [{ requestLimit: Infinity }, { requestLimit: 65537 }, { responseLimit: 4 * 1024 * 1024 + 1 }, { maxActive: 17 }])
    assert.throws(() => createApprovalHttpObserver({ expected: () => httpScope, ...options }), /bound/);
});

// No harness catch/destroy: only the original caller observes rejection.
// Teardown or an explicit end happens after observer cleanup assertions.
async function deferredHttpOutcome(t, finishFirst) {
  const observer = createApprovalHttpObserver({ expected: () => httpScope });
  const outcome = Promise.withResolvers(), ready = Promise.withResolvers(), finished = Promise.withResolvers();
  let entry, callerError;
  const server = createServer((req, res) => {
    const methods = [[req, 'emit'], [res, 'write'], [res, 'end']].map(([object, key]) => ({ object, key,
      descriptor: Object.getOwnPropertyDescriptor(object, key), method: object[key] }));
    entry = { req, res, methods, nextCalls: 0, closeSeen: false };
    res.once('close', () => { entry.closeSeen = true; });
    res.once('finish', finished.resolve);
    const returned = observer.intercept(req, res, () => {
      entry.nextCalls++;
      (async () => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        assert(Buffer.concat(chunks).equals(requestBody()));
        if (finishFirst) res.end(responseBody);
        ready.resolve();
      })().catch(ready.reject);
      return outcome.promise;
    });
    assert.equal(returned, outcome.promise);
    returned.catch(error => { callerError = error; }); // Never close/destroy/end here.
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { observer.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const wire = new Promise((resolve, reject) => {
    const req = nodeRequest({ hostname: '127.0.0.1', port: server.address().port, method: 'POST', path: '/api/opencu' }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    }); req.on('error', reject); req.end(requestBody());
  });
  wire.catch(() => {}); await ready.promise;
  if (finishFirst) await finished.promise;
  const restored = () => {
    assert.equal(observer.snapshot().active, 0); assert.equal(entry.nextCalls, 1);
    for (const { object, key, descriptor, method } of entry.methods) {
      assert.equal(object[key], method); assert.deepEqual(Object.getOwnPropertyDescriptor(object, key), descriptor);
    }
    assert(!entry.res.listeners('finish').some(fn => fn.name === 'onFinish'));
    assert(!entry.res.listeners('close').some(fn => fn.name === 'onClose'));
  };
  return { observer, outcome, entry, wire, restored, callerError: () => callerError };
}

test('host-http async reject without finish or close cleans itself and preserves original rejection', async t => {
  const h = await deferredHttpOutcome(t, false), marker = Error('reject-without-close');
  assert.equal(h.entry.res.destroyed, false); assert.equal(h.entry.res.writableEnded, false);
  h.outcome.reject(marker);
  await assert.rejects(h.outcome.promise, error => error === marker); await delay(0);
  assert.equal(h.callerError(), marker); h.restored();
  assert(h.observer.snapshot().failures.includes('next-rejected')); assert.equal(h.observer.snapshot().records.length, 0);
  assert.equal(h.entry.res.destroyed, false); assert.equal(h.entry.res.writableEnded, false);
  h.entry.res.end(responseBody); assert.equal(await h.wire, responseBody);
});

test('host-http finish before delayed reject never publishes a successful receipt', async t => {
  const h = await deferredHttpOutcome(t, true), marker = Error('reject-after-finish');
  assert.equal(await h.wire, responseBody);
  const beforeReject = h.observer.snapshot().records.length;
  await delay(5); h.outcome.reject(marker);
  await assert.rejects(h.outcome.promise, error => error === marker); await delay(0);
  h.restored(); assert.equal(h.callerError(), marker);
  assert.deepEqual([beforeReject, h.observer.snapshot().records.length], [0, 0], 'Neither finish alone nor later rejection may publish success');
  assert(h.observer.snapshot().failures.includes('next-rejected'));
});

test('host-http finish before delayed fulfill publishes exactly once only after fulfill', async t => {
  const h = await deferredHttpOutcome(t, true);
  assert.equal(await h.wire, responseBody); await until(() => h.entry.closeSeen);
  assert.deepEqual(h.observer.snapshot().failures, []); assert.equal(h.observer.snapshot().records.length, 0);
  h.entry.res.statusCode = 599; // Cannot change the already-finished wire status.
  await delay(5); h.outcome.resolve(); await h.outcome.promise; await delay(0);
  h.restored(); assert.deepEqual(h.observer.snapshot().failures, []); assert.equal(h.observer.snapshot().records.length, 1);
  assert.equal(h.observer.snapshot().records[0].status, 200);
  assert.equal(h.observer.snapshot().records[0].responseSha256, shaHttp(Buffer.from(responseBody)));
  await delay(0); assert.equal(h.observer.snapshot().records.length, 1);
});

test('host-http preserves synchronous non-Promise next values while waiting for real finish', async t => {
  for (const value of [17, { original: true }]) {
    const observer = createApprovalHttpObserver({ expected: () => httpScope });
    const h = await httpHarness(t, observer, (req, res, entry) => {
      consumeHttp(req, entry).then(() => res.end(responseBody), error => { entry.bodyError = error; res.destroy(); });
      return value;
    });
    assert.equal((await h.send()).bytes.toString(), responseBody); h.restored();
    assert.equal(h.entries[0].bodyError, undefined); assert.deepEqual(observer.snapshot().failures, []);
    assert.equal(observer.snapshot().records.length, 1);
  }
});
