import test from'node:test';import assert from'node:assert/strict';
import{mkdtemp,rm,writeFile}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
import{ComputerUseManager}from'../src/computer-use/manager.mjs';

test('unload preserves the browser transport until uncertain style restoration is confirmed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-style-close-')),manager=new ComputerUseManager(root,{native:{binary:join(root,'missing')}});
  let fail=true,closed=0,restored=0;
  const view={stylePreview:{objectId:'style-object',loaderId:'document'},record:{page:{isClosed:()=>false}},cdp:{send:async(method)=>{
    if(method==='Runtime.callFunctionOn'){if(fail)throw new Error('restore not acknowledged');restored++;return{result:{value:{restored:true}}};}
    if(method==='Page.getFrameTree')return{frameTree:{frame:{loaderId:'document'}}};
    return{};
  }}};
  manager.browserViews.views.set('tab',view);
  const close=manager.browser.close.bind(manager.browser);manager.browser.close=async()=>{closed++;return close();};
  t.after(async()=>{fail=false;manager.browserViews.views.clear();await manager.close();await rm(root,{recursive:true,force:true});});
  await assert.rejects(manager.close(),/restore not acknowledged/);assert.equal(closed,0);assert.ok(view.stylePreview);
  fail=false;manager.browserViews.close=async()=>{};await manager.close();assert.equal(restored,1);assert.equal(view.stylePreview,null);assert.equal(closed,1);
});

test('removing Chrome preserves its connection and registration until temporary styles are restored',async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-style-remove-'));
  // This restoration test uses a fake page and registration. Give it an
  // explicitly ready transport too; a fresh Windows directory has no installed
  // native bridge, so constructor startup cannot supply that prerequisite.
  const bridge=join(root,'bridge.mjs');
  await writeFile(bridge,"process.stdout.write(Buffer.alloc(9));process.stdin.resume();process.stdin.on('end',()=>process.exit(0));");
  const manager=new ComputerUseManager(root,{native:{binary:join(root,'missing')},extension:{platform:'win32',windowsRuntime:{command:async()=>({command:process.execPath,args:[bridge]})}}});
  let fail=true,closed=0,removed=0;
  const view={stylePreview:{objectId:'style-object',loaderId:'document'},record:{page:{isClosed:()=>false}},cdp:{send:async method=>{
    if(method==='Runtime.callFunctionOn'){if(fail)throw new Error('restore not acknowledged');return{result:{value:{restored:true}}};}
    if(method==='Page.getFrameTree')return{frameTree:{frame:{loaderId:'document'}}};return{};
  }}};
  manager.extensionViews.set('fixture',{views:new Map([['tab',view]]),close:async()=>{closed++;}});
  manager.extensionInstaller.unregister=async()=>{removed++;};
  t.after(async()=>{manager.extensionViews.clear();await manager.close();await rm(root,{recursive:true,force:true});});
  await assert.rejects(manager.removeExtension(),/restore not acknowledged/);
  assert.equal(closed,0);assert.equal(removed,0);assert.ok(manager.extensionHub.server);
  fail=false;await manager.removeExtension();assert.equal(view.stylePreview,null);assert.equal(closed,1);assert.equal(removed,1);assert.equal(manager.extensionHub.server,null);
});
