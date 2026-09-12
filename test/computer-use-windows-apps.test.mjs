import { msbuildValue } from '../src/computer-use/windows-build.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { windowsProcessSnapshot, stopWindowsProcesses } from './fixtures/computer-use/windows-processes.mjs';
import { cleanupFixture } from './fixtures/process.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('Windows discovers installed apps, launches exact executables and Start menu entries, and preserves apps on Stop', { skip: process.platform !== 'win32' || process.env.TRISOUL_CU_WINDOWS_NATIVE_TEST !== '1', timeout: 360000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "oh-my-dsh-apps 中文 '-"));
  const artifacts = resolve('cu-artifacts', 'windows-apps-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const output = join(root, 'native'), fixtureOutput = join(root, 'fixture');
  const executable = join(fixtureOutput, 'OhMyDsh.DesktopFixture.Standalone.exe');
  const otherExecutable = join(fixtureOutput, 'OhMyDsh.OtherFixture.Standalone.exe');
  const title = 'Oh My DSH App Fixture ' + randomUUID();
  const env = { ...process.env, OMD_TEST_EXE: executable, OMD_TEST_OTHER_EXE: otherExecutable, OMD_TEST_SHORTCUT: title, OMD_SHORTCUT_SOURCE: fileURLToPath(new URL('./fixtures/computer-use/windows-shortcut.cs', import.meta.url)) };
  const ps = source => run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);\n" + source], { env, windowsHide: true, timeout: 20000 });
  let host; const calls = [];
  t.after(async () => {
    const connections = await Promise.all(Array.from(host?.connections.values() ?? [], pending => pending.catch(() => null)));
    const closed = await Promise.allSettled([host?.close()]);
    await writeFile(join(artifacts, 'native-calls.json'), JSON.stringify(calls, null, 2));
    await writeFile(join(artifacts, 'native-connections.json'), JSON.stringify(connections.filter(Boolean).map(connection => ({ pid: connection.client.child.pid, stderr: connection.client.stderr })), null, 2));
    // This is a test-created executable at a unique path. Stop never closes
    // it; the fixture cleanup separately removes only this app and shortcut.
    await ps(`$expected = [IO.Path]::GetFullPath($env:OMD_TEST_EXE)
$other = [IO.Path]::GetFullPath($env:OMD_TEST_OTHER_EXE)
Get-Process | Where-Object { $_.Path -eq $expected -or $_.Path -eq $other } | Stop-Process -Force
$link = Join-Path ([Environment]::GetFolderPath('Programs')) ($env:OMD_TEST_SHORTCUT + '.lnk')
if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link }`);
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    t.diagnostic('Windows application discovery artifacts: ' + artifacts);
    for (const result of closed) if (result.status === 'rejected') throw result.reason;
  });
  await run(process.execPath, ['scripts/build-computer-use-windows-native.mjs'], { timeout: 180000, env: { ...process.env, TRISOUL_CU_WINDOWS_NATIVE_OUTPUT: output } });
  const expected = await windowsNativeBuild();
  const built = await run(dotnet, ['publish', fileURLToPath(new URL('./fixtures/computer-use/windows-desktop/Fixture.csproj', import.meta.url)), '-c', 'Release', '-r', expected.rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:BaseIntermediateOutputPath=' + msbuildValue(join(root, 'obj')) + '/', '-p:PublishDir=' + msbuildValue(fixtureOutput) + '/', '--nologo'], { timeout: 120000 }).catch(async error => {
    await writeFile(join(artifacts, 'fixture-build.txt'), (error.stdout ?? '') + (error.stderr ?? ''));
    t.diagnostic((error.stdout ?? '') + (error.stderr ?? '')); throw error;
  });
  await writeFile(join(artifacts, 'fixture-build.txt'), built.stdout + built.stderr);
  await copyFile(join(fixtureOutput, 'OhMyDsh.DesktopFixture.exe'), executable);
  await copyFile(executable, otherExecutable);
  host = new WindowsNativeHost(root, { binary: join(output, expected.executable) });
  const call = host.call.bind(host);
  host.call = async (...args) => {
    const entry = { session: args[0], method: args[1], started: Date.now() }; calls.push(entry);
    try { return await call(...args); }
    catch (error) { entry.error = { code: error.code, message: error.message }; throw error; }
    finally { entry.elapsed = Date.now() - entry.started; }
  };
  const windowsFor = pid => host.windows('app-launch', pid);
  const closeApp = async binding => {
    const state = (await host.invoke('app-launch', binding.id, 'getAXState', [{ disableDiffing: true }])).state;
    const close = Number(state.match(/\[(\d+)\] Button 关闭测试应用/)?.[1]); assert.ok(Number.isSafeInteger(close));
    const target = host.targets.get(binding.id);
    await host.invoke('app-launch', binding.id, 'click', [close]);
    let exited = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await windowsFor(target.pid)).length === 0) { exited = true; break; } }
      catch (error) { if (error.code !== 'APP_EXITED') throw error; exited = true; break; }
      await delay(20);
    }
    assert.equal(exited, true); await host.release('app-launch');
  };
  const direct = await host.bind('app-launch', executable), target = host.targets.get(direct.id);
  await assert.rejects(host.bind('contender', otherExecutable), error => error.code === 'INPUT_BUSY');
  assert.equal((await host.list('app-launch')).some(app => app.isRunning && app.path?.endsWith('OhMyDsh.OtherFixture.Standalone.exe')), false, 'a conflicting controller cannot launch a foreground application');
  await host.release('contender');
  assert.ok(target.pid > 0); assert.equal((await windowsFor(target.pid)).length, 1);
  const state = await host.invoke('app-launch', direct.id, 'getAXStateAndScreenshot');
  assert.match(state.state, /Windows 观察验收 中文🙂/); assert.ok(state.screenshot);
  await writeFile(join(artifacts, 'launched-window.png'), Buffer.from(state.screenshot, 'base64'));
  assert.equal((await host.bind('app-launch', executable)).id, direct.id, 'rebinding an existing app does not launch a second instance');
  await host.release('app-launch'); assert.equal((await windowsFor(target.pid)).length, 1, 'Stop preserves the launched application');
  const again = await host.bind('app-launch', target.bundleId);
  await assert.rejects(host.bind('app-launch', { id: target.bundleId, windowId: 1 }), error => error.code === 'STALE_WINDOW');
  await closeApp(again);
  await assert.rejects(host.bind('app-launch', target.bundleId), error => error.code === 'STALE_PROCESS');
  await host.release('app-launch');
  const shortcutCreated = await ps(`$ErrorActionPreference='Stop'
$link = Join-Path ([Environment]::GetFolderPath('Programs')) ($env:OMD_TEST_SHORTCUT + '.lnk')
if (Test-Path -LiteralPath $link) { throw 'Refusing to replace an existing shortcut' }
Add-Type -Path $env:OMD_SHORTCUT_SOURCE
$target=[OhMyDshTestShortcut]::Create($link,[IO.Path]::GetFullPath($env:OMD_TEST_EXE))
if(!(Test-Path -LiteralPath $link)){throw 'The fixture shortcut was not created'}
$shellFolder=(New-Object -ComObject Shell.Application).NameSpace((Split-Path -Parent $link))
$item=$shellFolder.ParseName((Split-Path -Leaf $link))
[pscustomobject]@{file=$link;target=$target;name=$item.Name;shellTarget=$item.GetLink.Path;programs=[Environment]::GetFolderPath('Programs')} | ConvertTo-Json -Compress`);
  await writeFile(join(artifacts, 'shortcut-created.json'), shortcutCreated.stdout);
  assert.match(JSON.parse(shortcutCreated.stdout).target, /中文/, 'the native shortcut retains its Unicode target path');
  let installed, catalog;
  for (let i = 0; i < 80; i++) { catalog = await host.list('app-launch'); installed = catalog.find(app => app.displayName === title); if (installed) break; await delay(250); }
  await writeFile(join(artifacts, 'application-catalog.json'), JSON.stringify(catalog, null, 2));
  assert.ok(installed, 'Windows application discovery includes the fixture shortcut');
  assert.equal(installed.isRunning, false); assert.match(installed.id, /^win-app:/);
  await writeFile(join(artifacts, 'installed-app.json'), JSON.stringify(installed, null, 2));
  await assert.rejects(host.call('window-share-app-list', 'launch_app', { name: installed.id }), error => error.code === 'READ_ONLY_SESSION');
  const launched = await host.bind('app-launch', installed.id);
  assert.match((await host.invoke('app-launch', launched.id, 'getAXState')).state, /Windows 观察验收 中文🙂/);
  await closeApp(launched);
  if(process.env.GITHUB_ACTIONS==='true')await t.test('ordinary Notepad editing saves Unicode text and Stop preserves the app',async()=>{
    const note=join(root,'ordinary-note.txt'),text='Oh My DSH 日常编辑 中文🙂';
    await writeFile(note,'Ordinary editing fixture');
    const existing=await windowsProcessSnapshot();let owned;
    try{
      await run('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$start=[Diagnostics.ProcessStartInfo]::new((Join-Path $env:WINDIR 'System32\\notepad.exe')); $start.UseShellExecute=$false; $start.ArgumentList.Add($env:OMD_NOTE_FILE); [void][Diagnostics.Process]::Start($start)"],{windowsHide:true,timeout:10000,env:{...process.env,OMD_NOTE_FILE:note}});
      let app;
      for(let i=0;i<80;i++){app=(await host.list('ordinary-notepad')).find(item=>item.isRunning&&/notepad/i.test(item.displayName+' '+item.path));if(app)break;await delay(100);}
      assert.ok(app,'the real Windows Notepad must expose a running application');
      const binding=await host.bind('ordinary-notepad',app.id),target=host.targets.get(binding.id);
      owned=(await windowsProcessSnapshot()).find(item=>item.pid===target.pid&&!existing.some(old=>old.pid===item.pid&&old.created===item.created));
      assert.ok(owned,'the fixture must own this newly launched Notepad process');
      const observation=await host.invoke('ordinary-notepad',binding.id,'getAXStateAndScreenshot');
      assert.match(observation.state,/Ordinary editing fixture/);assert.ok(observation.screenshot);
      await host.invoke('ordinary-notepad',binding.id,'pressKey',['ctrl+a']);
      await host.invoke('ordinary-notepad',binding.id,'typeText',[text]);
      await host.invoke('ordinary-notepad',binding.id,'pressKey',['ctrl+s']);
      let saved;
      for(let i=0;i<100;i++){saved=(await readFile(note,'utf8')).replace(/^\uFEFF/,'');if(saved===text)break;await delay(20);}
      assert.equal(saved,text,'real Notepad must save the exact Unicode text to the test file');
      await host.release('ordinary-notepad');
      assert.ok((await host.windows('ordinary-observer',target.pid)).length,'Stop must preserve the actual Notepad window');
      await host.release('ordinary-observer');
      await writeFile(join(artifacts,'ordinary-notepad.json'),JSON.stringify({status:'passed',unicodeSaved:true,stopPreservesApplication:true},null,2));
    }finally{await cleanupFixture([()=>host.release('ordinary-notepad'),()=>owned&&stopWindowsProcesses([owned])]);}
  });
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({ status: 'passed', executableLaunch: true, installedApplicationLaunch: true, staleReferencesRejected: true, stopPreservesApplication: true }, null, 2));
});
