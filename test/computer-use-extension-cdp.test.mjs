import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { ExtensionCdp } from '../src/computer-use/extension-cdp.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';

test('scoped extension CDP: real Playwright, independent observers, dialogs and input release', {timeout:60000,skip:process.platform==='win32'&&'Needs a Windows native messaging host installer'}, async t=>{
  let gateway,model,observer;
  const env=await extensionFixture(t),page=await env.context.newPage();await page.goto(env.fixture.url);
  const unrelated=await env.context.newPage();await unrelated.goto(env.fixture.url+'/unrelated');
  const tab=(await env.hub.call(env.browser.id,'tabs.list')).find(tab=>tab.url===env.fixture.url+'/');
  gateway=new ExtensionCdp(env.hub,env.browser.id,tab);
  await gateway.start();
  const modelId=randomUUID();
  try{
    model=await chromium.connectOverCDP(gateway.endpointFor(modelId),{noDefaults:true,timeout:15000});
    model.contexts()[0].on('dialog',()=>{});
    assert.equal(model.contexts()[0].pages().length,1,'only the explicitly selected tab is exposed');
    const controlled=model.contexts()[0].pages()[0];
    const rejectedSocket=options=>new Promise((resolve,reject)=>{
      const socket=new WebSocket(gateway.endpoint,options);
      socket.once('open',()=>{socket.terminate();reject(new Error('Untrusted CDP upgrade was accepted'));});
      socket.once('error',()=>resolve());
    });
    await rejectedSocket({origin:env.fixture.url});
    await rejectedSocket({headers:{Host:'untrusted.example'}});
    await controlled.getByLabel('姓名',{exact:true}).fill('Playwright 扩展 中文 🧭');
    await controlled.getByRole('button',{name:'保存',exact:true}).click();
    assert.equal(await page.evaluate(()=>fixtureEvents.at(-1).value.name),'Playwright 扩展 中文 🧭');
    await controlled.frameLocator('iframe').getByLabel('框架输入').fill('真实 iframe');
    assert.equal(await page.frameLocator('iframe').getByLabel('框架输入').inputValue(),'真实 iframe');
    const cdp=await controlled.context().newCDPSession(controlled);
    await cdp.send('Page.enable');
    const {targetInfo}=await cdp.send('Target.getTargetInfo');assert.equal(targetInfo.targetId,gateway.targetInfo.targetId);
    const outside=await unrelated.context().newCDPSession(unrelated);
    const outsideInfo=await outside.send('Target.getTargetInfo');await outside.detach();
    const rootSession=await model.newBrowserCDPSession();
    await assert.rejects(rootSession.send('Target.attachToTarget',{targetId:outsideInfo.targetInfo.targetId,flatten:true}),/outside this browser connection/);
    const ax=await cdp.send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(node=>node.name?.value==='姓名'));
    observer=await chromium.connectOverCDP(gateway.endpoint,{noDefaults:true,timeout:15000});
    observer.contexts()[0].on('dialog',()=>{});
    const observed=observer.contexts()[0].pages()[0];
    assert.equal(await observed.getByLabel('姓名',{exact:true}).inputValue(),'Playwright 扩展 中文 🧭');
    await controlled.goto(env.fixture.url+'/cross-frames');
    const outer=controlled.frameLocator('iframe[title="跨源外层"]'),inner=outer.frameLocator('iframe[title="跨源内层"]');
    await outer.getByLabel('外层输入').fill('外层实际输入');await inner.getByLabel('框架输入').fill('内层实际输入');
    assert.equal(await observed.frameLocator('iframe[title="跨源外层"]').frameLocator('iframe[title="跨源内层"]').getByLabel('框架输入').inputValue(),'内层实际输入');
    assert.ok([...gateway.native.values()].some(native=>native.info.type==='iframe'),'the fixture must exercise real out-of-process frame targets');
    const innerFrame=controlled.frames().find(frame=>frame.url().endsWith('/cross-middle'));
    const frameSession=await controlled.context().newCDPSession(innerFrame);
    const frameAx=await frameSession.send('Accessibility.getFullAXTree');assert.ok(frameAx.nodes.some(node=>node.name?.value==='外层输入'));
    const lateId=randomUUID();const late=await chromium.connectOverCDP(gateway.endpointFor(lateId),{noDefaults:true,timeout:15000});
    try{assert.equal(await late.contexts()[0].pages()[0].frameLocator('iframe[title="跨源外层"]').frameLocator('iframe[title="跨源内层"]').getByLabel('框架输入').inputValue(),'内层实际输入');}
    finally{await late.close();await gateway.closeClientById(lateId);}
    await controlled.goto(env.fixture.url);
    await assert.rejects(frameSession.send('Runtime.evaluate',{expression:'1'}),/closed|detached/i);
    assert.equal([...gateway.native.values()].filter(native=>native.info.type==='iframe').length,0,'old native frame targets must leave discovery too');
    await controlled.getByLabel('姓名',{exact:true}).fill('Playwright 扩展 中文 🧭');
    const dialogReady=observed.waitForEvent('dialog',{timeout:5000});
    const clicking=controlled.getByRole('button',{name:'打开对话框',exact:true}).click({timeout:5000});
    const dialog=await dialogReady;await dialog.accept('观察连接回答弹窗');await clicking;
    await page.waitForFunction(()=>fixtureEvents.at(-1)?.value==='观察连接回答弹窗');
    await controlled.getByLabel('姓名',{exact:true}).click();await controlled.mouse.down();
    await page.waitForFunction(()=>fixtureMouseHeld);
    const worker=env.context.serviceWorkers().find(worker=>worker.url()===env.origin+'worker.js');
    await worker.evaluate(tabId=>{
      const send=chrome.debugger.sendCommand;
      globalThis.restoreActorRelease=()=>{chrome.debugger.sendCommand=send;};
      chrome.debugger.sendCommand=async(target,method,params)=>{
        if(target.tabId===tabId&&method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'){throw new Error('Fixture actor release failure');}
        return send.call(chrome.debugger,target,method,params);
      };
    },Number(tab.id));
    await model.close();model=null;
    await assert.rejects(gateway.closeClientById(modelId),/Input release was not confirmed/);
    assert.equal(await page.evaluate(()=>fixtureMouseHeld),true);
    assert.equal(await observed.getByLabel('姓名',{exact:true}).inputValue(),'Playwright 扩展 中文 🧭');
    await worker.evaluate(()=>globalThis.restoreActorRelease());
    await gateway.closeClientById(modelId);
    assert.equal(await page.evaluate(()=>fixtureMouseHeld),false,'closing the controller releases its held input');
    assert.equal(await observed.getByLabel('姓名',{exact:true}).inputValue(),'Playwright 扩展 中文 🧭','the independent observer remains connected');
    const image=await observed.screenshot();assert.equal(image.readUInt32BE(0),0x89504e47);
    assert.equal(unrelated.isClosed(),false);
    assert.deepEqual(gateway.failures,[{method:'Target.attachToTarget',message:'Target is outside this browser connection'}]);
  }catch(error){console.log('Extension CDP failures:',gateway.failures);throw error;}
  finally{
    const closed=await Promise.allSettled([model?.close(),observer?.close()]);
    const gatewayClosed=await Promise.allSettled([gateway.close()]);
    const errors=[...closed,...gatewayClosed].filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'CDP fixture cleanup failed');
  }
});
