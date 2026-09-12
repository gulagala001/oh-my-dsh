// The owning DSH process holds an IPC pipe to this guardian. EOF also arrives
// after SIGKILL, unlike exit handlers in the owner. Only this process group is
// ours; never enumerate or terminate the user's independent browser processes.
import { spawn, execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const [executable, ...args] = process.argv.slice(2);
let stopping, browser, browserExited, exitCode = 0;
let jobCleaned = false, browserStarted = false, browserExitNotified = false;
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
      try {
        if (browser?.stdin && !browser.stdin.destroyed && !browser.stdin.writableEnded) browser.stdin.end('stop\n');
        let timer;
        try { await Promise.race([browserExited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The Windows browser job did not finish exiting')), 10000); })]); }
        finally { clearTimeout(timer); }
        if (browserStarted && !jobCleaned) throw new Error('The Windows browser job exited without confirming process cleanup');
      } catch (error) {
        if (process.connected) await new Promise(resolve => { try { process.send({ type: 'cleanup-error', message: error.message }, () => resolve()); } catch { resolve(); } });
        process.exit(1);
      }
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
} else if (process.platform === 'win32') {
  // The in-memory helper uses Windows' own compiler; browser startup does not
  // depend on the separately installed desktop runtime or a .NET SDK.
  const command = "$ErrorActionPreference='Stop'; try { Add-Type -Path $env:OMD_BROWSER_JOB_SOURCE; $browserRequest=ConvertFrom-Json $env:OMD_BROWSER_JOB_REQUEST; [OhMyDshBrowserJob]::Run([string]$browserRequest.executable,[string[]]$browserRequest.arguments); exit 0 } catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }";
  browser = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, env: { ...process.env, OMD_BROWSER_JOB_SOURCE: fileURLToPath(new URL('../../native/computer-use/windows/BrowserJob.cs', import.meta.url)), OMD_BROWSER_JOB_REQUEST: JSON.stringify({ executable, arguments: args }) } });
  // close, unlike exit, follows the final stdout acknowledgement.
  browserExited = new Promise(resolve => browser.once('close', resolve));
  browser.stdin.on('error', () => {}); // Exit/error below determines cleanup.
  browser.on('spawn', () => notify({ type: 'browser-job-started', pid: browser.pid }));
  const output = createInterface({ input: browser.stdout });
  output.on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.type === 'job-ready') {
        if (!stopping && process.connected) browser.stdin.write('start\n');
        else if (!browser.stdin.writableEnded) browser.stdin.end('stop\n');
      } else if (message.type === 'browser-started' && Number.isSafeInteger(message.pid) && message.pid > 0) {
        browserStarted = true; notify(message);
      } else if (message.type === 'browser-exited' && Number.isInteger(message.code)) {
        browserExitNotified = true; exitCode = message.code; notify(message);
      } else if (message.type === 'browser-cleaned') jobCleaned = true;
      else throw new Error('Unexpected Windows browser job response');
    } catch (error) { exitCode = 1; notify({ type: 'launch-error', message: error.message }); void stop(); }
  });
  browser.on('error', error => { exitCode = 1; notify({ type: 'launch-error', message: error.message }); void stop(); });
  browser.on('close', (code, signal) => {
    if (code !== 0) exitCode = code ?? 1;
    if (!browserExitNotified) notify({ type: 'browser-exited', code, signal });
    void stop();
  });
} else {
  browser = spawn(executable, args, { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true });
  browserExited = new Promise(resolve => { browser.once('exit', resolve); browser.once('error', resolve); });
  browser.on('spawn', () => notify({ type: 'browser-started', pid: browser.pid }));
  browser.on('error', error => { exitCode = 1; notify({ type: 'launch-error', message: error.message }); void stop(); });
  browser.on('exit', (code, signal) => { exitCode = code ?? 1; notify({ type: 'browser-exited', code, signal }); void stop(); });
}
