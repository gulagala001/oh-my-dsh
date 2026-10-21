import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(new URL('../../dsh-extensions/', import.meta.url));
const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const host = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.name !== 'dsh-extensions' || manifest.engines.dsh !== host.engines.dsh) throw Error('Matching standalone DSH Extensions source required');
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], { cwd: source, encoding: 'utf8' }));
const local = join(root, '../.local');
await mkdir(local, { recursive: true });
const stage = await mkdtemp(join(local, 'dsh-extensions-bundle-'));
const files = {};
for (const { path } of packed.files) {
  if (path.startsWith('/') || path.split('/').includes('..') || /(?:^|\/)(?:\.local|node_modules|\.git)\//.test(path)) throw Error('Unsafe package path');
  await cp(join(source, path), join(stage, 'package', path), { recursive: true });
  files[path] = createHash('sha256').update(await readFile(join(source, path))).digest('hex');
}
const previous = await rename(join(root, 'plugins/dsh-extensions'), join(stage, 'previous')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
try { await rename(join(stage, 'package'), join(root, 'plugins/dsh-extensions')); }
catch (error) { if (previous) await rename(join(stage, 'previous'), join(root, 'plugins/dsh-extensions')); throw error; }
await writeFile(join(root, 'plugins/dsh-extensions.json'), JSON.stringify({ package: manifest.name, version: manifest.version, host: manifest.engines.dsh, source: '../dsh-extensions', files }, null, 2) + '\n');
console.log(`Synced ${Object.keys(files).length} DSH Extensions files; previous snapshot retained in ${stage}/previous`);
