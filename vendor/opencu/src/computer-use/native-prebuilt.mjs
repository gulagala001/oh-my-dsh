import { createHash } from 'node:crypto';
import { cp, lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../native/computer-use/prebuilt/', import.meta.url));
const bundleName = 'Oh My DSH Computer Use.app';
const invalid = () => Object.assign(new Error('The packaged desktop runtime does not match this plugin.'), { code: 'NATIVE_ARTIFACT_INVALID' });

export async function nativeArtifactFiles(directory) {
  const files = [];
  async function walk(path) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw invalid();
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await walk(join(path, name));
      return;
    }
    if (!info.isFile()) throw invalid();
    const name = relative(directory, path).split(sep).join('/');
    files.push({ path: name, size: info.size, mode: info.mode & 0o777,
      sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  await walk(directory);
  return files;
}

function validManifest(value, expected) {
  if (!value || value.schemaVersion !== 1 || value.platform !== expected.platform || value.arch !== expected.arch
    || value.build !== expected.build || value.version !== expected.version || value.protocol !== expected.protocol
    || value.bundle !== bundleName || !Array.isArray(value.files) || value.files.length < 2 || value.files.length > 10000) throw invalid();
  const names = new Set();
  for (const file of value.files) {
    if (!file || typeof file.path !== 'string' || !file.path || isAbsolute(file.path)
      || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..')
      || names.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(file.mode)
      || file.mode < 0 || file.mode > 0o777) throw invalid();
    names.add(file.path);
  }
  if (!names.has('Contents/MacOS/trisoul-computer-use') || !names.has('Contents/Info.plist')) throw invalid();
  return value;
}

async function assertFiles(directory, expected) {
  const actual = await nativeArtifactFiles(directory);
  if (actual.length !== expected.length) throw invalid();
  const byName = new Map(expected.map(file => [file.path, file]));
  for (const file of actual) {
    const saved = byName.get(file.path);
    if (!saved || ['size', 'mode', 'sha256'].some(key => saved[key] !== file[key])) throw invalid();
  }
}

export async function installPackagedNative(destination, expected) {
  if (expected.platform !== 'darwin') return false;
  const directory = join(root, `${expected.platform}-${expected.arch}`);
  let info;
  try { info = await lstat(directory); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid();
  const manifestPath = join(directory, 'manifest.json');
  const manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 1024 * 1024) throw invalid();
  const manifest = validManifest(JSON.parse(await readFile(manifestPath, 'utf8')), expected);
  const source = resolve(directory, bundleName);
  await assertFiles(source, manifest.files);
  await cp(source, destination, { recursive: true, dereference: false, force: false, errorOnExist: true });
  await assertFiles(destination, manifest.files);
  return true;
}
