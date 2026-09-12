import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { ExtensionHub } from '../src/computer-use/extension-hub.mjs';
import { NativeMessageReader, encodeNativeMessage } from '../src/computer-use/native-messaging.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

async function until(fn, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(25); }
  throw new Error('Extension test condition timed out');
}

test('native messaging handles fragmented Unicode, multiple frames and incomplete/oversized input', () => {
  const messages = [{ text: '中文 🧭' }, { value: 'bytes'.repeat(50000) }, { done: true }], received = [];
  const reader = new NativeMessageReader(message => received.push(message));
  const stream = Buffer.concat(messages.map(message => encodeNativeMessage(message)));
  for (let offset = 0; offset < stream.length; offset += 17) reader.push(stream.subarray(offset, offset + 17));
  reader.end(); assert.deepEqual(received, messages);
  const multiple = []; new NativeMessageReader(message => multiple.push(message)).push(stream); assert.deepEqual(multiple, messages);
  const partial = new NativeMessageReader(() => {}); partial.push(stream.subarray(0, 5)); assert.throws(() => partial.end(), /inside a frame/);
  assert.throws(() => new NativeMessageReader(() => {}, 4).push(stream.subarray(0,4)), /message length/);
  assert.throws(() => encodeNativeMessage({value:'x'.repeat(1024 * 1024)}), /exceeds/);
});

