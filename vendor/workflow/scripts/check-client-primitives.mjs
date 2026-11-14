import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse } from 'acorn';
import { transform } from 'esbuild';

// External browser modules bypass esbuild's named-export validation. Check
// actual source imports against the pinned host before shipping the bundle.
export async function checkClientPrimitives(metafile, root) {
  const require = createRequire(resolve(root, 'package.json'));
  const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
  const name = '@deepseek-ai/dsh-client-ui-primitives';
  const ast = parse(await readFile(host.resolve(name), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const available = new Set(ast.body.filter(node => node.type === 'ExportNamedDeclaration')
    .flatMap(node => node.specifiers.map(spec => spec.exported.name)));
  if (!available.size) throw Error('Pinned DSH primitives export table is empty');
  const missing = [];
  for (const path of Object.keys(metafile.inputs)) {
    if (!/\.(?:jsx?|mjs|tsx?)$/.test(path)) continue;
    const source = await readFile(resolve(root, path), 'utf8');
    if (!source.includes(name)) continue;
    const { code } = await transform(source, { loader: /\.tsx?$/.test(path) ? (path.endsWith('tsx') ? 'tsx' : 'ts') : 'jsx', format: 'esm' });
    for (const node of parse(code, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      if (node.source?.value !== name) continue;
      for (const spec of node.specifiers ?? []) {
        const imported = spec.imported?.name ?? (node.type === 'ExportNamedDeclaration' ? spec.local?.name : undefined);
        if (imported && !available.has(imported)) missing.push(`${path}: ${imported}`);
      }
    }
  }
  if (missing.length) throw Error(`Missing pinned DSH primitive exports:\n${missing.join('\n')}`);
}
