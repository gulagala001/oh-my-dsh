import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeHost, defaultNativeBinary } from '../src/computer-use/native.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { legacyBundle } from './fixtures/computer-use/native-runtime.mjs';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';

test('native bundle location keeps old installations and uses the new name for fresh ones', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-install-location-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = join(root, 'Trisoul Computer Use.app/Contents/MacOS/trisoul-computer-use');
  const current = join(root, 'Oh My DSH Computer Use.app/Contents/MacOS/trisoul-computer-use');
  assert.equal(defaultNativeBinary(root), current);
  await mkdir(join(root, 'Trisoul Computer Use.app/Contents/MacOS'), { recursive: true });
  await writeFile(legacy, 'existing runtime');
  assert.equal(defaultNativeBinary(root), legacy);
  await mkdir(join(root, 'Oh My DSH Computer Use.app/Contents/MacOS'), { recursive: true });
  await writeFile(current, 'new installation');
  assert.equal(defaultNativeBinary(root), current);
  assert.equal(await readFile(legacy, 'utf8'), 'existing runtime');
});

test('native setup installs a complete signed bundle once and opens its permission panel', { skip: process.platform !== 'darwin', timeout: 45000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-install-'));
  const binary = join(root, 'Oh My DSH Computer Use.app/Contents/MacOS/trisoul-computer-use');
  const host = new NativeHost(root, { binary });
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  assert.equal(host.available(), false);
  await Promise.all([host.install(), host.install()]);
  assert.equal(host.available(), true);
  assert.equal((await host.installedInfo()).displayName, 'Oh My DSH Computer Use');
  const installed = await stat(binary);
  await host.install();
  assert.equal((await stat(binary)).mtimeMs, installed.mtimeMs, 'repeated setup does not replace an installed runtime');
  const permission = await host.permissions('install-test');
  assert.equal(typeof permission.accessibility, 'boolean');
  assert.equal(typeof permission.screen_recording, 'boolean');
  assert.equal((await host.showSetup()).shown, true);
  let windows = [], visible = false;
  for (let i = 0; i < 50 && !visible; i++) {
    windows = await host.windows('install-test', permission.source.pid);
    visible = windows.some(window => window.layer === 0 && window.is_on_screen && window.bounds.width > 0);
    if (!visible) await delay(40);
  }
  assert.ok(visible, 'the permission action opens an actual native window, even before screen capture permission allows window titles: ' + JSON.stringify(windows));
});

test('native upgrade replaces the signed bundle and verifies the actual new daemon', {skip:process.platform!=='darwin',timeout:45000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-upgrade-')),binary=await legacyBundle(root),host=new NativeHost(root,{binary});
  t.after(async()=>{await host.close();await rm(root,{recursive:true,force:true});});
  const permissions=await host.permissions('old'),old=await host.connection('old'),installed=await host.installedInfo();
  assert.equal((await host.installationStatus()).updateAvailable,true);
  await assert.rejects(host.bind('old','unused-fixture'),/需要更新或重启/);
  let boundary=0;await host.install({beforeReplace:async()=>{boundary++;assert.equal((await host.probeInfo()).serverInfo.version,'0.1.0');}});
  assert.equal(boundary,1);assert.equal(old.client.closed,true);
  const expected=await host.expectedBuild(),updated=await host.installedInfo(),live=await host.probeInfo();
  assert.equal(updated.displayName, 'Oh My DSH Computer Use');
  assert.equal(host.binary, binary, 'an old bundle is upgraded in place');
  assert.equal(updated.build,expected.build);assert.notEqual(updated.identity,installed.identity);
  assert.equal(live._meta.trisoul.build,expected.build);assert.notEqual(live._meta.trisoul.pid,permissions.source.pid);
  assert.equal((await host.installationStatus()).updateAvailable,false);
  assert.equal((await host.installationStatus()).restartRequired,false);
  await host.install();assert.equal((await host.installedInfo()).identity,updated.identity,'current installation is not rebuilt');
  assert.deepEqual((await readdir(root)).filter(name=>name.startsWith('.trisoul-cu-install-')),[]);
});

test('native upgrade restores the original bundle and daemon after failed new-runtime validation', {skip:process.platform!=='darwin',timeout:45000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-rollback-')),binary=await legacyBundle(root),host=new NativeHost(root,{binary});
  t.after(async()=>{await host.close();await rm(root,{recursive:true,force:true});});
  await host.permissions('old');const original=await host.installedInfo(),launch=host.launch.bind(host);let failed=false;
  host.launch=async()=>{
    await launch();
    if(!failed&&(await host.probeInfo())?.serverInfo.version!=='0.1.0'){failed=true;throw new Error('injected post-launch verification failure');}
  };
  await assert.rejects(host.install(),/已恢复先前安装/);
  assert.equal(failed,true);assert.equal((await host.installedInfo()).identity,original.identity);
  assert.equal((await host.probeInfo()).serverInfo.version,'0.1.0');
  assert.equal((await host.installationStatus()).updateAvailable,true);
  execFileSync('codesign',['--verify','--strict',join(root,'Trisoul Computer Use.app')]);
});

