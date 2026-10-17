import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, rename, mkdtemp, stat, readdir, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { nativePackageModes } from './native-package-modes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(process.argv[2] || join(root, '../opencu'));
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const staging = await mkdtemp(join(local, 'opencu-bundle-'));
let archive;
if ((await stat(source)).isDirectory()) {
  if (!process.env.OMD_NPM_ENTRY) throw new Error('Supply the build-owned OMD_NPM_ENTRY or an already built OpenCU tgz');
  const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.OMD_NPM_ENTRY, 'pack', '--json', '--ignore-scripts', '--pack-destination', staging], { cwd: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  archive = join(staging, packed.filename);
} else {
  archive = join(staging, 'opencu.tgz');
  await copyFile(source, archive);
}
await nativePackageModes(archive);
const members = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split('\n');
if (!members.length || members.some(name => !name.startsWith('package/') || name.includes('\\') || name.split('/').includes('..'))) throw new Error('Expected a package-only OpenCU archive');
execFileSync('tar', ['-xzf', archive, '-C', staging]);
const unpacked = join(staging, 'package'), files = {};
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name, path = join(directory, entry.name);
    if (await realpath(path) !== path || !(await lstat(path)).isDirectory() && !entry.isFile()) throw new Error(`OpenCU contains a non-owned file: ${name}`);
    if (entry.isDirectory()) await inspect(path, name + '/');
    else files[name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
}
await inspect(unpacked);
if (process.platform === 'darwin') {
  const { checkMacHelperDistribution } = await import(new URL('./check-opencu-native.mjs', import.meta.url));
  await checkMacHelperDistribution(unpacked);
}
const manifest = JSON.parse(await readFile(join(unpacked, 'package.json'), 'utf8'));
if (manifest.name !== 'opencu' || manifest.exports?.['./integration'] !== './src/dsh/index.mjs' || !files['lib/client.factory.mjs']) throw new Error('Expected the rewritten OpenCU distribution');
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const [name, version] of Object.entries(manifest.peerDependencies)) {
  if ((host.peerDependencies?.[name] ?? host.devDependencies?.[name]) !== version) throw new Error(`Bundled OpenCU requires matching ${name} ${version}`);
}
if (manifest.opencu?.host !== host.devDependencies['@deepseek-ai/dsh']) throw new Error('OpenCU build target does not match OMD');
const target = join(root, 'vendor/opencu');
try {
  if (!(await lstat(target)).isDirectory() || await realpath(target) !== target) throw new Error('Refusing a non-owned OpenCU destination');
  await rename(target, join(staging, 'previous'));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await rename(unpacked, target); }
catch (error) { await rename(join(staging, 'previous'), target); throw error; }
await writeFile(join(root, 'vendor/opencu.json'), JSON.stringify({ name: manifest.name, version: manifest.version,
  source: source.endsWith('.tgz') ? source : '../opencu', policy: 'rewritten-plugin', hostVersion: manifest.opencu.host,
  archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files }, null, 2) + '\n');
console.log(`Bundled OpenCU ${manifest.version}; previous source preserved outside the package at ${staging}/previous`);
