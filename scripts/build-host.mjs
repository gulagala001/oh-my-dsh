import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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

// Embed the upstream-built browser factory in OMD's own client module. A
// file: subpackage cannot be resolved from a GitHub-installed dependency.
const client = await readFile(`${root}vendor/dsh/ui-conversation/lib/client.js`, 'utf8');
if (!client.startsWith('window.__ModuleLoader__.load({') || !client.trimEnd().endsWith('});')) throw new Error('Unexpected DSH browser factory format');
const ownedClient = client.replace(/(const tagId(?:\$\d+)? = )"@deepseek-ai\/dsh-client-ui-conversation\//g, '$1"trisoul_x/conversation/').replaceAll('tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-conversation"', 'tag.dataset.plugin = "trisoul_x"');
const registration = ownedClient.trimEnd().replace('window.__ModuleLoader__.load(', 'const registration = ').replace(/\);$/, ';');
await writeFile(`${root}lib/host/ui-conversation.factory.mjs`, registration + '\nexport function createConversation(require) { return registration.factory(require); }\n');

const support = await build({ entryPoints: [`${root}src/session-migration-support.ts`], outfile: `${root}lib/host/session-migration.factory.mjs`,
  platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
  banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: 'return module.exports; }' }, sourcemap: false, legalComments: 'eof' });
const supportDependencies = [...new Set(Object.values(support.metafile.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)))];
await writeFile(`${root}lib/host/session-migration.mjs`, `import { createModule } from './session-migration.factory.mjs';\nimport { loadHostModule } from '../../src/host-component.mjs';\nexport const loadMigrationSupport = ctx => loadHostModule(ctx, 'session-persistence-jsonl', createModule, ${JSON.stringify(supportDependencies)});\n`);

await writeFile(`${root}lib/host/ui-conversation.mjs`, `import { Config, apply as nativeApply } from '../../vendor/dsh/ui-conversation/lib/index.js';
import { legacySettings } from '#opencu/src/legacy-settings.mjs';
export { Config };
export const inject = ['settings'];
export async function apply(ctx) {
  nativeApply(ctx);
  const legacy = await legacySettings(ctx, 'omd-ui-conversation', Config, ['ui-conversation']);
  legacy.persist();
}
`);
