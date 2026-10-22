import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(new URL('../../deepseek-workbench/', import.meta.url));
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.name !== 'dsh-deepseek-workbench' || manifest.engines.dsh !== host.engines.dsh) throw Error('Matching standalone Workbench source required');
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], { cwd: source, encoding: 'utf8' }));
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const stage = await mkdtemp(join(local, 'deepseek-workbench-bundle-'));
const files = {};
for (const { path } of packed.files) {
  if (path.startsWith('/') || path.split('/').includes('..') || /(?:^|\/)(?:\.local|node_modules|\.git)\//.test(path)) throw Error('Unsafe package path');
  await cp(join(source, path), join(stage, 'package', path), { recursive: true });
  files[path] = createHash('sha256').update(await readFile(join(source, path))).digest('hex');
}
await rename(join(root, 'plugins/deepseek-workbench'), join(stage, 'previous'));
try { await rename(join(stage, 'package'), join(root, 'plugins/deepseek-workbench')); }
catch (error) { await rename(join(stage, 'previous'), join(root, 'plugins/deepseek-workbench')); throw error; }
await writeFile(join(root, 'plugins/deepseek-workbench.json'), JSON.stringify({ package: manifest.name, version: manifest.version, host: manifest.engines.dsh, source: '../deepseek-workbench', files }, null, 2) + '\n');
execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
console.log(`Synced ${Object.keys(files).length} Workbench files; previous snapshot retained in ${stage}/previous`);
