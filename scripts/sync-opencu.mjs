import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
if (!process.argv[2]) throw Error('Usage: node scripts/sync-opencu.mjs /path/to/opencu');
const source = resolve(process.argv[2]), root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'omd-opencu-pack-'));
const run = (command, args) => execFileSync(command, args, { cwd: source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
try {
  run(process.execPath, ['scripts/build.mjs']);
  const packedResult = JSON.parse(run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]));
  const [packed] = Array.isArray(packedResult) ? packedResult : Object.values(packedResult);
  const archive = join(temporary, packed.filename), destination = join(root, 'vendor/opencu');
  await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', destination]);
  const files = {};
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/');
      else files[path] = createHash('sha256').update(await readFile(join(dir, entry.name))).digest('hex');
    }
  }
  await walk(destination);
  await writeFile(join(root, 'vendor/opencu.json'), JSON.stringify({ repository: 'https://github.com/gulagala001/opencu', commit: run('git', ['rev-parse', 'HEAD']).trim(), workingTree: Boolean(run('git', ['status', '--porcelain']).trim()), version: packed.version,
    archiveSha256: createHash('sha256').update(await readFile(archive)).digest('hex'), files: Object.fromEntries(Object.entries(files).sort()) }, null, 2) + '\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
