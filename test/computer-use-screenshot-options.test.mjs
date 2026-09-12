import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import sharp from 'sharp';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
import {extensionFixture} from './fixtures/computer-use/extension.mjs';
import {startFixture} from './fixtures/computer-use/server.mjs';
import {panViewport} from './fixtures/computer-use/viewport.mjs';

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
test('a cancelled queued capture never reaches Chromium and does not poison later captures',{timeout:30000},async t=>{
  const s=await setup(t,'managed'),capture=s.browser.capture.bind(s.browser);
  let entered,release,count=0;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  s.browser.capture=async(...args)=>{count++;if(count===1){entered();await gate;}return capture(...args);};
  const controller=new AbortController();
  const first=s.browser.observeScreenshot(s.record,{});first.catch(()=>{});
  try{
    await started;
    const second=s.browser.observeScreenshot(s.record,{},controller.signal);
    const rejected=assert.rejects(second,/cancelled queued capture/);
    controller.abort(new Error('cancelled queued capture'));
    let timer;
    try{await Promise.race([rejected,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Cancellation waited for the preceding screenshot')),500);})]);}
    finally{clearTimeout(timer);}
    const third=s.browser.observeScreenshot(s.record,{});third.catch(()=>{});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(count,1,'cancellation must not unlock the preceding capture');
    release();await Promise.all([first,third]);assert.equal(count,2);
  }finally{release();s.browser.capture=capture;}
});
test('headless screenshot rendering retains nested scrolling',{timeout:15000},async t=>{
  const s=await setup(t,'managed');
  await s.page.setContent('<style>body{margin:0}section{width:240px;height:160px;overflow:auto}section div{height:1200px;background:linear-gradient(white,blue)}</style><section tabindex="0" role="region" aria-label="Nested"><div>Scrollable content</div></section>');
  await s.run("await tab.getScreenshot();await tab.scroll([100,70],'down',0.25);");
  await s.page.waitForFunction(()=>document.querySelector('section').scrollTop>0,{},{timeout:3000});
  assert.equal(await s.page.evaluate(()=>scrollY),0,'wheel input must scroll the nested region, not the outer page');
  const afterWheel=await s.page.locator('section').evaluate(element=>element.scrollTop);
  await s.run("await tab.playwright.getByRole('region',{name:'Nested'}).press('PageDown');");
  await s.page.waitForFunction(previous=>document.querySelector('section').scrollTop>previous,afterWheel,{timeout:3000});
});
for(const backend of ['managed','extension']){
  test(backend+' concurrent captures across CDP observers preserve the live viewport',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);
    await s.page.setViewportSize({width:800,height:600});
    await s.page.addStyleTag({content:'html{overflow:scroll}::-webkit-scrollbar{width:15px;height:15px}::-webkit-scrollbar-thumb{background:#777}'});
    await s.page.evaluate(()=>scrollTo(100,80));
    const observer=await s.browser.target('capture-observer',s.tab.id,{claim:false});
    assert.notEqual(observer.cdp,s.record.cdp);
    const before=await s.driver.send('Page.getLayoutMetrics');
    const results=await Promise.all([
      s.browser.observeScreenshot(s.record,{fullPage:true}),
      s.browser.observeScreenshot(observer,{fullPage:true}),
      s.browser.observeScreenshot(observer,{}),
    ]);
    const after=await s.driver.send('Page.getLayoutMetrics');
    assert.deepEqual(after.cssVisualViewport,before.cssVisualViewport);
    assert.deepEqual(after.cssLayoutViewport,before.cssLayoutViewport);
    for(const result of results.slice(0,2)){
      const meta=await sharp(Buffer.from(result.screenshot,'base64')).metadata();
      assert.equal(meta.width,Math.ceil(before.cssContentSize.width));
      assert.equal(meta.height,Math.ceil(before.cssContentSize.height));
    }
    assert.equal(results[2].screenshotFrame.width,before.cssVisualViewport.clientWidth);
  });
  test(backend+' cropped screenshot preserves pinch/pan and maps emitted image coordinates',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);await s.page.setViewportSize({width:1280,height:720});await s.driver.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
    await panViewport(s.driver);
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
    const restored=async()=>{
      // The debugger acknowledgement and renderer resize are separate IPC
      // messages. Require the actual restored dimensions, not just the reply.
      const deadline=Date.now()+1000;let actual;
      do{actual=await size();if(actual.width===original.width&&actual.height===original.height)return;await delay(20);}while(Date.now()<deadline);
      t.diagnostic(JSON.stringify({backend,original,actual,metrics:await s.driver.send('Page.getLayoutMetrics')}));assert.deepEqual(actual,original);
    };
    await s.run("const viewport=await browser.capabilities.get('viewport');await viewport.set({width:420,height:310});");assert.deepEqual(await size(),{width:420,height:310});
    await s.run('const next=await browser.tabs.new();await next.markDeliverable();');const next=s.manager.status('test').target,record=await s.browser.target('test',next.id);
    assert.deepEqual(await record.page.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:420,height:310});
    await s.run(`await cua.createBrowserTab(browser.browserId,${JSON.stringify(s.fixture.url+'/geometry')});`);const loaded=s.manager.status('test').target,loadedRecord=await s.browser.target('test',loaded.id);
    assert.deepEqual(await loadedRecord.page.evaluate(()=>geometryFixture.viewportAtLoad),{width:420,height:310},'viewport applies before page scripts execute');
    await s.run('await viewport.reset();');await restored();
    await s.run('await tab.viewport.set({width:500,height:350});');assert.deepEqual(await size(),{width:500,height:350});await s.run('await tab.viewport.reset();');await restored();
    await s.run('await viewport.set({width:640,height:360});');await s.manager.stop('test');await restored();assert.equal(s.page.isClosed(),false);
  });
  test(backend+' full-page screenshot preserves an owned viewport and returns complete document pixels',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
    const s=await setup(t,backend);
    for(const owned of [false,true]){
    if(owned)await s.run('await tab.viewport.set({width:800,height:600});');
    await s.page.reload();await s.page.evaluate(()=>{scrollTo(100,80);const context=document.querySelector('canvas').getContext('2d');context.fillStyle='rgb(0,255,0)';context.fillRect(1750,1550,50,50);});
    const before=await s.driver.send('Page.getLayoutMetrics');let result;
    try{result=await s.run('await nodeRepl.emitImage(await tab.screenshot({fullPage:true}));');}
    catch(error){t.diagnostic(JSON.stringify({backend,owned,before,after:await s.driver.send('Page.getLayoutMetrics')}));throw error;}
    const block=result.blocks.find(block=>block.type==='image'),meta=await sharp(Buffer.from(block.data,'base64')).metadata();assert.equal(meta.width,Math.ceil(before.cssContentSize.width));assert.equal(meta.height,Math.ceil(before.cssContentSize.height));
    const bottom=await sharp(Buffer.from(block.data,'base64')).extract({left:1760,top:1560,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...bottom],[0,255,0],'full-page output must render actual offscreen pixels, not padded viewport pixels');
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
