import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir, rename, stat, lstat, realpath, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

export async function npmInvocation({ platform = process.platform, execPath = process.execPath, env = process.env } = {}) {
  if (platform !== 'win32') return { command: 'npm', args: [] };
  const candidates = [];
  if (env.npm_execpath && basename(env.npm_execpath) === 'npm-cli.js') candidates.push(env.npm_execpath);
  candidates.push(join(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'));
  async function invocation(cli) {
    try { if ((await stat(cli)).isFile()) return { command: execPath, args: [cli] }; }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  for (const cli of candidates) { const found = await invocation(cli); if (found) return found; }
  const path = env[Object.keys(env).find(key => key.toLowerCase() === 'path')] || '';
  for (const entry of path.split(delimiter).filter(Boolean)) {
    const directory = entry.replace(/^"(.*)"$/, '$1');
    for (const name of ['npm.cmd', 'npm']) {
      try {
        const launcher = await realpath(join(directory, name));
        const found = await invocation(basename(launcher) === 'npm-cli.js' ? launcher : join(dirname(launcher), 'node_modules/npm/bin/npm-cli.js'));
        if (found) return found;
      } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
    }
  }
  throw Error('Cannot locate npm-cli.js for Windows. Install npm alongside Node or put its npm launcher on PATH.');
}

async function syncOpenCU() {
  const { values, positionals } = parseArgs({ options: {
    'allow-downgrade': { type: 'boolean', default: false }, archive: { type: 'string' },
  }, allowPositionals: true });
  if (positionals.length !== 1) throw Error('Usage: node scripts/sync-opencu.mjs /path/to/opencu [--archive /path/to/opencu.tgz] [--allow-downgrade]\n       node scripts/sync-opencu.mjs /path/to/opencu.tgz [--allow-downgrade]');
  const input = resolve(positionals[0]), inputState = await stat(input), root = fileURLToPath(new URL('../', import.meta.url));
  const source = inputState.isDirectory() ? input : undefined;
  if (!source && (values.archive || !inputState.isFile() || !input.endsWith('.tgz'))) throw Error('OpenCU input must be a source directory or a .tgz release archive');
  let archive = values.archive ? resolve(values.archive) : source ? undefined : input;
  if (archive && (!(await stat(archive)).isFile() || !archive.endsWith('.tgz'))) throw Error('OpenCU archive must be a .tgz file');
  const vendor = join(root, 'vendor'), destination = join(vendor, 'opencu'), manifestPath = join(vendor, 'opencu.json');

  // Keep this maintenance script independent of runtime release-manifest loading.
  function parseVersion(version) {
    const match = typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    const pre = match?.[4]?.split('.') || [];
    if (!match || pre.some(part => /^0\d+$/.test(part))) throw Error(`Invalid OpenCU version: ${version}`);
    return { core: match.slice(1, 4).map(BigInt), pre };
  }
  function compareVersions(a, b) {
    const x = parseVersion(a), y = parseVersion(b), compare = (u, v) => u < v ? -1 : u > v ? 1 : 0;
    for (let i = 0; i < 3; i++) { const result = compare(x.core[i], y.core[i]); if (result) return result; }
    if (!x.pre.length || !y.pre.length) return compare(!x.pre.length, !y.pre.length);
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
      const u = x.pre[i], v = y.pre[i];
      if (u === undefined || v === undefined) return compare(u !== undefined, v !== undefined);
      const un = /^\d+$/.test(u), vn = /^\d+$/.test(v);
      const result = un && vn ? compare(BigInt(u), BigInt(v)) : un !== vn ? (un ? -1 : 1) : compare(u, v);
      if (result) return result;
    }
    return 0;
  }
  const sourcePackage = source ? JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) : undefined;
  if (sourcePackage && sourcePackage.name !== 'opencu') throw Error('Source package is not OpenCU');
  const sourceVersion = sourcePackage?.version;
  if (source) parseVersion(sourceVersion);
  let previous;
  try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== undefined) parseVersion(previous?.version);
  function checkVersion(version) {
    parseVersion(version);
    if (previous !== undefined && compareVersions(version, previous.version) < 0 && !values['allow-downgrade']) {
      throw Error(`OpenCU downgrade refused: ${previous.version} -> ${version}. Use --allow-downgrade for an intentional rollback.`);
    }
  }
  if (source) checkVersion(sourceVersion);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  async function snapshot(directory) {
    const files = Object.create(null);
    const state = await lstat(directory);
    if (!state.isDirectory() || state.isSymbolicLink()) throw Error(`OpenCU snapshot is not a regular directory: ${directory}`);
    async function walk(dir, prefix = '') {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + entry.name;
        if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
        else if (entry.isFile()) files[path] = digest(await readFile(join(dir, entry.name)));
        else throw Error(`OpenCU snapshot contains an unsupported file type: ${path}`);
      }
    }
    await walk(directory);
    return Object.fromEntries(Object.entries(files).sort());
  }
  async function existingSnapshot() {
    let files;
    try { files = await snapshot(destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return undefined; }
    if (!previous || !previous.files || typeof previous.files !== 'object' || Array.isArray(previous.files)) {
      throw Error('OpenCU snapshot has no valid file manifest; refusing to delete unrecognized files');
    }
    // package.json is known package metadata, including older manifests that omitted it.
    const unrecognized = Object.keys(files).filter(path => path !== 'package.json' && !Object.hasOwn(previous.files, path));
    if (unrecognized.length) throw Error(`OpenCU snapshot contains unrecognized files; preserve them before syncing: ${unrecognized.join(', ')}`);
    return files;
  }
  const before = await existingSnapshot();
  const npm = archive ? undefined : await npmInvocation();
  await mkdir(vendor, { recursive: true });
  let temporary, staging, keepStaging = false;
  const run = (command, args) => execFileSync(command, args, { cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    // Stay on the project filesystem, outside the package.files vendor allowlist.
    staging = await mkdtemp(join(root, '.opencu-sync-'));
    if (!archive) {
      temporary = await mkdtemp(join(tmpdir(), 'omd-opencu-pack-'));
      run(process.execPath, ['scripts/build.mjs']);
      const packedResult = JSON.parse(run(npm.command, [...npm.args, 'pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
      const [packed] = Array.isArray(packedResult) ? packedResult : Object.values(packedResult);
      if (packed.version !== sourceVersion) throw Error('Packed OpenCU version differs from the source package.json');
      archive = join(temporary, packed.filename);
    } else {
      // Validate external archives before tar can create anything on disk.
      const suppliedArchive = join(staging, 'supplied.tgz');
      await copyFile(archive, suppliedArchive);
      archive = suppliedArchive;
      const members = run('tar', ['-tzf', archive]).split('\n').filter(Boolean);
      if (!members.length || members.some(path => !path.startsWith('package/') || /[\\\r\x00]/.test(path) || path.split('/').some(part => part === '..' || part === '.'))) {
        throw Error('OpenCU archive contains a path outside the npm package root');
      }
      const entries = run('tar', ['-tvzf', archive]).split('\n').filter(Boolean);
      if (entries.length !== members.length || entries.some(line => !/^[-d]/.test(line))) throw Error('OpenCU archive contains links or unsupported file types');
    }
    const next = join(staging, 'next'), nextManifest = join(staging, 'next-manifest.json');
    await mkdir(next);
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', next]);
    const extracted = JSON.parse(await readFile(join(next, 'package.json'), 'utf8'));
    if (extracted.name !== 'opencu') throw Error('Release archive is not OpenCU');
    if (source && extracted.version !== sourceVersion) throw Error('Extracted OpenCU version differs from the source package.json');
    checkVersion(extracted.version);
    const files = await snapshot(next);
    await writeFile(nextManifest, JSON.stringify({ repository: 'https://github.com/gulagala001/opencu',
      commit: source ? run('git', ['rev-parse', 'HEAD']).trim() : extracted.gitHead ?? null,
      workingTree: source ? Boolean(run('git', ['status', '--porcelain']).trim()) : null,
      version: extracted.version, archiveSha256: digest(await readFile(archive)), files }, null, 2) + '\n');
    if (JSON.stringify(await existingSnapshot()) !== JSON.stringify(before)) throw Error('OpenCU snapshot changed while syncing; refusing to replace it');
    let currentManifest;
    try { currentManifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (JSON.stringify(currentManifest) !== JSON.stringify(previous)) throw Error('OpenCU manifest changed while syncing; refusing to replace it');
    const old = join(staging, 'previous'), oldManifest = join(staging, 'previous-manifest.json');
    let hadSnapshot = false, hadManifest = false, installedSnapshot = false, installedManifest = false;
    async function backup(from, to) {
      try { await rename(from, to); return true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return false; }
    }
    try {
      hadSnapshot = await backup(destination, old);
      hadManifest = await backup(manifestPath, oldManifest);
      await rename(next, destination); installedSnapshot = true;
      await rename(nextManifest, manifestPath); installedManifest = true;
    } catch (error) {
      try {
        if (installedManifest) await rm(manifestPath, { force: true });
        if (installedSnapshot) await rm(destination, { recursive: true, force: true });
        if (hadSnapshot) await rename(old, destination);
        if (hadManifest) await rename(oldManifest, manifestPath);
      } catch (rollbackError) {
        keepStaging = true;
        throw new AggregateError([error, rollbackError], `OpenCU rollback failed; preserved recovery files in ${staging}`);
      }
      throw error;
    }
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    if (staging && !keepStaging) await rm(staging, { recursive: true, force: true });
  }
}

const entry = process.argv[1] && await realpath(process.argv[1]).catch(() => null);
if (entry === fileURLToPath(import.meta.url)) await syncOpenCU();
