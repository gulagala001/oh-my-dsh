import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, rename, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';

const socket = process.env.TRISOUL_CU_NATIVE_SOCKET;
const backgroundOnly = process.env.TRISOUL_CU_SURFACE_BACKGROUND_ONLY === '1';
test('native surface: real cursor ordering, clean images and nested scrolling', {
  skip: process.platform !== 'darwin' || !socket, timeout: 45000,
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'trisoul-cu-native-surface-'));
  const bundle = 'ai.trisoul.surface.test.' + process.pid;
  const app = join(directory, 'Fixture.app'), executable = join(app, 'Contents/MacOS/Fixture');
  const manager = new ComputerUseManager(join(directory, 'host'), {
    native: { socket, binary: process.env.TRISOUL_CU_NATIVE_BINARY },
  });
  const fixtures = [];
  t.after(async () => {
    await manager.close();
    for (const fixture of fixtures) { try { process.kill(fixture.pid, 'SIGTERM'); } catch {} }
    if (process.env.TRISOUL_CU_KEEP_ARTIFACTS) console.log('Native surface artifacts:', directory);
    else await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  execFileSync('clang', ['-fobjc-arc', '-framework', 'Cocoa', new URL('./fixtures/computer-use/NativeSurfaceFixture.m', import.meta.url).pathname, '-o', executable]);
  await writeFile(join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul Surface Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  const waitFor = async (get, predicate, message, milliseconds = 2000) => {
    const end = performance.now() + milliseconds; let value;
    do { value = await get(); if (predicate(value)) return value; await delay(10); } while (performance.now() < end);
    assert.fail(`${message}: ${JSON.stringify(value)}`);
  };
  const launch = async name => {
    const report = join(directory, name + '.json'), command = join(directory, name + '-command.json');
    const fixtureApp = join(directory, name + '.app'), fixtureBundle = bundle + '.' + name;
    await cp(app, fixtureApp, { recursive: true });
    const plist = join(fixtureApp, 'Contents/Info.plist');
    await writeFile(plist, (await readFile(plist, 'utf8')).replace(bundle, fixtureBundle));
    execFileSync('open', ['-n', '-g', fixtureApp, '--args', '--report', report, '--command', command]);
    const state = await waitFor(async () => { try { return JSON.parse(await readFile(report, 'utf8')); } catch { return null; } }, s => s?.windowId > 0 && s.events.some(e => e.event === 'ready'), 'fixture launch');
    const fixture = { ...state, bundle: fixtureBundle, read: async () => JSON.parse(await readFile(report, 'utf8')), command: async action => {
      if (action === 'front') execFileSync('open', ['-a', fixtureApp]);
      const id = randomUUID(); await writeFile(command + '.tmp', JSON.stringify({ id, action })); await rename(command + '.tmp', command);
      const acknowledged=await waitFor(fixture.read, s => s.command === id, 'fixture command ' + action);
      // LaunchServices/NSApp activation is asynchronous. An acknowledged
      // command is not yet proof that the intended foreground actually landed.
      if(action==='front')return waitFor(()=>fixture.command('sample'),s=>s.frontmostPid===fixture.pid&&s.keyWindow,'fixture foreground activation');
      return acknowledged;
    }};
    fixtures.push(fixture); return fixture;
  };
  const target = await launch('target');
  const execute = async code => {
    const result = await manager.execute('surface', code);
    assert.equal(result.error, undefined, JSON.stringify(result.error)); return result;
  };
  await execute(`const app = await cua.getApp({id:${JSON.stringify(target.bundle)},windowId:${target.windowId}});`);
  const cover = await launch('foreground');
  const permissions = await manager.native.permissions('surface-inspector');
  assert.equal(permissions.accessibility, true); assert.equal(permissions.screen_recording, true);
  const helperPid = permissions.source.pid;
  const windows = async () => {
    const records = await manager.native.windows('surface-inspector');
    // CGWindowListOptionAll is an inventory, not a guaranteed z-order. Read
    // the actual front-to-back on-screen IDs independently from the fixture.
    const { order } = await target.command('sample');
    return order.map(id => records.find(w => w.window_id === id)).filter(w => w && [target.pid, cover.pid, helperPid].includes(w.pid));
  };
  const cursorWindow = async () => (await windows()).find(w => w.pid === helperPid && w.title === 'Trisoul assistant cursor');
  const screenshot = async () => Buffer.from((await execute('await app.getScreenshot();')).blocks.find(b => b.type === 'image').data, 'base64');

  await t.test('cursor is rendered above its target, excluded from its image, and removed on stop', async () => {
    const before = await screenshot();
    await execute('await app.click([500,90]);');
    const cursor = await waitFor(cursorWindow, Boolean, 'actual cursor window');
    const ordered = await windows();
    assert.ok(ordered.findIndex(w => w.window_id === cursor.window_id) < ordered.findIndex(w => w.window_id === target.windowId), 'actual on-screen z-order');
    const raw = await manager.native.call('surface-inspector', 'get_window_state', { pid: helperPid, window_id: cursor.window_id, include_accessibility_tree: false, include_screenshot: true });
    const cursorPng = Buffer.from(raw.content.find(b => b.type === 'image').data, 'base64');
    await writeFile(join(directory, 'native-cursor.png'), cursorPng);
    const pixels = await sharp(cursorPng).ensureAlpha().raw().toBuffer();
    let dark = 0, white = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) { if (pixels[i] < 60 && pixels[i + 1] < 60 && pixels[i + 2] < 60) dark++; if (pixels[i] > 230 && pixels[i + 1] > 230 && pixels[i + 2] > 230) white++; }
    assert.ok(dark > 30 && white > 10, `arrow pixels: dark=${dark}, white=${white}`);
    const after = await screenshot(); await writeFile(join(directory, 'clean-target.png'), after);
    const region = { left: 470, top: 60, width: 70, height: 70 };
    assert.deepEqual(await sharp(after).extract(region).raw().toBuffer(), await sharp(before).extract(region).raw().toBuffer());
    await manager.stop('surface');
    try { assert.equal(await cursorWindow(), undefined, 'stop confirms removal from the actual on-screen list'); }
    finally {
      await manager.resume('surface');
      await execute(`const app = await cua.getApp({id:${JSON.stringify(target.bundle)},windowId:${target.windowId}});`);
    }
  });

  await t.test('background cursor stays above its target, below a foreground window, and out of captures', { skip: backgroundOnly }, async () => {
    await cover.command('front');
    await waitFor(() => cover.command('sample'), s => s.frontmostPid === cover.pid && s.keyWindow, 'foreground fixture');
    const beforeState = await target.command('sample'), before = await screenshot(), beforeWindows = await windows();
    await execute('await app.click([500,90]);');
    const cursor = await waitFor(cursorWindow, Boolean, 'visible assistant cursor');
    const ordered = await waitFor(windows, ws => ws.findIndex(w => w.window_id === cover.windowId) < ws.findIndex(w => w.window_id === cursor.window_id) && ws.findIndex(w => w.window_id === cursor.window_id) < ws.findIndex(w => w.window_id === target.windowId), 'cursor background z-order', 500);
    await writeFile(join(directory, 'ordering-diagnostic.json'), JSON.stringify({ beforeWindows, ordered, state: await target.command('sample') }, null, 2));
    assert.ok(ordered.findIndex(w => w.window_id === cover.windowId) < ordered.findIndex(w => w.window_id === cursor.window_id), 'foreground window must occlude the cursor');
    assert.ok(ordered.findIndex(w => w.window_id === cursor.window_id) < ordered.findIndex(w => w.window_id === target.windowId), 'cursor must appear above its target');
    const targetWindow = ordered.find(w => w.window_id === target.windowId),displayedCursor=ordered.find(w=>w.window_id===cursor.window_id);
    // Compare both windows from the same completed WindowServer presentation.
    assert.ok(displayedCursor.bounds.x <= targetWindow.bounds.x + 500 && displayedCursor.bounds.x + displayedCursor.bounds.width > targetWindow.bounds.x + 500);
    assert.ok(displayedCursor.bounds.y <= targetWindow.bounds.y + 90 && displayedCursor.bounds.y + displayedCursor.bounds.height > targetWindow.bounds.y + 90);
    const raw = await manager.native.call('surface-inspector', 'get_window_state', { pid: helperPid, window_id: cursor.window_id, include_accessibility_tree: false, include_screenshot: true });
    const cursorPng = Buffer.from(raw.content.find(b => b.type === 'image').data, 'base64');
    await writeFile(join(directory, 'native-cursor.png'), cursorPng);
    const pixels = await sharp(cursorPng).ensureAlpha().raw().toBuffer();
    let dark = 0, white = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) { if (pixels[i] < 60 && pixels[i + 1] < 60 && pixels[i + 2] < 60) dark++; if (pixels[i] > 230 && pixels[i + 1] > 230 && pixels[i + 2] > 230) white++; }
    assert.ok(dark > 30 && white > 10, `actual arrow pixels: dark=${dark}, white=${white}`);
    const after = await screenshot(); await writeFile(join(directory, 'clean-target.png'), after);
    const region = { left: 470, top: 60, width: 70, height: 70 };
    assert.deepEqual(await sharp(after).extract(region).raw().toBuffer(), await sharp(before).extract(region).raw().toBuffer(), 'target image contains no assistant cursor');
    const afterState = await target.command('sample');
    assert.equal(afterState.frontmostPid, cover.pid); assert.equal(afterState.keyWindow, false);
    assert.deepEqual(afterState.mouse, beforeState.mouse, 'assistant input must not move the physical mouse');
    assert.equal(afterState.events.slice(beforeState.events.length).some(e => e.event === 'became-active'), false);
    await writeFile(join(directory, 'cursor-order.json'), JSON.stringify({ ordered, beforeState, afterState }, null, 2));
  });

  await t.test('cursor appears over a key target and stop removes it before acknowledgment', { skip: backgroundOnly }, async () => {
    for(let round=0;round<8;round++){
    await target.command('front');
    await waitFor(() => target.command('sample'), s => s.frontmostPid === target.pid && s.keyWindow, 'key target');
    await screenshot();
    await execute('await app.click([500,90]);');
    const cursor = await waitFor(cursorWindow, Boolean, 'cursor over key target');
    const ordered = await waitFor(windows, ws => ws.findIndex(w => w.window_id === cursor.window_id) >= 0 && ws.findIndex(w => w.window_id === cursor.window_id) < ws.findIndex(w => w.window_id === target.windowId), 'cursor key target z-order', 500);
    assert.ok(ordered.findIndex(w => w.window_id === cursor.window_id) < ordered.findIndex(w => w.window_id === target.windowId));
    const state = await target.command('sample'); assert.equal(state.frontmostPid, target.pid); assert.equal(state.keyWindow, true);
    await manager.stop('surface');
    try {
      const residual=await cursorWindow();
      if(residual)await writeFile(join(directory,'stop-residual-'+round+'.json'),JSON.stringify({residual,observed:await target.command('sample')},null,2));
      assert.equal(residual, undefined, 'stop acknowledges cursor cleanup');
      await delay(100); assert.equal(await cursorWindow(), undefined, 'late updates cannot revive the cursor');
    } finally {
      await manager.resume('surface');
      await execute(`const app = await cua.getApp({id:${JSON.stringify(target.bundle)},windowId:${target.windowId}});`);
    }
    }
  });

  await t.test('element scrolling selects the inner or outer viewport in all four directions', async () => {
    if (!backgroundOnly) await cover.command('front');
    await target.command('reset-scroll');
    const before = await target.command('sample');
    const observed = await execute('let state = await app.getAXState({emit:false,disableDiffing:true}); nodeRepl.write(state); let inner = Number(state.match(/\\[(\\d+)\\] AXScrollArea Inner viewport/)[1]); let outer = Number(state.match(/\\[(\\d+)\\] AXScrollArea Outer viewport/)[1]);');
    await writeFile(join(directory, 'scroll-ax.json'), JSON.stringify(observed.blocks, null, 2));
    await execute("await app.scroll(inner,'down',1);");
    const down = await waitFor(target.read, s => s.inner[1] > 80, 'inner downward page');
    await writeFile(join(directory, 'first-scroll.json'), JSON.stringify(down, null, 2));
    assert.deepEqual(down.outer, [0, 0]); assert.ok(down.inner[1] <= 180);
    await execute("await app.scroll(inner,'up',1);");
    await waitFor(target.read, s => s.inner[1] === 0, 'inner upward page');
    await execute("await app.scroll(inner,'right',1);");
    const right = await waitFor(target.read, s => s.inner[0] > 180, 'inner horizontal page');
    assert.deepEqual(right.outer, [0, 0]); assert.ok(right.inner[0] <= 300);
    await execute("await app.scroll(inner,'left',1);");
    await waitFor(target.read, s => s.inner[0] === 0, 'inner left page');
    await execute("await app.scroll(outer,'right',1);");
    const outerRight = await waitFor(target.read, s => s.outer[0] > 400, 'outer horizontal page');
    assert.deepEqual(outerRight.inner, [0, 0], 'moving outer content must not redirect the remaining distance into its nested viewport');
    await execute("await app.scroll(outer,'left',1);");
    await waitFor(target.read, s => s.outer[0] === 0, 'outer left page');
    await execute("await app.scroll(inner,'down',2.5);");
    const multiple = await waitFor(target.read, s => s.inner[1] >= 350, 'fractional multiple inner pages');
    assert.deepEqual(multiple.outer, [0, 0]); assert.ok(multiple.inner[1] <= 410);
    await execute("await app.scroll(inner,'up',2.5);");
    await waitFor(target.read, s => s.inner[1] === 0, 'fractional multiple upward pages');
    await execute("await app.scroll(outer,'down',.5);");
    const outer = await waitFor(target.read, s => s.outer[1] > 100, 'explicit outer viewport');
    assert.deepEqual(outer.inner, [0, 0], 'the nested viewport beneath the outer center must not receive its scroll');
    const after = await target.command('sample');
    assert.equal(after.frontmostPid, before.frontmostPid); assert.equal(after.keyWindow, false);
    assert.deepEqual(after.mouse, before.mouse);
    await writeFile(join(directory, 'scroll-results.json'), JSON.stringify({ down, right, outerRight, multiple, outer, before, after }, null, 2));
  });

  await t.test('screenshot points hit the nested viewport and repeated scrolling settles at the boundary', async () => {
    await target.command('reset-scroll'); await screenshot();
    await execute("await app.scroll([220,250],'down',.5);");
    const point = await waitFor(target.read, s => s.inner[1] > 40, 'coordinate scroll');
    assert.deepEqual(point.outer, [0, 0]);
    await execute("await app.scroll([220,250],'down',20);");
    const bottom = await waitFor(target.read, s => s.inner[1] > 700, 'scroll bottom');
    await execute("await app.scroll([220,250],'down',1);");
    await delay(100); assert.deepEqual((await target.read()).inner, bottom.inner, 'boundary must remain stable');
  });

  await t.test('stopping a scroll gesture cancels its remaining events and hides its cursor', async () => {
    await target.command('reset-scroll'); await screenshot();
    const pending = manager.execute('surface', "await app.scroll([600,370],'down',50); await app.click([500,90]);");
    await waitFor(target.read, s => s.outer[1] > 0, 'scroll input in flight');
    const started = performance.now(); await manager.stop('surface');
    assert.ok(performance.now() - started < 1000);
    assert.match((await pending).error.message, /Stopped by user/);
    assert.equal(await cursorWindow(), undefined);
    await delay(100); const stopped = await target.read();
    await delay(200); const later = await target.read();
    assert.deepEqual(later.outer, stopped.outer); assert.equal(later.events.length, stopped.events.length);
  });
});
