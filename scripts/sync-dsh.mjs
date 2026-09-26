import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-dsh.mjs /path/to/patched-dsh-checkout');
const source = resolve(process.argv[2]), destination = join(root, 'vendor', 'dsh');
const commit = '477b4f420553e8a52c2fbccc464d7561b239c443';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw new Error('Expected the pinned DSH 0.1.7-rc.2 source checkout');
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
Object.assign(pkg, { name: '@oh-my-dsh/ui-conversation', version: '0.1.7-rc.2-omd.1', private: true,
  dependencies: { '@deepseek-ai/schemastery': '3.18.4' }, peerDependencies: { '@deepseek-ai/cordis': '4.0.4' },
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
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(directory, entry.name), path + '/');
    else files[path] = createHash('sha256').update(await readFile(join(directory, entry.name))).digest('hex');
  }
}
await walk(destination);
await writeFile(join(root, 'vendor/dsh.json'), JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', tag: 'dsh-v0.1.7-rc.2', commit, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
