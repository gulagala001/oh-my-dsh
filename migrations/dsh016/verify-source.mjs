#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function verifySource(root = dirname(fileURLToPath(import.meta.url))) {
  const manifest = JSON.parse(readFileSync(join(root, 'source-manifest.json'), 'utf8'));
  const hash = (kind, bytes) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest();
  let files = 0;
  function item(path, name) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Unexpected symlink: ' + path);
    if (stat.isDirectory()) {
      const children = readdirSync(path).map(n => item(join(path, n), n));
      return { name, directory: true, digest: tree(children) };
    }
    if (!stat.isFile()) throw new Error('Not a regular source file: ' + path);
    files++;
    return { name, directory: false, digest: hash('blob', readFileSync(path)) };
  }
  function tree(entries) {
    entries.sort((a,b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    return hash('tree', Buffer.concat(entries.flatMap(e => [Buffer.from(`${e.directory ? '40000' : '100644'} ${e.name}\0`), e.digest])));
  }
  const entries = manifest.roots.map(name => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Invalid root entry: ' + name);
    return item(join(root, name), name);
  });
  const actual = tree(entries).toString('hex');
  if (actual !== manifest.git_tree || files !== manifest.files) throw new Error(`Source checksum mismatch: ${actual}, ${files} files`);
  const bindings = JSON.parse(readFileSync(join(root, 'bindings.json'), 'utf8'));
  if (new Set(bindings.map(b => b.name)).size !== bindings.length) throw new Error('Duplicate tool bindings');
  for (const binding of bindings) {
    if (binding.file.includes('..') || binding.file.startsWith('/')) throw new Error('Unsafe module path');
    if (!readFileSync(join(root, 'prompts', binding.file), 'utf8').trim()) throw new Error('Empty module: ' + binding.file);
  }
  const fragments = readdirSync(join(root, 'prompts/main')).filter(n => n.endsWith('.md')).sort();
  const assembled = fragments.map(n => readFileSync(join(root, 'prompts/main', n), 'utf8').trim()).join('\n\n');
  if (assembled !== readFileSync(join(root, 'prompts/MAIN.md'), 'utf8').trim()) throw new Error('MAIN.md differs from maintained fragments');
  return { files, bindings: bindings.length, mainFragments: fragments.length, gitTree: actual };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(verifySource(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
