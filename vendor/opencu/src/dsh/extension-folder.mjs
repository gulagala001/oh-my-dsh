import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { desktopResourcePath } from '../desktop-resource.mjs';

const execute = promisify(execFile);

export function extensionFolderPath() {
  return desktopResourcePath(new URL('../../extension/', import.meta.url));
}

/** Only the packaged connector directory is eligible for this desktop action. */
export async function openExtensionFolder(signal) {
  const path = extensionFolderPath();
  if (!process.versions.electron || !['darwin', 'win32'].includes(process.platform)) return { path, revealed: false };
  if (!(await stat(path)).isDirectory()) throw new Error('The installed extension directory is unavailable');
  signal?.throwIfAborted();
  if (process.platform === 'darwin') {
    await execute('/usr/bin/open', [path], { signal, timeout: 15000 });
  } else {
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command',
      'Start-Process -FilePath $env:OPENCU_EXTENSION_FOLDER -ErrorAction Stop'],
    { signal, timeout: 15000, windowsHide: true, env: { ...process.env, OPENCU_EXTENSION_FOLDER: path } });
  }
  return { path, revealed: true };
}
