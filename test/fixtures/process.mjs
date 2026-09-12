import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// The fixture owns a scripts/start.mjs wrapper and its DSH child. On Windows,
// killing only the wrapper does not execute its JS signal handler.
export async function stopFixtureProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    try { await run('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 }); }
    catch (error) { if (child.exitCode === null && child.signalCode === null) throw error; }
    await exited;
  } else {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
}
