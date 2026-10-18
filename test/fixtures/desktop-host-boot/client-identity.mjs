import assert from 'node:assert/strict';

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
  for (const name of clientComponents(expected.publicComponents).dynamic) {
    const rows = identity.dynamic.filter(row => row.id === name);
    assert.equal(rows.length, 1, 'Required dynamic client module: ' + name);
    const row = rows[0];
    assert.equal(typeof row.rev, 'string'); assert(row.rev.length, 'Dynamic artifact revision: ' + name);
    assert.equal(row.url, `plugins/??${name}/client.js&rev=${row.rev}`, 'Official revisioned module source: ' + name);
    assert.equal(row.cachedId, name, 'Actual materialized module table identity: ' + name);
    assert.equal(row.materialized, true, 'Dynamic client module was really loaded: ' + name);
  }
}