test('two hosts can update a shared bundle without interleaving publication or signing', {skip:process.platform!=='darwin',timeout:60000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-update-concurrent-')),binary=await legacyBundle(root);
  const hosts=[new NativeHost(join(root,'one'),{binary}),new NativeHost(join(root,'two'),{binary})];
  t.after(async()=>{await Promise.all(hosts.map(host=>host.close()));await rm(root,{recursive:true,force:true});});
  await Promise.all(hosts.map(host=>host.permissions('old')));
  await Promise.all(hosts.map(host=>host.install()));
  const build=(await hosts[0].expectedBuild()).build;
  for(const host of hosts){assert.equal((await host.installedInfo()).build,build);assert.equal((await host.probeInfo())._meta.trisoul.build,build);}
  assert.notEqual((await hosts[0].probeInfo())._meta.trisoul.pid,(await hosts[1].probeInfo())._meta.trisoul.pid);
  assert.deepEqual((await readdir(root)).filter(name=>name.startsWith('.trisoul-cu-install-')),[]);
});

test('native upgrade interrupts a real drag, releases input and permits fresh bindings', {skip:process.platform!=='darwin',timeout:45000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-update-input-')),binary=await legacyBundle(root);
  const manager=new ComputerUseManager(join(root,'host'),{native:{binary}});let pid,closePreview;
  t.after(async()=>{await closePreview?.();await manager.close();if(pid)try{process.kill(pid,'SIGTERM');}catch{}await rm(root,{recursive:true,force:true});});
  const permission=await manager.native.permissions('setup');
  if(!permission.accessibility||!permission.screen_recording){t.skip('requires the native runtime permissions');return;}
  const fixture=join(root,'Fixture.app'),bundle='ai.trisoul.update-input.'+process.pid,report=join(root,'truth.json');
  await mkdir(join(fixture,'Contents/MacOS'),{recursive:true});
  execFileSync('clang',['-fobjc-arc','-framework','Cocoa',new URL('./fixtures/computer-use/NativeFixture.m',import.meta.url).pathname,'-o',join(fixture,'Contents/MacOS/Fixture')]);
  await writeFile(join(fixture,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul Update Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open',['-n','-g',fixture,'--args','--report',report]);
  const truth=async()=>JSON.parse(await readFile(report,'utf8'));
  for(let i=0;i<100;i++){try{pid=(await truth()).pid;if(pid)break;}catch{}await delay(20);}
  assert.ok(pid);
  // Model the manager that bound this app before its required runtime changed.
  const expectedBuild=manager.native.expectedBuild.bind(manager.native);
  manager.native.expectedBuild=async()=>({version:'0.1.0',protocol:0,build:'legacy-test-build'});
  const execute=async code=>{const result=await manager.execute('test',code);assert.equal(result.error,undefined,JSON.stringify(result.error));return result;};
  await execute(`const app=await cua.getApp(${JSON.stringify(bundle)}); await app.getScreenshot();`);
  const previewEvents=[];closePreview=await manager.watchNative('test',manager.status('test').target.viewId,(event,value)=>previewEvents.push({event,...(event==='frame'?{}:value)}),new AbortController().signal);
  for(let i=0;i<100&&!previewEvents.some(value=>value.event==='frame');i++)await delay(20);
  assert.ok(previewEvents.some(value=>value.event==='frame'),'an actual recording is active before the upgrade');
  const pending=manager.execute('test',"for(let i=0;i<100;i++)await app.drag([80,398],[500,398]); await app.typeText('LATE_UPDATE');");
  manager.native.expectedBuild=expectedBuild;
  const install=manager.native.install.bind(manager.native);let heldAtBoundary=false;
  manager.native.install=options=>install({...options,beforeReplace:async()=>{
    for(let i=0;i<100;i++){const state=await truth();if(state.mouseHeld&&state.dragCount>0){heldAtBoundary=true;break;}await delay(5);}
    assert.equal(heldAtBoundary,true,'update must interrupt input already received by the fixture');
    await options.beforeReplace();
  }});
  await manager.installNative();
  assert.ok(previewEvents.some(value=>value.event==='closed'&&value.reason==='runtime-update'));assert.equal(manager.nativeViews.views.size,0);
  assert.doesNotMatch(manager.status('test').lastError?.message??'',/应用窗口已关闭/,'an expected upgrade does not report that the user closed their application');
  assert.match((await pending).error.message,/正在更新/);
  assert.equal(manager.status('test').target,null);
  await delay(100);const stopped=await truth();assert.equal(stopped.mouseHeld,false);assert.equal(stopped.name,'');
  await delay(150);assert.equal((await truth()).events.length,stopped.events.length,'no late input after update acknowledgment');
  await execute(`const app=await cua.getApp(${JSON.stringify(bundle)});const state=await app.getAXState({emit:false,disableDiffing:true});const field=Number(state.match(/\\[(\\d+)\\] AXTextField 姓名/)[1]);const save=Number(state.match(/\\[(\\d+)\\] AXButton Save actions/)[1]);await app.setValue(field,'updated runtime');await app.click(save);`);
  assert.equal((await truth()).result,'Save | updated runtime');
});
