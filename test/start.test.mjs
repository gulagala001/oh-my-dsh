import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('restart does not reimport prototype settings after the host consumed settings.yaml', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-start-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'data/dsh/profiles/trisoul-x', 'node_modules/@deepseek-ai/dsh/lib']) await mkdir(join(root, dir), { recursive: true });
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(root, 'scripts/start.mjs'));
  await writeFile(join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), 'process.exit(0);');
  await writeFile(join(root, 'data/settings.json'), JSON.stringify({ main: { model: 'retired-model', baseUrl: 'http://retired' } }));
  await writeFile(join(root, 'data/dsh/profiles/trisoul-x/package.json'), JSON.stringify({ dependencies: { trisoul_x: 'link:.' } }));
  const imported = join(root, 'data/dsh/settings.yaml.imported');
  await writeFile(imported, 'model: current');
  execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], { env: { ...process.env, DSH_HOME: join(root, 'data/dsh') }, stdio: 'pipe' });
  await assert.rejects(access(join(root, 'data/dsh/settings.yaml')), { code: 'ENOENT' });
  await assert.rejects(access(join(root, 'data/dsh/.credentials.yaml')), { code: 'ENOENT' });
  assert.equal(await readFile(imported, 'utf8'), 'model: current');
});
