import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, access, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

test('starting from another cwd preserves relative home, explicit permissions and a spaced host path', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd start options-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const caller = join(root, 'caller directory'), source = join(root, 'source checkout');
  await mkdir(caller); await mkdir(join(source, 'scripts'), { recursive: true });
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(source, 'scripts/start.mjs'));
  const cli = join(caller, 'external host.cjs');
  await writeFile(cli, `const fs = require('node:fs'), path = require('node:path');
    const home = process.env.DSH_HOME, args = process.argv.slice(2);
    fs.appendFileSync(path.join(home, 'commands.jsonl'), JSON.stringify({ args, cwd: process.cwd(), home, permission: process.env.DSH_PERMISSION_MODE }) + '\\n');
    if (args.includes('--from-default-profile')) {
      const dir = path.join(home, 'profiles/trisoul-x'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
    }
    if (args[0] === 'plugin') {
      const file = path.join(home, 'profiles/trisoul-x/package.json');
      fs.writeFileSync(file, JSON.stringify({ dependencies: { trisoul_x: args.at(-1) } }));
    }`);
  for (const permission of ['read-only', 'workspace-write', undefined]) {
    const env = { ...process.env, OMD_DSH_CLI: 'external host.cjs', DSH_HOME: 'home', PORT: '0' };
    if (permission === undefined) delete env.DSH_PERMISSION_MODE;
    else env.DSH_PERMISSION_MODE = permission;
    execFileSync(process.execPath, [join(source, 'scripts/start.mjs')], { cwd: caller, env, stdio: 'pipe' });
    const last = JSON.parse((await readFile(join(caller, 'home/commands.jsonl'), 'utf8')).trim().split('\n').at(-1));
    assert.equal(last.cwd, source);
    assert.equal(last.home, join(caller, 'home'));
    assert.equal(last.permission, permission ?? 'danger-full-access');
    assert.equal(last.args.at(-1), '0');
  }
});

test('a host terminated by a signal is reported as a failed start', { skip: process.platform === 'win32' }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd-start-signal-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), profile = join(home, 'profiles/trisoul-x');
  await mkdir(join(root, 'scripts')); await mkdir(profile, { recursive: true });
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(root, 'scripts/start.mjs'));
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { trisoul_x: 'file:/release.tgz' } }));
  const cli = join(root, 'host.cjs');
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    await writeFile(cli, `process.kill(process.pid, ${JSON.stringify(signal)});`);
    assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], {
      env: { ...process.env, OMD_DSH_CLI: cli, DSH_HOME: home }, stdio: 'pipe',
    }), error => error.status === 1);
  }
});

test('a failed plugin bootstrap retries in the same profile and preserves user configuration', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd-start-retry-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cli = join(root, 'host.cjs');
  await mkdir(join(root, 'scripts')); await mkdir(home);
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(root, 'scripts/start.mjs'));
  const settings = 'user: settings\n', credentials = 'refs:\n  ORIGINAL_KEY: fixture-only\n';
  await writeFile(join(home, 'settings.yaml'), settings);
  await writeFile(join(home, '.credentials.yaml'), credentials, { mode: 0o600 });
  await writeFile(join(home, 'fail-install'), 'fixture');
  await writeFile(cli, `const fs = require('node:fs'), path = require('node:path');
    const args = process.argv.slice(2), home = process.env.DSH_HOME;
    fs.appendFileSync(path.join(home, 'commands.jsonl'), JSON.stringify(args) + '\\n');
    const dir = path.join(home, 'profiles/trisoul-x'), file = path.join(dir, 'package.json');
    if (args.includes('--from-default-profile')) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ dependencies: { 'other-plugin': '1.0.0' } }));
    }
    if (args[0] === 'plugin') {
      if (fs.existsSync(path.join(home, 'fail-install'))) process.exit(25);
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      manifest.dependencies.trisoul_x = args.at(-1); fs.writeFileSync(file, JSON.stringify(manifest));
    }`);
  const run = () => execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], {
    env: { ...process.env, OMD_DSH_CLI: cli, DSH_HOME: home }, stdio: 'pipe',
  });
  assert.throws(run);
  await rm(join(home, 'fail-install'));
  run();
  const commands = (await readFile(join(home, 'commands.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(commands.filter(args => args.includes('--from-default-profile')).length, 1);
  assert.equal(commands.filter(args => args[0] === 'plugin').length, 2);
  assert.equal(commands.filter(args => !args.includes('--from-default-profile') && args[0] !== 'plugin').length, 1);
  assert.equal(await readFile(join(home, 'settings.yaml'), 'utf8'), settings);
  assert.equal(await readFile(join(home, '.credentials.yaml'), 'utf8'), credentials);
  assert.equal(JSON.parse(await readFile(join(home, 'profiles/trisoul-x/package.json'), 'utf8')).dependencies['other-plugin'], '1.0.0');
});

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
  execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], { env: { ...process.env, OMD_DSH_CLI: '', DSH_HOME: join(root, 'data/dsh') }, stdio: 'pipe' });
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
    for (let i = 0; i < 2; i++) execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], { env: { ...process.env, OMD_DSH_CLI: '', DSH_HOME: home, PORT: '3099' }, stdio: 'pipe' });
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

test('an explicit built host CLI serves every bootstrap, plugin and launch command', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd external host-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(root, 'scripts/start.mjs'));
  const cli = join(root, 'external host.cjs'), home = join(root, 'home');
  await writeFile(cli, `const fs = require('node:fs'), path = require('node:path');
    const args = process.argv.slice(2), home = process.env.DSH_HOME;
    fs.appendFileSync(path.join(home, 'commands.jsonl'), JSON.stringify(args) + '\\n');
    if (args.includes('--from-default-profile')) {
      const dir = path.join(home, 'profiles', 'trisoul-x'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
    }`);
  execFileSync(process.execPath, [join(root, 'scripts/start.mjs')], { env: { ...process.env, OMD_DSH_CLI: cli, DSH_HOME: home, PORT: '3199' }, stdio: 'pipe' });
  const commands = (await readFile(join(home, 'commands.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(commands.length, 3);
  assert.ok(commands[0].includes('--from-default-profile'));
  assert.equal(commands[1][0], 'plugin');
  assert.equal(commands[2].at(-1), '3199');
});
