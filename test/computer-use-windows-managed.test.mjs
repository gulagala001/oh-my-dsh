import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';

const run = promisify(execFile);
test('Windows managed browser shutdown confirms its own processes have exited and the profile is unlocked', { skip: process.platform !== 'win32', timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-managed-exit-'));
  const artifacts = resolve('cu-artifacts', 'windows-managed-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const browser = new BrowserHost(join(root, 'profile')); let owned = [];
  const processes = async () => JSON.parse((await run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `@((Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate) | Where-Object { $_.CreationDate } | ForEach-Object {
  $entry=$_; $process=$null
  try {
    $process=[Diagnostics.Process]::GetProcessById([int]$entry.ProcessId); $handle=$process.SafeHandle
    $ticks=$process.StartTime.ToUniversalTime().Ticks; $cimTicks=$entry.CreationDate.ToUniversalTime().Ticks
    if (($ticks-($ticks%10)) -eq ($cimTicks-($cimTicks%10))) { [pscustomobject]@{pid=[int]$entry.ProcessId;parent=[int]$entry.ParentProcessId;created=$ticks.ToString()} }
  } catch {} finally { if($process){$process.Dispose()} }
}) | ConvertTo-Json -Compress`], { windowsHide: true, timeout: 15000 })).stdout);
  t.after(async () => {
    await browser.close().catch(error => t.diagnostic('Browser cleanup error: ' + error.message));
    // Recovery is separate from the assertions. Only previously observed
    // descendants with the same creation time can be stopped by this fixture.
    if (owned.length) await run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$failed=$false
foreach ($expected in (ConvertFrom-Json $env:OMD_OWNED_PROCESSES)) {
  $process=$null
  try {
    $process=[Diagnostics.Process]::GetProcessById([int]$expected.pid); $handle=$process.SafeHandle
    if ($process.StartTime.ToUniversalTime().Ticks.ToString() -eq $expected.created) { $process.Kill(); if(!$process.WaitForExit(5000)){throw 'Owned fixture process did not exit'} }
  } catch [System.ArgumentException] { # The observed process has already exited.
  } catch { if(!$process -or !$process.HasExited){$failed=$true; Write-Error $_} }
  finally { if($process){$process.Dispose()} }
}
if($failed){exit 1}
exit 0`], { windowsHide: true, timeout: 15000, env: { ...process.env, OMD_OWNED_PROCESSES: JSON.stringify(owned.reverse()) } });
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    t.diagnostic('Windows managed process evidence: ' + artifacts);
  });
  await browser.create('fixture', 'data:text/html,<title>Managed Windows fixture</title><input>');
  const connection = await browser.connection('fixture'), cdp = await connection.browser.newBrowserCDPSession();
  const version = await cdp.send('Browser.getVersion'); await cdp.detach();
  await writeFile(join(artifacts, 'browser.json'), JSON.stringify({ guardianPid: browser.child.pid, browserPid: browser.browserPid, executable: browser.runtimePath, version }, null, 2));
  const before = await processes(), ids = new Set([browser.child.pid]);
  for (let changed = true; changed;) { changed = false; for (const process of before) if (ids.has(process.parent) && !ids.has(process.pid)) { ids.add(process.pid); changed = true; } }
  owned = before.filter(process => ids.has(process.pid));
  assert.ok(owned.some(process => process.pid === browser.browserPid));
  await writeFile(join(artifacts, 'before.json'), JSON.stringify(owned, null, 2));
  await browser.close();
  // Check before slow process enumeration can hide an early close() return.
  const removal = await rm(root, { recursive: true, force: true }).then(() => null, error => ({ code: error.code, message: error.message }));
  await writeFile(join(artifacts, 'profile-removal.json'), JSON.stringify({ error: removal }, null, 2));
  let remaining;
  for (let i = 0; i < 5; i++) {
    const after = await processes(); remaining = owned.filter(expected => after.some(actual => actual.pid === expected.pid && actual.created === expected.created));
    if (!remaining.length) break; await delay(100);
  }
  await writeFile(join(artifacts, 'remaining.json'), JSON.stringify(remaining, null, 2));
  assert.deepEqual(remaining, [], 'normal shutdown must not leave the managed browser or its children running');
  assert.equal(removal, null, 'close() must wait until its browser releases the profile');
});
