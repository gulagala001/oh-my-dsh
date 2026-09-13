import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// These paths enter MSBuild expressions after command-line parsing. Shell
// argument quoting alone does not protect an apostrophe or a list separator.
export function msbuildValue(value) {
  return value.replace(/[%$@();'?,*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

export async function windowsBridgeBuild(arch = process.arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Windows browser connection requires x64 or ARM64');
  const hash = createHash('sha256').update('win-' + arch);
  for (const path of ['../../native/computer-use/windows/TrisoulBrowserBridge.csproj', '../../native/computer-use/windows/Program.cs', '../../scripts/build-computer-use-windows.mjs', './windows-build.mjs']) {
    hash.update(path).update('\0').update(await readFile(new URL(path, import.meta.url)));
  }
  return { build: hash.digest('hex'), arch, rid: 'win-' + arch, executable: 'OhMyDsh.BrowserBridge.exe' };
}
