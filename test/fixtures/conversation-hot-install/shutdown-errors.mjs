import assert from 'node:assert/strict';
import { isDeepStrictEqual as equal } from 'node:util';

export function assertNaturalShutdown(rows, hostPid) {
  const owned = rows.filter(row => row.pid === hostPid);
  assert.equal(owned.some(row => ['termination-signal', 'model-call'].includes(row.event)), false, 'No Host signal/model call');
  const ready = owned.filter(row => row.event === 'ready'); assert(ready.length > 0, 'Actual Host activation evidence');
  for (const start of ready) {
    const activation = owned.filter(row => row.bootId === start.bootId && row.event !== 'plugin-change');
    assert.deepEqual(activation.map(row => row.event), ['ready', 'disposed', 'before-exit', 'exit'], 'Natural Host lifecycle');
    assert.equal(activation.at(-2).rootDisposed, true); assert.equal(activation.at(-2).code, 0);
    assert.equal(activation.at(-1).code, 0); assert.equal(activation.at(-1).modelCalls, 0);
  }
}

const opencuHash = '33570e97a173e399921384b41888445e68c87e0d54a4a418464cc7c3dba77385';
const multiset = values => [...values].sort();
// Pure observation-order classification. It never removes or changes raw errors.
export function classifyShutdownErrors({ errors, errorEvents, resources, shutdowns, lifecycle }) {
  const reasons = [], expectedShutdown = [];
  const fail = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  const finish = () => ({ ok: reasons.length === 0, reasons, rawErrorCount: errors?.length ?? null,
    expectedShutdownCount: reasons.length ? 0 : expectedShutdown.length, expectedShutdown: reasons.length ? [] : expectedShutdown });
  if (!Array.isArray(errors) || !Array.isArray(errorEvents) || !resources
    || !Array.isArray(resources.marks) || !Array.isArray(resources.events) || !Array.isArray(resources.critical)) {
    fail('missing-error-or-resource-ledger'); return finish();
  }
  if (resources.dropped !== 0 || resources.droppedOrOmitted !== 0) fail('diagnostic-omission');
  const rows = [...resources.marks, ...resources.events, ...resources.critical].sort((a, b) => a.sequence - b.sequence);
  if (rows.some(row => !Number.isSafeInteger(row.sequence) || row.sequence <= 0 || !Number.isSafeInteger(row.ms) || row.ms < 0)
    || new Set(rows.map(row => row.sequence)).size !== rows.length
    || rows.some((row, index) => index && row.ms < rows[index - 1].ms)) fail('invalid-observation-order');
  if (rows.some(row => row.kind === 'response' && row.status >= 400)) fail('http-error-response');
  if (rows.some(row => row.kind === 'page-crash')) fail('page-crash');
  if (rows.some(row => row.label?.startsWith('cleanup-app-close'))) fail('cleanup-is-not-natural-quit');
  const one = (kind, label) => {
    const matches = rows.filter(row => row.kind === kind && (label === undefined || row.label === label));
    if (matches.length !== 1) fail('missing-or-duplicate-' + (label ?? kind));
    return matches[0];
  };
  const before = one('mark', 'quit-before'), returned = one('mark', 'quit-evaluation-returned');
  const quit = one('mark', 'quit-issued-received'), closed = one('page-close');
  const hostBefore = one('mark', 'host-before-exit-received'), hostExit = one('mark', 'host-exit-received');
  const electron = one('mark', 'electron-exit'), verified = one('mark', 'exit-verified');
  const precedes = (a, b) => a && b && a.sequence < b.sequence && a.ms <= b.ms;
  if (!precedes(before, quit) || !precedes(before, returned) || !precedes(returned, closed)
    || !precedes(quit, closed) || !precedes(closed, electron) || !precedes(electron, verified)
    || !precedes(hostBefore, hostExit) || !precedes(hostExit, verified)) fail('invalid-natural-exit-order');
  const shutdown = shutdowns?.length === 1 ? shutdowns[0] : null;
  if (!shutdown || !Number.isSafeInteger(shutdown.pid) || shutdown.pid <= 0
    || !Number.isSafeInteger(shutdown.hostPid) || shutdown.hostPid <= 0 || shutdown.naturalExit !== true || shutdown.exitCode !== 0 || shutdown.signalCode !== null
    || electron?.pid !== shutdown.pid || hostBefore?.pid !== shutdown.hostPid || hostExit?.pid !== shutdown.hostPid) fail('missing-natural-exit-proof');
  try { assertNaturalShutdown(lifecycle, shutdown?.hostPid); } catch { fail('invalid-host-lifecycle'); }
  if (errorEvents.some(row => row.source !== 'console')) fail('non-console-renderer-error');
  if (!equal(multiset(errors), multiset(errorEvents.map(row => row.message)))) fail('raw-error-ledger-mismatch');
  const consoles = rows.filter(row => row.kind === 'console-error');
  if (consoles.length !== errorEvents.length || new Set(errorEvents.map(row => row.resourceSequence)).size !== errorEvents.length
    || errorEvents.some(row => !consoles.some(console => console.sequence === row.resourceSequence))) fail('console-ledger-mismatch');
  function shutdownKind(terminal) {
    let kind;
    if (equal(terminal.resource, { category: 'module-events', origin: 'dsh-app' }) && terminal.method === 'GET'
      && terminal.type === 'eventsource' && terminal.opencuMethod === undefined) kind = 'module-events';
    if (equal(terminal.resource, { category: 'api-redacted', origin: 'dsh-app', pathnameSha256: opencuHash })
      && terminal.method === 'POST' && terminal.type === 'fetch' && terminal.opencuMethod === 'events') kind = 'opencu-events';
    return kind;
  }
  if (rows.some(row => row.kind === 'request' && precedes(quit, row) && precedes(row, closed) && !shutdownKind(row)))
    fail('non-allowlisted-shutdown-request');
  const terminals = rows.filter(row => row.kind === 'requestfailed'), usedConsoles = new Set(), usedKinds = new Set();
  for (const terminal of terminals) {
    const starts = rows.filter(row => row.kind === 'request' && row.requestId === terminal.requestId);
    const start = starts[0];
    if (starts.length !== 1 || terminal.startObserved !== true || start?.startObserved !== true
      || !Number.isSafeInteger(terminal.requestId) || terminal.requestId <= 0) { fail('missing-or-duplicate-request-start'); continue; }
    const fields = ['requestId', 'startObserved', 'startedMs', 'startedPhase', 'resource', 'method', 'type', 'opencuMethod'];
    if (fields.some(key => !equal(start[key], terminal[key])) || !Number.isSafeInteger(start.startedMs)
      || start.startedMs < quit?.ms || start.startedMs > start.ms || start.startedPhase !== start.phase
      || rows.some(row => row.kind === 'response' && row.requestId === start.requestId && fields.some(key => !equal(start[key], row[key])))) fail('request-metadata-mismatch');
    if (!precedes(quit, start) || !precedes(start, terminal) || !precedes(terminal, closed)) fail('request-outside-confirmed-quit-window');
    const kind = shutdownKind(terminal);
    if (terminal.errorText !== (kind === 'module-events' ? 'net::ERR_FAILED' : 'net::ERR_UNEXPECTED')) fail('non-allowlisted-terminal');
    if (!kind) { fail('non-allowlisted-terminal'); continue; }
    if (usedKinds.has(kind)) fail('duplicate-shutdown-class');
    usedKinds.add(kind);
    const matches = consoles.filter(row => equal(row.resource, terminal.resource) && precedes(terminal, row) && precedes(row, closed));
    if (matches.length !== 1 || usedConsoles.has(matches[0]?.sequence)) { fail('unmatched-or-duplicate-console'); continue; }
    const console = matches[0], ledger = errorEvents.filter(row => row.resourceSequence === console.sequence);
    if (ledger.length !== 1 || ledger[0].source !== 'console' || ledger[0].message !== 'Failed to load resource: ' + terminal.errorText) fail('console-message-mismatch');
    usedConsoles.add(console.sequence);
    expectedShutdown.push({ kind, requestId: terminal.requestId, requestSequence: start.sequence,
      failureSequence: terminal.sequence, consoleSequence: console.sequence });
  }
  if (usedConsoles.size !== consoles.length || terminals.length !== expectedShutdown.length
    || expectedShutdown.length !== errors.length) fail('unmatched-raw-errors-or-terminals');
  return finish();
}
