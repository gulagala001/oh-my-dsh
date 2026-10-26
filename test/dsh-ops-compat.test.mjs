import test from 'node:test';
import assert from 'node:assert/strict';
import { installPtcPresentation } from '../src/ptc.mjs';
import { recommendedPlugins, resolveRecommendedPlugin } from '../src/recommended-plugin-catalog.mjs';
import { RecommendedPluginManager, pluginInstallSpec } from '../src/recommended-plugins.mjs';
import { patchPtc } from '../scripts/build-ops-compat.mjs';

test('scope-only presentation probes and real requests expose identical controls without mutating context', async () => {
  const owner = {}, agent = { ctx: {}, session: {} }, callbacks = new Map(), guards = [];
  const definitions = new Map(['run_code', 'job_output', 'ops_inspect_local_file'].map(name => [name, { name }]));
  const tools = { presentAs() {}, guard(fn) { guards.push(fn); }, get: name => definitions.get(name),
    schemas: () => [...definitions.values()], modeFor: () => 'ptc', collapses: () => false };
  // This test isolates prompt projection. Real execution and scheduler gates
  // are exercised by the native host integration check.
  const ctx = { tools, effect() {}, on(name, fn) { callbacks.set(name, fn); } };
  const scopes = { scopeOf: () => owner, scopeChainOf: value => value === agent ? [owner] : [] };
  installPtcPresentation(ctx, () => ['job_output'], 'ptc', tools, scopes);
  const assembly = () => ({ tools: [{ name: 'run_code' }], sections: [{ name: 'tools:ptc-only', text: 'PTC' }] });
  const probe = { scope: agent }, request = { scope: agent, agent };
  const project = context => callbacks.get('system-prompt/assemble')(null, context, async () => assembly());
  assert.deepEqual(await project(probe), await project(request));
  assert.equal(Object.hasOwn(probe, 'agent'), false);
  assert.deepEqual((await project(probe)).tools.map(t => t.name), ['run_code', 'job_output']);
  assert.equal(guards[0]({ agent, name: 'job_output' }), undefined);
  assert.match(guards[0]({ agent, name: 'ops_inspect_local_file' }), /unknown tool/);
  assert.equal(guards[0]({ agent, name: 'ops_inspect_local_file', parent: {} }), undefined);
  assert.deepEqual(await project({ scope: {} }), assembly());
});

test('OPS compatibility recognizes pure PTC and reviewed controls, but rejects direct business tools', async () => {
  const upstream = "const isPtc = (assembly) => assembly.tools.length === 1 && assembly.tools[0]?.name === 'run_code'\n    && assembly.sections.some(section => section.name === 'tools:ptc-only' && section.text.trim() !== '');";
  const { isPtc } = await import('data:text/javascript,' + encodeURIComponent(patchPtc(upstream) + '\nexport { isPtc };'));
  const assembly = (names, section = 'PTC') => ({ tools: names.map(name => ({ name })), sections: [{ name: 'tools:ptc-only', text: section }] });
  assert.equal(isPtc(assembly(['run_code'])), true);
  assert.equal(isPtc(assembly(['run_code', 'job_output', 'job_kill', 'job_list', 'runtime_status'])), true);
  for (const names of [[], ['job_output'], ['run_code', 'ops_bash'], ['run_code', 'ops_inspect_local_file'], ['run_code', 'third_party_tool']])
    assert.equal(isPtc(assembly(names)), false);
  assert.equal(isPtc(assembly(['run_code'], '')), false);
});

test('OPS installation is pinned per full host, and incompatible installed versions cannot be enabled', async t => {
  const entry = recommendedPlugins.find(p => p.id === 'dsh-ops');
  for (const host of ['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3']) {
    const plugin = resolveRecommendedPlugin(entry, host);
    assert.equal(plugin.unavailable, null);
    assert.equal(plugin.review.dsh, host);
    assert.equal(plugin.review.upstreamVersion, '0.4.1');
    assert.ok(pluginInstallSpec(plugin, plugin.review.version).includes('/releases/download/' + plugin.review.releaseTag + '/'));
    assert.throws(() => pluginInstallSpec(plugin, '9.0.0'));
  }
  for (const host of [null, '0.2.1', '0.2.1-rc.4', '0.2.2']) assert.ok(resolveRecommendedPlugin(entry, host).unavailable);
  const rc3 = entry.hostBuilds['0.2.1-rc.3'];
  for (const releaseVersion of ['0.2.1-rc.2.omd.1.0.1', '0.2.1-rc.3.omd.latest', '0.2.1-rc.3.ops.1.0.1']) {
    const altered = { ...entry, hostBuilds: { '0.2.1-rc.3': { ...rc3, releaseVersion, releaseTag: 'v' + releaseVersion } } };
    assert.ok(resolveRecommendedPlugin(altered, '0.2.1-rc.3').unavailable);
  }
  const changes = [];
  const service = new RecommendedPluginManager({ catalog: [entry], hostVersion: '0.2.1-rc.2',
    manager: { async listBundles() { return [{ name: 'dsh-ops', version: '0.4.2', installed: true, enabled: false }]; },
      async setBundleEnabled(_name, value) { changes.push(value); return { application: 'applied' }; } },
    getConfig: () => ({}), saveConfig() {} });
  t.after(() => service.close());
  await service.start('dsh-ops', 'enable');
  assert.match((await service.status()).plugins[0].error, /兼容目录|原生运行时/);
  assert.deepEqual(changes, []);
  await service.start('dsh-ops', 'disable');
  assert.deepEqual(changes, [false]);
});
