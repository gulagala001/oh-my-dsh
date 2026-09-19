import test from 'node:test';
import assert from 'node:assert/strict';
import { Components } from '../src/components.mjs';

function fixture() {
  const own = { codegraphEnabled: true, componentAutoSetup: true }, cu = { computerUseEnabled: true }, calls = [];
  const manager = { browser: {}, native: { supported: () => true, available: () => false, permissions: async () => calls.push('permissions') },
    installBrowser: async () => { calls.push('browser'); }, installNative: async () => { calls.push('native'); }, installExtension: async () => { calls.push('extension'); },
    extensionInstaller: { status: async () => ({ supported: true, prepared: false }) }, extensionHub: { list: () => [] },
    setupStatus: async () => ({ browser: { installed: true }, native: { installed: false }, extension: {} }) };
  const graph = { enabled: true, projects: new Map(), prepare: async () => { calls.push('codegraph'); },
    retryCatalog() {}, setEnabled: async value => { graph.enabled = value; },
    ensureProject: async cwd => { calls.push('project:' + cwd); }, status: () => ({ enabled: graph.enabled, installed: true, projects: [] }) };
  const ctx = { settings: { update: async (section, patch) => Object.assign(section === 'opencu' ? cu : own, patch) } };
  const hub = { codegraph: graph, config: () => own, agents: new Map() };
  const computer = { computerUse: manager, config: () => cu, refresh: async () => {} };
  return { service: new Components(ctx, hub, computer), own, cu, manager, graph, calls };
}

test('enabled components prepare together, share concurrent requests and retry failures independently', async () => {
  const f = fixture();
  f.manager.installBrowser = async () => { f.calls.push('browser'); throw Error('network unavailable'); };
  f.service.start(); await Promise.all([f.service.prepare(), f.service.prepare()]);
  for (const id of ['codegraph', 'browser', 'native', 'extension']) assert.equal(f.calls.filter(x => x === id).length, 1);
  assert.equal(f.service.records.get('browser').status, 'error');
  assert.equal(f.service.records.get('native').status, 'ready');
  f.service.start(); await f.service.reconfigure();
  assert.equal(f.calls.length, 4, 'unrelated settings changes do not repeat failed automatic installs');
  f.manager.installBrowser = async () => { f.calls.push('browser'); };
  await f.service.prepare('browser');
  assert.equal(f.service.records.get('browser').status, 'ready');
  assert.equal(f.calls.filter(x => x === 'native').length, 1);
  f.service.close(); await f.service.prepare();
  assert.equal(f.calls.length, 5);
});

test('settings retain explicit opt-outs and use the shared OpenCU configuration', async () => {
  const f = fixture(); f.own.componentAutoSetup = false;
  f.service.start(); assert.deepEqual(f.calls, []);
  await f.service.settings({ computerUseEnabled: false, codegraphEnabled: false });
  await f.service.prepare(); assert.deepEqual(f.calls, []);
  assert.equal((await f.service.status()).computerUse.enabled, false);
  assert.equal(f.graph.enabled, false);
  await assert.rejects(f.service.settings({ codegraphEnabled: 'yes' }), /开关/);
  await assert.rejects(f.service.settings({ command: 'untrusted' }), /未知/);
  await f.service.settings({ computerUseEnabled: true, codegraphEnabled: true });
  assert.deepEqual(f.calls, [], 'manual mode does not silently install dependencies');
  assert.equal(f.graph.enabled, true);
  f.service.project('/current-project'); assert.deepEqual(f.calls, ['project:/current-project']);
  f.service.close();
});

test('automatic setup preserves custom desktop runtimes and starts installed helpers through the common API', async () => {
  const f = fixture(); f.cu.computerUseNativeBinary = '/custom/native';
  await f.service.prepare('native');
  assert.deepEqual(f.calls, []); assert.match(f.service.records.get('native').error, /自定义/);
  delete f.cu.computerUseNativeBinary;
  f.manager.native.available = () => true;
  await f.service.prepare();
  assert.ok(f.calls.includes('permissions')); assert.ok(!f.calls.includes('native'), 'startup does not replace a working helper');
  await f.service.prepare('native'); assert.ok(f.calls.includes('native'), 'explicit repair can update the helper');
  f.service.close();
});
