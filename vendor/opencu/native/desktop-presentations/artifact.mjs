import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_RUNTIME_PROVIDER, PLUGIN_RUNTIME_VERSION } from '../plugin-runtime/artifact.mjs';

const require = createRequire(import.meta.url);
const { lstatSync, readFileSync } = require(process.versions.electron ? 'original-fs' : 'node:fs');
const componentRoot = dirname(fileURLToPath(import.meta.url));
const shaPattern = /^[a-f0-9]{64}$/;

export const NATIVE_PRESENTATIONS_FILE = 'desktop-presentations.node';
export const NATIVE_PRESENTATIONS_MANIFEST = 'desktop-presentations.json';
export const NATIVE_PRESENTATIONS_DISTRIBUTION_DIRECTORY = 'native/desktop-presentations/prebuilt';
// Source build output is accepted only when tooling supplies its root explicitly.
export const nativePresentationsRoot = () => join(componentRoot, 'build');
export const nativePresentationsPackageRoot = (target = process) => join(componentRoot, 'prebuilt', `${target.platform}-${target.arch}`);
export const nativePresentationsDistributionRoot = (distribution, target = process) => join(distribution, NATIVE_PRESENTATIONS_DISTRIBUTION_DIRECTORY, `${target.platform}-${target.arch}`);

function realDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Native presentations require a real artifact directory');
}

function packageDirectories(root) {
  const local = relative(componentRoot, root);
  if (local === '..' || local.startsWith(`..${sep}`)) throw new Error('Native presentations are outside the plugin package');
  let current = componentRoot;
  realDirectory(current);
  for (const part of local.split(sep).filter(Boolean)) { current = join(current, part); realDirectory(current); }
}

export function presentationArtifact(root, target = process) {
  const packaged = root === undefined;
  if (packaged) {
    if (target.platform !== 'darwin' || !['arm64', 'x64'].includes(target.arch)) return undefined;
    root = nativePresentationsPackageRoot(target);
  }
  const binary = join(root, NATIVE_PRESENTATIONS_FILE), manifest = join(root, NATIVE_PRESENTATIONS_MANIFEST);
  try {
    if (packaged) packageDirectories(root);
    else realDirectory(root);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  const files = [binary, manifest].map(path => {
    try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  });
  if (files.every(file => file === undefined)) return undefined;
  if (files.some(file => !file || file.isSymbolicLink() || !file.isFile())
    || files[0].size > 128 * 1024 * 1024 || files[1].size > 1024 * 1024) throw new Error('Native presentations require the complete bounded binary and manifest');
  const value = JSON.parse(readFileSync(manifest, 'utf8')), bytes = readFileSync(binary);
  if (value?.schemaVersion !== 2 || value.artifact !== 'opencu-desktop-presentations'
    || value.platform !== 'darwin' || value.platform !== target.platform || value.arch !== target.arch
    || !['arm64', 'x64'].includes(value.arch) || value.nodeApiVersion !== 8 || value.minimumMacOSMajorVersion !== 14
    || value.runtime?.provider !== PLUGIN_RUNTIME_PROVIDER || value.runtime?.electronVersion !== PLUGIN_RUNTIME_VERSION
    || !Array.isArray(value.files) || value.files.length !== 1) throw new Error('Incompatible native presentations artifact');
  const file = value.files[0];
  if (file?.path !== NATIVE_PRESENTATIONS_FILE || file.bytes !== bytes.length || !shaPattern.test(file.sha256 ?? '')
    || file.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Native presentations artifact integrity verification failed');
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0xfeedfacf
    || bytes.readUInt32LE(4) !== { arm64: 0x0100000c, x64: 0x01000007 }[value.arch]) throw new Error('Native presentations Mach-O architecture differs from its manifest');
  if (Number(target.versions?.napi ?? 0) < value.nodeApiVersion) throw new Error('The process does not support the presentation Node-API ABI');
  if (target.versions?.electron && target.versions.electron !== PLUGIN_RUNTIME_VERSION) throw new Error('Native presentations require the pinned official Electron version');
  return { binary, manifest: value, provider: 'opencu-native-presentations', packaged };
}

export function verifyPresentationArtifactSignature(artifact) {
  // Both ad-hoc and distributor signatures are valid. The independently packaged
  // Node-API addon need not share Electron's paid signing identity.
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', '--all-architectures', artifact.binary], { stdio: 'pipe', timeout: 30000 });
  return { valid: true, provider: 'codesign' };
}
