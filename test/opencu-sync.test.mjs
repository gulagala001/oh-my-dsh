import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir, realpath } from 'node:fs/promises';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { npmInvocation } from '../scripts/sync-opencu.mjs';

const script = new URL('../scripts/sync-opencu.mjs', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, version = '1.2.2', currentVersion = '1.2.1') {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omd-opencu sync & ^ % test-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, 'release'), source = join(base, 'source');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'vendor/opencu'), { recursive: true });
  await mkdir(join(source, 'scripts'), { recursive: true });
  await cp(script, join(root, 'scripts/sync-opencu.mjs'));
  await writeFile(join(root, 'vendor/opencu/package.json'), JSON.stringify({ name: 'opencu', version: currentVersion }));
  await writeFile(join(root, 'vendor/opencu/old.txt'), 'previous snapshot\n');
  await writeFile(join(root, 'vendor/opencu.json'), JSON.stringify({ version: currentVersion, files: { 'old.txt': digest('previous snapshot\n') } }) + '\n');
  await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'opencu', version, files: ['dist', 'README.md'] }));
  await writeFile(join(source, 'README.md'), 'replacement snapshot\n');
  await writeFile(join(source, '.gitignore'), 'dist/\n');
  await writeFile(join(source, 'scripts/build.mjs'), "import { mkdirSync, writeFileSync } from 'node:fs'; mkdirSync('dist', { recursive: true }); writeFileSync('dist/index.mjs', 'export const ready = true;\\n');\n");
  execFileSync('git', ['init', '--quiet'], { cwd: source });
  execFileSync('git', ['add', '.'], { cwd: source });
  execFileSync('git', ['-c', 'user.name=OpenCU fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: source });
  const before = await snapshot(join(root, 'vendor'));
  const run = (args = [], fault) => spawnSync(process.execPath,
    [...(fault ? ['--require', fault] : []), join(root, 'scripts/sync-opencu.mjs'), source, ...args],
    { encoding: 'utf8', env: { ...process.env, npm_config_cache: join(base, 'npm-cache'), npm_config_update_notifier: 'false' } });
  return { base, root, source, before, run };
}

async function snapshot(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await snapshot(join(directory, entry.name), path + '/'));
    else result[path] = (await readFile(join(directory, entry.name))).toString('base64');
  }
  return result;
}

async function faultFile(base, text) {
  const path = join(base, 'fault.cjs');
  await writeFile(path, text);
  return path;
}

test('OpenCU sync rejects accidental downgrades before building and leaves both artifacts intact', async t => {
  const f = await fixture(t, '1.2.0');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /downgrade.*1\.2\.1.*1\.2\.0/i);
  assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
  await assert.rejects(readFile(join(f.source, 'dist/index.mjs')), { code: 'ENOENT' });
});

test('OpenCU sync keeps the snapshot and manifest when extraction fails after partial output', async t => {
  const f = await fixture(t);
  const fault = await faultFile(f.base, `const child = require('node:child_process');
const fs = require('node:fs');
const original = child.execFileSync;
child.execFileSync = function(command, args, options) {
  if (command === 'tar') {
    fs.writeFileSync(require('node:path').join(args[args.indexOf('-C') + 1], 'partial.txt'), 'partial');
    throw Error('Injected extraction failure');
  }
  return original(command, args, options);
};
require('node:module').syncBuiltinESMExports();`);
  const result = f.run([], fault);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Injected extraction failure/);
  assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
});

test('OpenCU sync restores both old artifacts if installing the new manifest fails', async t => {
  const f = await fixture(t);
  const fault = await faultFile(f.base, `const fs = require('node:fs/promises');
const original = fs.rename;
const originalWrite = fs.writeFile;
fs.writeFile = async function(path, ...args) {
  if (path.endsWith('opencu.json')) throw Error('Injected manifest replacement failure');
  return originalWrite(path, ...args);
};
fs.rename = async function(from, to) {
  if (from.endsWith('next-manifest.json')) throw Error('Injected manifest replacement failure');
  return original(from, to);
};
require('node:module').syncBuiltinESMExports();`);
  const result = f.run([], fault);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Injected manifest replacement failure/);
  assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
});