test('real Chrome extension: native messaging, targeted input, popup stop and connection loss', { timeout: 60000, skip: process.platform === 'win32' && 'Needs a Windows native messaging host installer' }, async t => {
  const root = await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'trisoul-ext-'));
  const profile = join(root, 'profile'), socketPath = join(root, 'bridge.sock');
  const hub = new ExtensionHub(socketPath); await hub.start();
  const fixture = await startFixture(); let context, popup, complete = false;
  t.after(async () => {
    if (!complete && popup && !popup.isClosed()) console.log('Extension popup:', await popup.locator('body').innerText());
    await context?.close(); await hub.close(); await fixture.close();
    if (!process.env.TRISOUL_CU_UI_ARTIFACTS) await rm(root, {recursive:true,force:true});
  });
  const extension = fileURLToPath(new URL('../browser-extension', import.meta.url));
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  const extensionId = createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32).split('').map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
  const origin = 'chrome-extension://' + extensionId + '/';
  const launcher = join(root, 'native-host'), host = fileURLToPath(new URL('../scripts/computer-use-extension-host.mjs', import.meta.url));
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  await writeFile(launcher, '#!/bin/sh\nexec '+[process.execPath,host,'--socket',socketPath,'--extension-origin',origin].map(quote).join(' ')+' "$@"\n', {mode:0o700});
  const hostDirectory = join(profile,'NativeMessagingHosts'); await mkdir(hostDirectory,{recursive:true});
  await writeFile(join(hostDirectory,'ai.trisoul.computer_use.json'), JSON.stringify({name:'ai.trisoul.computer_use',description:'Isolated Trisoul extension test',path:launcher,type:'stdio',allowed_origins:[origin]}));
  // Playwright's mock keychain belongs only to this disposable, login-free
  // fixture profile. A real user's browser is never launched or replaced here.
  context = await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  context.on('dialog',()=>{});
  popup = await context.newPage(); await popup.goto(origin+'popup.html');
  const connected = await until(()=>hub.list()[0]);
  await popup.getByText('已连接 Oh My DSH',{exact:true}).waitFor();
  const page = await context.newPage(); await page.goto(fixture.url);
  await page.evaluate(()=>localStorage.setItem('extension-fixture','keep-existing-session'));
  const tabs = await hub.call(connected.id,'tabs.list'); const tab = tabs.find(value=>value.url===fixture.url+'/'); assert.ok(tab);
  const tabId = Number(tab.id), leaseId = randomUUID();
  await assert.rejects(hub.call(connected.id,'attach',{tabId,leaseId:randomUUID(),expected:{...tab,title:'stale title'}}),error=>error.code==='STALE_TAB');
  const attached = await hub.call(connected.id,'attach',{tabId,leaseId,expected:tab}); assert.ok(attached.targetId);
  await assert.rejects(hub.call(connected.id,'attach',{tabId,leaseId:randomUUID()}),error=>error.code==='TAB_BUSY');
  const command = (method,params={}) => hub.call(connected.id,'command',{tabId,leaseId,method,params});
  const ax = await command('Accessibility.getFullAXTree'); assert.ok(ax.nodes.some(node=>node.name?.value==='姓名'));
  const position = async locator => {const rect=await locator.boundingBox();return{x:rect.x+rect.width/2,y:rect.y+rect.height/2};};
  const click = async locator => {const point=await position(locator);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});};
  await click(page.getByLabel('姓名',{exact:true})); await command('Input.insertText',{text:'已有浏览器 中文 🧭'});
  await click(page.getByRole('button',{name:'保存',exact:true}));
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'已有浏览器 中文 🧭');
  assert.equal(await page.evaluate(()=>fixtureEvents.at(-1).value.name),'已有浏览器 中文 🧭');
  const screenshot = await command('Page.captureScreenshot',{format:'png'});
  assert.equal(Buffer.from(screenshot.data,'base64').readUInt32BE(0),0x89504e47);
  await assert.rejects(command('Target.attachToTarget',{targetId:'unclaimed-target',flatten:true}),error=>error.code==='STALE_TARGET');
  await command('Page.enable');
  let dialogSeen=false;
  const dialogEvent=event=>{if(event.params?.leaseId===leaseId&&event.params?.method==='Page.javascriptDialogOpening')dialogSeen=true;};
  hub.on('event',dialogEvent); t.after(()=>hub.off('event',dialogEvent));
  const prompt=command('Runtime.evaluate',{expression:'prompt("Protocol dialog", "")',returnByValue:true}).catch(error=>error);
  await until(()=>dialogSeen);
  await hub.call(connected.id,'command',{tabId,leaseId,method:'Page.handleJavaScriptDialog',params:{accept:true,promptText:'弹窗并发回复'}},{timeoutMs:1000});
  assert.equal((await prompt).result.value,'弹窗并发回复','a protocol wait must not block the command that resolves its dialog');

  const point = await position(page.getByLabel('姓名',{exact:true}));
  await page.evaluate(()=>{window.extensionKeyUps=[];addEventListener('keyup',event=>extensionKeyUps.push(event.code));addEventListener('mouseup',event=>{window.extensionMouseUp={x:event.clientX,y:event.clientY};});});
  await command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8});
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
  await page.waitForFunction(()=>fixtureMouseHeld);
  const stoppedAt={x:point.x+25,y:point.y+4};
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,...stoppedAt});
  const pending = command('Runtime.evaluate',{expression:'new Promise(resolve=>{window.extensionTestResolve=resolve;window.extensionTestPending=true})',awaitPromise:true}).catch(error=>error);
  await page.waitForFunction(()=>window.extensionTestPending===true);
  const queued = pending.then(()=>command('Input.insertText',{text:'MUST_NOT_BE_INSERTED'})).catch(error=>error);
  await popup.getByRole('button',{name:'停止',exact:true}).click();
  await page.waitForFunction(()=>!fixtureMouseHeld);
  await page.waitForFunction(()=>extensionKeyUps.includes('ShiftLeft'));
  const releasedAt=await page.evaluate(()=>extensionMouseUp);
  assert.equal(releasedAt.x,Math.floor(stoppedAt.x));assert.equal(releasedAt.y,Math.floor(stoppedAt.y));
  assert.ok((await queued) instanceof Error,'queued input must be rejected after popup stop'); await pending;
  await assert.rejects(command('Input.insertText',{text:'STALE_LEASE'}),error=>error.code==='CONTROL_STOPPED');
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'已有浏览器 中文 🧭');
  assert.equal(await page.evaluate(()=>localStorage.getItem('extension-fixture')),'keep-existing-session');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS){await popup.screenshot({path:join(root,'extension-stopped.png')});}

  const independent = await context.newPage(); await independent.goto(fixture.url+'/other');
  const independentTab = (await hub.call(connected.id,'tabs.list')).find(item=>item.url===fixture.url+'/other');
  const independentLease = randomUUID();
  await hub.call(connected.id,'attach',{tabId:Number(independentTab.id),leaseId:independentLease,expected:independentTab});
  const independentCommand = (method,params={})=>hub.call(connected.id,'command',{tabId:Number(independentTab.id),leaseId:independentLease,method,params});
  const independentPoint = await position(independent.getByLabel('姓名',{exact:true}));
  await independentCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...independentPoint});
  await independentCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...independentPoint});
  let resumed = randomUUID(); await hub.call(connected.id,'attach',{tabId,leaseId:resumed,expected:tab});
  await hub.call(connected.id,'command',{tabId,leaseId:resumed,method:'Input.dispatchMouseEvent',params:{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point}});
  const cancel = new AbortController();
  const cancelling = hub.call(connected.id,'command',{tabId,leaseId:resumed,method:'Runtime.evaluate',params:{expression:'new Promise(resolve=>{window.extensionCancelPending=true})',awaitPromise:true}},{signal:cancel.signal}).catch(error=>error);
  await page.waitForFunction(()=>window.extensionCancelPending);
  const cancelledQueue = cancelling.then(()=>hub.call(connected.id,'command',{tabId,leaseId:resumed,method:'Input.insertText',params:{text:'CANCELLED_QUEUE'}},{signal:cancel.signal})).catch(error=>error);
  cancel.abort(new Error('Stop this conversation'));
  assert.match((await cancelling).message,/Stop this conversation/); assert.ok((await cancelledQueue) instanceof Error);
  assert.equal(await page.evaluate(()=>fixtureMouseHeld),false,'cancellation returns only after the input release acknowledgement');
  assert.equal(hub.list().length,1,'cancelling one tab must keep the browser connection alive');
  await independentCommand('Input.insertText',{text:'其他会话仍可操作'});
  assert.equal(await independent.getByLabel('姓名',{exact:true}).inputValue(),'其他会话仍可操作');
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'已有浏览器 中文 🧭');
  const extensionWorker = context.serviceWorkers().find(worker=>worker.url()===origin+'worker.js'); assert.ok(extensionWorker);
  resumed = randomUUID(); await hub.call(connected.id,'attach',{tabId,leaseId:resumed,expected:tab});
  await hub.call(connected.id,'command',{tabId,leaseId:resumed,method:'Input.dispatchMouseEvent',params:{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point}});
  await extensionWorker.evaluate(tabId=>{
    const send=chrome.debugger.sendCommand;let injected=false;
    globalThis.restoreExtensionSend=()=>{chrome.debugger.sendCommand=send;};
    chrome.debugger.sendCommand=async(target,method,params)=>{
      if(target.tabId===tabId&&method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&!injected){injected=true;throw new Error('Fixture input release failure');}
      return send.call(chrome.debugger,target,method,params);
    };
  },tabId);
  await assert.rejects(hub.call(connected.id,'detach',{tabId,leaseId:resumed}),error=>error.code==='INPUT_RELEASE_FAILED');
  await popup.getByRole('button',{name:'重试停止',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>fixtureMouseHeld),true,'a failed release must remain a visible failure');
  await independentCommand('Input.insertText',{text:' · 未中断'});
  assert.equal(await independent.getByLabel('姓名',{exact:true}).inputValue(),'其他会话仍可操作 · 未中断');
  await extensionWorker.evaluate(()=>globalThis.restoreExtensionSend());
  await popup.getByRole('button',{name:'重试停止',exact:true}).click();
  await page.waitForFunction(()=>!fixtureMouseHeld);
  assert.deepEqual(await hub.call(connected.id,'detach',{tabId,leaseId:resumed}),{released:true},'a repeated stop reuses its confirmed terminal acknowledgement');
  await hub.call(connected.id,'detach',{tabId:Number(independentTab.id),leaseId:independentLease});
  resumed = randomUUID(); await hub.call(connected.id,'attach',{tabId,leaseId:resumed,expected:tab});
  await hub.call(connected.id,'command',{tabId,leaseId:resumed,method:'Input.dispatchMouseEvent',params:{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point}});
  await page.waitForFunction(()=>fixtureMouseHeld);
  await hub.close();
  await page.waitForFunction(()=>!fixtureMouseHeld);
  await popup.getByText('未连接',{exact:true}).waitFor();
  assert.equal(page.isClosed(),false,'loss of the host must keep the existing user tab open');
  assert.equal(await page.evaluate(()=>localStorage.getItem('extension-fixture')),'keep-existing-session');
  if(process.env.TRISOUL_CU_UI_ARTIFACTS){await popup.screenshot({path:join(root,'extension-disconnected.png')});console.log('Extension UI artifacts:',root);}
  await hub.start();
  await popup.getByRole('button',{name:'连接 Oh My DSH',exact:true}).click();
  const reconnected = await until(()=>hub.list()[0]);
  assert.equal(reconnected.id,connected.id,'profile identity survives reconnect');
  assert.notEqual(reconnected.epoch,connected.epoch,'every connection has a new lifetime identity');
  await assert.rejects(hub.call(reconnected.id,'command',{tabId,leaseId:resumed,method:'Input.insertText',params:{text:'OLD_CONNECTION'}}),error=>error.code==='CONTROL_STOPPED');
  const latest = randomUUID(); await hub.call(reconnected.id,'attach',{tabId,leaseId:latest,expected:tab});
  await popup.getByRole('button',{name:'停止',exact:true}).waitFor();
  if(process.env.TRISOUL_CU_UI_ARTIFACTS){
    await popup.setViewportSize({width:320,height:260}); await popup.screenshot({path:join(root,'extension-connected-light.png')});
    await popup.emulateMedia({colorScheme:'dark'}); await popup.screenshot({path:join(root,'extension-connected-dark.png')});
  }
  // Chrome does not promise an onDetach notification for our own API detach.
  // A missing notification must not leave a phantom controller in the popup;
  // the failed protocol request invalidates its lease without auto-reattaching.
  const worker = context.serviceWorkers().find(worker=>worker.url()===origin+'worker.js'); assert.ok(worker);
  await worker.evaluate(tabId=>chrome.debugger.detach({tabId}),tabId);
  await assert.rejects(hub.call(reconnected.id,'command',{tabId,leaseId:latest,method:'Input.insertText',params:{text:'AFTER_CANCEL'}}),error=>error.code==='CONTROL_STOPPED');
  await popup.getByRole('button',{name:'停止',exact:true}).waitFor({state:'detached'});
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'已有浏览器 中文 🧭');
  await worker.evaluate(tabId=>{
    const get=chrome.tabs.get;
    globalThis.extensionLookupStarted=false;globalThis.extensionLookupFinished=false;
    globalThis.restoreExtensionLookup=()=>{chrome.tabs.get=get;};
    chrome.tabs.get=async id=>{
      if(id===tabId){globalThis.extensionLookupStarted=true;await new Promise(resolve=>setTimeout(resolve,250));globalThis.extensionLookupFinished=true;}
      return get.call(chrome.tabs,id);
    };
  },tabId);
  const selecting = hub.call(reconnected.id,'attach',{tabId,leaseId:randomUUID(),expected:tab}).catch(error=>error);
  await until(()=>worker.evaluate(()=>globalThis.extensionLookupStarted));
  await hub.close();
  assert.ok((await selecting) instanceof Error);
  await until(()=>worker.evaluate(()=>globalThis.extensionLookupFinished));
  const attachedAfterDisconnect = await worker.evaluate(async tabId=>{
    globalThis.restoreExtensionLookup();
    try{await chrome.debugger.sendCommand({tabId},'Target.getTargetInfo');return true;}catch{return false;}
  },tabId);
  assert.equal(attachedAfterDisconnect,false,'disconnect during target lookup must prevent a late debugger attachment');
  complete = true;
});
