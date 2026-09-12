import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

export async function windowsProcessSnapshot() {
  return JSON.parse((await run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `@((Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate) | Where-Object { $_.CreationDate } | ForEach-Object {
  $entry=$_; $process=$null
  try {
    $process=[Diagnostics.Process]::GetProcessById([int]$entry.ProcessId); $handle=$process.SafeHandle
    $ticks=$process.StartTime.ToUniversalTime().Ticks; $cimTicks=$entry.CreationDate.ToUniversalTime().Ticks
    if (($ticks-($ticks%10)) -eq ($cimTicks-($cimTicks%10))) { [pscustomobject]@{pid=[int]$entry.ProcessId;parent=[int]$entry.ParentProcessId;created=$ticks.ToString()} }
  } catch {} finally { if($process){$process.Dispose()} }
}) | ConvertTo-Json -Compress`], { windowsHide: true, timeout: 15000 })).stdout);
}

export function windowsProcessTree(snapshot, rootPid) {
  const ids = new Set([rootPid]);
  for (let changed = true; changed;) { changed = false; for (const process of snapshot) if (ids.has(process.parent) && !ids.has(process.pid)) { ids.add(process.pid); changed = true; } }
  return snapshot.filter(process => ids.has(process.pid));
}

// A retained OS handle and creation time prevent this test cleanup from
// terminating a different process that has reused a former child's PID.
export async function stopWindowsProcesses(owned) {
  if (!owned.length) return;
  await run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$failed=$false
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
exit 0`], { windowsHide: true, timeout: 15000, env: { ...process.env, OMD_OWNED_PROCESSES: JSON.stringify([...owned].reverse()) } });
}
