import test from'node:test';import assert from'node:assert/strict';
import{mkdtemp,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';
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
