import { windowsProcessSnapshot, windowsProcessTree, stopWindowsProcesses } from './computer-use/windows-processes.mjs';

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

// The fixture owns a scripts/start.mjs wrapper and its DSH child. On Windows,
// killing only the wrapper does not execute its JS signal handler.
export async function stopFixtureProcess(child) {
  try {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (process.platform === 'win32') {
      // taskkill /T can abort the whole tree on an already exiting Chromium
      // descendant. Stop the observed identities using retained OS handles.
      const snapshot = await windowsProcessSnapshot();
      if (child.exitCode !== null || child.signalCode !== null) return;
      const owned = windowsProcessTree(snapshot, child.pid);
      if (!owned.length) throw new Error('The live fixture process could not be identified');
      await stopWindowsProcesses(owned);
    } else {
      child.kill('SIGTERM');
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    let deadline;
    try { await Promise.race([exited, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Fixture process did not exit')), 10000); })]); }
    finally { clearTimeout(timer); clearTimeout(deadline); }
  } finally {
    // Cleanup errors remain test failures, but inherited descendant pipes must
    // not keep the runner alive and hide that failure until the CI job expires.
    for (const stream of child.stdio ?? []) stream?.destroy();
    child.unref();
  }
}
