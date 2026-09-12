import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

export async function windowsNativeBuild(arch = process.arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Windows desktop requires x64 or ARM64');
  const root = new URL('../../native/computer-use/windows/desktop/', import.meta.url);
  const hash = createHash('sha256').update('desktop-win-' + arch);
  for (const name of (await readdir(root)).filter(name => /\.(cs|csproj)$/.test(name)).sort()) {
    hash.update(name).update('\0').update(await readFile(new URL(name, root)));
  }
  for (const name of ['./windows-native-build.mjs', '../../scripts/build-computer-use-windows-native.mjs']) hash.update(name).update('\0').update(await readFile(new URL(name, import.meta.url)));
  return { build: hash.digest('hex'), arch, rid: 'win-' + arch, executable: 'OhMyDsh.Desktop.exe', version: '0.1.1', protocol: 1 };
}
