import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('preview keyboard cycling, search and restore remain local until explicit resume',async t=>{
  const{outputFiles}=await build({bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState,useRef} from 'react';import{createRoot}from'react-dom/client';import{FloatingPreview}from'./src/client/floating-preview.jsx';
    window.calls=[];window.streams=[];window.EventSource=class{constructor(url){this.url=url;this.handlers={};window.streams.push(this);}addEventListener(name,fn){this.handlers[name]=fn;}close(){}emit(name,value){this.handlers[name]?.({data:JSON.stringify(value)});}};
    const targets=['A','B','C'].map(id=>({kind:'tab',id,title:'Page '+id})),url=(op,id)=>'/stream?session='+id;
    function Harness(){const anchor=useRef(null),[state,setState]=useState({enabled:true,target:targets[2],previewTargets:targets,status:'idle'});window.stopState=()=>setState(value=>({...value,status:'stopped'}));const api=async(op,id,input)=>{window.calls.push({op,id,input});return {...state,status:'idle'};};return <div><div contentEditable suppressContentEditableWarning style={{position:'absolute',left:100,top:650,width:650,height:80}}>Input</div><div ref={anchor} style={{position:'absolute',left:100,top:750}}><FloatingPreview sessionId="fixture" state={state} url={url} api={api} onState={setState} onError={text=>window.error=text} anchor={anchor}/></div></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  `}});
  const browser=await chromium.launch();t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1000,height:900}});page.setDefaultTimeout(3000);
  await page.setContent('<div id="root"></div>');await page.addStyleTag({content:await readFile(new URL('../src/client/computer-use.css',import.meta.url),'utf8')});await page.addScriptTag({content:outputFiles[0].text});
  const preview=page.getByLabel('悬浮操控预览');await preview.waitFor();await page.waitForFunction(()=>window.streams.length===3);
  const front=()=>preview.locator('.tx-cu-preview-card').filter({has:page.locator('.tx-cu-preview-open')}).evaluateAll(nodes=>nodes.reduce((a,b)=>Number(a.style.zIndex)>Number(b.style.zIndex)?a:b).dataset.target);
  const card=preview.getByRole('button',{name:'打开网页：Page C'});await card.focus();await card.press('ArrowRight');assert.equal(await front(),'B');await page.keyboard.press('ArrowRight');assert.equal(await front(),'A');await page.keyboard.press('ArrowRight');assert.equal(await front(),'C');
  assert.deepEqual(await page.evaluate(()=>window.calls),[]);
  await preview.getByRole('button',{name:'展开 3',exact:true}).click();const search=preview.getByRole('searchbox',{name:'筛选预览目标'});await search.fill('Page B');assert.equal(await preview.locator('.tx-cu-preview-card:visible').count(),1);assert.equal(await page.evaluate(()=>window.streams.length),3,'filtering does not reconnect preview streams');
  await search.fill('missing');await preview.getByText('没有匹配的窗口或网页').waitFor();await search.press('Escape');assert.equal(await search.inputValue(),'');await search.press('Escape');await search.waitFor({state:'hidden'});
  await page.evaluate(()=>window.stopState());await preview.hover();await preview.getByRole('button',{name:'从预览恢复助手'}).click();assert.deepEqual(await page.evaluate(()=>window.calls.map(call=>call.op)),['resume']);
  await preview.getByRole('button',{name:'关闭操控预览'}).focus();await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'悬浮预览',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>window.error??''),'');
});
