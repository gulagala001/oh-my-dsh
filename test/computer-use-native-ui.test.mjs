import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { defaultNativeBinary } from '#opencu/src/computer-use/native.mjs';

// OpenCU owns platform input, cursor, multi-window and PiP coverage.
// Keep the OMD tool -> real native target -> workbench stream -> stop boundary here.
test('OMD native integration preserves the target and its preview after stopping', {
  timeout: 60000, skip: process.platform !== 'darwin' || !process.env.TRISOUL_CU_NATIVE_SOCKET,
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-native-integration-'));
  const app = join(root, 'Fixture.app'), report = join(root, 'truth.json'), command = join(root, 'command.json');
  const bundle = 'ai.trisoul.nativeui.' + crypto.randomUUID(); let pid;
  t.after(async () => { if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} } await rm(root, { recursive: true, force: true }); });
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  execFileSync('clang', ['-fobjc-arc', '-framework', 'Cocoa', new URL('./fixtures/computer-use/NativeFixture.m', import.meta.url).pathname, '-o', join(app, 'Contents/MacOS/Fixture')]);
  await writeFile(join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Oh My DSH UI Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open', ['-n', '-g', app, '--args', '--report', report, '--command', command]);
  pid = await until(async () => { try { return JSON.parse(await readFile(report, 'utf8')).pid; } catch {} });
  const f = await frontendFixture(t, { omdConfig: { codegraphEnabled: false, computerUseNativeBinary: process.env.TRISOUL_CU_NATIVE_BINARY ?? defaultNativeBinary(), computerUseNativeSocket: process.env.TRISOUL_CU_NATIVE_SOCKET } });
  const { page, sessionId } = f; let sent = false;
  f.replyWith(() => {
    if (sent) return { delta: { role: 'assistant', content: '原生宿主接入完成。' }, finish_reason: 'stop' };
    sent = true;
    return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'native-integration', type: 'function', function: { name: 'computer_use', arguments: JSON.stringify({ title: '观察原生测试窗口', code: `var app = await cua.getApp(${JSON.stringify(bundle)}); await app.getScreenshot();` }) } }] }, finish_reason: 'tool_calls' };
  });
  const endpoint = name => new URL('/trisoul-x/computer-use/' + name + '?session=' + sessionId, page.url()).href;
  const state = async () => (await page.request.get(endpoint('state'))).json();
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '验证原生电脑接入' }] });
  await page.getByText('原生宿主接入完成。', { exact: true }).waitFor();
  const target = (await until(async () => { const value = await state(); return value.previewAt && value; })).target;
  assert.equal(target.kind, 'app');
  await page.getByLabel('悬浮操控预览').locator('img').waitFor();
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  const image = page.getByAltText('当前应用窗口的实时画面'); await image.waitFor();
  await until(() => image.evaluate(img => img.complete && img.naturalWidth > 0));
  const before = await image.getAttribute('src');
  await writeFile(command, JSON.stringify({ id: 'live', action: 'text', value: '原生界面实时更新' }));
  await until(async () => await image.getAttribute('src') !== before);
  assert.equal((await page.request.post(endpoint('stop'), { data: {} })).status(), 200);
  assert.equal((await state()).status, 'stopped');
  const stopped = await image.getAttribute('src');
  await writeFile(command, JSON.stringify({ id: 'stopped', action: 'text', value: '助手停止后仍可查看' }));
  await until(async () => await image.getAttribute('src') !== stopped);
  assert.equal((await state()).target.viewId, target.viewId);
  assert.deepEqual(f.errors, []);
});
