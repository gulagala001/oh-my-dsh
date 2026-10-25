import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, rename, mkdtemp, stat, readdir, lstat, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(process.argv[2] || join(root, '../opencu'));
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const staging = await mkdtemp(join(local, 'opencu-bundle-'));
// Direct source fixes retain host-specific output. --client synchronizes only
// rebuilt frontend/extension bytes; version/build-input changes use the package path.
if (['--files', '--client'].includes(process.argv[3])) {
  const clientOnly = process.argv[3] === '--client', target = join(root, 'vendor/opencu');
  let selected = [...new Set(process.argv.slice(4))];
  const manifestPath = join(root, 'vendor/opencu.json'), originalManifest = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifest), pkg = JSON.parse(await readFile(join(source, 'package.json')));
  if (pkg.name !== manifest.name || pkg.version !== manifest.version || pkg.opencu?.host !== manifest.hostVersion) throw new Error('Source-only sync requires the same package and host version');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const runtimeFile = /^lib\/rea-assets\/opencu-(?:client|chunk)-[A-Z0-9]{8}\.js$/;
  const removed = new Set();
  if (clientOnly) {
    if (selected.length) throw new Error('--client takes no file arguments');
    if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: source, encoding: 'utf8' }).trim()) throw new Error('Commit the OpenCU source and generated extension before synchronizing its client');
    execFileSync(process.execPath, ['scripts/check-extension-distribution.mjs'], { cwd: source, stdio: 'inherit' });
    if (!(await readFile(join(source, 'lib/page-cursor.js'))).equals(await readFile(join(source, 'extension/page-cursor.js')))) throw new Error('Extension cursor differs from the rebuilt client');
    const resources = JSON.parse(await readFile(join(source, 'lib/rea-assets/manifest.json')));
    const runtime = resources.filter(record => record.source === 'opencu-client-build');
    if (!runtime.length) throw new Error('Missing built OpenCU client resources');
    const next = runtime.map(record => `lib/rea-assets/${record.file}`);
    for (const record of runtime) {
      const name = `lib/rea-assets/${record.file}`;
      if (!runtimeFile.test(name) || createHash('sha256').update(await readFile(join(source, name))).digest('hex') !== record.sha256) throw new Error(`Invalid built client resource: ${name}`);
    }
    const previous = Object.keys(manifest.files).filter(name => runtimeFile.test(name));
    previous.filter(name => !next.includes(name)).forEach(name => removed.add(name));
    selected = [...new Set(['lib/client.js', 'lib/browser-surface.js', 'lib/presentation.js', 'lib/page-cursor.js',
      'lib/page-annotations.js', 'lib/extension.zip', 'lib/rea-assets/manifest.json',
      'extension/page-cursor.js', 'src/extension/distribution.json', ...previous, ...next])];
  }
  if (!selected.length) throw new Error('Select existing distributed source files');
  const updates = [];
  for (const name of selected) {
    const exists = Object.hasOwn(manifest.files, name);
    if (name.includes('\\') || name.split('/').includes('..') || (!clientOnly && (!exists ||
      !/^(?:src\/(?!client\/)|host\/(?!build-inputs\/)|docs\/|DEVELOPMENT\.md$)/.test(name) || !/\.(?:mjs|js|ts|json|md|css|ya?ml)$/.test(name))) ||
      (clientOnly && !exists && !runtimeFile.test(name))) throw new Error(`Not a distributed OpenCU file: ${name}`);
    const from = join(source, name), destination = join(target, name);
    if (!exists) {
      try { await lstat(destination); throw new Error(`Refusing an untracked destination: ${name}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if ((!removed.has(name) && await realpath(from) !== from) || (exists && await realpath(destination) !== destination) ||
      (!exists && await realpath(dirname(destination)) !== dirname(destination))) throw new Error(`Refusing a non-owned source file: ${name}`);
    const bytes = removed.has(name) ? null : await readFile(from), previous = exists ? await readFile(destination) : null;
    if (bytes && (!clientOnly || !name.startsWith('lib/'))) {
      const committed = execFileSync('git', ['show', `${commit}:${name}`], { cwd: source, maxBuffer: 8 * 1024 * 1024 });
      if (!bytes.equals(committed)) throw new Error(`Commit the source file before synchronizing: ${name}`);
    }
    if (previous && createHash('sha256').update(previous).digest('hex') !== manifest.files[name]) throw new Error(`Bundled source differs from its manifest: ${name}`);
    if (bytes && previous && bytes.equals(previous)) continue;
    const staged = bytes ? join(staging, 'next', name) : null;
    if (staged) {
      await mkdir(dirname(staged), { recursive: true }); await writeFile(staged, bytes, { mode: exists ? (await stat(destination)).mode & 0o777 : 0o644 });
    }
    updates.push({ name, destination, previous, staged });
    if (bytes) manifest.files[name] = createHash('sha256').update(bytes).digest('hex');
    else delete manifest.files[name];
  }
  manifest.source = '../opencu'; manifest.sourceCommit = commit;
  delete manifest.archiveSha256; // No new archive was built for this mixed source/output snapshot.
  const applied = [];
  try {
    for (const update of updates) {
      if (update.staged) await rename(update.staged, update.destination); else await rm(update.destination);
      applied.push(update);
    }
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await rename(join(staging, 'manifest.json'), manifestPath);
  } catch (error) {
    const rollback = await Promise.allSettled([...applied.map(update => update.previous ? writeFile(update.destination, update.previous) : rm(update.destination, { force: true })), writeFile(manifestPath, originalManifest)]);
    throw new AggregateError([error, ...rollback.filter(result => result.status === 'rejected').map(result => result.reason)], 'OpenCU source sync failed');
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
  await rm(staging, { recursive: true, force: true });
  console.log(`Synced ${updates.length} OpenCU ${clientOnly ? 'client output' : 'committed source'} files from ${commit}`);
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
