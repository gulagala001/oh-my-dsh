import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const { values, positionals } = parseArgs({ options: { commit: { type: 'string' } }, allowPositionals: true });
if (positionals.length !== 1) throw Error('Usage: node scripts/sync-dsh-chat.mjs /path/to/patched-dsh [--commit <full SHA>]');
const source = resolve(positionals[0]), destination = join(root, 'vendor/dsh-chat');
const previous = JSON.parse(await readFile(join(root, 'vendor/dsh-chat.json'), 'utf8'));
const commit = values.commit ?? previous.commit;
if (!/^[0-9a-f]{40}$/.test(commit)) throw Error('Expected a full DSH commit SHA');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw Error(`Expected the pinned DSH source checkout ${commit}`);
const version = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).version;
const officialTag = 'dsh-v' + version;
const tag = execFileSync('git', ['tag', '--points-at', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim().split('\n').includes(officialTag) ? officialTag : null;
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ['src', 'README.md', 'lib/client.js', 'lib/index.js']) {
  await cp(join(source, 'packages/client/ui-chat', name), join(destination, name), { recursive: true });
}
await cp(join(source, 'LICENSE'), join(destination, 'LICENSE'));
await mkdir(join(destination, 'build'));
await cp(join(source, 'packages/client/tsdown.client.ts'), join(destination, 'build/tsdown.client.ts'));
await writeFile(join(destination, 'changes.patch'), execFileSync('git', ['diff', '--binary', 'HEAD', '--', 'packages/client/ui-chat', 'packages/client/tsdown.client.ts'], { cwd: source }));
const files = {};
async function walk(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
    else files[path] = createHash('sha256').update(await readFile(join(dir, entry.name))).digest('hex');
  }
}
await walk(destination);
await writeFile(join(root, 'vendor/dsh-chat.json'), JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', tag, commit, version, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
