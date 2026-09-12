import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';

// Opt in on a Mac with the installed service's permissions granted. The test
// builds its own AppKit target and reads its event log, never another app's data.
const socket = process.env.TRISOUL_CU_NATIVE_SOCKET;
test('native: actual AppKit effects, persistent JS and in-flight cancellation', {
  skip: process.platform !== 'darwin' || !socket,
  timeout: 45000,
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-native-'));
  const bundle = 'ai.trisoul.fixture.test.' + process.pid;
  const app = join(directory, 'Fixture.app'), executable = join(app, 'Contents/MacOS/Fixture');
  const report = join(directory, 'ground-truth.json');
  const manager = new ComputerUseManager(join(directory, 'host'), {
    native: { socket, binary: process.env.TRISOUL_CU_NATIVE_BINARY },
  });
  let pid;
  t.after(async () => {
    await manager.close();
    if (pid) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  execFileSync('clang', ['-fobjc-arc', '-framework', 'Cocoa', new URL('./fixtures/computer-use/NativeFixture.m', import.meta.url).pathname, '-o', executable]);
  await writeFile(join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul Test Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open', ['-n', '-g', app, '--args', '--report', report, '--references']);
  for (let i = 0; i < 80; i++) {
    const apps = await manager.native.list('test');
    pid = apps.find(a => a.id === bundle && a.isRunning)?.pid;
    try { if (pid && (await readFile(report, 'utf8'))) break; } catch {}
    await delay(50);
  }
  assert.ok(pid, 'isolated native fixture launched');
  const truth = async () => JSON.parse(await readFile(report, 'utf8'));
  const execute = async code => {
    const result = await manager.execute('test', code);
    assert.equal(result.error, undefined, JSON.stringify({ error: result.error, text: result.blocks.filter(b => b.type === 'text') }));
    return result;
  };
  await execute(String.raw`const app = await cua.getApp(${JSON.stringify(bundle)}); const state = await app.getAXState({emit:false,disableDiffing:true}); const name = Number(state.match(/\[(\d+)\] AXTextField 姓名/)[1]); const save = Number(state.match(/\[(\d+)\] AXButton Save actions/)[1]);`);

  await t.test('Unicode input, exact Save and real screenshot through the JS worker', async () => {
    const before = await truth();
    await execute("await app.setValue(name,'青禾🌿'); await app.click(save);");
    const after = await truth();
    assert.equal(after.result, 'Save | 青禾🌿');
    assert.equal(after.events.slice(before.events.length).some(e => e.event === 'became-active'), false);
    const screenshot = await execute('await app.getScreenshot();');
    const bytes = Buffer.from(screenshot.blocks.find(b => b.type === 'image').data, 'base64');
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 660);
    assert.equal(bytes.readUInt32BE(20), 458);
  });

  await t.test('text selection refuses ambiguity and preserves Unicode boundaries', async () => {
    await execute("await app.setValue(name,'甲乙甲乙'); await app.click(name);");
    const ambiguous = await manager.execute('test', "await app.selectText(name,'甲');");
    assert.match(ambiguous.error.message, /match exactly once/);
    await execute("await app.selectText(name,'甲',{prefix:'甲乙'}); await app.typeText('青禾🌿'); await app.click(save);");
    assert.equal((await truth()).result, 'Save | 甲乙青禾🌿乙');
  });

  await t.test('native observations return differences, explicit full state and literal text',async()=>{
    await execute('await app.getAXState({disableDiffing:true});');
    let result=await execute('await app.getAXState();');assert.match(result.blocks.map(b=>b.text??'').join('\n'),/No change/);
    result=await execute("await app.setValue(name,'literal [0] and [9999]');await app.getAXState();");
    let text=result.blocks.map(b=>b.text??'').join('\n');assert.match(text,/Accessibility changes/);assert.match(text,/literal \[0\] and \[9999\]/);assert.doesNotMatch(text,/AXButton Save As/);
    result=await execute("await app.setValue(name,'silent observation');await app.getAXState({emit:false});");assert.equal(result.blocks.length,0);
    result=await execute('await app.getAXState();');assert.match(result.blocks.map(b=>b.text??'').join('\n'),/No change/);
    result=await execute('await app.getAXState({disableDiffing:true});');text=result.blocks.map(b=>b.text??'').join('\n');assert.match(text,/AXButton Save As/);assert.match(text,/Focused element:/);
    await execute("await app.setValue(name,'same reference after full state');await app.click(save);");assert.equal((await truth()).result,'Save | same reference after full state');
  });

  await t.test('Command+A selects the input in a freshly launched background app', async () => {
    try{
      await execute("await app.setValue(name,'old keyboard content'); await app.click(name); await app.pressKey('super+a'); await app.typeText('键盘全选替换'); await app.click(save);");
      assert.equal((await truth()).result,'Save | 键盘全选替换');
    }finally{await execute("await app.setValue(name,'甲乙青禾🌿乙'); await app.click(save);");}
  });

  await t.test('unchanged controls retain references across observations, value changes and inserted siblings', async () => {
    await execute("await app.getAXState(); await app.setValue(name,'stable reference'); await app.getAXState(); await app.click(save);");
    assert.equal((await truth()).result, 'Save | stable reference');
    await execute(String.raw`let current = await app.getAXState({emit:false,disableDiffing:true}); let insert = Number(current.match(/\[(\d+)\] AXButton Insert control actions/)[1]); await app.click(insert); await app.getAXState(); await app.setValue(name,'stable after insertion'); await app.click(save);`);
    assert.equal((await truth()).result, 'Save | stable after insertion');
    await assert.rejects(manager.native.bind('other', bundle), /another conversation/);
  });

  await t.test('same-label replacement and reinserted controls never inherit a retired reference', async () => {
    await execute(String.raw`current = await app.getAXState({emit:false,disableDiffing:true}); let replace = Number(current.match(/\[(\d+)\] AXButton Replace field actions/)[1]); let restore = Number(current.match(/\[(\d+)\] AXButton Restore field actions/)[1]); await app.click(replace); await app.getAXState();`);
    const stale = await manager.execute('test', "await app.setValue(name,'should not be written');");
    assert.match(stale.error.message, /stale/);assert.equal((await truth()).name, 'replacement');
    await execute(String.raw`current = await app.getAXState({emit:false,disableDiffing:true}); let replacement = Number(current.match(/\[(\d+)\] AXTextField 姓名/)[1]); await app.setValue(replacement,'new field works'); await app.click(save);`);
    assert.equal((await truth()).result, 'Save | new field works');
    await execute('await app.click(restore); await app.getAXState();');
    for(const id of ['name','replacement']){
      const retired=await manager.execute('test', `await app.setValue(${id},'must remain retired');`);
      assert.match(retired.error.message, /stale/);
    }
    assert.equal((await truth()).name, 'stable after insertion');
    await execute(String.raw`current = await app.getAXState({emit:false,disableDiffing:true}); let restored = Number(current.match(/\[(\d+)\] AXTextField 姓名/)[1]); await app.setValue(restored,'restored field works'); await app.click(save);`);
    assert.equal((await truth()).result, 'Save | restored field works');
  });

  await t.test('stop during actual dragging releases mouse and blocks queued input', async () => {
    await execute('await app.getScreenshot();');
    const before = await truth();
    const pending = manager.execute('test', "await app.drag([80,398],[500,398]); await app.typeText('LATE_INPUT');");
    let sawDrag = false;
    for (let i = 0; i < 100; i++) {
      const state = await truth();
      if (state.mouseHeld && state.dragCount > before.dragCount) { sawDrag = true; break; }
      await delay(5);
    }
    assert.equal(sawDrag, true, 'cancellation must happen after the target receives drag input');
    const started = performance.now();
    await manager.stop('test');
    const stoppedMs = performance.now() - started;
    const result = await pending;
    assert.match(result.error.message, /Stopped by user/);
    assert.ok(stoppedMs < 1000, `stop took ${stoppedMs} ms`);
    await delay(100);
    const after = await truth();
    assert.equal(after.mouseHeld, false);
    assert.ok(after.events.slice(before.events.length).some(e => e.event === 'mouse-up'));
    assert.equal(after.name, before.name);
    await delay(500);
    assert.equal((await truth()).events.length, after.events.length, 'no input after stop acknowledged');
    await assert.rejects(manager.execute('test', 'await cua.getState();'), /stopped by the user/);
    await manager.resume('test');
    await execute(`const rebound = await cua.getApp(${JSON.stringify(bundle)});`);
  });
  await t.test('a bounded raw observation reports truncation and permits a fresh complete observation',async()=>{
    const target=[...manager.native.targets.values()].find(target=>target.sessionId==='test');
    const partial=await manager.native.call('test','get_window_state',{pid:target.pid,window_id:target.windowId,include_screenshot:false,max_elements:2});
    assert.equal(partial.structuredContent.truncated,true);assert.equal(partial.structuredContent.elements.length,2);
    const result=await execute('await rebound.getAXState({disableDiffing:true});');assert.match(result.blocks.map(b=>b.text??'').join('\n'),/AXTextField 姓名/);
  });
});
