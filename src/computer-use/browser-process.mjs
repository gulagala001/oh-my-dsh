// The owning DSH process holds an IPC pipe to this guardian. EOF also arrives
// after SIGKILL, unlike exit handlers in the owner. Only this process group is
// ours; never enumerate or terminate the user's independent browser processes.
import { spawn, execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const [executable, ...args] = process.argv.slice(2);
let stopping, browser, exitCode = 0;
const notify = message => {
  if (process.connected) { try { process.send(message, () => {}); } catch {} }
};

async function groupMembers() {
  return new Promise((resolve, reject) => {
    const query = execFile('/bin/ps', ['-ax', '-o', 'pid=,pgid=,stat='], { timeout: 500 }, (error, stdout) => {
      if (error) { reject(error); return; }
      resolve(stdout.split('\n').filter(line => {
        const [pid, group, status] = line.trim().split(/\s+/);
        return Number(group) === process.pid && ![process.pid, query.pid].includes(Number(pid)) && status && !status.startsWith('Z');
      }));
    });
  });
}

function stop() {
  if (stopping) return stopping;
  stopping = Promise.resolve().then(async () => {
    if (process.platform === 'win32') {
      if (browser?.pid) await new Promise(resolve => {
        const task = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        task.once('error', resolve); task.once('exit', resolve);
      });
      process.exit(exitCode);
    }
    const signalGroup = signal => {
      try { process.kill(-process.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') notify({ type: 'cleanup-error', message: error.message }); }
    };
    // SIGTERM reaches us too; the promise above makes that reentrant signal a
    // no-op. Keep the guardian alive until all children, including orphaned
    // launch helpers, have exited or the hard deadline kills the group.
    signalGroup('SIGTERM');
    const deadline = setTimeout(() => { signalGroup('SIGKILL'); process.exit(1); }, 2000);
    while (true) {
      try {
        if (!(await groupMembers()).length) { clearTimeout(deadline); process.exit(exitCode); }
      } catch { /* The hard deadline still cleans up if process inspection fails. */ }
      await delay(30);
    }
  });
  return stopping;
}

process.on('disconnect', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
process.on('message', message => { if (message?.type === 'stop') void stop(); });

if (!process.connected || !executable) {
  process.exit(1);
} else {
  browser = spawn(executable, args, { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  browser.on('spawn', () => notify({ type: 'browser-started', pid: browser.pid }));
  browser.on('error', error => { exitCode = 1; notify({ type: 'launch-error', message: error.message }); void stop(); });
  browser.on('exit', (code, signal) => { exitCode = code ?? 1; notify({ type: 'browser-exited', code, signal }); void stop(); });
}
