import { setTimeout as delay } from 'node:timers/promises';

export async function cleanupFixture(actions) {
  const errors = [];
  for (const action of actions) { try { await action(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed: ' + errors.map(error => error.message).join('; '));
}

export async function closeFixtureServer(server) {
  const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
}

const live = child => Boolean(child.pid) && child.exitCode === null && child.signalCode === null;
function observeExit(child) {
  if (!live(child)) return { promise: Promise.resolve(), close() {} };
  let listener;
  const promise = new Promise(resolve => { listener = () => resolve(); child.once('exit', listener); });
  return { promise, close: () => child.off('exit', listener) };
}
async function bounded(task, timeoutMs, message) {
  let timer;
  try { return await Promise.race([task, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
function releaseProcess(child) {
  // A descendant may inherit pipes after the root exits. Preserve the failure,
  // but never let those streams keep the runner alive until its outer timeout.
  for (const stream of child.stdio ?? []) stream?.destroy();
  child.unref();
}
async function windowsTree(child) {
  const { windowsProcessSnapshot, windowsProcessTree } = await import('./computer-use/windows-processes.mjs');
  const owned = windowsProcessTree(await windowsProcessSnapshot(), child.pid);
  if (!owned.length && live(child)) throw Error('The live fixture process could not be identified');
  return owned;
}
async function stopWindowsTree(owned) {
  if (!owned.length) return;
  const { stopWindowsProcesses } = await import('./computer-use/windows-processes.mjs');
  await stopWindowsProcesses(owned);
}
async function waitWindowsTree(owned, timeoutMs) {
  const { windowsProcessSnapshot } = await import('./computer-use/windows-processes.mjs');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snapshot = await windowsProcessSnapshot();
    const remaining = owned.filter(expected => snapshot.some(actual => actual.pid === expected.pid && actual.created === expected.created));
    if (!remaining.length) return;
    if (Date.now() >= deadline) throw Error('Owned fixture descendants did not exit naturally');
    await delay(50);
  }
}

// This is failure cleanup, not a persistence/graceful attestation. Windows Kill
// remains confined to the existing identity-checked public cleanup helper.
export async function stopFixtureProcess(child, { ownedProcesses } = {}) {
  const exited = observeExit(child);
  try {
    if (process.platform === 'win32') {
      const owned = ownedProcesses ?? (live(child) ? await windowsTree(child) : []);
      // Retained identities still belong to cleanup if their root already exited.
      await stopWindowsTree(owned);
    } else if (live(child)) {
      child.kill('SIGTERM');
    }
    if (!live(child)) return;
    let forced = false;
    const timer = setTimeout(() => { forced = true; child.kill('SIGKILL'); }, 5000);
    try { await bounded(exited.promise, 10000, 'Fixture process did not exit'); }
    finally { clearTimeout(timer); }
    if (forced) throw Error('Fixture process required forced cleanup after SIGTERM');
  } finally { exited.close(); releaseProcess(child); }
}

export function nativeShutdownEvidence(rows, expected) {
  if (!Array.isArray(rows)) throw Error('Native shutdown evidence is missing');
  const matching = rows.filter(row => row.bootId === expected.bootId);
  for (const row of matching) for (const key of ['pid', 'root', 'home', 'profile', 'profileDir'])
    if (row[key] !== expected[key]) throw Error('Native shutdown evidence has a foreign ' + key);
  const index = name => matching.findIndex(row => row.event === name);
  const names = ['ready', 'shutdown-request', 'agents-idle', 'persistence-flush', 'app-exit-request', 'observer-dispose', 'observer-disposed', 'before-exit', 'exit'];
  if (names.some(name => index(name) < 0) || names.some((name, i) => i && index(name) <= index(names[i - 1])))
    throw Error('Native shutdown lifecycle did not complete in order');
  const request = matching[index('shutdown-request')], idle = matching[index('agents-idle')], flushed = matching[index('persistence-flush')];
  if (idle.pending !== 0 || flushed.pending !== 0) throw Error('Native shutdown left lifecycle work pending at flush');
  for (const session of request.sessions) {
    const checkpoint = matching.find(row => row.event === 'session-flush' && row.id === session.id);
    if (!checkpoint?.participated || checkpoint.events < session.events || matching.indexOf(checkpoint) <= index('shutdown-request')
      || matching.indexOf(checkpoint) >= index('persistence-flush')) throw Error('Native session was not durably flushed: ' + session.id);
  }
  const settled = matching[index('before-exit')], exit = matching[index('exit')];
  if (!settled.rootDisposed || !settled.persistenceDrained || settled.code !== 0 || exit.code !== 0 || settled.pending !== 0
    || settled.liveSessions !== 0 || settled.liveAgents !== 0 || settled.errors.length || settled.failures.length)
    throw Error('Native shutdown did not drain persistence and root lifecycle');
  return { persistenceDrained: true, rootDisposed: true, pendingAtShutdown: request.pending, pendingAtFlush: flushed.pending, finalSessions: settled.finalSessions, lifecycle: matching };
}

// Only this path can attest a native restart. It waits for appExit/root teardown
// and natural process exit; force cleanup always throws, never returns graceful.
export async function shutdownFixtureProcess(child, { requestShutdown, evidence, timeoutMs = 30000 } = {}) {
  const exited = observeExit(child);
  let owned;
  try {
    if (!live(child)) throw Error('Native fixture process was not running before shutdown');
    if (typeof requestShutdown !== 'function' || typeof evidence !== 'function') throw Error('Native shutdown requires lifecycle evidence');
    if (process.platform === 'win32') owned = await windowsTree(child);
    await bounded(Promise.resolve().then(requestShutdown), timeoutMs, 'Native shutdown request timed out');
    if (live(child)) await bounded(exited.promise, timeoutMs, 'Native fixture process did not exit naturally');
    if (child.exitCode !== 0 || child.signalCode !== null) throw Error('Native fixture did not exit successfully without a signal');
    if (owned) await waitWindowsTree(owned, timeoutMs);
    const proof = await evidence();
    if (proof?.rootDisposed !== true || proof?.persistenceDrained !== true) throw Error('Native shutdown persistence evidence was incomplete');
    return { ...proof, graceful: true, naturalExit: true, exitCode: child.exitCode, signalCode: child.signalCode, pid: child.pid, ownedProcesses: owned ?? [] };
  } catch (error) {
    try { await stopFixtureProcess(child, { ownedProcesses: owned }); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], error.message + '; native failure cleanup also failed'); }
    throw error;
  } finally { exited.close(); releaseProcess(child); }
}
