import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativePresentationsPackageRoot, NATIVE_PRESENTATIONS_FILE, NATIVE_PRESENTATIONS_MANIFEST } from './artifact.mjs';
import { PLUGIN_RUNTIME_PROVIDER, PLUGIN_RUNTIME_VERSION } from '../plugin-runtime/artifact.mjs';

export async function sealNativePresentations({ arch = process.arch,
  root = nativePresentationsPackageRoot({ platform: 'darwin', arch }) } = {}) {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(arch)) throw new Error('Native presentations require a macOS arm64 or x64 build');
  if (!isAbsolute(root)) throw new Error('Native presentation artifact directory must be absolute');
  const directory = await lstat(root), file = await lstat(join(root, NATIVE_PRESENTATIONS_FILE));
  if (!directory.isDirectory() || directory.isSymbolicLink() || !file.isFile() || file.isSymbolicLink() || file.size > 128 * 1024 * 1024) throw new Error('Native presentation sealing requires a bounded real artifact');
  const bytes = await readFile(join(root, NATIVE_PRESENTATIONS_FILE));
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== { arm64: 0x0100000c, x64: 0x01000007 }[arch]) throw new Error('Native presentation architecture does not match the requested seal');
  const artifact = { schemaVersion: 2, artifact: 'opencu-desktop-presentations', platform: 'darwin', arch,
    nodeApiVersion: 8, minimumMacOSMajorVersion: 14,
    runtime: { provider: PLUGIN_RUNTIME_PROVIDER, electronVersion: PLUGIN_RUNTIME_VERSION },
    files: [{ path: NATIVE_PRESENTATIONS_FILE, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }] };
  await writeFile(join(root, NATIVE_PRESENTATIONS_MANIFEST), JSON.stringify(artifact, null, 2) + '\n');
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let root, arch;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--root' && root === undefined && isAbsolute(value)) root = value;
    else if (flag === '--arch' && arch === undefined && ['arm64', 'x64'].includes(value)) arch = value;
    else throw new Error('Usage: node native/desktop-presentations/seal.mjs [--root ABSOLUTE_PATH] [--arch arm64|x64]');
  }
  await sealNativePresentations({ root, arch });
}
