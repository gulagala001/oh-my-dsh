import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const provider = 'desktop-deny-fixture';
export const model = 'deny-fixture';
export const callId = 'omd-deny-select-1';
export const targetId = 'omd-deny-sentinel';
export const appName = 'OMD Deny Fixture';
export const declinedText = `Access to ${appName} was declined`;
export const completionText = 'OMD Deny fixture completed without application access.';
export const disabledBackends = { browserEnabled: false, nativeEnabled: false, extensionEnabled: false, managedHeadless: false };
export const forbiddenMethods = ['select', 'verify', 'observe', 'act', 'focus', 'preview'];

export function credentialFiles(dataDir) {
  return { bridge: existsSync(join(dataDir, 'extension-connection.json')), pairings: existsSync(join(dataDir, 'extension', 'browser-pairings.json')) };
}

export function syntheticBackend(root) {
  const directory = resolve(root, 'sentinel');
  assert(directory.startsWith(resolve(root) + sep));
  const executable = join(directory, 'never-created-fixture-executable');
  assert.equal(existsSync(executable), false, 'Sentinel must not be a real executable');
  const target = { id: targetId, backend: 'native', kind: 'native', name: appName, title: appName,
    identity: { executable, fixture: 'local-test-only' } };
  const calls = Object.fromEntries(['listTargets', 'applicationMetadata', 'release', 'close', ...forbiddenMethods].map(key => [key, 0]));
  const backend = {
    async listTargets() { calls.listTargets++; assert.equal(existsSync(executable), false); return [structuredClone(target)]; },
    async applicationMetadata(value) { calls.applicationMetadata++; assert.equal(value.id, targetId); return { displayName: appName, iconDataURL: null }; },
    async release() { calls.release++; return { released: true }; },
    async close() { calls.close++; },
  };
  for (const method of forbiddenMethods) backend[method] = async () => {
    calls[method]++; throw Error('Deny fixture forbids backend ' + method);
  };
  return { backend, calls, target };
}

export function acquireBeforeStart(ctx, config, synthetic) {
  assert.equal(existsSync(join(config.dataDir, 'controller.lock')), false, 'Synthetic injection is too late: controller already started');
  const lease = ctx.opencu.acquire(ctx, { namespace: 'opencu', config: {
    ...disabledBackends, dataDir: config.dataDir, native: synthetic.backend,
  } });
  assert.equal(resolve(lease.dataDir), resolve(config.dataDir), 'The configuration owner must use the exclusive data directory');
  return lease;
}

export async function warmTargets(lease, synthetic) {
  const before = synthetic.calls.listTargets;
  const inventory = await lease.request('targets');
  assert.equal(inventory.ok, true); assert.deepEqual(inventory.errors, []);
  assert.equal(inventory.targets.length, 1);
  const target = inventory.targets[0];
  assert.equal(target.id, targetId); assert.equal(target.backend, 'native');
  assert.deepEqual(target.identity, synthetic.target.identity);
  assert(synthetic.calls.listTargets > before, 'Inventory must actually call the injected backend; late injection cannot silently reuse a controller');
  return inventory;
}

export function createModelGuard(readSession, isAgentLoopRequest) {
  const attempts = [], rejected = [];
  return { attempts, rejected, intercept(options, next) {
    const row = { provider: options.provider, model: options.model, sessionId: options.sessionId, purpose: options.purpose };
    attempts.push(row);
    const sessionId = readSession();
    if (!sessionId || options.sessionId !== sessionId || options.provider !== provider || options.model !== model
      || options.purpose !== undefined || !isAgentLoopRequest(options) || attempts.length > 2) {
      rejected.push(row); throw Error('Deny acceptance rejected an unexpected model route/session/purpose/count');
    }
    return next(); // The official adapter must produce every chunk.
  } };
}

export function createWireProtocol() {
  const requests = [], failures = [];
  return { requests, failures, respond(body) {
    try {
      assert.equal(requests.length < 2, true, 'Only two model HTTP requests are allowed');
      assert.equal(body.model, model); assert.equal(body.stream, true);
      assert(Array.isArray(body.messages));
      assert(body.tools?.some(tool => tool.type === 'function' && tool.function?.name === 'opencu_select'), 'Actual Agent exposes the real OpenCU tool');
      const tools = body.messages.filter(message => message.role === 'tool');
      const assistantCalls = body.messages.flatMap(message => message.role === 'assistant' ? message.tool_calls ?? [] : []);
      if (requests.length === 0) {
        assert.equal(tools.length, 0); assert.equal(assistantCalls.length, 0);
      } else {
        assert.equal(assistantCalls.length, 1); assert.equal(assistantCalls[0].id, callId);
        assert.equal(assistantCalls[0].function.name, 'opencu_select');
        assert.deepEqual(JSON.parse(assistantCalls[0].function.arguments), { reference: targetId });
        assert.equal(tools.length, 1); assert.equal(tools[0].tool_call_id, callId);
        assert.equal(typeof tools[0].content, 'string'); assert(tools[0].content.includes(declinedText), 'Second request must carry the real declined tool result');
      }
      requests.push({ model: body.model, stream: body.stream, toolResults: tools.map(({ tool_call_id, content }) => ({ callId: tool_call_id, content })), assistantCalls });
      const first = requests.length === 1;
      const delta = first ? { role: 'assistant', tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: 'opencu_select', arguments: JSON.stringify({ reference: targetId }) } }] }
        : { role: 'assistant', content: completionText };
      const chunk = (delta, finish_reason) => ({ id: 'chatcmpl-omd-deny-' + requests.length, object: 'chat.completion.chunk', created: 1, model,
        choices: [{ index: 0, delta, finish_reason }] });
      return [chunk(delta, null), chunk({}, first ? 'tool_calls' : 'stop')].map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') + 'data: [DONE]\n\n';
    } catch (error) { failures.push(error.message); throw error; }
  } };
}

