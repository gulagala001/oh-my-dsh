import test from'node:test';import assert from'node:assert/strict';import{createServer}from'node:http';
import{mkdtemp,writeFile,rm}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{chromium}from'playwright';import sharp from'sharp';
import{ComputerUseManager}from'../src/computer-use/manager.mjs';import{extensionFixture}from'./fixtures/computer-use/extension.mjs';
import{pointInPolygon,compareAnnotationPaint}from'../src/computer-use/annotation-geometry.mjs';

for(const backend of ['managed','extension'])test(backend+': nested frame annotations follow real pixels, clipping, stacking and frame-specific styles',{timeout:30000},async t=>{
  const server=createServer((req,res)=>{const port=server.address().port;res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url.startsWith('/inner')?`<style>body{margin:0;height:900px}button{position:absolute;left:30px;top:50px;width:160px;height:40px;border:0;padding:0;background:rgb(20,100,200)}#below{top:700px}</style><button id="target" aria-label="框架目标"></button><button id="below"></button><script>window.clicks=0;onclick=()=>clicks++</script>`:req.url.startsWith('/outer')?`<style>body{margin:0}</style><iframe id="nested" title="内部框架" style="position:absolute;left:22px;top:24px;border:5px solid;padding:2px;width:400px;height:230px" src="http://127.0.0.1:${port}/inner"></iframe>`:`<style>body{margin:0}iframe{position:absolute}#cross{left:100px;top:80px;border:7px solid;padding:5px;width:500px;height:320px;transform:rotate(8deg) scale(.9);transform-origin:0 0}#same{left:750px;top:70px;width:350px;height:300px;border:3px solid}#cover{display:none;position:fixed;z-index:999;background:rgb(200,20,40)}</style><iframe id="cross" title="跨源外层" src="http://localhost:${port}/outer"></iframe><iframe id="same" title="同源外层" src="/outer"></iframe><iframe style="display:none" src="/inner"></iframe><div id="cover"></div>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fixture={url:'http://127.0.0.1:'+server.address().port};
  const cleanups=[];let close;
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-frame-annotation-')),external=backend==='extension'?await extensionFixture({after:fn=>cleanups.push(fn)},{fixture}):null,launcher=join(root,'browser'),quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  if(process.platform==='darwin')await writeFile(launcher,'#!/bin/sh\nexec '+quote(chromium.executablePath())+' --use-mock-keychain "$@"\n',{mode:0o700});
  const manager=new ComputerUseManager(root,{...(external?{extensionHub:external.hub}:{}),browser:process.platform==='darwin'?{executablePath:launcher}:{},native:{binary:join(root,'missing')}});
  t.after(async()=>{await close?.();await manager.close();for(const cleanup of cleanups)await cleanup();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const tab=await manager.dispatch('frames','createBrowserTab',[external?.browser.id??'browser',fixture.url]);let actor,frame;
  close=await manager.watchBrowser('frames',tab.id,(type,value)=>{if(type==='ready')actor=value.actor;if(type==='frame')frame=value;});
  for(let i=0;i<100&&!frame;i++)await new Promise(r=>setTimeout(r,20));assert.ok(frame);
  const views=manager.viewsFor(manager.status('frames').target),view=views.views.get(tab.id),page=view.record.page;
  // The test observer owns this viewport. A model-owned viewport is correctly
  // removed by Stop and would make the pre-stop annotation stale.
  await view.cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const cross=await(await page.locator('#cross').elementHandle()).contentFrame(),inner=await(await cross.locator('#nested').elementHandle()).contentFrame();await inner.evaluate(()=>scrollTo(0,20));
  const input=()=>({actor,tabId:tab.id,controlEpoch:manager.status('frames').controlEpoch}),capture=()=>manager.annotationSnapshot('frames',input());
  const started=performance.now(),snapshot=await capture();console.log(backend+' frame capture ms:',Math.round(performance.now()-started));
  const targets=snapshot.elements.filter(e=>e.id==='target');assert.equal(targets.length,2,'same-named controls in both visible frame branches are retained, hidden frame is excluded');
  const selected=targets.find(e=>e.framePath[0].id==='cross');assert.ok(selected);assert.equal(selected.framePath.length,2);assert.ok(selected.polygon.some((p,i)=>Math.abs(p.y-selected.polygon[(i+1)%selected.polygon.length].y)>1e-3),'rotated frame produces a polygon');
  assert.equal(snapshot.elements.some(e=>e.id==='below'),false,'clip scrolled child content at the frame viewport');
  const center=e=>e.polygon.reduce((p,q)=>({x:p.x+q.x/e.polygon.length,y:p.y+q.y/e.polygon.length}),{x:0,y:0});
  const pixel=async(s,e)=>{const image=sharp(Buffer.from(s.frame.data,'base64')),meta=await image.metadata(),p=center(e);return[...await image.extract({left:Math.floor(p.x*meta.width),top:Math.floor(p.y*meta.height),width:1,height:1}).removeAlpha().raw().toBuffer()];};
  assert.deepEqual(await pixel(snapshot,selected),[20,100,200],'mapped center lands on actual colored pixels, including frame borders, padding, transform and child scroll');
  const pick=(s,p)=>s.elements.filter(e=>pointInPolygon(p,e.polygon)).sort(compareAnnotationPaint)[0];assert.equal(pick(snapshot,center(selected)).key,selected.key);
  const preview=await manager.annotationStylePreview('frames',{...input(),sourceFrameId:snapshot.frame.id,elementKey:selected.key,changes:{'background-color':'rgb(40, 180, 70)'}});
  assert.deepEqual(await pixel(preview,preview.element),[40,180,70]);assert.deepEqual(await pixel(preview,targets.find(e=>e.key!==selected.key)),[20,100,200],'the other same-named frame control is untouched');assert.equal(await inner.locator('#target').getAttribute('style'),null);assert.equal(await inner.evaluate(()=>clicks),0);
  const p=center(selected),g=snapshot.frame.geometry;await page.locator('#cover').evaluate((el,pos)=>{Object.assign(el.style,{display:'block',left:pos.x-40+'px',top:pos.y-30+'px',width:'80px',height:'60px'});},{x:p.x*g.width+g.offsetX,y:p.y*g.height+g.offsetY});
  const covered=await capture();assert.equal(pick(covered,p).id,'cover','an outer overlay must beat all child-frame paint orders');await page.locator('#cover').evaluate(el=>el.removeAttribute('style'));
  await view.cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});const zoomed=await capture(),zoomTarget=zoomed.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross');assert.deepEqual(await pixel(zoomed,zoomTarget),[20,100,200]);await view.cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  await page.evaluate(()=>{document.body.style.height='1800px';scrollTo(0,100);});const scrolled=await capture(),scrolledTarget=scrolled.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross');assert.equal(scrolled.frame.geometry.pageY,100);assert.ok(scrolledTarget);assert.deepEqual(await pixel(scrolled,scrolledTarget),[20,100,200],'document rows without CSS must not clip away all elements after scrolling');
  await inner.evaluate(()=>Object.defineProperty(window,'innerWidth',{value:1,configurable:true}));const spoofed=await capture();assert.deepEqual(await pixel(spoofed,spoofed.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross')),[20,100,200],'page globals cannot spoof frame geometry');await inner.evaluate(()=>delete window.innerWidth);
  await page.locator('#cross').evaluate(el=>el.style.transform='perspective(700px) rotateY(16deg) rotateZ(8deg) scale(.9)');const perspective=await capture(),perspectiveTarget=perspective.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross');assert.deepEqual(await pixel(perspective,perspectiveTarget),[20,100,200]);
  const beforeNavigation=await capture(),old=beforeNavigation.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross');await inner.goto(fixture.url+'/inner?changed');
  await assert.rejects(manager.annotationStylePreview('frames',{...input(),sourceFrameId:beforeNavigation.frame.id,elementKey:old.key,changes:{color:'red'}}),/改变/);
  const fresh=await capture(),next=fresh.elements.find(e=>e.id==='target'&&e.framePath[0].id==='cross');assert.ok(next);
  const observe=views.browser.observeScreenshot;let moved=false;views.browser.observeScreenshot=async(...args)=>{if(!moved){moved=true;await inner.goto(fixture.url+'/inner?during-preview');}return observe.apply(views.browser,args);};
  await assert.rejects(manager.annotationStylePreview('frames',{...input(),sourceFrameId:fresh.frame.id,elementKey:next.key,changes:{color:'red'}}));views.browser.observeScreenshot=observe;
  assert.equal(view.stylePreview,null,'child navigation does not leave an unrecoverable style lease');assert.equal(await inner.locator('#target').getAttribute('style'),null);
});
