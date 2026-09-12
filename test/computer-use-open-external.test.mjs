import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {externalWebUrl,openExternalUrl} from '../src/computer-use/open-external.mjs';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';

test('system URL openers use argument arrays and a literal Windows URL, never a shell command',async()=>{
  const calls=[],run=async(...args)=>{calls.push(args);},url="https://example.org/?q=';$(bad)&percent=%25#中文";
  await openExternalUrl(url,{platform:'darwin',run});assert.equal(calls[0][0],'/usr/bin/open');assert.deepEqual(calls[0][1],[externalWebUrl(url)]);assert.equal(calls[0][2].shell,undefined);
  await openExternalUrl(url,{platform:'win32',run});assert.equal(calls[1][0],'powershell.exe');assert.equal(calls[1][1][2],'-EncodedCommand');
  const script=Buffer.from(calls[1][1][3],'base64').toString('utf16le');assert.equal(script,"$ErrorActionPreference='Stop';Start-Process -FilePath '"+externalWebUrl(url).replaceAll("'","''")+"'");
  await openExternalUrl(url,{platform:'linux',env:{},run});assert.deepEqual(calls[2].slice(0,2),['xdg-open',[externalWebUrl(url)]]);
  await openExternalUrl(url,{platform:'linux',env:{WSL_DISTRO_NAME:'fixture'},run});assert.equal(calls[3][0],'powershell.exe');
  for(const url of ['file:///tmp/test.html','javascript:alert(1)','about:blank','data:text/html,test','custom:launch'])await assert.rejects(openExternalUrl(url,{run}));
  const controller=new AbortController();controller.abort();await assert.rejects(openExternalUrl('https://example.org',{signal:controller.signal,run}));assert.equal(calls.length,4);
  await assert.rejects(openExternalUrl(url,{platform:'darwin',run:async()=>{throw Object.assign(new Error('command failed: '+url),{code:'ENOENT'});}}),error=>error.message.includes('默认浏览器')&&!error.message.includes(url));
});

test('external opening uses the selected URL and preserves model control, rejecting changed and foreign targets',async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-open-external-')),opened=[];
  const manager=new ComputerUseManager(root,{native:{binary:join(root,'missing')},openExternal:async url=>opened.push(url)});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  const state=manager.session('owner'),model={id:'model',kind:'tab',browserId:'browser',url:'https://model.example/'},view={id:'view',kind:'tab',browserId:'browser',url:'https://view.example/page'};
  state.target=model;state.viewTarget=view;state.previewTargets.set(view.id,{target:view});state.status='running';state.controlEpoch=7;
  manager.browser.records.set(model.id,model);manager.browser.records.set(view.id,view);manager.browser.claim('owner',view.id);
  const result=await manager.openViewedExternally('owner',{tabId:view.id,expectedUrl:view.url});assert.deepEqual(opened,[view.url]);assert.equal(result.target.id,model.id);assert.equal(result.status,'running');assert.equal(result.controlEpoch,7);
  await assert.rejects(manager.openViewedExternally('owner',{tabId:model.id,expectedUrl:model.url}),/查看的网页已改变/);
  await assert.rejects(manager.openViewedExternally('owner',{tabId:view.id,expectedUrl:'https://view.example/old'}),/地址已改变/);
  await assert.rejects(manager.openViewedExternally('foreign',{tabId:view.id,expectedUrl:view.url}),/查看的网页已改变/);
  manager.browser.owners.set(view.id,{sessionId:'foreign'});await assert.rejects(manager.openViewedExternally('owner',{tabId:view.id,expectedUrl:view.url}),/其他对话/);assert.equal(opened.length,1);
});
