import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, realpath, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire, isBuiltin } from 'node:module';
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute } from 'node:path';
import { createHostConstEnums } from './host-const-enums.mjs';
import { hostTarget } from './host-targets.mjs';
import { checkMacHelperDistribution } from './check-opencu-native.mjs';
import { buildChatStyleFactory } from './chat-style-adapter.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform === 'darwin') await checkMacHelperDistribution(join(root, 'vendor/opencu'));
const requireBuild = createRequire(import.meta.url);
const snapshot = JSON.parse(await readFile(`${root}vendor/dsh.json`, 'utf8'));
const chatSnapshot = JSON.parse(await readFile(`${root}vendor/dsh/ui-chat.json`, 'utf8'));
const hostLayout = hostTarget(snapshot.version);
if (snapshot.repository !== 'https://github.com/deepseek-ai/deepseek-harness' || snapshot.commit !== hostLayout.commit || snapshot.tag !== 'dsh-v' + snapshot.version) throw new Error('DSH snapshot does not use the reviewed official source pin');
const parent = JSON.parse(await readFile(`${root}package.json`, 'utf8'));
const sdk = parent.devDependencies['@deepseek-ai/dsh'];
if (sdk !== snapshot.version) throw new Error(`DSH SDK ${sdk} does not match snapshot ${snapshot.version}`);
for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
  for (const [name, version] of Object.entries(parent[section] ?? {})) {
    if (/^@deepseek-ai\/dsh(?:-|$)/.test(name) && version !== sdk) throw new Error(`DSH SDK ${section}.${name} ${version} does not match snapshot ${snapshot.version}`);
  }
}
const framework = { '@deepseek-ai/cordis': hostLayout.cordisVersion, '@deepseek-ai/schemastery': hostLayout.schemaVersion };
for (const [name, version] of Object.entries(framework)) {
  for (const section of ['devDependencies', 'peerDependencies']) {
    if (parent[section]?.[name] !== version) throw new Error(`DSH ${sdk} requires ${section}.${name} ${version}`);
  }
}
for (const field of ['repository', 'commit', 'tag', 'version']) {
  if (chatSnapshot[field] !== snapshot[field]) throw new Error(`Public Chat snapshot has mismatched ${field}`);
}
const conversationPackage = JSON.parse(await readFile(`${root}vendor/dsh/ui-conversation/package.json`, 'utf8'));
if (conversationPackage.name !== '@oh-my-dsh/ui-conversation' || conversationPackage.version !== sdk + '-omd.1' || conversationPackage.private !== true ||
    conversationPackage.peerDependencies?.['@deepseek-ai/cordis'] !== framework['@deepseek-ai/cordis'] ||
    conversationPackage.dependencies?.['@deepseek-ai/schemastery'] !== framework['@deepseek-ai/schemastery']) throw new Error('Conversation package metadata does not match the pinned SDK and frameworks');
