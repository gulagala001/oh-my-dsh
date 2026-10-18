import assert from 'node:assert/strict';

// Host rows are replaced by the bundle patch; both client factories are
// bundled into the single trisoul_x renderer row (scripts/build.mjs).
export const uiReplacements = [
  { officialId: 'ui-conversation', officialClient: '@deepseek-ai/dsh-client-ui-conversation', replacementId: 'omd-ui-conversation', replacementHost: 'trisoul_x/host/ui-conversation' },
  { officialId: 'ui-chat', officialClient: '@deepseek-ai/dsh-client-ui-chat', replacementId: 'omd-ui-chat', replacementHost: 'trisoul_x/host/ui-chat' },
];

export function assertHostUiIdentity(host, expected) {
  assert(['stock', 'installed'].includes(expected.stage), 'Explicit UI identity stage');
  for (const row of uiReplacements) {
    const original = host.entries.filter(entry => entry.id === row.officialId);
    assert.equal(original.length, 1, 'Original Host UI row remains configured: ' + row.officialId);
    assert.equal(original[0].name, row.officialClient);
    assert.equal(original[0].disabled, expected.stage === 'installed', 'Actual bundle-patch disabled state: ' + row.officialId);
    assert.equal(original[0].active, expected.stage === 'stock', 'Original Host UI activation: ' + row.officialId);
  }
  if (expected.stage === 'stock') return;
  for (const [id, name] of [['trisoul-x', 'trisoul_x'], ...uiReplacements.map(row => [row.replacementId, row.replacementHost])]) {
    const rows = host.entries.filter(entry => entry.id === id);
    assert.equal(rows.length, 1, 'Required OMD Host replacement: ' + id);
    const row = rows[0];
    assert.equal(row.name, name); assert.equal(row.active, true); assert.equal(row.disabled, false);
    assert.equal(row.source?.name, 'trisoul_x', 'Replacement package identity: ' + id);
    assert.equal(row.source?.dir, expected.bundleRoot, 'Replacement resolves from the installed tgz: ' + id);
    assert.equal(row.source?.version, expected.omdVersion, 'Actual loaded replacement package version: ' + id);
    assert.equal(row.moduleCallbackMatches, true, 'Actual Host imported callback is active: ' + id);
  }
}

// Fixed rc.2 shell table: packages/client/web/src/{platform,seed}.ts at
// deepseek-harness@687f282e8625c6b8d11ff58211a90524be2e4317. These exports are
// compiled into the official shell, not necessarily standalone Host packages.
export const shellSeeds = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit'];
export function clientComponents(names) {
  return { static: names.filter(name => shellSeeds.includes(name)), dynamic: names.filter(name => !shellSeeds.includes(name)) };
}

export function assertClientIdentity(identity, expected) {
  assert(['stock', 'installed'].includes(expected.stage), 'Explicit UI identity stage');
  assert.equal(expected.appVersion, expected.hostVersion, 'Verified official shell release');
  assert.equal(identity.shellProtocol, 1, 'Real Electron shell preload');
  assert.equal(identity.moduleSystem, 'client');
  assert.equal(identity.release?.version, expected.hostVersion, 'Actual boot module release');
  assert.deepEqual(identity.release, identity.bootRelease, 'Actual module table uses the shell boot release');
  assert.equal(identity.rev, identity.bootRev, 'Actual module table uses the shell boot graph');
  assert.equal(typeof identity.rev, 'string'); assert(identity.rev.length);
  for (const [name, valid] of Object.entries(identity.services)) assert.equal(valid, true, 'Real service instance: ' + name);
  for (const name of ['moduleTableIsLoader', 'rootUsesShellCordis', 'slotsUsesShellCordis', 'slotsUsesDynamicRenderer'])
    assert.equal(identity.services[name], true, 'Required real service instance: ' + name);
  for (const name of clientComponents(expected.publicComponents).static) {
    const seed = identity.seeds[name];
    assert(seed, 'Required shell seed: ' + name);
    assert.equal(seed.sameAsFactory, true, 'Module-table seed is the shell factory export: ' + name);
    assert.equal(seed.validExports, true, 'Real seed API: ' + name);
    assert.equal(seed.dynamicRow, false, 'Seed is shell-static, not a fetched package row: ' + name);
  }
  const originals = uiReplacements.map(row => row.officialClient);
  const required = new Set(clientComponents(expected.publicComponents).dynamic);
  if (expected.stage === 'stock') for (const name of originals) required.add(name);
  else {
    for (const name of originals) {
      assert.equal(identity.dynamic.filter(row => row.id === name).length, 0, 'Bundle-disabled official client row is absent: ' + name);
      required.delete(name); // Exact, positively verified replacement mapping only.
    }
    required.add('trisoul_x');
  }
  const provider = expected.stage === 'stock' ? '@deepseek-ai/dsh-client-ui-conversation' : 'trisoul_x';
  assert.equal(identity.conversationOwners[provider], true, 'Actual uiConversation service descends from the loaded provider callback: ' + provider);
  for (const name of required) {
    const rows = identity.dynamic.filter(row => row.id === name);
    assert.equal(rows.length, 1, 'Required dynamic client module: ' + name);
    const row = rows[0];
    assert.equal(typeof row.rev, 'string'); assert(row.rev.length, 'Dynamic artifact revision: ' + name);
    assert.equal(row.url, `plugins/??${name}/client.js&rev=${row.rev}`, 'Official revisioned module source: ' + name);
    assert.equal(row.cachedId, name, 'Actual materialized module table identity: ' + name);
    assert.equal(row.materialized, true, 'Dynamic client module was really loaded: ' + name);
  }
}
