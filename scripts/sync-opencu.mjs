import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, rename, mkdtemp, stat, readdir, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(process.argv[2] || join(root, '../opencu'));
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const staging = await mkdtemp(join(local, 'opencu-bundle-'));
// Direct server/host-source fixes do not require replacing host-specific client
// output. Membership/version/build-input changes still use the full package path.
if (process.argv[3] === '--files') {
  const selected = [...new Set(process.argv.slice(4))], target = join(root, 'vendor/opencu');
  if (!selected.length) throw new Error('Select existing distributed source files');
  const manifestPath = join(root, 'vendor/opencu.json'), originalManifest = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifest), pkg = JSON.parse(await readFile(join(source, 'package.json')));
  if (pkg.name !== manifest.name || pkg.version !== manifest.version || pkg.opencu?.host !== manifest.hostVersion) throw new Error('Source-only sync requires the same package and host version');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const updates = [];
  for (const name of selected) {
    if (!Object.hasOwn(manifest.files, name) || name.includes('\\') || name.split('/').includes('..') ||
      !/^(?:src\/(?!client\/)|host\/(?!build-inputs\/)|docs\/|DEVELOPMENT\.md$)/.test(name) || !/\.(?:mjs|js|ts|json|md|css|ya?ml)$/.test(name)) throw new Error(`Not an existing distributed source file: ${name}`);
    const from = join(source, name), destination = join(target, name);
    if (await realpath(from) !== from || await realpath(destination) !== destination) throw new Error(`Refusing a non-owned source file: ${name}`);
    const bytes = await readFile(from), previous = await readFile(destination);
    const committed = execFileSync('git', ['show', `${commit}:${name}`], { cwd: source, maxBuffer: 8 * 1024 * 1024 });
    if (!bytes.equals(committed)) throw new Error(`Commit the source file before synchronizing: ${name}`);
    if (createHash('sha256').update(previous).digest('hex') !== manifest.files[name]) throw new Error(`Bundled source differs from its manifest: ${name}`);
    const staged = join(staging, 'next', name);
    await mkdir(dirname(staged), { recursive: true }); await writeFile(staged, bytes, { mode: (await stat(destination)).mode & 0o777 });
    updates.push({ name, destination, previous, staged });
    manifest.files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  manifest.source = '../opencu'; manifest.sourceCommit = commit;
  delete manifest.archiveSha256; // No new archive was built for this mixed source/output snapshot.
  const applied = [];
  try {
    for (const update of updates) { await rename(update.staged, update.destination); applied.push(update); }
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await rename(join(staging, 'manifest.json'), manifestPath);
  } catch (error) {
    const rollback = await Promise.allSettled([...applied.map(update => writeFile(update.destination, update.previous)), writeFile(manifestPath, originalManifest)]);
    throw new AggregateError([error, ...rollback.filter(result => result.status === 'rejected').map(result => result.reason)], 'OpenCU source sync failed');
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
  console.log(`Synced ${selected.length} committed OpenCU source files; existing built assets retained`);
  process.exit(0);
}
let archive;
if ((await stat(source)).isDirectory()) {
  if (!process.env.OMD_NPM_ENTRY) throw new Error('Supply the build-owned OMD_NPM_ENTRY or an already built OpenCU tgz');
  const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.OMD_NPM_ENTRY, 'pack', '--json', '--ignore-scripts', '--pack-destination', staging], { cwd: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  archive = join(staging, packed.filename);
} else {
  archive = join(staging, 'opencu.tgz');
  await copyFile(source, archive);
}
const { nativePackageModes } = await import('./native-package-modes.mjs');
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
if (manifest.name !== 'opencu' || manifest.exports?.['./integration'] !== './src/dsh/index.mjs' ) throw new Error('Expected the rewritten OpenCU distribution');
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
  source: source.endsWith('.tgz') ? `${manifest.name}@${manifest.version}` : '../opencu', policy: 'rewritten-plugin', hostVersion: manifest.opencu.host,
  archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files }, null, 2) + '\n');
execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
console.log(`Bundled OpenCU ${manifest.version}; previous source preserved outside the package at ${staging}/previous`);