const projectRoot = await realpath(root);
for (const [directory, manifest] of [['vendor/dsh', snapshot], ['vendor/dsh/ui-chat', chatSnapshot]]) {
  const base = await realpath(join(root, directory));
  if (base !== join(projectRoot, directory)) throw new Error(`Refusing symlinked snapshot directory: ${directory}`);
  const found = new Set();
  async function inspect(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name, target = join(dir, entry.name);
      if (entry.isDirectory()) await inspect(target, path + '/');
      else {
        if (!entry.isFile() || await realpath(target) !== target) throw new Error(`Snapshot contains a non-owned file: ${directory}/${path}`);
        const expected = manifest.files?.[path];
        if (expected === undefined) throw new Error(`Snapshot contains an unlisted file: ${directory}/${path}`);
        const hash = createHash('sha256').update(await readFile(target)).digest('hex');
        if (hash !== expected) throw new Error(`DSH snapshot checksum mismatch: ${directory}/${path}`);
        found.add(path);
      }
    }
  }
  await inspect(base);
  for (const path of Object.keys(manifest.files ?? {})) {
    const local = relative(base, join(base, path));
    if (!local || local === '..' || local.startsWith('..\\') || local.startsWith('../') || isAbsolute(local) || !found.has(path)) throw new Error(`Missing or invalid snapshot path: ${directory}/${path}`);
  }
}
// A stable virtual filename keeps dependency labels independent of checkout
// location, including builds that reuse node_modules from another directory.
const acornDependency = { name: 'workflow-acorn', setup(b) {
  b.onResolve({ filter: /^acorn$/ }, () => ({ path: 'acorn', namespace: 'omd-dependency' }));
  b.onLoad({ filter: /^acorn$/, namespace: 'omd-dependency' }, async () => ({ contents: await readFile(requireBuild.resolve('acorn'), 'utf8'), loader: 'js' }));
} };
const modules = ['jobs-local', 'tool-jobs', 'tool-bash', 'tool-pwsh', 'bash-sandbox', 'pwsh-sandbox', 'workflow-ptc', 'tool-workflow', 'workflow-spawn'];
const hostEntry = name => `${root}vendor/dsh/${name === 'workflow-spawn' ? 'workflow-ptc/src/spawn.ts' : `${name}/src/index.ts`}`;
const hostAliases = { '@deepseek-ai/dsh-tools': 'tools/src/json-schema.ts', '@deepseek-ai/dsh-workflow': 'workflow/src/index.ts', '@deepseek-ai/dsh-llm': 'llm/src/error.ts' };
const localHostImport = specifier => {
  if (/^@deepseek-ai\/dsh-(bash|pwsh)-local$/.test(specifier)) return `${root}vendor/dsh/${specifier.split('dsh-')[1]}/src/index.ts`;
  if (/^\.\.\/\.\.\/\.\.\/(session|subagent)\//.test(specifier)) return `${root}vendor/dsh/${specifier.split('/').slice(4).join('/')}`;
  if (specifier === '@deepseek-ai/dsh-session-persistence-jsonl/src/lease.ts') return `${root}vendor/dsh/session-persistence-jsonl/src/lease.ts`;
  if (hostLayout.subagentDriver && specifier === '@deepseek-ai/dsh-subagent-in-process-driver/src/index.ts') return `${root}vendor/dsh/subagent-in-process-driver/src/index.ts`;
};
const enumOptions = { root, snapshot };
const guestEnums = await createHostConstEnums({ ...enumOptions, entryPoints: [`${root}vendor/dsh/workflow-ptc/src/guest.ts`],
  resolveImport: specifier => hostAliases[specifier] && `${root}vendor/dsh/${hostAliases[specifier]}` });
const hostEnums = await createHostConstEnums({ ...enumOptions, ts: guestEnums.ts,
  entryPoints: [...modules.map(hostEntry), `${root}src/session-migration-support.ts`], resolveImport: localHostImport });
async function ownedOutput(path, directory = false) {
  try {
    const entry = await lstat(path);
    if (!(directory ? entry.isDirectory() : entry.isFile()) || await realpath(path) !== path) throw new Error(`Refusing non-owned host output: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const outputRoot = join(projectRoot, 'lib/host');
await ownedOutput(join(projectRoot, 'lib'), true);
await ownedOutput(outputRoot, true);
for (const name of [...modules, 'ui-conversation', 'ui-chat', 'session-migration']) {
  for (const extension of ['.mjs', '.factory.mjs']) await ownedOutput(join(outputRoot, name + extension));
}
for (const name of ['bash-local.mjs', 'pwsh-local.mjs', 'tools.mjs', 'tools.factory.mjs']) await ownedOutput(join(outputRoot, name));
await mkdir(outputRoot, { recursive: true });
// The workflow VM is transported as one self-contained ESM source string. Its
// only external imports may be Node builtins, never plugin/host package paths.
const guest = await build({ entryPoints: [`${root}vendor/dsh/workflow-ptc/src/guest.ts`], bundle: true,
  platform: 'node', target: 'node22', format: 'esm', write: false, metafile: true,
  treeShaking: true, ignoreAnnotations: false,
  // Use the pinned pure source helpers, not native package barrels that read
  // package.json through import.meta.url (the guest runs from a data URL).
  plugins: [{ name: 'workflow-guest-helpers', setup(b) {
    b.onResolve({ filter: /^@deepseek-ai\/dsh-(tools|workflow|llm)$/ }, args => ({ path: `${root}vendor/dsh/${hostAliases[args.path]}`, sideEffects: false }));
  } }, acornDependency, guestEnums.plugin],
});
guestEnums.assertExternal(guest);
await guestEnums.assertOutput(guest);
const guestImports = Object.values(guest.metafile.outputs).flatMap(output => output.imports).filter(item => item.external && !isBuiltin(item.path));
if (guestImports.length) throw new Error(`Workflow guest has external package imports: ${guestImports.map(item => item.path).join(', ')}`);
// Normalize esbuild's dependency-location comments in the transported source.
const guestSource = guest.outputFiles[0].text.replace(/^\/\/ (?:.*\/)?node_modules\//gm, '// node_modules/');
for (const name of modules) {
  const reference = name === 'workflow-spawn' ? 'subagent-spawn-in-process' : name;
  const result = await build({ entryPoints: [hostEntry(name)], outfile: `${root}lib/host/${name}.factory.mjs`,
    platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
    supported: { 'dynamic-import': false },
    banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' },
    footer: { js: 'return module.exports; }' },
    sourcemap: false, legalComments: 'eof',
    plugins: [{ name: 'local-host', setup(b) {
      b.onResolve({ filter: /^(?:@deepseek-ai\/dsh-|\.\.\/\.\.\/\.\.\/)/ }, args => {
        const path = localHostImport(args.path);
        if (path) return { path };
      });
      b.onLoad({ filter: /workflow-ptc[\\/]src[\\/]guest-source\.ts$/ }, () => ({ contents: `export const WORKFLOW_GUEST_SOURCE = ${JSON.stringify(guestSource)};`, loader: 'ts' }));
    } }, acornDependency, hostEnums.plugin],
  });
  hostEnums.assertExternal(result);
  await hostEnums.assertOutput(result);
  const dependencies = [...new Set(Object.values(result.metafile.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)))];
  await writeFile(`${root}lib/host/${name}.mjs`, `import { createModule } from './${name}.factory.mjs';\nimport { mountHostComponent } from '../../src/host-component.mjs';\nexport const name = 'omd-host-${name}';\nexport const inject = ['loader'];\nexport const apply = (ctx, config) => mountHostComponent(ctx, ${JSON.stringify(reference)}, createModule, ${JSON.stringify(dependencies)}, config);\n`);
}
// Retire only known outputs from the earlier direct-entry build, never user data.
for (const name of ['bash-local.mjs', 'pwsh-local.mjs', 'tools.mjs', 'tools.factory.mjs']) {
  const target = join(outputRoot, name);
  try {
    if (await realpath(target) !== target) throw new Error(`Refusing to remove non-owned output: ${target}`);
  } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  await rm(target);
}

// Embed the upstream-built browser factories in OMD's own client module. A
// file: subpackage cannot be resolved from a GitHub-installed dependency.
for (const [name, create, styleOwner] of [['ui-conversation', 'createConversation', 'trisoul_x'], ['ui-chat', 'createChat', 'trisoul_x/chat']]) {
  const rawClient = await readFile(`${root}vendor/dsh/${name}/lib/client.js`, 'utf8');
  if (name === 'ui-chat') {
    const { code } = buildChatStyleFactory(rawClient, { commit: snapshot.commit, sha256: chatSnapshot.files['lib/client.js'] });
    await writeFile(`${root}lib/host/${name}.factory.mjs`, code);
    continue;
  }
  const client = rawClient.replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
  if (!client.startsWith('window.__ModuleLoader__.load({') || !client.trimEnd().endsWith('});')) throw new Error(`Unexpected DSH ${name} browser factory format`);
  if (!client.slice(0, 150).includes(`id: "@deepseek-ai/dsh-client-${name}"`)) throw new Error(`Unexpected DSH ${name} module identity`);
  const stylePrefix = name === 'ui-chat' ? styleOwner : 'trisoul_x/conversation';
  const ownedClient = client.replace(new RegExp(`(const tagId(?:\\$\\d+)? = )"@deepseek-ai/dsh-client-${name}/`, 'g'), `$1"${stylePrefix}/`)
    .replaceAll(`tag.dataset.plugin = "@deepseek-ai/dsh-client-${name}"`, `tag.dataset.plugin = "${styleOwner}"`);
  const registration = ownedClient.trimEnd().replace('window.__ModuleLoader__.load(', 'const registration = ').replace(/\);$/, ';');
  const origin = name === 'ui-chat' ? ` Object.defineProperty(component, Symbol.for('omd.ui-chat.source.v1'), { value: ${JSON.stringify({ commit: snapshot.commit, sha256: chatSnapshot.files['lib/client.js'] })} });` : '';
  await writeFile(`${root}lib/host/${name}.factory.mjs`, registration + `\nexport function ${create}(require) { const component = registration.factory(require);${origin} return component; }\n`);
}

const support = await build({ entryPoints: [`${root}src/session-migration-support.ts`], outfile: `${root}lib/host/session-migration.factory.mjs`,
  // Dynamic native dependencies must use the same host resolver as static ones.
  supported: { 'dynamic-import': false },
  platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
  banner: { js: 'export function createModule(require) { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: 'return module.exports; }' }, sourcemap: false, legalComments: 'eof', plugins: [hostEnums.plugin] });
hostEnums.assertExternal(support);
await hostEnums.assertOutput(support);
const supportDependencies = [...new Set(Object.values(support.metafile.outputs).flatMap(o => o.imports.filter(i => i.external).map(i => i.path)))];
await writeFile(`${root}lib/host/session-migration.mjs`, `import { createModule } from './session-migration.factory.mjs';\nimport { loadHostModule } from '../../src/host-component.mjs';\nexport const loadMigrationSupport = ctx => loadHostModule(ctx, 'session-persistence-jsonl', createModule, ${JSON.stringify(supportDependencies)});\n`);

await writeFile(`${root}lib/host/ui-conversation.mjs`, `import { Config, apply as nativeApply } from '../../vendor/dsh/ui-conversation/lib/index.js';
import { legacySettings } from '../../src/legacy-settings.mjs';
export { Config };
export const inject = ['settings'];
export async function apply(ctx) {
  nativeApply(ctx);
  const legacy = await legacySettings(ctx, 'omd-ui-conversation', Config, ['ui-conversation']);
  legacy.persist();
}
`);
