import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function windowsBridgeBuild(arch = process.arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Windows browser connection requires x64 or ARM64');
  const hash = createHash('sha256').update('win-' + arch);
  for (const path of ['../../native/computer-use/windows/TrisoulBrowserBridge.csproj', '../../native/computer-use/windows/Program.cs', '../../scripts/build-computer-use-windows.mjs', './windows-build.mjs']) {
    hash.update(path).update('\0').update(await readFile(new URL(path, import.meta.url)));
  }
  return { build: hash.digest('hex'), arch, rid: 'win-' + arch, executable: 'OhMyDsh.BrowserBridge.exe' };
}
