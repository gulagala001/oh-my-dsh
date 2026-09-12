import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('real recovery process keeps ownership until release succeeds after parent death or EOF', { skip: process.platform !== 'win32' && !process.env.TRISOUL_CU_DOTNET, timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-input-recovery-')), processes = [];
  t.after(async () => {
    await Promise.all(processes.map(child => child.exitCode !== null || child.signalCode !== null ? undefined : new Promise(resolve => { child.once('exit', resolve); child.kill('SIGKILL'); })));
    await rm(root, { recursive: true, force: true });
  });
  for (const name of ['InputRecovery.cs', 'NativeProtocol.cs']) await copyFile(new URL('../native/computer-use/windows/desktop/' + name, import.meta.url), join(root, name));
  await copyFile(new URL('./fixtures/computer-use/windows-input-recovery.cs', import.meta.url), join(root, 'Fixture.cs'));
  await writeFile(join(root, 'Fixture.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  await run(dotnet, ['build', join(root, 'Fixture.csproj'), '-o', join(root, 'out'), '--nologo'], { timeout: 40000 });
  const dll = join(root, 'out', 'Fixture.dll');
  const until = async fn => { for (let i = 0; i < 400; i++) { if (await fn()) return; await delay(10); } throw new Error('Recovery process did not reach its expected state'); };
  const trace = async path => readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const start = async name => {
    const parent = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'ignore'] }); processes.push(parent);
    const mutex = 'omd-recovery-' + randomUUID(), log = join(root, name + '.log'), allowed = join(root, name + '.allowed');
    const child = spawn(dotnet, [dll, 'recover', mutex, String(parent.pid), log, allowed], { stdio: ['pipe', 'pipe', 'pipe'] }); processes.push(child);
    let output = ''; child.stdout.on('data', data => { output += data; });
    await until(() => /(?:^|\n)ready\r?\n/.test(output));
    return { parent, child, mutex, log, allowed, arm: async () => { child.stdin.write('arm\n'); await until(() => /(?:^|\n)armed\r?\n/.test(output)); }, clear: async () => { child.stdin.write('clear\n'); await until(() => /(?:^|\n)cleared\r?\n/.test(output)); } };
  };
  const canClaim = async fixture => JSON.parse((await run(dotnet, [dll, 'claim', fixture.mutex])).stdout).owned;
  const crashed = await start('crashed'); await crashed.arm();
  assert.equal(await canClaim(crashed), false);
  crashed.parent.kill('SIGKILL');
  await until(async () => (await trace(crashed.log)).includes('release\n'));
  assert.equal(crashed.child.exitCode, null, 'failed release must keep the recovery process alive');
  assert.equal(await canClaim(crashed), false, 'a new owner must wait until actual release succeeds');
  await writeFile(crashed.allowed, 'allow'); await until(() => crashed.child.exitCode === 0);
  assert.equal(await canClaim(crashed), true);
  const eof = await start('eof'); await eof.arm(); await writeFile(eof.allowed, 'allow'); eof.child.stdin.end();
  await until(() => eof.child.exitCode === 0); assert.equal(await trace(eof.log), 'release\n'); assert.equal(eof.parent.exitCode, null);
  const cleared = await start('cleared'); await cleared.arm(); await cleared.clear(); cleared.child.stdin.end();
  await until(() => cleared.child.exitCode === 0); assert.equal(await trace(cleared.log), '');
  const unarmed = await start('unarmed'); unarmed.child.stdin.end(); await until(() => unarmed.child.exitCode === 0);
  assert.equal(await trace(unarmed.log), '', 'an unarmed recovery connection must not release unrelated input');
});
