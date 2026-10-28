import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, symlink, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hostClientSource, replaceExactly, ownClientStyles, clientRegistration } from '../scripts/host-build-contracts.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));

test('native overview builds with actual pinned inputs in a hoisted layout', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'omd-hoisted-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await mkdir(join(dir, 'node_modules/@deepseek-ai/dsh'), { recursive: true });
  await copyFile(new URL('package.json', root), join(dir, 'package.json'));
  await copyFile(host.resolve('@deepseek-ai/dsh/package.json'), join(dir, 'node_modules/@deepseek-ai/dsh/package.json'));
  for (const file of ['build-overview-native.mjs', 'host-build-contracts.mjs']) await copyFile(new URL('scripts/' + file, root), join(dir, 'scripts', file));
  await symlink(dirname(require.resolve('acorn/package.json')), join(dir, 'node_modules/acorn'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of ['dsh-experimental-client-ui-agent-team', 'dsh-client-ui-jobs', 'dsh-client-ui-workflow-run']) {
    const manifest = host.resolve('@deepseek-ai/' + name + '/package.json'), target = join(dir, 'node_modules/@deepseek-ai', name);
    await mkdir(join(target, 'lib'), { recursive: true });
    await copyFile(manifest, join(target, 'package.json'));
    await copyFile(join(dirname(manifest), 'lib/client.js'), join(target, 'lib/client.js'));
  }
  assert.equal(existsSync(join(dir, 'node_modules/.pnpm')), false);
  execFileSync(process.execPath, [join(dir, 'scripts/build-overview-native.mjs')], { stdio: 'pipe' });
  const compiled = await import(pathToFileURL(join(dir, 'lib/host/overview-native.factory.mjs')));
  for (const name of ['createTeamOverview', 'createJobsOverview', 'createWorkflowOverview']) assert.equal(typeof compiled[name], 'function');
  const target = join(dir, 'node_modules/@deepseek-ai/dsh-client-ui-jobs/package.json');
  const pkg = JSON.parse(await readFile(target, 'utf8')); pkg.version = '0.0.0';
  await writeFile(target, JSON.stringify(pkg));
  await assert.rejects(hostClientSource(pathToFileURL(dir + '/'), pkg.name), /wrong component identity or version/);
});

test('registration extraction preserves factory and license without executing it', () => {
  const source = '/* upstream license */\nwindow.__ModuleLoader__.load ( { factory: (require) => ({ value: require("x") }), id: "fixture" } );';
  const registration = clientRegistration(source, 'fixture');
  assert.ok(registration.startsWith('/* upstream license */'));
  const load = new Function('require', registration + '\nreturn registration.factory(require);');
  assert.deepEqual(load(() => 7), { value: 7 });
  for (const bad of [source + '\nrun();', source + source, source.replace('"fixture"', '"other"'),
    source.replace('id: "fixture"', 'id: "fixture", id: "fixture"'), source.replace('(require) => ({ value: require("x") })', 'missingFactory')])
    assert.throws(() => clientRegistration(bad, 'fixture'), /Host build contract/);
});

test('semantic edits reject missing or duplicate anchors and keep replacement text literal', () => {
  assert.equal(replaceExactly('one marker', 'marker', '$&', 'fixture'), 'one $&');
  for (const source of ['no match', 'marker marker']) assert.throws(() => replaceExactly(source, 'marker', 'next', 'fixture'), /expected one replacement/);
});

test('style owner edits reject zero, duplicate and mismatched registrations', () => {
  const source = 'const tagId = "@fixture/ui/body"; tag.dataset.plugin = "@fixture/ui";';
  const options = { moduleId: '@fixture/ui', owner: 'omd', namespace: 'omd/body', count: 1 };
  assert.equal(ownClientStyles(source, options), 'const tagId = "omd/body/body"; tag.dataset.plugin = "omd";');
  for (const bad of ['', source + source, source.replace('tag.dataset.plugin', 'otherOwner')])
    assert.throws(() => ownClientStyles(bad, options), /style tags\/owners/);
});
