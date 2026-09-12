import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('browser tab keyboard focus, address cancellation and narrow layout',async t=>{
  const {outputFiles}=await build({bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {BrowserControls} from './src/client/browser-controls.jsx';
    const tabs=[{id:'one',browserId:'browser',title:'First page',url:'https://example.org/one',available:true},{id:'blank',browserId:'browser',title:'',url:'about:blank',available:true},{id:'busy',title:'Another conversation',url:'https://example.org/busy',available:false}];
    window.calls=[];
    function Harness(){const[state,setState]=useState({target:{...tabs[0],kind:'tab'},enabled:true,controlEpoch:1}),[loading,setLoading]=useState(false);window.setLoading=setLoading;
      const api=async(op,id,input)=>{if(!input)return {tabs};window.calls.push({...input,op});if(op==='view-tab')return {...state,viewTarget:{...tabs.find(tab=>tab.id===input.tabId),kind:'tab'}};return state;};
      return <div className="tx-cu-pane tx-cu-pane-browser" style={{width:300,height:400}}><BrowserControls sessionId="fixture" state={state} navigation={{tabId:'one',url:tabs[0].url,loading}} visible api={api} onState={setState} onError={message=>window.lastError=message}/></div>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `}});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:320,height:480}});
  await page.route('http://localhost/browser-controls',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0}</style><div id="root"></div>'}));
  await page.goto('http://localhost/browser-controls');
  await page.addStyleTag({content:await readFile(new URL('../src/client/computer-use.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:outputFiles[0].text});
  const tabs=page.getByRole('tablist',{name:'浏览器标签页'}),selected=tabs.locator('[aria-selected="true"]');
  await tabs.getByRole('tab',{name:'Another conversation'}).waitFor();
  const toolbar=page.locator('.tx-cu-browser-controls'),height=(await toolbar.boundingBox()).height;
  await page.evaluate(()=>window.setLoading(true));await page.getByRole('button',{name:'停止加载页面'}).waitFor();
  assert.equal((await toolbar.boundingBox()).height,height,'loading does not move the toolbar or page');
  await page.evaluate(()=>window.setLoading(false));await page.getByRole('button',{name:'重新加载页面'}).waitFor();
  assert.equal(await tabs.locator('[role=tab] > svg').count(),3,'all tabs carry the reference globe icon without remote favicon requests');
  assert.equal(await tabs.getByRole('tab',{name:'Another conversation'}).isEnabled(),false);
  await selected.press('End');
  await page.waitForFunction(()=>document.activeElement?.dataset.tabId==='blank'&&document.activeElement.getAttribute('aria-selected')==='true');
  const external=page.getByRole('button',{name:'在外部浏览器中打开',exact:true});assert.equal(await external.isEnabled(),false,'blank tabs cannot launch an external application');
  await selected.press('ArrowLeft');
  await page.waitForFunction(()=>document.activeElement?.dataset.tabId==='one'&&document.activeElement.getAttribute('aria-selected')==='true');
  const address=page.getByRole('textbox',{name:'浏览器地址'});
  await address.fill('https://unsent.invalid');await address.press('Escape');
  assert.equal(await address.inputValue(),'https://example.org/one');
  assert.equal(await page.evaluate(()=>window.calls.some(call=>call.action==='goto')),false);
  assert.equal(await page.evaluate(()=>window.calls.every(call=>call.op==='view-tab')),true,'keyboard tab selection only changes the viewed tab');
  await address.fill('https://unsent.invalid');await external.click();await page.waitForFunction(()=>window.calls.some(call=>call.op==='open-external'));
  assert.equal(await page.evaluate(()=>window.calls.at(-1).expectedUrl),'https://example.org/one','external opening uses the displayed page, not unsubmitted address text');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>window.lastError||''),'');
});
