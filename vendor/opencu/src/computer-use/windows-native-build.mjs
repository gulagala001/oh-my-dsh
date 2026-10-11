import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

export const WINDOWS_NATIVE_IDENTITY = Object.freeze({
  platform: 'win32',
  name: 'oh-my-dsh-windows-desktop',
  serverName: 'trisoul-computer-use',
  executable: 'OhMyDsh.Desktop.exe',
  minimumSystemVersion: '10.0.19041.0',
  version: '0.1.1',
  protocol: 1,
});

async function sourceFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(new URL(prefix || './', root), { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory() && !['bin', 'obj', '.git'].includes(entry.name)) files.push(...await sourceFiles(root, name + '/'));
    else if (entry.isFile() && /\.(cs|csproj|manifest|xaml|resx|props|targets)$/.test(entry.name)) files.push(name);
  }
  return files.sort();
}

export async function windowsNativeBuild(arch = process.arch) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Windows desktop requires x64 or ARM64');
  const root = new URL('../../native/computer-use/windows/desktop/', import.meta.url);
  const hash = createHash('sha256').update('desktop-win-' + arch);
  // SDK projects discover nested source and WPF resources as build inputs.
  for (const name of await sourceFiles(root)) {
    hash.update(name).update('\0').update(await readFile(new URL(name, root)));
  }
  for (const name of ['./windows-native-build.mjs', './windows-build.mjs', '../../scripts/build-computer-use-windows-native.mjs']) hash.update(name).update('\0').update(await readFile(new URL(name, import.meta.url)));
  return { ...WINDOWS_NATIVE_IDENTITY, build: hash.digest('hex'), arch, rid: 'win-' + arch };
}
