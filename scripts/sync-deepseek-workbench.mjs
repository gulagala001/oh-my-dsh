import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const adapterOnly = args[0] === '--desktop-adapter';
if (adapterOnly) args.shift();
if (args.length > 1 || args[0]?.startsWith('-')) throw Error('Usage: sync-deepseek-workbench.mjs [--desktop-adapter] [source]');
const source = resolve(args[0] ?? fileURLToPath(new URL('../../deepseek-workbench/', import.meta.url)));
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const provenance = join(root, 'plugins/deepseek-workbench.json');
const current = JSON.parse(await readFile(provenance, 'utf8'));
if (manifest.name !== 'dsh-deepseek-workbench' || (adapterOnly ? (manifest.version !== current.version || manifest.engines.dsh !== current.host) : manifest.engines.dsh !== host.devDependencies['@deepseek-ai/dsh']))
  throw Error('Matching standalone Workbench source required');
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], { cwd: source, encoding: 'utf8' }));
const isAdapter = path => path.startsWith('desktop/') || /^docs\/desktop-host(?:_EN)?\.md$/.test(path);
const selected = adapterOnly ? packed.files.filter(({ path }) => isAdapter(path)) : packed.files;
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const stage = await mkdtemp(join(local, 'deepseek-workbench-bundle-'));
const files = adapterOnly ? { ...current.files } : {};
if (adapterOnly) {
  for (const [path, digest] of Object.entries(files)) if (isAdapter(path)) {
    if (digest !== createHash('sha256').update(await readFile(join(root, 'plugins/deepseek-workbench', path))).digest('hex'))
      throw Error('Workbench adapter snapshot differs from its manifest: ' + path);
    if (!selected.some(entry => entry.path === path)) throw Error('Workbench adapter removed a distributed file: ' + path);
  }
  await cp(join(root, 'plugins/deepseek-workbench'), join(stage, 'package'), { recursive: true });
}
for (const { path } of selected) {
  if (path.startsWith('/') || path.split('/').includes('..') || /(?:^|\/)(?:\.local|node_modules|\.git)\//.test(path)) throw Error('Unsafe package path');
  const body = await readFile(join(source, path));
  if (adapterOnly && !body.equals(execFileSync('git', ['show', `HEAD:${path}`], { cwd: source })))
    throw Error('Commit the Workbench adapter before synchronizing: ' + path);
  await mkdir(dirname(join(stage, 'package', path)), { recursive: true });
  await writeFile(join(stage, 'package', path), body);
  files[path] = createHash('sha256').update(body).digest('hex');
}
await rename(join(root, 'plugins/deepseek-workbench'), join(stage, 'previous'));
try { await rename(join(stage, 'package'), join(root, 'plugins/deepseek-workbench')); }
catch (error) { await rename(join(stage, 'previous'), join(root, 'plugins/deepseek-workbench')); throw error; }
await writeFile(provenance, JSON.stringify({ package: manifest.name, version: manifest.version, host: manifest.engines.dsh, source: '../deepseek-workbench', files }, null, 2) + '\n');
execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
console.log(`Synced ${Object.keys(files).length} Workbench files; previous snapshot retained in ${stage}/previous`);
