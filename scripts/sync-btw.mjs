import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await realpath(resolve(process.argv[2] || join(root, '../dsh-btw-plugin')));
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.name !== '@gulagala001/dsh-btw' || manifest.main !== 'src/index.mjs') throw new Error('Expected the standalone @gulagala001/dsh-btw package');
if (manifest.engines?.dsh !== host.engines.dsh) throw new Error('BTW build target does not match OMD');
for (const [name, version] of Object.entries(manifest.peerDependencies ?? {})) {
  if (name.startsWith('@deepseek-ai/') && (host.peerDependencies?.[name] ?? host.devDependencies?.[name]) !== version) {
    throw new Error(`Bundled BTW requires matching ${name} ${version}`);
  }
}
const npmEntry = process.env.OMD_NPM_ENTRY;
const [packed] = JSON.parse(execFileSync(npmEntry ? process.execPath : 'npm',
  [...(npmEntry ? [npmEntry] : []), 'pack', '--json', '--ignore-scripts', '--dry-run'],
  { cwd: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const paths = packed.files.map(file => file.path).sort();
for (const required of ['package.json', 'src/index.mjs', 'src/client/index.jsx', 'lib/client.js', 'LICENSE']) {
  if (!paths.includes(required)) throw new Error(`Complete BTW build required: missing ${required}`);
}
const files = {};
for (const name of paths) {
  if (isAbsolute(name) || name.includes('\\') || name.split('/').some(part => part === '..' || part === '.')
    || /(?:^|\/)(?:node_modules|\.git|\.local|work|data|test-results|playwright-report)(?:\/|$)/.test(name)
    || /(?:^|\/)(?:AGENTS|CLAUDE|PLAN|AI_README)\.md$/i.test(name)) throw new Error(`Refusing internal or unsafe BTW file: ${name}`);
  const path = join(source, name), info = await lstat(path);
  if (!info.isFile() || await realpath(path) !== path) throw new Error(`Refusing non-owned BTW file: ${name}`);
  files[name] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const staging = await mkdtemp(join(local, 'btw-bundle-'));
const unpacked = join(staging, 'package');
for (const name of paths) {
  const from = join(source, name), to = join(unpacked, name);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  await chmod(to, (await lstat(from)).mode & 0o777);
  if (createHash('sha256').update(await readFile(to)).digest('hex') !== files[name]) throw new Error(`BTW source changed during sync: ${name}`);
}
const target = join(root, 'vendor/btw');
let previous = false;
try {
  if (!(await lstat(target)).isDirectory() || await realpath(target) !== target) throw new Error('Refusing non-owned BTW destination');
  await rename(target, join(staging, 'previous'));
  previous = true;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
try { await rename(unpacked, target); }
catch (error) {
  if (previous) await rename(join(staging, 'previous'), target);
  throw error;
}
await writeFile(join(root, 'vendor/btw.json'), JSON.stringify({ schema: 1, package: manifest.name,
  version: manifest.version, host: manifest.engines.dsh, source: '../dsh-btw-plugin', sourceCommit, files }, null, 2) + '\n');
console.log(`Bundled BTW ${manifest.version}: ${paths.length} files; previous snapshot retained at ${staging}/previous`);
