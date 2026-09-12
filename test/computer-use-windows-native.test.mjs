import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { McpClient } from '../src/computer-use/mcp-client.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('Windows native observation reads real WPF controls and occluded pixels without activating or typing', { skip: process.platform !== 'win32' || process.env.TRISOUL_CU_WINDOWS_NATIVE_TEST !== '1' ? 'requires an interactive Windows desktop and TRISOUL_CU_WINDOWS_NATIVE_TEST=1' : false, timeout: 360000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-native-'));
  const artifact = resolve('cu-artifacts', 'windows-native-' + Date.now()); await mkdir(artifact, { recursive: true });
  const clients = []; let native;
  t.after(async () => {
    await native?.close();
    for (const client of clients) await client.close();
    await writeFile(join(artifact, 'processes.json'), JSON.stringify(clients.map(client => ({ pid: client.child.pid, exitCode: client.child.exitCode, signal: client.child.signalCode, stderr: client.stderr })), null, 2));
    await rm(root, { recursive: true, force: true });
    t.diagnostic('Windows native observation artifacts: ' + artifact);
  });
  const output = join(root, 'native');
  await run(process.execPath, ['scripts/build-computer-use-windows-native.mjs'], { timeout: 180000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, TRISOUL_CU_WINDOWS_NATIVE_OUTPUT: output } });
  const expected = await windowsNativeBuild(), binary = join(output, expected.executable);
  assert.equal(JSON.parse((await run(binary, ['info'])).stdout).build, expected.build);
  const fixtureOutput = join(root, 'fixture');
  await run(dotnet, ['publish', fileURLToPath(new URL('./fixtures/computer-use/windows-desktop/Fixture.csproj', import.meta.url)), '-c', 'Release', '-r', expected.rid, '--self-contained', 'true', '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:BaseIntermediateOutputPath=' + join(root, 'fixture-obj') + '/', '-o', fixtureOutput, '--nologo'], { timeout: 120000, maxBuffer: 1024 * 1024 });
  const fixture = new McpClient(join(fixtureOutput, 'OhMyDsh.DesktopFixture.exe')); clients.push(fixture);
  const original = await fixture.request('fixture', { action: 'state' });
  const connect = async label => {
    const client = new McpClient(binary, ['mcp']); clients.unshift(client);
    const info = await client.initialize(); assert.equal(info._meta.trisoul.build, expected.build); assert.equal(info._meta.trisoul.input, true);
    await client.call('start_session', { session: label, read_only: true });
    return { client, call: (name, args = {}, options) => client.call(name, { ...args, session: label }, options) };
  };
  const control = await connect('observer'), video = await connect('preview');
  const windows = (await control.call('list_windows', { pid: original.pid })).structuredContent.windows;
  assert.equal(windows.length, 2);
  const target = windows.find(window => window.window_id === original.first);
  assert.ok(target); assert.ok(target.dpi >= 96);
  assert.equal(target.focused, false, 'fixture intentionally covers target with another foreground window');
  const identity = { pid: original.pid, window_id: target.window_id, process_identity: target.process_identity };
  await assert.rejects(control.call('get_window_state', { ...identity, process_identity: 'stale' }), error => error.code === 'STALE_PROCESS');
  const observed = await control.call('get_window_state', { ...identity, include_screenshot: true });
  const state = observed.structuredContent;
  assert.ok(state.elements.some(element => element.automation_id === 'fixture-editor' && element.value === original.text));
  assert.ok(state.elements.some(element => element.label === '密码' && element.value === '[password]'));
  assert.doesNotMatch(JSON.stringify(observed), /fixture-secret-must-not-leak/);
  assert.ok(state.elements.every(element => element.actions.length === 0 && !element.element_token));
  const image = Buffer.from(observed.content.find(content => content.type === 'image').data, 'base64');
  await writeFile(join(artifact, 'occluded-window.png'), image);
  await writeFile(join(artifact, 'observation.json'), JSON.stringify(state, null, 2));
  const metadata = await sharp(image).metadata(); assert.equal(metadata.width, state.screenshot_width); assert.equal(metadata.height, state.screenshot_height);
  // The target is covered in the desktop. WGC must still deliver its own red
  // content, rather than a cropped screenshot of the foreground blue window.
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let red = 0; for (let offset = 0; offset < data.length; offset += info.channels) if (data[offset] > 190 && data[offset + 1] < 70 && data[offset + 2] < 90) red++;
  assert.ok(red > 15000, 'capture contains the actual target red patch');
  const after = await fixture.request('fixture', { action: 'state' });
  assert.equal(after.foreground, original.foreground); assert.deepEqual(after.cursor, original.cursor); assert.equal(after.text, original.text);
  await assert.rejects(control.call('type_text', { ...identity, text: 'must not type' }), error => error.code === 'READ_ONLY_SESSION');
  assert.equal((await fixture.request('fixture', { action: 'state' })).text, original.text);

  await video.call('start_preview', identity);
  const nextFrame = async () => {
    for (let i = 0; i < 10; i++) { const result = (await video.call('preview_frame')).structuredContent; if (result.data) return result; }
    throw new Error('No actual Windows preview frame');
  };
  const firstFrame = await nextFrame(); assert.equal(firstFrame.geometryVerified, true); assert.equal(firstFrame.cursor, null);
  await control.call('end_session');
  await fixture.request('fixture', { action: 'text', text: '独立预览仍在🙂' });
  const later = await nextFrame(); assert.ok(later.sequence > firstFrame.sequence);
  // Exercise the actual plugin adapter against a distinct controlling native
  // process. The earlier read-only client remains stopped and cannot be upgraded.
  native = new WindowsNativeHost(root, { binary });
  await fixture.request('fixture', { action: 'focus' });
  const binding = await native.bind('controller', { id: target.app_id, windowId: target.window_id });
  const readState = async () => (await native.invoke('controller', binding.id, 'getAXState', [{ disableDiffing: true }])).state;
  let actualState = await readState();
  const editorId = Number(actualState.match(/\[(\d+)\] Edit 测试内容/)?.[1]); assert.ok(Number.isSafeInteger(editorId));
  await native.invoke('controller', binding.id, 'setValue', [editorId, '前缀中文中间中文后缀']);
  assert.equal((await fixture.request('fixture', { action: 'state' })).text, '前缀中文中间中文后缀');
  await native.invoke('controller', binding.id, 'selectText', [editorId, '中文', { prefix: '中间', suffix: '后缀', selectionType: 'select' }]);
  const selected = await fixture.request('fixture', { action: 'state' }); assert.equal(selected.selectionStart, 6); assert.equal(selected.selectionLength, 2);
  await native.invoke('controller', binding.id, 'selectText', [editorId, '中文', { prefix: '中间', suffix: '后缀', selectionType: 'after' }]);
  const caret = await fixture.request('fixture', { action: 'state' }); assert.equal(caret.selectionStart, 8); assert.equal(caret.selectionLength, 0);
  await native.invoke('controller', binding.id, 'pressKey', ['ctrl+a']);
  await native.invoke('controller', binding.id, 'typeText', ['键盘中文🙂']);
  for (let i = 0; i < 100; i++) { if ((await fixture.request('fixture', { action: 'state' })).text === '键盘中文🙂') break; await delay(20); }
  const typed = await fixture.request('fixture', { action: 'state' }); assert.equal(typed.text, '键盘中文🙂'); assert.ok(Object.values(typed.held).every(held => held === false));
  actualState = await readState();
  const currentEditor = Number(actualState.match(/\[(\d+)\] Edit 测试内容/)?.[1]), buttonId = Number(actualState.match(/\[(\d+)\] Button 计数按钮/)?.[1]);
  await fixture.request('fixture', { action: 'reject-next-value' });
  await assert.rejects(native.invoke('controller', binding.id, 'setValue', [currentEditor, '不得伪报赋值成功']), error => error.code === 'VALUE_NOT_RETAINED');
  assert.equal((await fixture.request('fixture', { action: 'state' })).text, '应用回退了输入');
  assert.ok(Number.isSafeInteger(buttonId));
  await native.invoke('controller', binding.id, 'click', [buttonId]);
  assert.equal((await fixture.request('fixture', { action: 'state' })).clicks, 1);
  await native.release('controller');
  assert.ok(Object.values((await fixture.request('fixture', { action: 'state' })).held).every(held => held === false));
  assert.ok((await nextFrame()).sequence > later.sequence, 'the independent preview continues after native control is released');
  await fixture.request('fixture', { action: 'minimize' });
  await assert.rejects(video.call('preview_frame'), error => error.code === 'WINDOW_NOT_VISIBLE');
  await fixture.request('fixture', { action: 'restore' }); await delay(400); await nextFrame();
  await video.client.close();
  assert.equal((await fixture.request('fixture', { action: 'state' })).first, original.first, 'closing observation preserves the user window');
  const share = await connect('share');
  const shared = await share.call('get_window_share', identity); assert.ok(shared.content.some(item => item.type === 'image'));
  await fixture.request('fixture', { action: 'close' });
  await assert.rejects(share.call('get_window_state', identity), error => ['STALE_WINDOW', 'APP_EXITED'].includes(error.code));
  await writeFile(join(artifact, 'report.json'), JSON.stringify({ status: 'passed', platform: process.platform, arch: process.arch, runtime: JSON.parse(await readFile(join(output, 'build.json'), 'utf8')), dpi: target.dpi, inputTested: ['setValue', 'selectText', 'pressKey', 'typeText', 'semanticClick', 'release'], inputPending: ['physicalPointer', 'drag', 'clipboard', 'physicalUserIntervention'] }, null, 2));
});
