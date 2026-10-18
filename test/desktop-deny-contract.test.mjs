import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { markAgentLoopRequest, isAgentLoopRequest, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { acquireOpenCU } from '../vendor/opencu/src/dsh/shared.mjs';
import { assertDenyReport } from './fixtures/desktop-deny/gate.mjs';
import { installToolDefinitions } from '../vendor/opencu/src/dsh/tools.mjs';
import { syntheticBackend, acquireBeforeStart, warmTargets, createModelGuard, createWireProtocol,
  credentialFiles, disabledBackends, forbiddenMethods, provider, model, callId, targetId, declinedText, assertPending, assertDenied } from './fixtures/desktop-deny/protocol.mjs';

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
  const response = { args: { conversationId: 'unit-session', requestId: pending.id, action: 'decline', persist: null } };
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
  const tap = '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n';
  const report = { status: 'passed', executed: 1, skipped: 0, phase: 'checks-complete', cancelledForCleanup: false,
    launches: [{ pid: 1 }, { pid: 2 }], shutdowns: [1, 2].map(() => ({ naturalExit: true, exitCode: 0, signalCode: null })),
    counts: { localModelRequests: 2, toolCalls: 1, externalModelRequests: 0, physicalInputs: 0 }, errors: [], approvalResponses: [response],
    pending: { deny: snapshot }, denied: { deny: value, modelCalls: value.modelCalls, rejectedModels: [] }, providerRequests: wire.requests, providerFailures: [] };
  assertDenyReport(tap, report);
  for (const invalid of ['', tap.replace('# tests 1', '# tests 0'), tap.replace('# skipped 0', '# skipped 1'), tap.replace('# pass 1', '# pass 0')]) assert.throws(() => assertDenyReport(invalid, report));
  for (const mutate of [r => { r.cancelledForCleanup = true; }, r => { r.shutdowns[1].naturalExit = false; }, r => { r.counts.localModelRequests = 1; },
    r => { r.counts.externalModelRequests = 1; }, r => { r.counts.physicalInputs = 1; }, r => { r.launches[1].pid = 1; }]) {
    const invalid = structuredClone(report); mutate(invalid); assert.throws(() => assertDenyReport(tap, invalid));
  }
  for (const method of forbiddenMethods) assert.equal(synthetic.calls[method], 0);
  assert.deepEqual((await lease.request('state')).state.targets, []);
  assert.deepEqual((await lease.request('appApprovals/pending', { conversationId: 'unit-session' })).requests, []);
  assert.deepEqual(credentialFiles(dataDir), { bridge: false, pairings: false });
  assert.equal(existsSync(join(dataDir, 'app-approvals.json')), false); assert.equal(existsSync(join(dataDir, 'app-approvals.json.pending')), false);
});
