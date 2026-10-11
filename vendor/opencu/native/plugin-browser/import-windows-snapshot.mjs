import { spawn } from 'node:child_process';
import { join } from 'node:path';

// FileShare.Read rejects a browser's existing write handle and prevents source
// writes/replacement during both snapshot passes, matching the native reader.
const reader = "$ErrorActionPreference='Stop';$file=$null;$image=$null;try{$request=ConvertFrom-Json ([Console]::In.ReadToEnd());$path=[string]$request.path;$size=[long]$request.size;$file=[IO.FileStream]::new($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);if($file.Length -ne $size -or $size -gt 268435456){exit 3};$image=[byte[]]::new([int]$size);$offset=0;while($offset -lt $image.Length){$count=$file.Read($image,$offset,[Math]::Min(65536,$image.Length-$offset));if($count -eq 0){exit 3};$offset+=$count};$sha=[Security.Cryptography.SHA256]::Create();$first=$sha.ComputeHash($image);$file.Position=0;$second=$sha.ComputeHash($file);if($file.Length -ne $size -or [Convert]::ToBase64String($first) -cne [Convert]::ToBase64String($second)){exit 3};$output=[Console]::OpenStandardOutput();$output.Write($image,0,$image.Length);$output.Flush()}catch [UnauthorizedAccessException]{exit 4}catch [IO.IOException]{exit 2}catch{exit 5}finally{if($image){[Array]::Clear($image,0,$image.Length)};if($file){$file.Dispose()}}";
const failure = code => Object.assign(new Error('The selected source could not be snapshotted'), { code });

export async function readWindowsSourceSnapshot(identity, signal) {
  if (signal?.aborted) throw failure('ABORTED');
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', reader],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let pieces = [], bytes = 0, reason;
    const abort = () => { reason ??= failure('ABORTED'); child.kill(); };
    const timer = setTimeout(() => { reason ??= failure('SOURCE_SNAPSHOT_TIMEOUT'); child.kill(); }, 120000);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', piece => {
      bytes += piece.length;
      if (bytes > identity.bytes) { piece.fill(0); reason ??= failure('SOURCE_CHANGED'); child.kill(); }
      else pieces.push(piece);
    });
    child.stderr.on('data', piece => piece.fill(0));
    child.stdin.on('error', () => { reason ??= failure('SOURCE_FILE_UNAVAILABLE'); });
    child.once('error', () => { reason ??= failure('SOURCE_SYSTEM_API_UNAVAILABLE'); });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      const image = Buffer.concat(pieces); for (const piece of pieces) piece.fill(0); pieces = [];
      if (!reason && code !== 0) reason = failure(code === 2 ? 'SOURCE_DATABASE_LOCKED' : code === 3 ? 'SOURCE_CHANGED' : code === 4 ? 'SOURCE_READ_DENIED' : 'SOURCE_FILE_UNAVAILABLE');
      if (!reason && (signal?.aborted || image.length !== identity.bytes)) reason = failure(signal?.aborted ? 'ABORTED' : 'SOURCE_CHANGED');
      if (reason) { image.fill(0); reject(reason); } else resolve(image);
    });
    if (signal?.aborted) abort();
    child.stdin.end(JSON.stringify({ path: identity.path, size: identity.bytes }));
  });
}
