import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { windowsProcessSnapshot, windowsProcessTree, stopWindowsProcesses } from './fixtures/computer-use/windows-processes.mjs';
const run = promisify(execFile);

async function gone(owned, artifacts) {
  let remaining = owned;
  for (let i = 0; i < 10; i++) {
    const current = await windowsProcessSnapshot();
    remaining = owned.filter(expected => current.some(actual => actual.pid === expected.pid && actual.created === expected.created));
    if (!remaining.length) break; await delay(100);
  }
  await writeFile(join(artifacts, 'remaining.json'), JSON.stringify(remaining, null, 2));
  assert.deepEqual(remaining, [], 'every observed process in this browser instance must exit');
}

for (const phase of ['running', 'starting']) test('Windows job cleans the browser tree after owner death while ' + phase, { skip: process.platform !== 'win32', timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "omd-job 中文 '-")), profile = join(root, 'profile');
  const artifacts = resolve('cu-artifacts', 'windows-job-owner-' + phase + '-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const entry = join(root, 'owner.mjs'); let owner, owned = [], stderr = '';
  t.after(async () => {
    if (owner && owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    await stopWindowsProcesses(owned); await writeFile(join(artifacts, 'owner-stderr.txt'), stderr);
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const pendingBrowser = join(root, 'PendingBrowser.exe');
  if (phase === 'starting') await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -Path $env:OMD_PENDING_SOURCE -OutputAssembly $env:OMD_PENDING_EXE -OutputType ConsoleApplication"], { windowsHide: true, timeout: 15000, env: { ...process.env, OMD_PENDING_SOURCE: fileURLToPath(new URL('./fixtures/computer-use/windows-starting-browser.cs', import.meta.url)), OMD_PENDING_EXE: pendingBrowser } });
  await writeFile(entry, `import {BrowserHost} from ${JSON.stringify(new URL('../src/computer-use/browser.mjs', import.meta.url).href)};
import {setTimeout as delay} from 'node:timers/promises';
const host=new BrowserHost(process.argv[2],process.argv[3]==='starting'?{executablePath:process.argv[4]}:{});
if(process.argv[3]==='starting') { void host.start().catch(()=>{}); while(!host.browserPid) await delay(5); }
else { await host.create('fixture','data:text/html,<h1>Windows owned browser</h1>'); await host.create('fixture','data:text/html,<h1>Second owned page</h1>'); }
process.send({guardian:host.child.pid,browser:host.browserPid,job:host.run.jobPid,ready:!!host.run.ready});`);
  owner = fork(entry, [profile, phase, pendingBrowser], { execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env, TRISOUL_CU_DOTNET: 'deliberately-unavailable-sdk' } });
  owner.stderr.on('data', data => { stderr += data; });
  const ready = new AbortController(), timeout = setTimeout(() => ready.abort(), 20000);
  let info;
  try {
    [info] = await Promise.race([
      once(owner, 'message', { signal: ready.signal }),
      once(owner, 'exit', { signal: ready.signal }).then(([code, signal]) => { throw new Error(`Browser fixture owner exited before ready (${signal ?? code}): ${stderr}`); }),
    ]);
  } finally { clearTimeout(timeout); ready.abort(); }
  owned = windowsProcessTree(await windowsProcessSnapshot(), owner.pid);
  assert.ok(owned.some(process => process.pid === info.guardian)); assert.ok(owned.some(process => process.pid === info.job));
  assert.ok(owned.some(process => process.pid === info.browser));
  assert.equal(info.ready, phase === 'running');
  if (phase === 'starting') assert.ok(owned.some(process => process.parent === info.browser), 'the pending browser must really create a descendant');
  await writeFile(join(artifacts, 'before.json'), JSON.stringify({ info, owned }, null, 2));
  const exited = once(owner, 'exit'); owner.kill('SIGKILL'); await exited;
  await gone(owned, artifacts);
  await rm(root, { recursive: true, force: true });
});

test('Windows guardian death invalidates old work, releases its job and permits a fresh browser', { skip: process.platform !== 'win32', timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-job-guardian-'));
  const artifacts = resolve('cu-artifacts', 'windows-job-guardian-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const host = new BrowserHost(join(root, 'profile')); let owned = [];
  t.after(async () => { await host.close().catch(error => t.diagnostic(error.message)); await stopWindowsProcesses(owned); await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); });
  const first = await host.create('fixture', 'data:text/html,<h1>Old Windows page</h1>');
  const waiting = host.invoke('fixture', first.id, 'locator', [[{ method: 'getByRole', args: ['button', { name: 'never appears' }] }], 'click', []]);
  const rejected = assert.rejects(waiting, /closed|exited|crash|disconnected/i);
  owned = windowsProcessTree(await windowsProcessSnapshot(), host.child.pid);
  await writeFile(join(artifacts, 'before.json'), JSON.stringify(owned, null, 2));
  host.child.kill('SIGKILL'); await rejected; await gone(owned, artifacts);
  await assert.rejects(host.target('fixture', first.id), /closed|exited/i);
  const second = await host.create('fixture', 'data:text/html,<h1>Fresh Windows page</h1>');
  assert.notEqual(second.id, first.id);
  assert.match((await host.invoke('fixture', second.id, 'getAXState', [])).state, /Fresh Windows page/);
  await host.close(); await rm(root, { recursive: true, force: true });
});
