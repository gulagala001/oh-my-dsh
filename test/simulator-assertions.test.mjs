import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFaultLedger } from '../scripts/simulator/assertions.mjs';
import { suiteStatus } from '../scripts/simulate.mjs';

const arm = { type: 'arm', fault: { id: 'f1', count: 1 } };
const consumed = { type: 'failure', faultId: 'f1', remaining: 0 };

test('unconsumed faults cannot disappear on cleanup or a new host boot', () => {
  assert.throws(() => assertFaultLedger([arm]), /unconsumed/);
  assert.throws(() => assertFaultLedger([arm, { type: 'clear', remaining: 1 }]), /unconsumed/);
  assert.throws(() => assertFaultLedger([arm, { type: 'ready' }]), /unconsumed/);
  assert.doesNotThrow(() => assertFaultLedger([arm, consumed, { type: 'clear', remaining: 0 }, { type: 'ready' }, arm, consumed]));
});

test('fault evidence rejects missing, duplicate, overconsumed and unsupported injections', () => {
  assert.throws(() => assertFaultLedger([consumed]), /without an arm/);
  assert.throws(() => assertFaultLedger([arm, arm]), /duplicate/);
  assert.throws(() => assertFaultLedger([arm, consumed, consumed]));
  assert.throws(() => assertFaultLedger([arm, { ...consumed, remaining: 1 }]));
  assert.throws(() => assertFaultLedger([{ type: 'unsupported', api: 'native-fd' }]), /unsupported/);
});

test('original exploration failures control the suite even without a child report', () => {
  const reports = [{ status: 'pass' }];
  const completed = { status: 'completed', total: 1, results: [{ status: 'fail' }] };
  assert.equal(suiteStatus(reports, { exploration: completed }), 'fail');
  assert.equal(suiteStatus(reports, { exploration: { ...completed, results: [{ status: 'invalid' }] } }), 'fail');
  assert.equal(suiteStatus(reports, { exploration: { ...completed, status: 'deadline', results: [{ status: 'fail' }, { status: 'timeout' }] } }), 'fail');
  assert.equal(suiteStatus([], { exploration: { ...completed, results: [{ status: 'pass' }] } }), 'pass');
});

test('partial, timed out or cancelled exploration never becomes PASS', () => {
  for (const exploration of [
    { status: 'completed', total: 2, results: [{ status: 'pass' }] },
    { status: 'deadline', total: 1, results: [{ status: 'pass' }] },
    { status: 'completed', total: 1, results: [{ status: 'timeout' }] },
    { status: 'completed', total: 1, results: [{ status: 'cancelled' }] },
  ]) assert.equal(suiteStatus([{ status: 'pass' }], { exploration }), 'incomplete');
  assert.equal(suiteStatus([{ status: 'pass' }], { aborted: true, exploration: { status: 'completed', total: 1, results: [{ status: 'pass' }] } }), 'incomplete');
  assert.equal(suiteStatus([]), 'fail');
});

test('a real late cleanup failure wins over an earlier exploration timeout', () => {
  const exploration = { status: 'deadline', total: 1, results: [{ status: 'timeout' }] };
  assert.equal(suiteStatus([{ status: 'fail', interruption: 'exploration_timeout' }], { exploration }), 'incomplete');
  assert.equal(suiteStatus([{ status: 'fail', error: { code: 'CLEANUP_DEADLINE' } }], { exploration }), 'fail');
  assert.equal(suiteStatus([{ status: 'fail', error: { code: 'SIM_ASSERTION' } }], { exploration }), 'fail');
  assert.equal(suiteStatus([{ status: 'fail', error: { errors: [{ code: 'exploration_timeout' }, { code: 'SIM_PROCESS_CLEANUP' }] } }], { exploration }), 'fail');
});
