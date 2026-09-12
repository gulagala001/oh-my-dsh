import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { McpClient } from '../src/computer-use/mcp-client.mjs';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { msbuildValue } from '../src/computer-use/windows-build.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('Windows paste delivers real clipboard formats and preserves newer copies', {
  // The fixture seeds the system clipboard. Run in the dedicated CI desktop,
  // not as part of the user's ordinary interactive-machine self-test.
  skip: process.platform !== 'win32' || process.env.TRISOUL_CU_WINDOWS_NATIVE_TEST !== '1' || process.env.GITHUB_ACTIONS !== 'true'
    ? 'requires the dedicated Windows CI desktop' : false, timeout: 300000,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-clipboard-'));
  const artifact = resolve('cu-artifacts', 'windows-clipboard-' + Date.now());
  await mkdir(artifact, { recursive: true });
  let native, fixture;
  t.after(async () => {
    // End the native paste transaction before restoring the fixture baseline.
    try { await native?.close(); }
    finally {
      if (fixture && !fixture.closed) await fixture.request('fixture', { action: 'clipboard-restore' });
      await fixture?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  const output = join(root, 'native');
  await run(process.execPath, ['scripts/build-computer-use-windows-native.mjs'], { timeout: 180000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, TRISOUL_CU_WINDOWS_NATIVE_OUTPUT: output } });
  const { rid } = await windowsNativeBuild(), fixtureOutput = join(root, 'fixture');
  await run(dotnet, ['publish', fileURLToPath(new URL('./fixtures/computer-use/windows-desktop/Fixture.csproj', import.meta.url)), '-c', 'Release', '-r', rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:BaseIntermediateOutputPath=' + msbuildValue(join(root, 'fixture-obj')) + '/', '-p:PublishDir=' + msbuildValue(fixtureOutput) + '/', '--nologo'], { timeout: 120000, maxBuffer: 1024 * 1024 });
  fixture = new McpClient(join(fixtureOutput, 'OhMyDsh.DesktopFixture.exe'));
  const command = (action, args = {}) => fixture.request('fixture', { action, ...args });
  const original = await command('state');
  native = new WindowsNativeHost(root, { binary: join(output, 'OhMyDsh.Desktop.exe') });
  const windows = (await native.call('discovery', 'list_windows', { pid: original.pid })).structuredContent.windows;
  const target = windows.find(window => window.window_id === original.first); assert.ok(target);
  await native.release('discovery');
  const cases = [
    { name: 'plain', mode: 'normal', text: '实际粘贴中文🙂', expected: '实际粘贴中文🙂' },
    { name: 'html', mode: 'normal', text: '<p><b>富文本中文🙂</b></p>', format: 'html', expected: '富文本中文🙂' },
    { name: 'rejected', mode: 'reject', text: '应用拒绝粘贴', error: 'PASTE_UNCONFIRMED' },
    { name: 'cancelled', mode: 'reject', text: '取消等待中的粘贴', cancel: true },
    { name: 'newer-copy', mode: 'copy', text: '不应覆盖用户复制', error: 'CLIPBOARD_CHANGED', newer: '用户中途复制的新内容🙂' },
  ];
  for (const sample of cases) await t.test(sample.name, async () => {
    const baseline = await command('clipboard-seed', { mode: sample.mode, text: '原剪贴板 ' + sample.name });
    assert.equal(baseline.pixels, 'ChQe/ygyPP8=', 'the fixture must publish real bitmap pixels before paste');
    await command('text', { text: '原编辑内容' }); await command('focus');
    const binding = await native.bind(sample.name, { id: target.app_id, windowId: original.first });
    let resultError;
    try {
      const observation = await native.invoke(sample.name, binding.id, 'getAXState', [{ disableDiffing: true }]);
      assert.match(observation.state, /原编辑内容/);
      await native.invoke(sample.name, binding.id, 'pressKey', ['ctrl+a']);
      const controller = new AbortController();
      const paste = native.invoke(sample.name, binding.id, 'paste', [sample.text, { format: sample.format ?? 'text' }], controller.signal)
        .catch(error => { resultError = { code: error.code, message: error.message }; });
      if (sample.cancel) {
        for (let i = 0; i < 100 && !resultError; i++) {
          if ((await command('clipboard-state')).pastes > baseline.pastes) break;
          await delay(20);
        }
        controller.abort(new Error('Clipboard fixture cancelled'));
      }
      await paste; await native.release(sample.name);
      const clipboard = await command('clipboard-state'), state = await command('state');
      await writeFile(join(artifact, sample.name + '.json'), JSON.stringify({ baseline, error: resultError, clipboard, text: state.text }, null, 2));
      if (sample.cancel) assert.match(resultError?.message ?? '', /cancel/i);
      else if (sample.error) assert.equal(resultError?.code, sample.error, JSON.stringify(resultError));
      else assert.equal(resultError, undefined, JSON.stringify(resultError));
      assert.equal(clipboard.text, sample.newer ?? baseline.text, 'restore must preserve a newer copy or recover the prior text');
      assert.equal(clipboard.bytes, baseline.bytes, 'restore retains the original custom binary representation');
      assert.equal(clipboard.pixels, baseline.pixels, 'restore retains the original bitmap pixels');
      assert.deepEqual(clipboard.files, baseline.files, 'restore retains the original Unicode file-drop paths');
      assert.equal(clipboard.pastes, baseline.pastes + 1, 'the actual WPF paste handler must receive the operation');
      if (sample.expected) assert.equal(state.text, sample.expected);
      else assert.equal(state.text, '原编辑内容');
      if (sample.format === 'html') { assert.match(clipboard.observedHtml, /StartHTML:\d+/); assert.match(clipboard.observedHtml, /<b>富文本中文🙂<\/b>/); }
    } finally { await native.release(sample.name); }
  });
  await t.test('atomic restoration, partial-write retry and a newer external copy', async () => {
    const result = await command('clipboard-atomic');
    await writeFile(join(artifact, 'atomic-restore.json'), JSON.stringify(result, null, 2));
    assert.equal(result.locked, true, 'another process cannot open the clipboard during restoration');
    assert.equal(result.partial, true, 'the interrupted attempt must really transfer a format first');
    assert.equal(result.restored, true, 'an interrupted restore retains a complete retryable backup');
    assert.equal(result.newer, true, 'an external copy before locking must survive restoration');
  });
  t.diagnostic('Windows clipboard evidence: ' + artifact);
});
