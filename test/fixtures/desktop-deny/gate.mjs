import assert from 'node:assert/strict';
import { assertPending, assertDenied } from './protocol.mjs';

export function assertDenyReport(tap, report) {
  for (const [key, expected] of [['tests', 1], ['pass', 1], ['fail', 0], ['cancelled', 0], ['skipped', 0]]) {
    const match = tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    assert(match, 'Missing Deny test count: ' + key);
    assert.equal(Number(match[1]), expected, 'Deny test count: ' + key);
  }
  assert.equal(report.status, 'passed'); assert.equal(report.executed, 1); assert.equal(report.skipped, 0);
  assert.equal(report.phase, 'checks-complete'); assert.equal(report.cancelledForCleanup, false);
  assert.equal(report.launches.length, 2); assert.equal(report.shutdowns.length, 2);
  assert.notEqual(report.launches[0].pid, report.launches[1].pid);
  for (const row of report.shutdowns) { assert.equal(row.naturalExit, true); assert.equal(row.exitCode, 0); assert.equal(row.signalCode, null); }
  assert.deepEqual(report.counts, { localModelRequests: 2, toolCalls: 1, externalModelRequests: 0, physicalInputs: 0 });
  assert.deepEqual(report.errors, []); assert.equal(report.approvalResponses.length, 1);
  const response = report.approvalResponses[0];
  assert.equal(response.source, 'host-http'); assert.equal(response.requestComplete, true);
  assert.equal(response.readableEnded, true); assert.equal(response.responseFinished, true);
  assert(response.responseBytes > 0); assert.match(response.responseSha256, /^[a-f0-9]{64}$/);
  const sessionId = report.denied.deny.agent.id;
  const pending = assertPending(report.pending.deny, sessionId);
  assert.equal(report.groupNavigation.defaultApprovalVisible, false);
  assert.equal(report.groupNavigation.manualGroupExpansion, true);
  assert.equal(report.groupNavigation.callId, 'omd-deny-select-1');
  assert(report.groupNavigation.bodyId);
  for (const state of [report.groupNavigation.before, report.groupNavigation.after])
    assert.deepEqual(state, { requestId: pending.id, sessionId, localModelRequests: 1, physicalInputs: 0 });
  assertDenied({ ...report.denied.deny, modelCalls: report.denied.modelCalls, rejectedModels: report.denied.rejectedModels }, {
    sessionId, requestId: pending.id, response: report.approvalResponses[0],
    wire: { requests: report.providerRequests, failures: report.providerFailures },
  });
}
