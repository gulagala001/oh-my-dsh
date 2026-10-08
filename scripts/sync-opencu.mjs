import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir, rename, stat, realpath } from 'node:fs/promises';
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
  const { values, positionals } = parseArgs({ options: { 'allow-downgrade': { type: 'boolean', default: false } }, allowPositionals: true });
  if (positionals.length !== 1) throw Error('Usage: node scripts/sync-opencu.mjs /path/to/opencu [--allow-downgrade]');
  const source = resolve(positionals[0]), root = fileURLToPath(new URL('../', import.meta.url));
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
  const sourceVersion = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version;
  parseVersion(sourceVersion);
  let previous;
  try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== undefined && compareVersions(sourceVersion, previous?.version) < 0 && !values['allow-downgrade']) {
    throw Error(`OpenCU downgrade refused: ${previous.version} -> ${sourceVersion}. Use --allow-downgrade for an intentional rollback.`);
  }
  const npm = await npmInvocation();
  await mkdir(vendor, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), 'omd-opencu-pack-'));
  let staging, keepStaging = false;
  const run = (command, args) => execFileSync(command, args, { cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    // Stay on the project filesystem, outside the package.files vendor allowlist.
    staging = await mkdtemp(join(root, '.opencu-sync-'));
    run(process.execPath, ['scripts/build.mjs']);
    const packedResult = JSON.parse(run(npm.command, [...npm.args, 'pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
    const [packed] = Array.isArray(packedResult) ? packedResult : Object.values(packedResult);
    if (packed.version !== sourceVersion) throw Error('Packed OpenCU version differs from the source package.json');
    const archive = join(temporary, packed.filename), next = join(staging, 'next'), nextManifest = join(staging, 'next-manifest.json');
    await mkdir(next);
    execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', next]);
    if (JSON.parse(await readFile(join(next, 'package.json'), 'utf8')).version !== sourceVersion) throw Error('Extracted OpenCU version differs from the source package.json');
    const files = {};
    async function walk(dir, prefix = '') {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + entry.name;
        if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
        else files[path] = createHash('sha256').update(await readFile(join(dir, entry.name))).digest('hex');
      }
    }
    await walk(next);
    await writeFile(nextManifest, JSON.stringify({ repository: 'https://github.com/gulagala001/opencu', commit: run('git', ['rev-parse', 'HEAD']).trim(), workingTree: Boolean(run('git', ['status', '--porcelain']).trim()), version: packed.version,
      archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
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
    await rm(temporary, { recursive: true, force: true });
    if (staging && !keepStaging) await rm(staging, { recursive: true, force: true });
  }
}

const entry = process.argv[1] && await realpath(process.argv[1]).catch(() => null);
if (entry === fileURLToPath(import.meta.url)) await syncOpenCU();
