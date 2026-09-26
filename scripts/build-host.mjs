import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = ['jobs-local', 'tool-jobs', 'tool-bash', 'tool-pwsh', 'bash-sandbox', 'pwsh-sandbox', 'tools', 'workflow-ptc', 'tool-workflow', 'workflow-spawn'];
await mkdir(new URL('../lib/host/', import.meta.url), { recursive: true });
// The workflow VM is transported as one self-contained ESM source string. Its
// only external imports may be Node builtins, never plugin/host package paths.
const guest = await build({ entryPoints: [`${root}vendor/dsh/workflow-ptc/src/guest.ts`], bundle: true,
  platform: 'node', target: 'node22', format: 'esm', write: false, metafile: true,
  treeShaking: true, ignoreAnnotations: false,
  // Use the pinned pure source helpers, not native package barrels that read
  // package.json through import.meta.url (the guest runs from a data URL).
  plugins: [{ name: 'workflow-guest-helpers', setup(b) {
    const aliases = { '@deepseek-ai/dsh-tools': 'tools/src/json-schema.ts', '@deepseek-ai/dsh-workflow': 'workflow/src/index.ts', '@deepseek-ai/dsh-llm': 'llm/src/error.ts' };
    b.onResolve({ filter: /^@deepseek-ai\/dsh-(tools|workflow|llm)$/ }, args => ({ path: `${root}vendor/dsh/${aliases[args.path]}`, sideEffects: false }));
  } }],
});
const guestImports = Object.values(guest.metafile.outputs).flatMap(output => output.imports).filter(item => item.external && !isBuiltin(item.path));
if (guestImports.length) throw new Error(`Workflow guest has external package imports: ${guestImports.map(item => item.path).join(', ')}`);
const guestSource = guest.outputFiles[0].text;
const requireBuild = createRequire(import.meta.url);
for (const name of modules) {
  const entry = name === 'workflow-spawn' ? 'workflow-ptc/src/spawn.ts' : `${name}/src/index.ts`;
  const reference = name === 'workflow-spawn' ? 'subagent-spawn-in-process' : name;
  const result = await build({ entryPoints: [`${root}vendor/dsh/${entry}`], outfile: `${root}lib/host/${name}.factory.mjs`,
    platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
    supported: { 'dynamic-import': false },
    banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' },
    footer: { js: 'return module.exports; }' },
    sourcemap: false, legalComments: 'eof',
    plugins: [{ name: 'local-host', setup(b) {
      b.onResolve({ filter: /^@deepseek-ai\/dsh-(bash|pwsh)-local$/ }, args => ({ path: `${root}vendor/dsh/${args.path.split('dsh-')[1]}/src/index.ts` }));
      b.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/(session|subagent)\// }, args => ({ path: `${root}vendor/dsh/${args.path.split('/').slice(4).join('/')}` }));
      b.onResolve({ filter: /^acorn$/ }, () => ({ path: requireBuild.resolve('acorn') }));
      b.onLoad({ filter: /workflow-ptc[\\/]src[\\/]guest-source\.ts$/ }, () => ({ contents: `export const WORKFLOW_GUEST_SOURCE = ${JSON.stringify(guestSource)};`, loader: 'ts' }));
    } }],
  });
  const dependencies = [...new Set(Object.values(result.metafile.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)))];
  await writeFile(`${root}lib/host/${name}.mjs`, `import { createModule } from './${name}.factory.mjs';\nimport { mountHostComponent } from '../../src/host-component.mjs';\nexport const name = 'omd-host-${name}';\nexport const inject = ['loader'];\nexport const apply = (ctx, config) => mountHostComponent(ctx, ${JSON.stringify(reference)}, createModule, ${JSON.stringify(dependencies)}, config);\n`);
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
  // Dynamic native dependencies must use the same host resolver as static ones.
  supported: { 'dynamic-import': false },
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
