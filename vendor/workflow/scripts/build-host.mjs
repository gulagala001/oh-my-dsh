import { build } from 'esbuild';
import { createRequire, isBuiltin } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHostConstEnums } from './host-const-enums.mjs';
import { root, outputPath, validateInputs } from './build-inputs.mjs';

const { snapshot } = await validateInputs();
const requireBuild = createRequire(import.meta.url);
const source = path => join(root, 'vendor/dsh', path);
const modules = { 'workflow-ptc': 'workflow-ptc/src/index.ts', 'tool-workflow': 'tool-workflow/src/index.ts', 'workflow-spawn': 'workflow-ptc/src/spawn.ts' };
const aliases = { '@deepseek-ai/dsh-tools': 'tools/src/json-schema.ts', '@deepseek-ai/dsh-workflow': 'workflow/src/index.ts', '@deepseek-ai/dsh-llm': 'llm/src/error.ts' };
const localImport = specifier => specifier === '@deepseek-ai/dsh-session-persistence-jsonl/src/lease.ts' ? source('session-persistence-jsonl/src/lease.ts') : undefined;
const acorn = { name: 'workflow-acorn', setup(b) {
  b.onResolve({ filter: /^acorn$/ }, () => ({ path: 'acorn', namespace: 'workflow-dependency' }));
  b.onLoad({ filter: /^acorn$/, namespace: 'workflow-dependency' }, async () => ({ contents: await readFile(requireBuild.resolve('acorn'), 'utf8'), loader: 'js' }));
} };
const guestEnums = await createHostConstEnums({ root, snapshot, entryPoints: [source('workflow-ptc/src/guest.ts')], resolveImport: name => aliases[name] && source(aliases[name]) });
const hostEnums = await createHostConstEnums({ root, snapshot, ts: guestEnums.ts, entryPoints: Object.values(modules).map(source), resolveImport: localImport });
const guest = await build({ absWorkingDir: root, entryPoints: [source('workflow-ptc/src/guest.ts')], platform: 'node', target: 'node22', format: 'esm', bundle: true, write: false, metafile: true,
  plugins: [{ name: 'workflow-guest-helpers', setup(b) {
    b.onResolve({ filter: /^@deepseek-ai\/dsh-(tools|workflow|llm)$/ }, args => ({ path: source(aliases[args.path]), sideEffects: false }));
  } }, acorn, guestEnums.plugin] });
guestEnums.assertExternal(guest);
await guestEnums.assertOutput(guest);
const externals = result => [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(item => item.external).map(item => item.path)))].sort();
const invalid = externals(guest).filter(name => !isBuiltin(name));
if (invalid.length) throw Error(`Workflow guest has external packages: ${invalid.join(', ')}`);
const guestSource = guest.outputFiles[0].text.replace(/^\/\/ (?:.*\/)?node_modules\//gm, '// node_modules/');
const dependencies = {};
for (const [name, entry] of Object.entries(modules)) {
  const outfile = await outputPath(join(root, 'lib/host', name + '.factory.mjs'));
  const result = await build({ absWorkingDir: root, entryPoints: [source(entry)], outfile, platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
    supported: { 'dynamic-import': false }, legalComments: 'eof',
    banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' }, footer: { js: 'return module.exports; }' },
    plugins: [{ name: 'workflow-host', setup(b) {
      b.onResolve({ filter: /^@deepseek-ai\/dsh-/ }, args => { const path = localImport(args.path); if (path) return { path }; });
      b.onLoad({ filter: /workflow-ptc[\\/]src[\\/]guest-source\.ts$/ }, () => ({ contents: `export const WORKFLOW_GUEST_SOURCE = ${JSON.stringify(guestSource)};`, loader: 'ts' }));
    } }, acorn, hostEnums.plugin] });
  hostEnums.assertExternal(result);
  await hostEnums.assertOutput(result);
  dependencies[name] = externals(result);
}
await writeFile(await outputPath(join(root, 'lib/host/dependencies.json')), JSON.stringify(dependencies, null, 2) + '\n');
console.log('Built Workflow host factories and self-contained guest.');
