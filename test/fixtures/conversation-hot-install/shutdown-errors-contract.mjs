import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceDiagnostics } from './resources.mjs';
import { classifyShutdownErrors } from './shutdown-errors.mjs';

export function shutdownFixture(kinds = ['module', 'opencu']) {
  let time = 0; const errors = [], errorEvents = [];
  const value = createResourceDiagnostics({ now: () => time++, write() {} });
  value.mark('quit-before'); value.mark('quit-evaluation-returned'); value.mark('quit-issued-received');
  for (const kind of kinds) {
    const key = {}, module = kind === 'module', url = 'dsh-app://app/' + (module ? 'plugins/events' : 'api/opencu');
    const method = module ? 'GET' : 'POST', type = module ? 'eventsource' : 'fetch';
    const errorText = module ? 'net::ERR_FAILED' : 'net::ERR_UNEXPECTED';
    value.request({ key, url, method, type, readBody: () => '{"method":"events","args":["PRIVATE"]}' });
    value.failed({ key, url, method, type, errorText });
    const resourceSequence = value.consoleError({ url, lineNumber: 0, columnNumber: 0 });
    const message = 'Failed to load resource: ' + errorText;
    errors.push(message); errorEvents.push({ source: 'console', message, resourceSequence });
  }
  value.mark('host-before-exit-received', { pid: 100 }); value.mark('host-exit-received', { pid: 100 });
  value.pageEvent('page-close'); value.mark('electron-exit', { pid: 200 }); value.mark('exit-verified');
  return { errors, errorEvents, resources: value.snapshot(),
    shutdowns: [{ pid: 200, hostPid: 100, exitCode: 0, signalCode: null, naturalExit: true }],
    lifecycle: ['ready', 'disposed', 'before-exit', 'exit'].map(event => ({ event, bootId: 'activation', pid: 100,
      code: 0, rootDisposed: true, modelCalls: 0 })) };
}
const rows = r => [...r.resources.marks, ...r.resources.events, ...r.resources.critical];
const find = (r, kind) => rows(r).find(row => row.kind === kind);
for (const kinds of [[], ['module'], ['opencu'], ['module', 'opencu']]) {
  test('strict natural-exit classification accepts ' + JSON.stringify(kinds), () => {
    const r = shutdownFixture(kinds), before = structuredClone(r), result = classifyShutdownErrors(r);
    assert.equal(result.ok, true, result.reasons.join(','));
    assert.equal(result.rawErrorCount, kinds.length); assert.equal(result.expectedShutdownCount, kinds.length);
    assert.deepEqual(r, before, 'Raw errors and all observations remain unchanged');
  });
}
for (const [name, mutate, reason] of [
  ['request before quit', r => { find(r, 'request').sequence = 0; }, 'request-outside-confirmed-quit-window'],
  ['terminal before quit', r => { find(r, 'requestfailed').sequence = 0; }, 'request-outside-confirmed-quit-window'],
  ['missing quit', r => { r.resources.marks = r.resources.marks.filter(row => row.label !== 'quit-issued-received'); }, 'missing-or-duplicate-quit-issued-received'],
  ['missing quit request', r => { r.resources.marks = r.resources.marks.filter(row => row.label !== 'quit-before'); }, 'missing-or-duplicate-quit-before'],
  ['missing page close', r => { r.resources.critical = r.resources.critical.filter(row => row.kind !== 'page-close'); }, 'missing-or-duplicate-page-close'],
  ['missing natural proof', r => { r.shutdowns = []; }, 'missing-natural-exit-proof'],
  ['nonzero Electron exit', r => { r.shutdowns[0].exitCode = 1; }, 'missing-natural-exit-proof'],
  ['Electron signal', r => { r.shutdowns[0].signalCode = 'SIGTERM'; }, 'missing-natural-exit-proof'],
  ['nonzero Host exit', r => { r.lifecycle.at(-1).code = 1; }, 'invalid-host-lifecycle'],
  ['Host signal', r => { r.lifecycle.push({ pid: 100, event: 'termination-signal' }); }, 'invalid-host-lifecycle'],
  ['missing Host before-exit', r => { r.lifecycle = r.lifecycle.filter(row => row.event !== 'before-exit'); }, 'invalid-host-lifecycle'],
  ['cleanup instead of quit', r => { r.resources.marks[0].label = 'cleanup-app-close-before'; }, 'cleanup-is-not-natural-quit'],
  ['missing request start', r => { r.resources.events = r.resources.events.filter(row => row.kind !== 'request'); }, 'missing-or-duplicate-request-start'],
  ['missing terminal', r => { r.resources.critical = r.resources.critical.filter(row => row.kind !== 'requestfailed'); }, 'unmatched-raw-errors-or-terminals'],
  ['wrong requestId', r => { find(r, 'requestfailed').requestId++; }, 'missing-or-duplicate-request-start'],
  ['unobserved start', r => { find(r, 'requestfailed').startObserved = false; }, 'missing-or-duplicate-request-start'],
  ['metadata mismatch', r => { find(r, 'requestfailed').startedMs++; }, 'request-metadata-mismatch'],
  ['missing start metadata', r => { delete find(r, 'request').startedMs; delete find(r, 'requestfailed').startedMs; }, 'request-metadata-mismatch'],
  ['terminal after page close', r => { find(r, 'requestfailed').sequence = 98; find(r, 'requestfailed').ms = 98; }, 'request-outside-confirmed-quit-window'],
  ['missing Electron exit observation', r => { r.resources.marks = r.resources.marks.filter(row => row.label !== 'electron-exit'); }, 'missing-or-duplicate-electron-exit'],
  ['missing verified exit', r => { r.resources.marks = r.resources.marks.filter(row => row.label !== 'exit-verified'); }, 'missing-or-duplicate-exit-verified'],
  ['wrong Host observation pid', r => { r.resources.marks.find(row => row.label === 'host-exit-received').pid++; }, 'missing-natural-exit-proof'],
  ['unknown resource', r => { find(r, 'requestfailed').resource.category = 'path-redacted'; }, 'non-allowlisted-terminal'],
  ['wrong origin', r => { find(r, 'requestfailed').resource.origin = 'current-loopback'; }, 'non-allowlisted-terminal'],
  ['wrong error', r => { find(r, 'requestfailed').errorText = 'net::ERR_ABORTED'; }, 'non-allowlisted-terminal'],
  ['extra pageerror with identical text', r => { r.errors.push(r.errors[0]); r.errorEvents.push({ source: 'pageerror', message: r.errors[0] }); }, 'non-console-renderer-error'],
  ['pageerror replacing console text', r => { r.errorEvents[0].source = 'pageerror'; }, 'non-console-renderer-error'],
  ['extra unmatched raw error', r => { r.errors.push('other'); }, 'raw-error-ledger-mismatch'],
  ['wrong console message', r => { r.errors[0] = r.errorEvents[0].message = 'other'; }, 'console-message-mismatch'],
  ['console before terminal', r => { find(r, 'console-error').sequence = 0; }, 'unmatched-or-duplicate-console'],
  ['missing console', r => { r.resources.critical = r.resources.critical.filter(row => row.kind !== 'console-error'); }, 'console-ledger-mismatch'],
  ['duplicate console link', r => { r.errorEvents.push({ ...r.errorEvents[0] }); r.errors.push(r.errors[0]); }, 'console-ledger-mismatch'],
  ['extra console', r => { r.resources.critical.push({ ...find(r, 'console-error'), sequence: 99, ms: 99 }); }, 'console-ledger-mismatch'],
  ['in-memory overflow', r => { r.resources.dropped = 1; }, 'diagnostic-omission'],
  ['stdout omission', r => { r.resources.droppedOrOmitted = 1; }, 'diagnostic-omission'],
]) test('strict shutdown rejects ' + name, () => {
  const r = shutdownFixture(['module']); mutate(r); const result = classifyShutdownErrors(r);
  assert.equal(result.ok, false); assert(result.reasons.includes(reason), JSON.stringify(result));
});
for (const method of ['browser/disconnect', 'other', 'invalid', undefined]) test('OpenCU never exempts ' + method, () => {
  const r = shutdownFixture(['opencu']);
  for (const row of rows(r).filter(row => row.requestId)) row.opencuMethod = method;
  assert(classifyShutdownErrors(r).reasons.includes('non-allowlisted-terminal'));
});
for (const status of [404, 503]) test('HTTP ' + status + ' fails even without raw errors', () => {
  const r = shutdownFixture([]); r.resources.events.push({ kind: 'response', status, sequence: 99, ms: 99 });
  assert(classifyShutdownErrors(r).reasons.includes('http-error-response'));
});
for (const kind of ['module', 'opencu']) test('each shutdown class is allowed at most once: ' + kind, () => {
  assert(classifyShutdownErrors(shutdownFixture([kind, kind])).reasons.includes('duplicate-shutdown-class'));
});
test('zero raw errors still require complete diagnostics and no page crash', () => {
  const r = shutdownFixture([]); r.resources.droppedOrOmitted = 1;
  r.resources.critical.push({ kind: 'page-crash', sequence: 99, ms: 99 });
  const result = classifyShutdownErrors(r);
  assert(result.reasons.includes('diagnostic-omission')); assert(result.reasons.includes('page-crash'));
});
test('a successful side-effect request during shutdown is not an allowed passive poll', () => {
  const r = shutdownFixture(['opencu']);
  r.errors = []; r.errorEvents = [];
  r.resources.critical = r.resources.critical.filter(row => !['requestfailed', 'console-error'].includes(row.kind));
  find(r, 'request').opencuMethod = 'browser/disconnect';
  assert(classifyShutdownErrors(r).reasons.includes('non-allowlisted-shutdown-request'));
});
test('snapshot and flush share final omission accounting including byte limits', () => {
  let clock = 0; const output = [], value = createResourceDiagnostics({ now: () => clock++, write: line => output.push(line) });
  const path = '/assets/' + 'a'.repeat(230) + '.js'; value.allowStaticPaths([path]);
  value.mark('cleanup-app-close-returned');
  for (let n = 0; n < 64; n++) {
    const key = {}, url = 'dsh-app://app' + path;
    value.request({ key, url, method: 'GET', type: 'script' });
    value.failed({ key, url, method: 'GET', type: 'script', errorText: 'net::ERR_UNEXPECTED' });
  }
  const snapshot = value.snapshot(); value.flush();
  const end = JSON.parse(output.at(-1).slice('OMD_HOT_RESOURCE '.length));
  assert.equal(snapshot.dropped, 0); assert(snapshot.droppedOrOmitted > 0);
  assert.equal(snapshot.droppedOrOmitted, end.droppedOrOmitted);
  const r = shutdownFixture([]); r.resources = snapshot;
  assert(classifyShutdownErrors(r).reasons.includes('diagnostic-omission'));
});
