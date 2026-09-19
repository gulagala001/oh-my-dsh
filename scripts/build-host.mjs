import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = ['jobs-local', 'tool-jobs', 'tool-bash', 'tool-pwsh', 'bash-sandbox', 'pwsh-sandbox', 'tools'];
await mkdir(new URL('../lib/host/', import.meta.url), { recursive: true });
for (const name of modules) {
  const result = await build({ entryPoints: [`${root}vendor/dsh/${name}/src/index.ts`], outfile: `${root}lib/host/${name}.factory.mjs`,
    platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
    banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' },
    footer: { js: 'return module.exports; }' },
    sourcemap: false, legalComments: 'eof',
    plugins: [{ name: 'local-shell', setup(b) { b.onResolve({ filter: /^@deepseek-ai\/dsh-(bash|pwsh)-local$/ }, args => ({ path: `${root}vendor/dsh/${args.path.split('dsh-')[1]}/src/index.ts` })); } }],
  });
  const dependencies = [...new Set(Object.values(result.metafile.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)))];
  await writeFile(`${root}lib/host/${name}.mjs`, `import { createModule } from './${name}.factory.mjs';\nimport { mountHostComponent } from '../../src/host-component.mjs';\nexport const name = 'omd-host-${name}';\nexport const inject = ['loader'];\nexport const apply = (ctx, config) => mountHostComponent(ctx, ${JSON.stringify(name)}, createModule, ${JSON.stringify(dependencies)}, config);\n`);
}
// Retire outputs from the earlier direct-entry build, never user data.
for (const name of ['bash-local', 'pwsh-local']) await rm(`${root}lib/host/${name}.mjs`, { force: true });
