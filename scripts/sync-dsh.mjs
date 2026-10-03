import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({ options: { commit: { type: 'string' } }, allowPositionals: true });
if (positionals.length !== 1) throw new Error('Usage: node scripts/sync-dsh.mjs /path/to/patched-dsh-checkout [--commit <full SHA>]');
const source = resolve(positionals[0]), destination = join(root, 'vendor', 'dsh');
const previous = JSON.parse(await readFile(join(root, 'vendor/dsh.json'), 'utf8'));
const commit = values.commit ?? previous.commit;
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Expected a full DSH commit SHA');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw new Error(`Expected the pinned DSH source checkout ${commit}`);
const version = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version;
const cordisVersion = JSON.parse(await readFile(join(source, 'vendor/cordis/package.json'), 'utf8')).version;
const schemaVersion = JSON.parse(await readFile(join(source, 'vendor/schemastery/package.json'), 'utf8')).version;
const officialTag = 'dsh-v' + version;
const tag = execFileSync('git', ['tag', '--points-at', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim().split('\n').includes(officialTag) ? officialTag : null;
const modules = { 'session-persistence-jsonl': 'session/session-persistence-jsonl', jobs: 'jobs/jobs', 'jobs-local': 'jobs/jobs-local', 'tool-jobs': 'jobs/tool-jobs', shell: 'shell/shell', 'tool-bash': 'shell/tool-bash', 'tool-pwsh': 'shell/tool-pwsh', 'bash-local': 'shell/bash-local', 'pwsh-local': 'shell/pwsh-local', 'bash-sandbox': 'shell/bash-sandbox', 'pwsh-sandbox': 'shell/pwsh-sandbox', tools: 'core/tools', 'ui-conversation': 'client/ui-conversation' };
Object.assign(modules, { workflow: 'workflow/workflow', 'workflow-ptc': 'workflow/workflow-ptc', 'tool-workflow': 'workflow/tool-workflow', 'subagent-in-process-driver': 'subagent/subagent-in-process-driver' });
execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'tsdown'], { cwd: join(source, 'packages/client/ui-conversation'), stdio: 'inherit', shell: process.platform === 'win32' });
for (const [name, path] of Object.entries(modules)) {
  const target = join(destination, name);
  await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
  await cp(join(source, 'packages', path, 'src'), join(target, 'src'), { recursive: true });
  await cp(join(source, 'packages', path, 'README.md'), join(target, 'README.md'));
}
// Only the pure error helper is needed by the self-contained workflow guest.
await mkdir(join(destination, 'llm/src'), { recursive: true });
await cp(join(source, 'packages/llm/llm/src/error.ts'), join(destination, 'llm/src/error.ts'));
const ui = join(destination, 'ui-conversation'); await mkdir(join(ui, 'lib'));
for (const name of ['client.js', 'index.js']) {
  const text = await readFile(join(source, 'packages/client/ui-conversation/lib', name), 'utf8');
  await writeFile(join(ui, 'lib', name), text.replace(/^\/\/# sourceMappingURL=.*\n?/gm, ''));
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
const paths = [...Object.values(modules).map(path => 'packages/' + path), 'packages/client/tsdown.client.ts', 'packages/llm/llm/src/error.ts'];
// Include the newly authored file in git diff without staging any source changes.
execFileSync('git', ['add', '-N', 'packages/client/ui-conversation/src/client/skeleton/background-wait.ts', 'packages/client/ui-conversation/src/client/conversation-reload.ts',
  'packages/workflow/workflow-ptc/src/journal.ts', 'packages/workflow/workflow-ptc/src/source.ts', 'packages/workflow/workflow-ptc/src/worktree.ts', 'packages/workflow/workflow-ptc/src/spawn.ts'], { cwd: source });
const patch = execFileSync('git', ['diff', '--binary', 'HEAD', '--', ...paths], { cwd: source, maxBuffer: 16 * 1024 * 1024 });
await writeFile(join(destination, 'changes.patch'), patch);
const files = {};
const readmePath = join(destination, 'README.md');
const baseLabel = tag ? `tag \`${tag}\`` : `untagged master, declared version \`${version}\``;
await writeFile(readmePath, (await readFile(readmePath, 'utf8')).replace(/^Base: .*?MIT license\./m,
  `Base: \`deepseek-ai/deepseek-harness\`, ${baseLabel}, commit \`${commit}\`, MIT license.`));
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(directory, entry.name), path + '/');
    else files[path] = createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex');
  }
}
await walk(destination);
await writeFile(join(root, 'vendor/dsh.json'), JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', tag, commit, version, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
