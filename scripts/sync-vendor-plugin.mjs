import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const privatePath = /(?:^|\/)(?:node_modules|\.git|\.local|work|data|test-results|playwright-report)(?:\/|$)|(?:^|\/)(?:AGENTS|CLAUDE|PLAN|AI_README)\.md$/i;

export async function syncVendorPlugin({ id, repository, name, required, revision }) {
  const source = await realpath(resolve(process.argv[2] || join(root, '..', repository)));
  const pkg = await readJson(join(source, 'package.json'));
  const host = await readJson(join(root, 'package.json'));
  if (pkg.name !== name || pkg.main !== 'src/index.mjs' || pkg.engines?.dsh !== host.devDependencies['@deepseek-ai/dsh'])
    throw Error(`Expected ${name} for DSH ${host.devDependencies['@deepseek-ai/dsh']}`);
  for (const [peer, version] of Object.entries(pkg.peerDependencies ?? {})) {
    if (peer.startsWith('@deepseek-ai/') && (host.devDependencies?.[peer] ?? host.peerDependencies?.[peer]) !== version)
      throw Error(`${name} requires matching ${peer} ${version}`);
  }

  const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
  if (revision === 'clean') git('diff', '--exit-code', 'HEAD');
  const provenance = { schema: 1, package: name, version: pkg.version, host: pkg.engines.dsh, source: '../' + repository };
  if (revision) provenance.sourceCommit = git('rev-parse', 'HEAD');
  const npm = process.env.OMD_NPM_ENTRY;
  const [packed] = JSON.parse(execFileSync(npm ? process.execPath : 'npm',
    [...(npm ? [npm] : []), 'pack', '--json', '--ignore-scripts', '--dry-run'],
    { cwd: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const paths = packed.files.map(file => file.path).sort();
  for (const path of ['package.json', 'src/index.mjs', 'LICENSE', ...required]) {
    if (!paths.includes(path)) throw Error(`Incomplete ${name} package: missing ${path}`);
  }

  const local = resolve(root, '../.local');
  await mkdir(local, { recursive: true });
  const stage = await mkdtemp(join(local, id + '-bundle-'));
  const next = join(stage, 'package'), previous = join(stage, 'previous');
  const target = resolve(root, 'vendor', id);
  const files = {};
  let saved = false, installed = false;
  const lock = new DatabaseSync(join(local, id + '-bundle.sqlite'));
  try {
    lock.exec('BEGIN IMMEDIATE');
    for (const path of paths) {
      if (isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || privatePath.test(path))
        throw Error('Unsafe package path: ' + path);
      const from = join(source, path), to = join(next, path);
      const info = await lstat(from);
      if (!info.isFile() || await realpath(from) !== from) throw Error('Non-owned source file: ' + path);
      const bytes = await readFile(from);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, bytes);
      await chmod(to, info.mode & 0o777);
      files[path] = sha256(bytes);
      if (!bytes.equals(await readFile(to))) throw Error('Staged copy differs: ' + path);
    }
    await writeFile(join(stage, 'manifest.json'), JSON.stringify({ ...provenance, files }, null, 2) + '\n');
    for (const path of paths) {
      if (sha256(await readFile(join(source, path))) !== files[path]) throw Error('Source changed during sync: ' + path);
    }
    if (revision === 'clean') {
      git('diff', '--exit-code', 'HEAD');
      if (git('rev-parse', 'HEAD') !== provenance.sourceCommit) throw Error('Source commit changed during sync');
    }
    try {
      if (!(await lstat(target)).isDirectory() || await realpath(target) !== target) throw Error('Non-owned destination: ' + target);
      await rename(target, previous);
      saved = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(next, target);
    installed = true;
    await rename(join(stage, 'manifest.json'), target + '.json');
  } catch (error) {
    if (installed) await rename(target, next);
    if (saved) await rename(previous, target);
    await rm(stage, { recursive: true, force: true });
    throw error;
  } finally {
    lock.close();
  }
  execFileSync(process.execPath, [join(root, 'scripts/build-credits.mjs'), '--write'], { stdio: 'inherit' });
  console.log(`Synced ${name} ${pkg.version}: ${paths.length} files${saved ? '; previous snapshot at ' + previous : ''}`);
  if (!saved) await rm(stage, { recursive: true });
}
