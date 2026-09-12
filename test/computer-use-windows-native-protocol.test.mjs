import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { McpClient } from '../src/computer-use/mcp-client.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
const enabled = process.platform === 'win32' || !!process.env.TRISOUL_CU_DOTNET;

test('compiled Windows native protocol revokes queued work and acknowledges actual cleanup', { skip: !enabled, timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-native-protocol-'));
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); await rm(root, { recursive: true, force: true }); });
  await copyFile(new URL('../native/computer-use/windows/desktop/NativeProtocol.cs', import.meta.url), join(root, 'NativeProtocol.cs'));
  await copyFile(new URL('./fixtures/computer-use/windows-native-protocol.cs', import.meta.url), join(root, 'Fixture.cs'));
  await writeFile(join(root, 'Fixture.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  await run(dotnet, ['build', join(root, 'Fixture.csproj'), '-o', join(root, 'out'), '--nologo'], { timeout: 40000 });
  const create = async (name, args = [], readOnly = false) => {
    const trace = join(root, name + '.txt'), client = new McpClient(dotnet, [join(root, 'out', 'Fixture.dll'), trace, ...args]); clients.push(client);
    await client.initialize(); await client.call('start_session', { session: name, read_only: readOnly });
    return { client, trace, name };
  };
  const waitFor = async (path, value) => {
    for (let i = 0; i < 300; i++) { if ((await readFile(path, 'utf8').catch(() => '')).includes(value)) return; await delay(10); }
    throw new Error('Protocol fixture did not report ' + value);
  };
  const first = await create('first'), second = await create('second');
  await assert.rejects(first.client.call('echo', { session: 'second' }), /another connection/);
  assert.equal((await second.client.call('echo', { session: 'second', value: '独立🙂' })).structuredContent.value, '独立🙂');
  const holding = assert.rejects(first.client.call('hold', { session: 'first' }), error => error.code === 'CANCELLED');
  await waitFor(first.trace, 'started:hold');
  const queued = assert.rejects(first.client.call('queued', { session: 'first' }), error => error.code === 'CANCELLED');
  const stopAt = Date.now();
  assert.equal((await first.client.call('end_session', { session: 'first' })).structuredContent.status, 'ended');
  assert.ok(Date.now() - stopAt >= 100, 'end ACK must wait for asynchronous operation cleanup');
  await Promise.all([holding, queued]);
  const trace = await readFile(first.trace, 'utf8');
  assert.match(trace, /finished:hold\ncleanup:0/); assert.doesNotMatch(trace, /started:queued/);
  await assert.rejects(first.client.call('echo', { session: 'first' }), /stopping/);
  await assert.rejects(first.client.call('start_session', { session: 'new-label' }), /stopping/);
  assert.equal((await second.client.call('echo', { session: 'second', value: 'still live' })).structuredContent.value, 'still live');

  const cancel = new AbortController();
  const cancelled = assert.rejects(second.client.call('hold', { session: 'second' }, { signal: cancel.signal }), /one request cancelled/);
  await waitFor(second.trace, 'started:hold'); cancel.abort(new Error('one request cancelled')); await cancelled;
  assert.equal((await second.client.call('echo', { session: 'second', value: 'after cancellation' })).structuredContent.value, 'after cancellation');

  const eof = await create('eof');
  const disconnected = assert.rejects(eof.client.call('hold', { session: 'eof' }), /cancel|exited/i);
  await waitFor(eof.trace, 'started:hold');
  await eof.client.close(); await disconnected;
  assert.equal(eof.client.child.exitCode, 0);
  assert.match(await readFile(eof.trace, 'utf8'), /finished:hold\ncleanup:0/);
  const retry = await create('retry', ['fail-cleanup-once']);
  await assert.rejects(retry.client.call('end_session', { session: 'retry' }), error => error.code === 'CLEANUP_PENDING');
  await assert.rejects(retry.client.call('echo', { session: 'retry' }), /stopping/);
  assert.equal((await retry.client.call('end_session', { session: 'retry' })).structuredContent.status, 'ended');
  assert.equal(await readFile(retry.trace, 'utf8'), 'cleanup:0\n');
  const observer = await create('read-only', [], true);
  assert.ok((await observer.client.call('list_windows', { session: 'read-only' })).structuredContent);
  for (const operation of ['click', 'type_text', 'set_value', 'press_key', 'paste', 'drag']) await assert.rejects(observer.client.call(operation, { session: 'read-only' }), error => error.code === 'READ_ONLY_SESSION');
  await assert.rejects(observer.client.call('start_session', { session: 'read-only', read_only: false }), /already has a session/);
  assert.doesNotMatch(await readFile(observer.trace, 'utf8'), /started:(click|type_text|set_value|press_key|paste|drag)/);
});
