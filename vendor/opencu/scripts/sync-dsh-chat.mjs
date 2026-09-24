import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw Error('Usage: node scripts/sync-dsh-chat.mjs /path/to/patched-dsh');
const source = resolve(process.argv[2]), destination = join(root, 'vendor/dsh-chat');
const commit = '477b4f420553e8a52c2fbccc464d7561b239c443';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw Error('Expected DSH 0.1.7-rc.2');
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
await writeFile(join(root, 'vendor/dsh-chat.json'), JSON.stringify({ repository: 'https://github.com/deepseek-ai/deepseek-harness', tag: 'dsh-v0.1.7-rc.2', commit, files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
