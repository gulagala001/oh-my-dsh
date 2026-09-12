import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('Windows discovers installed apps, launches exact executables and Start menu entries, and preserves apps on Stop', { skip: process.platform !== 'win32' || process.env.TRISOUL_CU_WINDOWS_NATIVE_TEST !== '1', timeout: 360000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "oh-my-dsh-apps 中文 '-"));
  const artifacts = resolve('cu-artifacts', 'windows-apps-' + Date.now()); await mkdir(artifacts, { recursive: true });
  const output = join(root, 'native'), fixtureOutput = join(root, 'fixture');
  const executable = join(fixtureOutput, 'OhMyDsh.DesktopFixture.Standalone.exe');
  const otherExecutable = join(fixtureOutput, 'OhMyDsh.OtherFixture.Standalone.exe');
  const title = 'Oh My DSH App Fixture ' + randomUUID();
  const env = { ...process.env, OMD_TEST_EXE: executable, OMD_TEST_OTHER_EXE: otherExecutable, OMD_TEST_SHORTCUT: title };
  const ps = source => run('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', source], { env, windowsHide: true, timeout: 20000 });
  let host;
  t.after(async () => {
    const closed = await Promise.allSettled([host?.close()]);
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
  await run(dotnet, ['publish', fileURLToPath(new URL('./fixtures/computer-use/windows-desktop/Fixture.csproj', import.meta.url)), '-c', 'Release', '-r', expected.rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:BaseIntermediateOutputPath=' + join(root, 'obj') + '/', '-o', fixtureOutput, '--nologo'], { timeout: 120000 });
  await copyFile(join(fixtureOutput, 'OhMyDsh.DesktopFixture.exe'), executable);
  await copyFile(executable, otherExecutable);
  host = new WindowsNativeHost(root, { binary: join(output, expected.executable) });
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
  await ps(`$link = Join-Path ([Environment]::GetFolderPath('Programs')) ($env:OMD_TEST_SHORTCUT + '.lnk')
if (Test-Path -LiteralPath $link) { throw 'Refusing to replace an existing shortcut' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = [IO.Path]::GetFullPath($env:OMD_TEST_EXE)
$shortcut.Save()`);
  let installed;
  for (let i = 0; i < 80; i++) { installed = (await host.list('app-launch')).find(app => app.displayName === title); if (installed) break; await delay(250); }
  assert.ok(installed, 'the Windows Applications folder discovers the fixture shortcut');
  assert.equal(installed.isRunning, false); assert.match(installed.id, /^win-app:/);
  await writeFile(join(artifacts, 'installed-app.json'), JSON.stringify(installed, null, 2));
  await assert.rejects(host.call('window-share-app-list', 'launch_app', { name: installed.id }), error => error.code === 'READ_ONLY_SESSION');
  const launched = await host.bind('app-launch', installed.id);
  assert.match((await host.invoke('app-launch', launched.id, 'getAXState')).state, /Windows 观察验收 中文🙂/);
  await closeApp(launched);
  await writeFile(join(artifacts, 'report.json'), JSON.stringify({ status: 'passed', executableLaunch: true, installedApplicationLaunch: true, staleReferencesRejected: true, stopPreservesApplication: true }, null, 2));
});
