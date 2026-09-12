import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WindowsNativeRuntime } from '../src/computer-use/windows-native-runtime.mjs';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { appDocumentation, APP_DOCUMENTATION } from '../src/computer-use/api-docs.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-native-install-')); t.after(() => rm(root, { recursive: true, force: true }));
  const state = { build: 'a'.repeat(64), probes: [], failPublished: false, changedDuringBuild: false, replace: 0, unlock: 0 };
  const expected = () => ({ build: state.build, arch: 'x64', rid: 'win-x64', executable: 'OhMyDsh.Desktop.exe', version: '0.1.1', protocol: 1 });
  const runtime = new WindowsNativeRuntime(root, {
    buildInfo: async () => expected(),
    compile: async path => { await writeFile(join(path, expected().executable), state.build); if (state.changedDuringBuild) state.build = 'c'.repeat(64); },
    inspect: async binary => ({ name: 'oh-my-dsh-windows-desktop', protocol: 1, build: await readFile(binary, 'utf8') }),
    probe: async binary => { state.probes.push(binary); if (state.failPublished && !binary.includes('.build-')) throw new Error('simulated launch failure'); return { serverInfo: { name: 'trisoul-computer-use' }, _meta: { trisoul: { protocol: 1, build: await readFile(binary, 'utf8') } } }; },
    lock: async () => async () => { state.unlock++; },
  });
  return { root, runtime, state, install: () => runtime.install({ beforeReplace: async () => { state.replace++; } }) };
}
test('Windows native installation publishes verified generations, repairs corruption and preserves the old executable', async t => {
  const f = await fixture(t); assert.equal(f.runtime.binary(), null);
  await f.install(); const original = f.runtime.binary(); assert.equal((await f.runtime.installedInfo()).build, 'a'.repeat(64));
  await f.install(); assert.equal(f.state.replace, 1, 'an unchanged installation is not rebuilt or interrupted');
  f.state.build = 'b'.repeat(64); await f.install(); const updated = f.runtime.binary();
  assert.notEqual(updated, original); assert.equal(await readFile(original, 'utf8'), 'a'.repeat(64));
  assert.equal((await f.runtime.installedInfo()).build, f.state.build);
  await writeFile(updated, 'tampered'); await assert.rejects(f.runtime.installedInfo(), /文件已变化/);
  await f.install(); assert.notEqual(f.runtime.binary(), updated); assert.equal(await readFile(updated, 'utf8'), 'tampered');
  assert.equal((await f.runtime.installedInfo()).build, f.state.build); assert.equal(f.state.unlock, 3);
  assert.equal((await readdir(f.runtime.directory)).some(name => name.startsWith('.build-') || name.startsWith('.current-')), false);
});
test('Windows native failed launch rolls back its pointer and source changes do not publish a candidate', async t => {
  const f = await fixture(t); await f.install(); const original = f.runtime.binary();
  f.state.build = 'b'.repeat(64); f.state.failPublished = true;
  await assert.rejects(f.install(), /simulated launch failure/);
  assert.equal(f.runtime.binary(), original); assert.equal((await f.runtime.installedInfo()).build, 'a'.repeat(64));
  f.state.failPublished = false; f.state.changedDuringBuild = true;
  await assert.rejects(f.install(), /源码发生变化/); assert.equal(f.runtime.binary(), original);
});
test('Windows native installer refuses a foreign directory and checks changed receipts after caching a binary', async t => {
  const f = await fixture(t); await f.install(); await f.runtime.installedInfo();
  const recordPath = join(f.runtime.directory, f.runtime.pointer().directory, 'build.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8')); record.build = 'f'.repeat(64); await writeFile(recordPath, JSON.stringify(record));
  await assert.rejects(f.runtime.installedInfo(), /身份或版本/);
  await writeFile(join(f.runtime.directory, 'owner.json'), JSON.stringify({ owner: 'another-app' }));
  await assert.rejects(f.install(), /不属于/); assert.equal(JSON.parse(await readFile(join(f.runtime.directory, 'owner.json'), 'utf8')).owner, 'another-app');
});
test('Windows native adapter creates immutable read-only preview/share sessions and keeps control key semantics', async t => {
  const f = await fixture(t); await f.install(); const expected = await windowsNativeBuild();
  const clients = [];
  const host = new WindowsNativeHost(f.root, { platform: 'win32', osRelease: '10.0.22631', runtime: f.runtime, client: (_binary, _args, options = {}) => {
    const calls = []; const client = { calls, notify: options.onNotification, closed: false, initialize: async () => ({ serverInfo: { name: 'trisoul-computer-use', version: '0.1.1' }, _meta: { trisoul: { protocol: 1, build: expected.build, pid: process.pid } } }), call: async (name, args) => { calls.push({ name, args }); return { structuredContent: name === 'check_permissions' ? { platform: 'win32', interactive: true, capture_supported: true } : { status: 'ok' } }; }, close: async () => { client.closed = true; } }; clients.push(client); return client;
  } });
  t.after(() => host.close());
  assert.equal(host.available(), true);
  for (const id of ['native-preview-one', 'window-share-one', 'window-share-list-one', 'ui-permissions']) await host.connection(id);
  assert.ok(clients.every(client => client.calls[0].args.read_only === true));
  const control = await host.connection('conversation'); assert.equal(control.client.calls[0].args.read_only, false);
  host.targets.set('target', { id: 'target', sessionId: 'conversation', pid: 123, windowId: 456, processIdentity: '123:creation', elements: new Map() });
  await host.invoke('conversation', 'target', 'pressKey', ['Win+e']);
  const action = control.client.calls.find(call => call.name === 'press_key'); assert.equal(action.args.process_identity, '123:creation'); assert.deepEqual(action.args.modifiers, ['win']);
  const identity = { pid: 123, window_id: 456, process_identity: '123:creation' };
  await host.call('native-preview-one', 'start_preview', { ...identity, owner_session_id: 'conversation' });
  await host.call('native-preview-foreign', 'start_preview', { ...identity, owner_session_id: 'another-conversation' });
  control.client.notify({ method: 'notifications/trisoul/cursor', params: { ...identity, x: 20, y: 30, at: Date.now(), geometry: { x: 100, y: 100, width: 640, height: 480 } } });
  assert.equal((await host.call('native-preview-one', 'preview_frame')).structuredContent.cursor.x, 20);
  assert.equal((await host.call('native-preview-foreign', 'preview_frame')).structuredContent.cursor, null, 'another conversation does not inherit this cursor');
  assert.deepEqual(await host.permissions('ui-permissions'), { platform: 'win32', interactive: true, capture_supported: true });
  await host.release('conversation'); assert.equal(control.client.closed, true); assert.ok(clients.slice(0, 4).every(client => !client.closed));
  assert.equal((await host.call('native-preview-one', 'preview_frame')).structuredContent.cursor, null);
  assert.equal(host.targets.has('target'), false);
});
test('Windows native update restarts old transports even if another process already updated disk', async t => {
  const f = await fixture(t); await f.install(); let replaced = 0;
  const host = new WindowsNativeHost(f.root, { platform: 'win32', osRelease: '10.0.22631', runtime: f.runtime });
  const client = { closed: false, call: async () => ({}), close: async () => { client.closed = true; } };
  host.connections.set('old', Promise.resolve({ client, label: 'old-label', info: { _meta: { trisoul: { build: 'old-build' } } } }));
  await host.install({ beforeReplace: async () => { replaced++; } });
  assert.equal(replaced, 1); assert.equal(client.closed, true); assert.equal(host.connections.size, 0);
  await host.close(); await assert.rejects(host.connection('late'), /已关闭/);
  assert.equal(appDocumentation('darwin'), APP_DOCUMENTATION); assert.match(appDocumentation('win32'), /super\/meta\/win mean the Windows key/);
});