export function assertPending(value, sessionId) {
  assert.equal(value.pending.length, 1); const pending = value.pending[0];
  assert.equal(pending.conversationId, sessionId); assert.equal(pending.targetId, targetId);
  assert.equal(pending.request.appDisplayName, appName); assert(pending.id);
  assert.deepEqual(value.approvals.approvedApps, []); assert.deepEqual(value.selected, []);
  assert.deepEqual(value.authorizationFiles, { persisted: false, pending: false });
  assert.deepEqual(value.credentialFiles, { bridge: false, pairings: false }, 'No persistent extension/bridge credentials');
  assert(value.calls.listTargets > 0 && value.calls.applicationMetadata > 0, 'Real inventory and metadata called the synthetic backend');
  for (const method of forbiddenMethods) assert.equal(value.calls[method], 0, 'Forbidden backend invocation: ' + method);
  return pending;
}

export function assertWaitingApproval(snapshot, { sessionId, pending, localModelRequests }) {
  const current = assertPending(snapshot.deny, sessionId);
  assert.deepEqual(current, pending, 'Default-card observation must retain the same real pending request');
  assert.equal(snapshot.modelCalls.length, 1, 'Default-card observation cannot advance the Agent');
  assert.deepEqual(snapshot.rejectedModels, []); assert.equal(localModelRequests, 1);
  const row = snapshot.modelCalls[0];
  assert.equal(row.provider, provider); assert.equal(row.model, model); assert.equal(row.sessionId, sessionId); assert.equal(row.purpose, undefined);
  return { requestId: current.id, sessionId: current.conversationId, localModelRequests, physicalInputs: forbiddenMethods.reduce((sum, key) => sum + snapshot.deny.calls[key], 0) };
}

export function assertDenied(value, { sessionId, requestId, response, wire }) {
  assert.deepEqual(response.args, { conversationId: sessionId, requestId, action: 'decline', persist: null });
  assert.equal(response.value.ok, true); assert.equal(response.value.settled, true);
  assert.deepEqual(value.pending, []); assert.deepEqual(value.selected, []); assert.deepEqual(value.approvals.approvedApps, []);
  assert.deepEqual(value.authorizationFiles, { persisted: false, pending: false });
  assert.deepEqual(value.credentialFiles, { bridge: false, pairings: false }, 'No persistent extension/bridge credentials');
  assert.equal(value.nativeToolRuntime, true); assert.equal(value.nativeAgentRegistry, true); assert.equal(value.agentOwnsSession, true);
  assert.equal(value.agent.status, 'idle'); assert.equal(value.header.agentPreset, 'trisoul-x');
  const events = value.events, calls = events.filter(event => event.type === 'tool/call'), results = events.filter(event => event.type === 'tool/result');
  assert.equal(calls.length, 1); assert.equal(calls[0].data.name, 'opencu_select'); assert.equal(calls[0].data.callId, callId);
  assert.deepEqual(JSON.parse(calls[0].data.arguments), { reference: targetId });
  assert.equal(results.length, 1); const message = results[0].data.message;
  assert.equal(message.toolCallId, callId); assert.equal(message.role, 'tool'); assert.deepEqual(message.source, { kind: 'tool', callId }); assert.equal(message.isError, true);
  assert(message.content.some(part => part.type === 'text' && part.text.includes(declinedText)), 'Official tool result contains the actual denial text');
  const ends = events.filter(event => event.type === 'turn/end');
  assert.equal(ends.length, 1); assert.equal(ends[0].data.reason.kind, 'completed');
  assert.equal(value.activity.latest.error.code, 'APP_ACCESS_DENIED'); assert.equal(value.activity.latest.status, 'failed');
  assert.equal(value.modelCalls.length, 2); assert.deepEqual(value.rejectedModels, []);
  for (const row of value.modelCalls) { assert.equal(row.provider, provider); assert.equal(row.model, model); assert.equal(row.sessionId, sessionId); assert.equal(row.purpose, undefined); }
  assert.equal(wire.requests.length, 2); assert.deepEqual(wire.failures, []);
  assert.equal(wire.requests[1].toolResults[0].callId, callId); assert(wire.requests[1].toolResults[0].content.includes(declinedText));
  assert(value.calls.listTargets > 0 && value.calls.applicationMetadata > 0);
  for (const method of forbiddenMethods) assert.equal(value.calls[method], 0, 'Deny reached physical backend: ' + method);
}
