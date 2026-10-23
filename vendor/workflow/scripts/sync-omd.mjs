import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { root, sha256, validateInputs, readJson } from './build-inputs.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--target') throw Error('Usage: node scripts/sync-omd.mjs --target ../oh-my-dsh (build first; no automatic sync)');
const target = await realpath(resolve(root, args[1]));
if (target !== await realpath(resolve(root, '../oh-my-dsh'))) throw Error('Sync target must be the sibling oh-my-dsh workspace');
const { pkg, snapshot } = await validateInputs();
const destination = join(target, 'vendor/workflow'), manifestPath = join(target, 'vendor/workflow.json');
const vendor = join(target, 'vendor');
if (await realpath(vendor) !== vendor) throw Error('Refusing symlinked target vendor directory');
const files = new Map();
async function collect(directory, prefix, accept) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) await collect(path, name + '/', accept);
    else if (!entry.isFile() || await realpath(path) !== path) throw Error(`Refusing non-owned source: ${name}`);
    else if (accept(name)) files.set(name, path);
  }
}
await collect(join(root, 'src'), 'src/', path => /\.(?:mjs|jsx|css|json)$/.test(path));
await collect(join(root, 'lib'), 'lib/', path => /\.(?:mjs|js|json)$/.test(path));
await collect(join(root, 'docs'), 'docs/', () => true);
await collect(join(root, 'scripts'), 'scripts/', path => /\.(?:mjs|json)$/.test(path));
await collect(join(root, 'vendor'), 'vendor/', path => path === 'vendor/dsh.json' || path.startsWith('vendor/dsh/'));
for (const name of ['package.json', 'cordis.patch.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'README_EN.md', 'CHANGELOG.md']) {
  const path = join(root, name);
  if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw Error(`Invalid package metadata: ${name}`);
  files.set(name, path);
}
for (const name of ['src/index.mjs', 'src/client/index.jsx', 'lib/client.js', 'lib/client.factory.mjs', 'lib/host/dependencies.json', 'lib/host/workflow-ptc.factory.mjs', 'lib/host/tool-workflow.factory.mjs', 'lib/host/workflow-spawn.factory.mjs']) if (!files.has(name)) throw Error(`Build before syncing; missing ${name}`);
let previous;
try {
  if (!(await lstat(manifestPath)).isFile() || await realpath(manifestPath) !== manifestPath) throw Error('Refusing non-owned Workflow manifest');
  previous = await readJson(manifestPath);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let destinationExists = true;
try { await lstat(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; destinationExists = false; }
if (destinationExists) {
  if (!(await lstat(destination)).isDirectory() || await realpath(destination) !== destination || previous?.package !== pkg.name) throw Error('Existing Workflow snapshot is not owned by this sync script');
  const existing = new Map();
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), name = relative(destination, path).split(sep).join('/');
      if (entry.isDirectory()) await inspect(path);
      else {
        if (!entry.isFile() || previous.files?.[name] !== sha256(await readFile(path))) throw Error(`Preserve locally changed/unlisted target: ${name}`);
        existing.set(name, true);
      }
    }
  }
  await inspect(destination);
  for (const name of Object.keys(previous.files ?? {})) if (!existing.has(name)) throw Error(`Existing Workflow snapshot is incomplete: ${name}`);
}
const staging = destination + `.sync-${process.pid}`, backup = destination + `.previous-${process.pid}`;
await mkdir(staging);
let moved = false;
try {
  const hashes = {};
  for (const [name, source] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const path = join(staging, name);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(source, path);
    hashes[name] = sha256(await readFile(path));
  }
  const manifest = { schema: 1, package: pkg.name, version: pkg.version, host: snapshot.version, upstream: { repository: snapshot.repository, commit: snapshot.commit, tag: snapshot.tag }, files: hashes };
  const pendingManifest = manifestPath + `.sync-${process.pid}`;
  await writeFile(pendingManifest, JSON.stringify(manifest, null, 2) + '\n');
  try { await rename(destination, backup); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(staging, destination); await rename(pendingManifest, manifestPath); }
  catch (error) { await rm(destination, { recursive: true, force: true }); if (moved) await rename(backup, destination); await rm(pendingManifest, { force: true }); throw error; }
  if (moved) await rm(backup, { recursive: true });
  execFileSync(process.execPath, [join(target, 'scripts/build-credits.mjs'), '--write'], { cwd: target, stdio: 'inherit' });
  console.log(`Synced ${files.size} distribution files to ${destination}; SHA256 inventory: ${manifestPath}`);
} finally { await rm(staging, { recursive: true, force: true }); }