test('OpenCU sync restores old artifacts on backup or snapshot replacement failure', async t => {
  for (const step of ['manifest-backup', 'snapshot-install']) {
    const f = await fixture(t);
    const fault = await faultFile(f.base, `const fs = require('node:fs/promises');
const original = fs.rename;
fs.rename = async function(from, to) {
  if (${JSON.stringify(step)} === 'manifest-backup' ? from.endsWith('opencu.json') : from.endsWith('/next') || from.endsWith('\\\\next')) {
    throw Error('Injected ${step} failure');
  }
  return original(from, to);
};
require('node:module').syncBuiltinESMExports();`);
    const result = f.run([], fault);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Injected ${step} failure`));
    assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
  }
});

test('OpenCU sync preserves recovery files outside the published package if rollback fails', async t => {
  const f = await fixture(t);
  const fault = await faultFile(f.base, `const fs = require('node:fs/promises');
const original = fs.rename;
fs.rename = async function(from, to) {
  if (from.endsWith('next-manifest.json')) throw Error('Injected manifest replacement failure');
  if (from.endsWith('/previous') || from.endsWith('\\\\previous')) throw Error('Injected rollback failure');
  return original(from, to);
};
require('node:module').syncBuiltinESMExports();`);
  const result = f.run([], fault);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OpenCU rollback failed; preserved recovery files in/);
  const recovery = (await readdir(f.root)).filter(name => name.startsWith('.opencu-sync-'));
  assert.equal(recovery.length, 1);
  const staged = await snapshot(join(f.root, recovery[0]));
  for (const [path, content] of Object.entries(f.before)) {
    assert.equal(staged[path === 'opencu.json' ? 'previous-manifest.json' : path.replace('opencu/', 'previous/')], content);
  }
  await writeFile(join(f.root, 'package.json'), JSON.stringify({ name: 'omd-pack-fixture', version: '1.0.0', files: ['vendor'] }));
  const npm = await npmInvocation();
  const [packed] = JSON.parse(execFileSync(npm.command,
    [...npm.args, 'pack', '--json', '--dry-run', '--ignore-scripts', '--cache', join(f.base, 'npm-cache')], { cwd: f.root, encoding: 'utf8' }));
  assert.ok(packed.files.every(file => !file.path.includes('.opencu-sync-')));
});

test('OpenCU sync replaces the whole snapshot and hashes the packed archive and every file', async t => {
  const f = await fixture(t);
  const archiveCopy = join(f.base, 'packed.tgz');
  const fault = await faultFile(f.base, `const child = require('node:child_process');
const original = child.execFileSync;
child.execFileSync = function(command, args, options) {
  if (command === 'tar') require('node:fs').copyFileSync(args[1], ${JSON.stringify(archiveCopy)});
  return original(command, args, options);
};
require('node:module').syncBuiltinESMExports();`);
  const result = f.run([], fault);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(f.root, 'vendor/opencu.json'), 'utf8'));
  assert.equal(manifest.version, '1.2.2');
  assert.equal(manifest.commit, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.source, encoding: 'utf8' }).trim());
  assert.equal(manifest.workingTree, false);
  assert.equal(manifest.archiveSha256, digest(await readFile(archiveCopy)));
  const files = await snapshot(join(f.root, 'vendor/opencu'));
  assert.deepEqual(Object.keys(manifest.files), Object.keys(files).sort());
  for (const [path, content] of Object.entries(files)) assert.equal(manifest.files[path], digest(Buffer.from(content, 'base64')));
  assert.equal(files['old.txt'], undefined);
  assert.deepEqual((await readdir(join(f.root, 'vendor'))).sort(), ['opencu', 'opencu.json']);
});

test('OpenCU sync permits explicit downgrade and same-version snapshot refresh', async t => {
  for (const [version, args] of [['1.2.0', ['--allow-downgrade']], ['1.2.1', []]]) {
    const f = await fixture(t, version);
    if (version === '1.2.1') await writeFile(join(f.source, 'README.md'), 'same-version source refresh\n');
    const result = f.run(args);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(join(f.root, 'vendor/opencu.json'), 'utf8'));
    assert.equal(manifest.version, version);
    assert.equal(manifest.workingTree, version === '1.2.1');
    if (version === '1.2.1') assert.equal(await readFile(join(f.root, 'vendor/opencu/README.md'), 'utf8'), 'same-version source refresh\n');
  }
});

test('OpenCU sync orders prereleases numerically and refuses a stable-to-prerelease downgrade', async t => {
  const upgrade = await fixture(t, '1.3.0-rc.10', '1.3.0-rc.9');
  assert.equal(upgrade.run().status, 0);
  const downgrade = await fixture(t, '1.3.0-rc.10', '1.3.0');
  const result = downgrade.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /downgrade/i);
  assert.deepEqual(await snapshot(join(downgrade.root, 'vendor')), downgrade.before);
});

test('OpenCU sync refuses invalid source or recorded versions even with the downgrade override', async t => {
  for (const [version, currentVersion] of [['01.2.0', '1.2.1'], ['1.2.2-rc.01', '1.2.1'], ['1.2.2', 'invalid'], ['1.2.2', null]]) {
    const f = await fixture(t, version, currentVersion);
    const result = f.run(['--allow-downgrade']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid OpenCU version/);
    assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
    await assert.rejects(readFile(join(f.source, 'dist/index.mjs')), { code: 'ENOENT' });
  }
});

test('OpenCU sync can create the initial snapshot and manifest without prior artifacts', async t => {
  const f = await fixture(t);
  await rm(join(f.root, 'vendor'), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await readFile(join(f.root, 'vendor/opencu.json'), 'utf8')).version, '1.2.2');
  assert.deepEqual((await readdir(join(f.root, 'vendor'))).sort(), ['opencu', 'opencu.json']);
});

test('Windows npm invocation resolves Node installation and PATH launchers without a shell', async t => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omd-npm Windows & ^ % paths-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const node = join(base, 'Node installation & ^ %', 'node.exe');
  const bundled = join(base, 'Node installation & ^ %', 'node_modules/npm/bin/npm-cli.js');
  const launcherDirectory = join(base, 'npm launcher & ^ %');
  const pathCLI = join(launcherDirectory, 'node_modules/npm/bin/npm-cli.js');
  await mkdir(join(base, 'Node installation & ^ %', 'node_modules/npm/bin'), { recursive: true });
  await mkdir(join(launcherDirectory, 'node_modules/npm/bin'), { recursive: true });
  await writeFile(bundled, '');
  await writeFile(join(launcherDirectory, 'npm.cmd'), 'launcher text is never executed or parsed');
  await writeFile(pathCLI, 'console.log(JSON.stringify(process.argv.slice(2)))');
  await writeFile(join(base, 'pnpm.cjs'), 'this is an existing unrelated package-manager entry');
  const runner = join(base, 'resolve invocation.mjs');
  await writeFile(runner, `import { npmInvocation } from ${JSON.stringify(script.href)}; console.log(JSON.stringify(await npmInvocation(JSON.parse(process.argv[2]))));`);
  const resolveInNode = options => JSON.parse(execFileSync(process.execPath, [runner, JSON.stringify(options)], { encoding: 'utf8' }));
  const options = { platform: 'win32', execPath: node, env: { npm_execpath: join(base, 'pnpm.cjs'), Path: [join(base, 'missing'), '"' + launcherDirectory + '"'].join(delimiter) } };
  assert.deepEqual(resolveInNode(options), { command: node, args: [bundled] });
  await rm(bundled);
  assert.deepEqual(resolveInNode(options), { command: node, args: [pathCLI] });
  const invocation = await npmInvocation({ ...options, execPath: process.execPath, env: { npm_execpath: pathCLI } });
  const args = ['pack', '--pack-destination', join(base, 'archive destination & ^ %'), 'literal $(value) `value` & ^ %'];
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(JSON.parse(execFileSync(invocation.command, [...invocation.args, ...args], { cwd: launcherDirectory, encoding: 'utf8' })), args);
  await rm(pathCLI);
  await assert.rejects(npmInvocation(options), /Cannot locate npm-cli.js for Windows/);
});

test('Windows npm CLI discovery failure keeps both artifacts and never builds the source', async t => {
  const f = await fixture(t);
  const fault = await faultFile(f.base, `const fs = require('node:fs/promises');
const original = fs.stat;
fs.stat = async function(path, ...args) {
  if (path.endsWith('npm-cli.js')) throw Object.assign(Error('Missing npm CLI fixture'), { code: 'ENOENT' });
  return original(path, ...args);
};
Object.defineProperty(process, 'platform', { value: 'win32' });
process.env.npm_execpath = 'pnpm.cjs';
process.env.PATH = '';
require('node:module').syncBuiltinESMExports();`);
  const result = f.run([], fault);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot locate npm-cli.js for Windows/);
  assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
  await assert.rejects(readFile(join(f.source, 'dist/index.mjs')), { code: 'ENOENT' });
});

test('Windows sync branch executes the npm JS CLI with literal source and temporary paths', async t => {
  const f = await fixture(t);
  const cli = join(f.base, 'npm CLI & ^ %', 'npm-cli.js'), record = join(f.base, 'invocation.json');
  const temporary = join(f.base, 'temporary archives & ^ %');
  await mkdir(dirname(cli));
  await mkdir(temporary);
  await writeFile(cli, `require('node:fs').writeFileSync(${JSON.stringify(record)}, JSON.stringify({ node: process.execPath, args: process.argv.slice(2), cwd: process.cwd() })); process.exitCode = 23;`);
  const fault = await faultFile(f.base, `Object.defineProperty(process, 'platform', { value: 'win32' });
process.env.npm_execpath = ${JSON.stringify(cli)};
process.env.TMPDIR = process.env.TMP = process.env.TEMP = ${JSON.stringify(temporary)};`);
  const result = f.run([], fault);
  assert.notEqual(result.status, 0);
  const observed = JSON.parse(await readFile(record, 'utf8'));
  assert.equal(observed.node, process.execPath);
  assert.equal(observed.cwd, f.source);
  assert.deepEqual(observed.args.slice(0, 4), ['pack', '--json', '--ignore-scripts', '--pack-destination']);
  assert.equal(observed.args.length, 5);
  assert.equal(dirname(observed.args[4]), temporary);
  assert.deepEqual(await snapshot(join(f.root, 'vendor')), f.before);
});
