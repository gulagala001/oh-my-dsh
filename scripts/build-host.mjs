await import('./build-metering.mjs');
await import('./check-metering.mjs');
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, realpath, readdir, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute } from 'node:path';
import { createHostConstEnums } from './host-const-enums.mjs';
import { hostTarget } from './host-targets.mjs';
import { checkMacHelperDistribution } from './check-opencu-native.mjs';
import { buildChatStyleFactory } from './chat-style-adapter.mjs';
import { ownClientStyles, clientRegistration } from './host-build-contracts.mjs';
import { finishHostFactory } from './host-factory-imports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.platform === 'darwin') await checkMacHelperDistribution(join(root, 'vendor/opencu'));
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
const modules = ['jobs-local', 'tool-jobs', 'tool-bash', 'tool-pwsh', 'bash-sandbox', 'pwsh-sandbox'];
const hostEntry = name => `${root}vendor/dsh/${name}/src/index.ts`;
const localHostImport = specifier => {
  if (/^@deepseek-ai\/dsh-(bash|pwsh)-local$/.test(specifier)) return `${root}vendor/dsh/${specifier.split('dsh-')[1]}/src/index.ts`;
  if (/^\.\.\/\.\.\/\.\.\/(session|subagent)\//.test(specifier)) return `${root}vendor/dsh/${specifier.split('/').slice(4).join('/')}`;
  if (specifier === '@deepseek-ai/dsh-session-persistence-jsonl/src/lease.ts') return `${root}vendor/dsh/session-persistence-jsonl/src/lease.ts`;
};
const hostEnums = await createHostConstEnums({ root, snapshot,
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
for (const name of modules) {
  const reference = name;
  const result = await build({ entryPoints: [hostEntry(name)], outfile: `${root}lib/host/${name}.factory.mjs`,
    platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
    banner: { js: 'export function createModule(require, importHostModule) { const module = { exports: {} }; const exports = module.exports;' },
    footer: { js: 'return module.exports; }' },
    sourcemap: false, legalComments: 'eof',
    plugins: [{ name: 'local-host', setup(b) {
      b.onResolve({ filter: /^(?:@deepseek-ai\/dsh-|\.\.\/\.\.\/\.\.\/)/ }, args => {
        const path = localHostImport(args.path);
        if (path) return { path };
      });
    } }, hostEnums.plugin],
  });
  hostEnums.assertExternal(result);
  await hostEnums.assertOutput(result);
  const dependencies = await finishHostFactory(result, `${root}lib/host/${name}.factory.mjs`);
  await writeFile(`${root}lib/host/${name}.mjs`, `import { createModule } from './${name}.factory.mjs';\nimport { mountHostComponent } from '../../src/host-component.mjs';\nexport const name = 'omd-host-${name}';\nexport const inject = ['loader'];\nexport const apply = (ctx, config) => mountHostComponent(ctx, ${JSON.stringify(reference)}, createModule, ${JSON.stringify(dependencies)}, config);\n`);
}
// Workflow is maintained in the independent dsh-workflow-plus module.
for (const [name, entry] of [['workflow-ptc', 'engine'], ['tool-workflow', 'tool'], ['workflow-spawn', 'spawn']]) {
  await writeFile(`${root}lib/host/${name}.mjs`, `export * from '../../vendor/workflow/src/${entry}.mjs';\n`);
  await writeFile(`${root}lib/host/${name}.factory.mjs`, `export { createModule } from '../../vendor/workflow/lib/host/${name}.factory.mjs';\n`);
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
for (const [name, create, styleOwner] of [['ui-conversation', 'createConversation', 'oh-my-dsh'], ['ui-chat', 'createChat', 'oh-my-dsh/chat']]) {
  const rawClient = await readFile(`${root}vendor/dsh/${name}/lib/client.js`, 'utf8');
  if (name === 'ui-chat') {
    const { code } = buildChatStyleFactory(rawClient, { commit: snapshot.commit, sha256: chatSnapshot.files['lib/client.js'] });
    await writeFile(`${root}lib/host/${name}.factory.mjs`, code);
    continue;
  }
  const moduleId = '@deepseek-ai/dsh-client-' + name;
  const owned = ownClientStyles(rawClient, { moduleId, owner: styleOwner, namespace: 'oh-my-dsh/conversation', count: 10 });
  const registration = clientRegistration(owned, moduleId);
  await writeFile(`${root}lib/host/${name}.factory.mjs`, registration + `\nexport function ${create}(require) { return registration.factory(require); }\n`);
}

const support = await build({ entryPoints: [`${root}src/session-migration-support.ts`], outfile: `${root}lib/host/session-migration.factory.mjs`,
  platform: 'node', target: 'node22', format: 'cjs', bundle: true, packages: 'external', metafile: true,
  banner: { js: 'export function createModule(require, importHostModule) { const module = { exports: {} }; const exports = module.exports;' },
  footer: { js: 'return module.exports; }' }, sourcemap: false, legalComments: 'eof', plugins: [hostEnums.plugin] });
hostEnums.assertExternal(support);
await hostEnums.assertOutput(support);
const supportDependencies = await finishHostFactory(support, `${root}lib/host/session-migration.factory.mjs`);
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
