import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
import {extensionFixture} from './fixtures/computer-use/extension.mjs';
import {startFixture} from './fixtures/computer-use/server.mjs';

async function setup(t,backend){
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-screenshot-')),cleanups=[];let manager;
  t.after(async()=>{try{await manager?.close();}finally{for(const close of cleanups)await close();await rm(root,{recursive:true,force:true});}});
  const external=backend==='extension'?await extensionFixture({after:close=>cleanups.push(close)},{headless:true,viewport:null}):null,fixture=external?.fixture??await startFixture();if(!external)cleanups.push(()=>fixture.close());
  manager=new ComputerUseManager(root,{native:{binary:join(root,'absent')},...(external?{extensionHub:external.hub}:{})});
  const browserId=external?.browser.id??'browser';let tab;
  const run=async code=>{const result=await manager.execute('test',code);assert.equal(result.error,undefined,JSON.stringify(result.error));return result;};
  await run(`const browser=await cua.getBrowser({id:${JSON.stringify(browserId)}});const tab=await cua.createBrowserTab(${JSON.stringify(browserId)},${JSON.stringify(fixture.url+'/geometry')});await tab.markDeliverable();`);tab=manager.status('test').target;
  const browser=manager.browserForTab(tab.id),record=await browser.target('test',tab.id),page=external?external.context.pages().find(page=>page.url().endsWith('/geometry')):(await browser.target('observer',tab.id,{claim:false})).page;
  const driver=await page.context().newCDPSession(page);return {manager,run,tab,browser,record,page,driver,fixture};
}
for(const backend of ['managed','extension']){
  test(backend+' cropped screenshot preserves pinch/pan and maps emitted image coordinates',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);await s.page.setViewportSize({width:1280,height:720});await s.driver.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await s.driver.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    await s.driver.send('Input.synthesizeScrollGesture',{x:300,y:180,xDistance:-80,yDistance:0,gestureSourceType:'touch',speed:800});
    const before=await s.driver.send('Page.getLayoutMetrics');
    const full=await s.manager.execute('test','await tab.screenshot({fullPage:true});');assert.match(full.error?.message??'',/pinch zoom/);
    const quiet=await s.run('const cropped=await tab.screenshot({clip:{x:60,y:20,width:260,height:200}});');assert.equal(quiet.blocks.filter(block=>block.type==='image').length,0);
    const shown=await s.run('await nodeRepl.emitImage(cropped);'),block=shown.blocks.find(block=>block.type==='image');assert.ok(block.capture?.geometry.region);
    const image=await sharp(Buffer.from(block.data,'base64')).resize(260,200).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x=0,y=0,n=0;
    for(let i=0;i<image.data.length;i+=4)if(image.data[i]>150&&image.data[i+1]<100&&image.data[i+2]<120){x+=(i/4)%image.info.width;y+=Math.floor(i/4/image.info.width);n++;}assert.ok(n>30);
    assert.deepEqual((await s.driver.send('Page.getLayoutMetrics')).cssVisualViewport,before.cssVisualViewport);assert.deepEqual((await s.driver.send('Page.getLayoutMetrics')).cssLayoutViewport,before.cssLayoutViewport);
    const frame={...block.capture,previewWidth:260,previewHeight:200},frames=new Map([[JSON.stringify(['tab',s.tab.browserId,s.tab.id]),frame]]);
    const clicked=await s.manager.execute('test',`await tab.click([${x/n},${y/n}]);`,{coordinateFrames:frames});assert.equal(clicked.error,undefined);assert.equal(await s.page.evaluate(()=>geometryFixture.redHit),true);
    for(const options of [{clip:{x:-1,y:0,width:10,height:10}},{clip:{x:0,y:0,width:0,height:10}},{clip:{x:0,y:0,width:10000,height:10}},{fullPage:true,clip:{x:0,y:0,width:10,height:10}}])assert.ok((await s.manager.execute('test',`await tab.screenshot(${JSON.stringify(options)});`)).error);
  });
  test(backend+' viewport capability applies to new tabs, resets, and restores on stop',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend),size=()=>s.page.evaluate(()=>({width:innerWidth,height:innerHeight}));const original=await size();
    await s.run("const viewport=await browser.capabilities.get('viewport');await viewport.set({width:420,height:310});");assert.deepEqual(await size(),{width:420,height:310});
    await s.run('const next=await browser.tabs.new();await next.markDeliverable();');const next=s.manager.status('test').target,record=await s.browser.target('test',next.id);
    assert.deepEqual(await record.page.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:420,height:310});
    await s.run(`await cua.createBrowserTab(browser.browserId,${JSON.stringify(s.fixture.url+'/geometry')});`);const loaded=s.manager.status('test').target,loadedRecord=await s.browser.target('test',loaded.id);
    assert.deepEqual(await loadedRecord.page.evaluate(()=>geometryFixture.viewportAtLoad),{width:420,height:310},'viewport applies before page scripts execute');
    await s.run('await viewport.reset();');assert.deepEqual(await size(),original);
    await s.run('await tab.viewport.set({width:500,height:350});');assert.deepEqual(await size(),{width:500,height:350});await s.run('await tab.viewport.reset();');assert.deepEqual(await size(),original);
    await s.run('await viewport.set({width:640,height:360});');await s.manager.stop('test');assert.deepEqual(await size(),original);assert.equal(s.page.isClosed(),false);
  });
  test(backend+' full-page screenshot preserves an owned viewport and returns complete document pixels',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);
    for(const owned of [false,true]){
    if(owned)await s.run('await tab.viewport.set({width:800,height:600});');
    await s.page.reload();await s.page.evaluate(()=>scrollTo(100,80));
    const before=await s.driver.send('Page.getLayoutMetrics'),result=await s.run('await nodeRepl.emitImage(await tab.screenshot({fullPage:true}));');
    const block=result.blocks.find(block=>block.type==='image'),meta=await sharp(Buffer.from(block.data,'base64')).metadata();assert.equal(meta.width,Math.ceil(before.cssContentSize.width));assert.equal(meta.height,Math.ceil(before.cssContentSize.height));
    assert.deepEqual((await s.driver.send('Page.getLayoutMetrics')).cssVisualViewport,before.cssVisualViewport);
    assert.deepEqual((await s.driver.send('Page.getLayoutMetrics')).cssLayoutViewport,before.cssLayoutViewport);
    const image=await sharp(Buffer.from(block.data,'base64')).resize(Math.round(meta.width/2),Math.round(meta.height/2)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x=0,y=0,n=0;
    for(let i=0;i<image.data.length;i+=4)if(image.data[i]>150&&image.data[i+1]<100&&image.data[i+2]<120){x+=(i/4)%image.info.width;y+=Math.floor(i/4/image.info.width);n++;}assert.ok(n>30);
    const frames=new Map([[JSON.stringify(['tab',s.tab.browserId,s.tab.id]),{...block.capture,previewWidth:image.info.width,previewHeight:image.info.height}]]);
    const clicked=await s.manager.execute('test',`await tab.click([${x/n},${y/n}]);`,{coordinateFrames:frames});assert.equal(clicked.error,undefined);assert.equal(await s.page.evaluate(()=>geometryFixture.redHit),true);
    const rejected=await s.manager.execute('test',`await tab.click([20,${meta.height-10}]);`);assert.match(rejected.error?.message??'',/outside the visible viewport/);
    }
  });
  test(backend+' viewport reset failure still releases the control connection',{timeout:15000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);await s.run('await tab.viewport.set({width:800,height:600});');
    const send=s.record.cdp.send.bind(s.record.cdp);s.record.cdp.send=(method,...args)=>method==='Emulation.clearDeviceMetricsOverride'?Promise.reject(new Error('fixture reset failure')):send(method,...args);
    await assert.rejects(s.manager.stop('test'),/fixture reset failure/);
    assert.equal(s.browser.connections.has('test'),false);assert.equal(s.page.isClosed(),false);
    if(backend==='extension')assert.equal(s.browser.entries.size,0);
  });
}
