import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('download panel has truthful progress, safe filenames, keyboard close and scoped polling',{timeout:10000},async t=>{
  const {outputFiles}=await build({bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserDownloads} from './src/client/browser-downloads.jsx';
    window.calls=[];window.items=[];const api=async(op,id,value,signal)=>{window.calls.push({op,id,value});if(window.fail)throw Error('暂时无法连接');return {downloads:structuredClone(window.items)};};
    function Harness(){const[id,setId]=useState('one');window.switchSession=()=>setId('two');return <div className="tx-cu-pane" style={{width:320}}><div style={{display:'flex',justifyContent:'flex-end',paddingRight:30}}><BrowserDownloads key={id} sessionId={id} visible api={api}/></div><button style={{marginTop:500}}>外部按钮</button></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  `}});
  const browser=await chromium.launch();t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:320,height:650}});page.setDefaultTimeout(2500);
  await page.setContent('<style>body{margin:0}</style><div id="root"></div>');await page.addStyleTag({content:await readFile(new URL('../src/client/computer-use.css',import.meta.url),'utf8')});await page.addScriptTag({content:outputFiles[0].text});
  const trigger=page.getByRole('button',{name:'下载记录',exact:true});await trigger.waitFor();assert.equal(await page.evaluate(()=>window.calls.length),0);
  await trigger.click();const panel=page.getByRole('dialog',{name:'当前会话下载记录'});await panel.getByText('当前会话还没有下载记录').waitFor();
  await page.evaluate(()=>window.items=[{id:'test',filename:'<img onerror=alert(1)>'.repeat(12),browserId:'browser',state:'inProgress',receivedBytes:512,totalBytes:1024,source:'example.com',canDownload:false}]);
  await panel.getByRole('progressbar').waitFor();assert.equal(await panel.locator('img').count(),0);assert.match(await panel.innerText(),/下载中 · 512 B \/ 1.0 KB/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'long names do not overflow a narrow pane');
  await page.evaluate(()=>window.items[0]={...window.items[0],state:'completed',receivedBytes:1024,canDownload:true});await panel.getByRole('link',{name:'保存文件'}).waitFor();assert.match(await panel.getByRole('link').getAttribute('href'),/session=one&id=test$/);
  await panel.press('Escape');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  const calls=await page.evaluate(()=>window.calls.length);await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.calls.length),calls,'closed panel stops polling');
  await page.evaluate(()=>{window.items=[];window.switchSession();});await trigger.click();await panel.getByText('当前会话还没有下载记录').waitFor();assert.equal(await panel.getByRole('link').count(),0);assert.equal(await page.evaluate(()=>window.calls.at(-1).id),'two');
  await page.evaluate(()=>window.fail=true);await panel.getByRole('alert').waitFor();assert.match(await panel.getByRole('alert').innerText(),/无法连接/);
  await page.getByRole('button',{name:'外部按钮'}).click();await panel.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.calls.some(call=>call.op!=='downloads'||call.value!==undefined)),false,'panel only reads history');
});
