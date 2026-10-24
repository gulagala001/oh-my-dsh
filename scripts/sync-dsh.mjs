import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, rm, realpath, lstat } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { devNull } from 'node:os';
import { hostTarget } from './host-targets.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const usage = `Usage: node scripts/sync-dsh.mjs <independent staging checkout> [--commit <full SHA>] [--build-browser]

Source must be an independent checkout under ${join(root, '.cache/dsh-source')}.
The pinned official commit and matching prebuilt conversation + Chat artifacts are required.
Default sync only reads source files and Git metadata; it never installs dependencies or stages Git files.
Symlinks, linked worktrees, shared Git object stores, and external build outputs are refused.
--build-browser explicitly rebuilds both native browser packages in that disposable staging checkout.
Never pass oh-my-dsh, a linked worktree, the current DSH checkout, or any retained user data.
Run only after all implementation domains are ready for the centralized build/acceptance phase.`;
const { values, positionals } = parseArgs({ options: { commit: { type: 'string' }, 'build-browser': { type: 'boolean', default: false }, help: { type: 'boolean', default: false } }, allowPositionals: true });
if (values.help) {
  console.log(usage);
  process.exit(0);
}
if (positionals.length !== 1) throw new Error(usage);
const sourcePath = resolve(positionals[0]), source = await realpath(sourcePath);
if (source !== sourcePath) throw new Error(`Refusing symlinked staging source ${sourcePath}`);
let staging;
try { staging = await realpath(join(root, '.cache/dsh-source')); }
catch (error) { if (error.code !== 'ENOENT') throw error; throw new Error(`Prepare an independent pinned clone under .cache/dsh-source before syncing.\n${usage}`); }
if (staging !== join(root, '.cache/dsh-source')) throw new Error('Refusing symlinked staging directory');
const inside = (parent, path) => {
  const name = relative(parent, path);
  return name !== '' && name !== '..' && !name.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(name);
};
if (!inside(staging, source) || !inside(root, staging)) throw new Error(`Refusing non-staging source ${source}.\n${usage}`);
const gitDir = join(source, '.git');
if (!(await lstat(gitDir)).isDirectory() || await realpath(gitDir) !== gitDir) throw new Error('Use an independent staging clone, not a linked or symlinked worktree');
async function ownedGit(path) {
  const entry = await lstat(path);
  if ((!entry.isFile() && !entry.isDirectory()) || await realpath(path) !== path) throw new Error('Staging Git metadata must not contain symlinks or shared object paths');
  if (entry.isDirectory()) for (const name of await readdir(path)) await ownedGit(join(path, name));
}
await ownedGit(gitDir);
const git = args => execFileSync('git', args, { cwd: source, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
if (await realpath(git(['rev-parse', '--show-toplevel']).trim()) !== source) throw new Error('Staging source must be its own Git repository root');
if (await realpath(git(['rev-parse', '--path-format=absolute', '--git-dir']).trim()) !== gitDir ||
    await realpath(git(['rev-parse', '--path-format=absolute', '--git-common-dir']).trim()) !== gitDir) throw new Error('Staging Git metadata must belong to this independent clone');
for (const name of ['commondir', 'objects/info/alternates', 'objects/info/http-alternates']) {
  try { await lstat(join(gitDir, name)); throw new Error('Use a fully independent clone without shared Git object storage'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const destination = await realpath(join(root, 'vendor/dsh'));
if (destination !== join(root, 'vendor/dsh')) throw new Error('Refusing symlinked snapshot destination');
const previous = JSON.parse(await readFile(join(root, 'vendor/dsh.json'), 'utf8'));
const commit = values.commit ?? previous.commit;
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected a full DSH commit SHA');
if (git(['rev-parse', 'HEAD']).trim() !== commit) throw new Error(`Expected the pinned DSH source checkout ${commit}`);
const version = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version;
const hostLayout = hostTarget(version);
if (hostLayout.commit !== commit) throw new Error(`DSH ${version} requires official source pin ${hostLayout.commit}`);
const { cordisVersion, schemaVersion } = hostLayout;
const officialTag = 'dsh-v' + version;
if (!git(['tag', '--points-at', 'HEAD']).trim().split('\n').includes(officialTag)) throw new Error(`Pinned source is missing official tag ${officialTag}`);
const tag = officialTag;
const modules = { 'session-persistence-jsonl': 'session/session-persistence-jsonl', jobs: 'jobs/jobs', 'jobs-local': 'jobs/jobs-local', 'tool-jobs': 'jobs/tool-jobs', shell: 'shell/shell', 'tool-bash': 'shell/tool-bash', 'tool-pwsh': 'shell/tool-pwsh', 'bash-local': 'shell/bash-local', 'pwsh-local': 'shell/pwsh-local', 'bash-sandbox': 'shell/bash-sandbox', 'pwsh-sandbox': 'shell/pwsh-sandbox', tools: 'core/tools', 'ui-conversation': 'client/ui-conversation' };
Object.assign(modules, { workflow: 'workflow/workflow', 'workflow-ptc': 'workflow/workflow-ptc', 'tool-workflow': 'workflow/tool-workflow' });
async function ownedSource(path) {
  const entry = await lstat(path);
  if ((!entry.isFile() && !entry.isDirectory()) || !inside(source, path) || await realpath(path) !== path) throw new Error(`Refusing non-owned staging source ${path}`);
  if (entry.isDirectory()) for (const name of await readdir(path)) await ownedSource(join(path, name));
}
const sourceFiles = [...[...Object.values(modules), 'client/ui-chat'].flatMap(path => ['src', 'README.md'].map(name => 'packages/' + path + '/' + name)),
  'packages/client/ui-conversation/package.json', 'packages/client/tsdown.client.ts', 'packages/llm/llm/src/error.ts', 'LICENSE'];
for (const path of sourceFiles) await ownedSource(join(source, path));
// Check all existing output paths before a builder can follow a symlink or a
// snapshot refresh can overwrite a file outside OMD's own directory.
async function ownedDestination(path) {
  const entry = await lstat(path);
  if ((!entry.isFile() && !entry.isDirectory()) || await realpath(path) !== path) throw new Error(`Refusing non-owned snapshot destination ${path}`);
  if (entry.isDirectory()) for (const name of await readdir(path)) await ownedDestination(join(path, name));
}
await ownedDestination(destination); await ownedDestination(join(root, 'vendor/dsh.json'));
for (const name of ['ui-conversation', 'ui-chat']) {
  const directory = join(source, 'packages/client', name);
  if (await realpath(directory) !== directory) throw new Error(`Refusing symlinked browser source ${directory}`);
  try { await ownedSource(join(directory, 'lib')); }
  catch (error) { if (error.code !== 'ENOENT' || !values['build-browser']) throw error; }
}
for (const name of ['ui-conversation', 'ui-chat']) {
  const directory = join(source, 'packages/client', name);
  if (values['build-browser']) {
    if (!process.env.OMD_PNPM_ENTRY) throw new Error('--build-browser requires the matching OMD_PNPM_ENTRY');
    execFileSync(process.execPath, [process.env.OMD_PNPM_ENTRY, 'exec', 'tsdown'], { cwd: directory, stdio: 'inherit' });
  }
  await ownedSource(join(directory, 'lib/client.js')); await ownedSource(join(directory, 'lib/index.js'));
  const client = (await readFile(join(directory, 'lib/client.js'), 'utf8')).replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
  if (!client.startsWith('window.__ModuleLoader__.load({') || !client.trimEnd().endsWith('});') || !client.slice(0, 150).includes(`id: "@deepseek-ai/dsh-client-${name}"`)) throw new Error(`Missing matching prebuilt ${name} artifact; build the pinned staging host first`);
  await readFile(join(directory, 'lib/index.js'));
}
// Collect both patches before replacing any snapshot, so patch discovery
// failures cannot leave a partially refreshed distribution.
async function sourcePatch(paths) {
  const parts = [git(['diff', '--binary', 'HEAD', '--', ...paths])];
  for (const path of git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]).split('\0').filter(Boolean)) {
    if (!inside(source, resolve(source, path)) || await realpath(join(source, path)) !== join(source, path)) throw new Error(`Unsafe patch source ${path}`);
    try { parts.push(git(['diff', '--no-index', '--binary', '--', devNull, path])); }
    catch (error) { if (error.status !== 1 || !error.stdout) throw error; parts.push(error.stdout); }
  }
  return parts.join('');
}
const paths = [...Object.values(modules).map(path => 'packages/' + path), 'packages/client/tsdown.client.ts', 'packages/llm/llm/src/error.ts'];
const hostPatch = await sourcePatch(paths);
const chatPatch = await sourcePatch(['packages/client/ui-chat', 'packages/client/tsdown.client.ts']);
console.warn(`Syncing ${version} (${commit}) from disposable staging ${source}; old projects and vendor/opencu remain untouched.`);
async function retire(name) {
  const target = join(destination, name);
  if (!['subagent-in-process-driver', ...Object.keys(modules), 'ui-chat'].includes(name)) throw new Error(`Unknown snapshot output ${name}`);
  try {
    if (await realpath(target) !== target || !inside(destination, target)) throw new Error(`Refusing non-owned snapshot output ${target}`);
  } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  await rm(target, { recursive: true });
}
for (const [name, path] of Object.entries(modules)) {
  const target = join(destination, name);
  await retire(name); await mkdir(target, { recursive: true });
  await cp(join(source, 'packages', path, 'src'), join(target, 'src'), { recursive: true });
  await cp(join(source, 'packages', path, 'README.md'), join(target, 'README.md'));
}
// Only the pure error helper is needed by the self-contained workflow guest.
await mkdir(join(destination, 'llm/src'), { recursive: true });
await cp(join(source, 'packages/llm/llm/src/error.ts'), join(destination, 'llm/src/error.ts'));
const ui = join(destination, 'ui-conversation'); await mkdir(join(ui, 'lib'));
// Build-directory names are source-map comments, not product inputs. Keep
// snapshots reproducible without publishing a developer's absolute paths.
const browserOutput = text => text.replace(/^([ \t]*\/\/#region \\0dsh-css:)[^\r\n]*?\/(packages\/[^\r\n]+)$/gm, '$1$2');
for (const name of ['client.js', 'index.js']) {
  const text = await readFile(join(source, 'packages/client/ui-conversation/lib', name), 'utf8');
  await writeFile(join(ui, 'lib', name), browserOutput(text).replace(/^\/\/# sourceMappingURL=.*\n?/gm, ''));
}
const pkg = JSON.parse(await readFile(join(source, 'packages/client/ui-conversation/package.json'), 'utf8'));
Object.assign(pkg, { name: '@oh-my-dsh/ui-conversation', version: version + '-omd.1', private: true,
  dependencies: { '@deepseek-ai/schemastery': schemaVersion }, peerDependencies: { '@deepseek-ai/cordis': cordisVersion },
  exports: { '.': './lib/index.js', './client': './lib/client.js', './package.json': './package.json' }, files: ['src', 'lib', 'README.md', 'LICENSE'] });
for (const field of ['devDependencies', 'scripts', 'publishConfig', 'types']) delete pkg[field];
await writeFile(join(ui, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
await cp(join(source, 'LICENSE'), join(ui, 'LICENSE')); await cp(join(source, 'LICENSE'), join(destination, 'LICENSE'));
await mkdir(join(destination, 'build'), { recursive: true });
await cp(join(source, 'packages/client/tsdown.client.ts'), join(destination, 'build/tsdown.client.ts'));
await writeFile(join(destination, 'changes.patch'), hostPatch);
const chat = join(destination, 'ui-chat');
await retire('ui-chat'); await mkdir(chat, { recursive: true });
for (const name of ['src', 'README.md', 'lib/client.js', 'lib/index.js']) {
  await cp(join(source, 'packages/client/ui-chat', name), join(chat, name), { recursive: true });
}
for (const name of ['client.js', 'index.js']) {
  const path = join(chat, 'lib', name);
  await writeFile(path, browserOutput(await readFile(path, 'utf8')));
}
await cp(join(source, 'LICENSE'), join(chat, 'LICENSE'));
await mkdir(join(chat, 'build'));
await cp(join(source, 'packages/client/tsdown.client.ts'), join(chat, 'build/tsdown.client.ts'));
await writeFile(join(chat, 'changes.patch'), chatPatch);
const readmePath = join(destination, 'README.md');
await writeFile(readmePath, (await readFile(readmePath, 'utf8')).replace(/^Base: .*?MIT license\./m,
  `Base: \`deepseek-ai/deepseek-harness\`, tag \`${tag}\`, commit \`${commit}\`, MIT license.`));
async function manifest(directory) {
  const files = {};
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
      else {
        if (!entry.isFile()) throw new Error(`Snapshot contains a non-file: ${path}`);
        files[path] = createHash('sha256').update(await readFile(join(dir, entry.name))).digest('hex');
      }
    }
  }
  await walk(directory);
  return { repository: 'https://github.com/deepseek-ai/deepseek-harness', tag, commit, version, files: Object.fromEntries(Object.entries(files).sort()) };
}
await writeFile(join(destination, 'ui-chat.json'), JSON.stringify(await manifest(chat), null, 2) + '\n');
await writeFile(join(root, 'vendor/dsh.json'), JSON.stringify(await manifest(destination), null, 2) + '\n');
execFileSync(process.execPath, [fileURLToPath(new URL('./build-credits.mjs', import.meta.url)), '--write'], { stdio: 'inherit' });
