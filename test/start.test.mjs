import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, access, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
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

test('moving a source checkout relinks the existing profile without replacing packaged installations', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd start moved-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), profile = join(home, 'profiles/trisoul-x');
  for (const dir of ['scripts', 'node_modules/@deepseek-ai/dsh/lib', 'home/profiles/trisoul-x']) await mkdir(join(root, dir), { recursive: true });
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(root, 'scripts/start.mjs'));
  await writeFile(join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), `
    const fs = require('node:fs'), path = require('node:path');
    const args = process.argv.slice(2), file = path.join(process.env.DSH_HOME, 'profiles/trisoul-x/package.json');
    fs.appendFileSync(path.join(process.env.DSH_HOME, 'calls.jsonl'), JSON.stringify(args) + '\\n');
    if (args[0] === 'plugin') {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      manifest.dependencies.trisoul_x = args.at(-1);
      fs.writeFileSync(file, JSON.stringify(manifest));
    }
  `);
  for (const [spec, relink] of [
    ['link:../retired-checkout', true],
    ['link:' + root, false],
    ['link:' + relative(profile, root), false],
    ['file:/original-release.tgz', false],
    ['github:gulagala001/oh-my-dsh#v0.1.7-rc.2.12', false],
  ]) {
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { trisoul_x: spec, 'other-plugin': '1.0.0' } }));
    await writeFile(join(home, 'calls.jsonl'), '');
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], { env: { ...process.env, DSH_HOME: home, PORT: '3099' }, stdio: 'pipe' });
    const calls = (await readFile(join(home, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    const installs = calls.filter(args => args[0] === 'plugin');
    assert.equal(installs.length, Number(relink), spec + ': bind once, then reuse');
    if (relink) assert.equal(resolve(installs[0].at(-1).slice(5)), root);
    assert.ok(calls.filter(args => args[0] !== 'plugin').every(args => args.at(-1) === '3099'));
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies['other-plugin'], '1.0.0');
    if (!relink) assert.equal(manifest.dependencies.trisoul_x, spec);
  }
});
