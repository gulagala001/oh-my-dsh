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
import { normalizeHostClientSource } from '../scripts/prepare-host-sdk.mjs';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));

test('workspace CSS path variation normalizes to the complete pinned bundle and still rejects code changes', async () => {
  const { source } = await hostClientSource(root, '@deepseek-ai/dsh-client-ui-workspace');
  const elsewhere = source.replaceAll('NgEgMa_', 'fixtureBrowser_').replaceAll('tvuezW_', 'fixtureRows_').replaceAll('AAf7EW_', 'fixturePicker_');
  assert.notEqual(elsewhere, source);
  assert.equal(normalizeHostClientSource('ui-workspace', elsewhere), source);
  assert.equal(normalizeHostClientSource('ui-workspace', source), source);
  assert.throws(() => normalizeHostClientSource('ui-workspace', elsewhere + '\n/* changed implementation */'), /differs from the released host/);
});

test('native overview builds with actual pinned inputs in a hoisted layout', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'omd-hoisted-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await mkdir(join(dir, 'node_modules/@deepseek-ai/dsh'), { recursive: true });
  await copyFile(new URL('package.json', root), join(dir, 'package.json'));
  await copyFile(host.resolve('@deepseek-ai/dsh/package.json'), join(dir, 'node_modules/@deepseek-ai/dsh/package.json'));
  for (const file of ['build-overview-native.mjs', 'host-build-contracts.mjs', 'prepare-host-sdk.mjs', 'host-targets.mjs']) await copyFile(new URL('scripts/' + file, root), join(dir, 'scripts', file));
  await symlink(dirname(require.resolve('acorn/package.json')), join(dir, 'node_modules/acorn'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const name of ['dsh-client-ui-agent-team', 'dsh-client-ui-jobs', 'dsh-client-ui-workflow-run']) {
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
  const source = `const renamedId /* style */ = '@fixture/ui/body';
    if (document) { const sheet = document.createElement('style');
      sheet . dataset.plugin = '@fixture/ui'; sheet.dataset.pluginCss = renamedId;
    } // tag.dataset.plugin = "@fixture/ui"`;
  const options = { moduleId: '@fixture/ui', owner: 'omd', namespace: 'omd/body', count: 1 };
  assert.equal(ownClientStyles(source, options), source.replace("'@fixture/ui/body'", '"omd/body/body"').replace("'@fixture/ui'", '"omd"'));
  for (const bad of ['', source + '\n{' + source + '\n}', source.replace('dataset.plugin =', 'dataset.other ='),
    source.replace('sheet.dataset.pluginCss', 'other.dataset.pluginCss'),
    source.replace('sheet.dataset.pluginCss', "if (document.head) sheet.dataset.plugin = 'different'; sheet.dataset.pluginCss"),
    source.replace('= renamedId;', "= renamedId; sheet.dataset['pluginCss'] += '/other';")]) {
    assert.throws(() => ownClientStyles(bad, options), /style owner count changed|ambiguous style (ID|metadata)/);
  }
});

test('host tool edits follow unique operations through formatting and fail on changed semantics', async () => {
  const { default: ts } = await import('typescript');
  const { adaptHostTool } = await import('../scripts/host-tool-adapter.mjs');
  const fixture = name => readFile(new URL('vendor/dsh/' + name + '/src/index.ts', root), 'utf8');
  for (const name of ['tool-bash', 'tool-pwsh']) {
    const oldWait = 'registry.wait(attached.id, timeoutMs, owner)';
    const input = (await fixture(name)).replace(oldWait, 'registry.wait( attached.id, /* grace */ timeoutMs, owner, )');
    const result = adaptHostTool(ts, name, input);
    assert.equal(result, input.replace('/* grace */ timeoutMs', '/* grace */ 1000'));
    assert.throws(() => adaptHostTool(ts, name, input.replace('/* grace */ timeoutMs', 'anotherTimeout')), /expected one match/);
  }
  const jobs = (await fixture('tool-jobs')).replace("name: 'job_list'", '"name" /* public tool */: "job_list"');
  const marked = adaptHostTool(ts, 'tool-jobs', jobs);
  assert.equal(marked.match(/Symbol\.for\("dsh-rewind-plus\.workspace-independent"\)/g).length, 3);
  assert.throws(() => adaptHostTool(ts, 'tool-jobs', jobs.replace("name: 'job_kill'", "name: 'job_output'")), /job_output registration: expected one match, found 2/);
  const local = (await fixture('jobs-local')).replace('throw waitAborted()', '{ throw /* sync */ waitAborted(); }')
    .replace('reject(waitAborted())', 'reject( /* async */ waitAborted() )');
  const fixed = adaptHostTool(ts, 'jobs-local', local);
  assert.match(fixed, /throw \/\* sync \*\/ signal.reason \?\? waitAborted\(\)/);
  assert.match(fixed, /reject\( \/\* async \*\/ signal\?\.reason \?\? waitAborted\(\) \)/);
  assert.throws(() => adaptHostTool(ts, 'jobs-local', local.replace('if (signal?.aborted) { throw /* sync */', 'if (signal?.closed) { throw /* sync */')), /abort check: expected one match/);
});
