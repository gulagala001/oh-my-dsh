import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';

const root = new URL('../', import.meta.url), directory = new URL('vendor/unharnessed/', root);
const inventory = JSON.parse(readFileSync(new URL('vendor/unharnessed.json', root)));
const pkg = JSON.parse(readFileSync(new URL('package.json', directory)));
const host = JSON.parse(readFileSync(new URL('package.json', root)));
assert.equal(inventory.package, pkg.name); assert.equal(inventory.version, pkg.version); assert.equal(inventory.host, host.devDependencies['@deepseek-ai/dsh']);
assert.match(inventory.sourceArchiveSha256, /^[a-f0-9]{64}$/);
const paths = readdirSync(directory, { recursive: true }).filter(path => !lstatSync(new URL(path, directory)).isDirectory()).sort();
assert.deepEqual(paths, Object.keys(inventory.files).sort());
const adapted = new Set(inventory.adaptations.map(item => item.file));
assert.deepEqual(Object.keys(inventory.originalFiles).sort(), paths);
for (const path of paths) {
  assert.ok(!path.split(/[\\/]/).some(part => ['..', 'node_modules', '__pycache__', '.local'].includes(part)));
  assert.ok(lstatSync(new URL(path, directory)).isFile(), path);
  const hash = createHash('sha256').update(readFileSync(new URL(path, directory))).digest('hex');
  assert.equal(hash, inventory.files[path], path);
  if (hash !== inventory.originalFiles[path]) assert.ok(adapted.has(path), 'Unrecorded adaptation: ' + path);
}
for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'vendor/LICENSE.Unharnessed', 'vendor/LICENSE.dill']) assert.ok(paths.includes(path));
console.log(`Bundled Unharnessed ${pkg.version}: ${paths.length} files and adaptations verified.`);
