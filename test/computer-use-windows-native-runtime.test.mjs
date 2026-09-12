import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
    probe: async binary => { state.probes.push(binary); if (state.failPublished && runtime.binary() === binary) throw new Error('simulated launch failure'); return { serverInfo: { name: 'trisoul-computer-use' }, _meta: { trisoul: { protocol: 1, build: await readFile(binary, 'utf8') } } }; },
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

test('Windows app resolution binds only a validated window and retains conversation ownership', async t => {
  const f = await fixture(t); await f.install(); const expected = await windowsNativeBuild(), calls = [];
  let result = { pid: 123, window_id: 456, process_identity: '123:created', app_id: 'win-app:fixture', app_name: 'Fixture' };
  const host = new WindowsNativeHost(f.root, { platform: 'win32', osRelease: '10.0.22631', runtime: f.runtime, client: () => {
    const client = { closed: false, initialize: async () => ({ serverInfo: { name: 'trisoul-computer-use' }, _meta: { trisoul: { protocol: 1, build: expected.build } } }), call: async (name, args) => { calls.push({ name, args }); return { structuredContent: name === 'launch_app' ? result : { status: 'ok' } }; }, close: async () => { client.closed = true; } }; return client;
  } });
  t.after(() => host.close());
  const app = await host.bind('one', { id: 'Fixture', windowId: 456 });
  assert.equal(calls.find(call => call.name === 'launch_app').args.window_id, 456);
  assert.equal(host.targets.get(app.id).processIdentity, '123:created');
  assert.equal((await host.bind('one', 'win-app:fixture')).id, app.id);
  await assert.rejects(host.bind('two', 'Fixture'), /another conversation/);
  result = { ...result, window_id: 0 };
  await assert.rejects(host.bind('one', 'invalid'), /无效的应用窗口身份/);
  assert.equal(host.targets.size, 1);
  await assert.rejects(host.bind('one', { id: 'Fixture', windowId: -1 }), /windowId/);
});

test('Windows native removal stops clients before deleting only its owned files and permits reinstall', async t => {
  const f = await fixture(t); await f.install(); const original = f.runtime.binary();
  f.state.build = 'b'.repeat(64); await f.install(); const current = f.runtime.binary();
  const note = join(dirname(current), 'user-note.txt'); await writeFile(note, 'keep this file');
  let stopped = 0;
  const result = await f.runtime.uninstall({ beforeRemove: async () => { assert.equal(await readFile(current, 'utf8'), f.state.build); stopped++; } });
  assert.equal(stopped, 1); assert.equal(result.removed, true); assert.equal(f.runtime.binary(), null);
  await assert.rejects(readFile(current), { code: 'ENOENT' }); await assert.rejects(readFile(original), { code: 'ENOENT' });
  assert.equal(await readFile(note, 'utf8'), 'keep this file'); assert.ok(result.retained.includes(dirname(current)));
  assert.equal((await f.runtime.uninstall()).removed, true);
  await f.install(); assert.equal((await f.runtime.installedInfo()).build, f.state.build);
  assert.equal(await readFile(note, 'utf8'), 'keep this file');
});

test('Windows native removal leaves installation usable when input cleanup is unconfirmed', async t => {
  const f = await fixture(t); await f.install(); const current = f.runtime.binary();
  await assert.rejects(f.runtime.uninstall({ beforeRemove: async () => { throw new Error('cleanup is unconfirmed'); } }), /cleanup is unconfirmed/);
  assert.equal(f.runtime.binary(), current); assert.equal((await f.runtime.installedInfo()).build, f.state.build);
  await f.runtime.uninstall(); assert.equal(f.runtime.binary(), null);
});

test('Windows native host removal closes control and read-only transports before removing the executable', async t => {
  const f = await fixture(t); await f.install(); const binary = f.runtime.binary();
  const host = new WindowsNativeHost(f.root, { platform: 'win32', osRelease: '10.0.22631', runtime: f.runtime });
  const ended = [], closed = [];
  for (const id of ['controller', 'native-preview-video', 'ui-permissions']) {
    const client = { closed: false, call: async name => { assert.equal(name, 'end_session'); assert.equal(await readFile(binary, 'utf8'), f.state.build); ended.push(id); return {}; }, close: async () => { client.closed = true; closed.push(id); } };
    host.connections.set(id, Promise.resolve({ label: id, client, info: {} }));
  }
  let prepared = false;
  await host.uninstall({ beforeRemove: async () => { prepared = true; assert.deepEqual(ended, []); } });
  assert.equal(prepared, true); assert.equal(ended.length, 3); assert.equal(closed.length, 3);
  assert.equal(host.connections.size, 0); assert.equal(host.available(), false);
  await assert.rejects(host.connection('late'), /安装/);
  await host.install(); assert.equal(host.available(), true); await host.close();
});

test('a compiler started before Windows removal cannot resurrect the runtime after removal', async t => {
  const f = await fixture(t); await f.install(); f.state.build = 'b'.repeat(64);
  const originalCompile = f.runtime.compile;
  let proceed, entered;
  const gate = new Promise(resolve => { proceed = resolve; }), started = new Promise(resolve => { entered = resolve; });
  f.runtime.compile = async output => { entered(); await gate; await originalCompile(output); };
  const updating = f.install(); const rejected = assert.rejects(updating, /构建期间移除/);
  await started;
  const other = new WindowsNativeRuntime(f.root, { ...f.runtime, compile: originalCompile });
  await other.uninstall(); assert.equal(other.binary(), null);
  proceed(); await rejected;
  assert.equal(other.binary(), null);
  assert.equal((await readdir(other.directory)).some(name => /^[a-f0-9]{64}-/.test(name)), false);
  await other.install(); assert.equal((await other.installedInfo()).build, f.state.build);
});

test('Windows removal rebuilds a trusted helper for a damaged executable and preserves foreign generations', async t => {
  const f = await fixture(t); await f.install(); const current = f.runtime.binary();
  await writeFile(current, 'damaged');
  const foreign = join(f.runtime.directory, 'f'.repeat(64) + '-00000000-0000-0000-0000-000000000000');
  const outside = join(f.root, 'other-application'); await mkdir(outside); await writeFile(join(outside, 'data.txt'), 'not ours');
  await symlink(outside, foreign, process.platform === 'win32' ? 'junction' : 'dir');
  const result = await f.runtime.uninstall(); assert.equal(result.removed, true); assert.equal(f.runtime.binary(), null);
  assert.equal(await readFile(join(outside, 'data.txt'), 'utf8'), 'not ours'); assert.equal((await lstat(foreign)).isSymbolicLink(), true);
});
