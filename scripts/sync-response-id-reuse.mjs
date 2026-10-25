import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, copyFile, rm, writeFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await realpath(resolve(process.argv[2] || join(root, '../dsh-response-id-reuse')));
const pkg = JSON.parse(await readFile(join(source, 'package.json')));
const host = JSON.parse(await readFile(join(root, 'package.json')));
if (pkg.name !== '@gulagala001/dsh-response-id-reuse' || pkg.engines.dsh !== host.engines.dsh) throw Error('Response ID Reuse host/package mismatch');
execFileSync('git', ['diff', '--exit-code', 'HEAD'], { cwd: source, stdio: 'pipe' });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--dry-run', '--json'], { cwd: source, encoding: 'utf8' }));
const files = {}, target = join(root, 'vendor/response-id-reuse');
for (const entry of packed.files) {
  if (entry.path.includes('..') || entry.path.startsWith('/') || entry.path.includes('\\')) throw Error('Unsafe source path');
  const path = join(source, entry.path);
  if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw Error('Non-owned source file');
  files[entry.path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
for (const required of ['src/index.mjs', 'src/engine.mjs', 'src/shared.mjs', 'LICENSE', 'docs/structure.json']) if (!files[required]) throw Error('Missing source: ' + required);
await rm(target, { recursive: true, force: true });
for (const [path, digest] of Object.entries(files)) {
  const destination = join(target, path); await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(source, path), destination);
  if (createHash('sha256').update(await readFile(destination)).digest('hex') !== digest) throw Error('Source changed during sync');
}
await writeFile(join(root, 'vendor/response-id-reuse.json'), JSON.stringify({ schema: 1, package: pkg.name,
  version: pkg.version, host: pkg.engines.dsh, source: '../dsh-response-id-reuse', sourceCommit, files }, null, 2) + '\n');
console.log(`Synced Response ID Reuse ${pkg.version}: ${Object.keys(files).length} files`);
