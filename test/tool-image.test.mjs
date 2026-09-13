import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('tool screenshot opens a modal with fit, original size, Escape and focus restoration',async t=>{
  const{outputFiles}=await build({bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';import{createRoot}from'react-dom/client';import{SavedImage}from'#opencu/src/client/tool-image.jsx';
    const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#e5edf9"/><text x="50" y="80" font-size="40">Screenshot</text></svg>');
    createRoot(document.getElementById('root')).render(<div className="tx-cu-card"><SavedImage attachment={{id:'image'}} loadImage={async()=>image}/></div>);
  `}});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({content:await readFile(new URL(import.meta.resolve('#opencu/src/client/computer-use.css')),'utf8')});
  await page.addScriptTag({content:outputFiles[0].text});
  const thumbnail=page.getByRole('button',{name:'查看截图大图'});await thumbnail.waitFor();
  assert.equal((await thumbnail.boundingBox()).width,80);
  await thumbnail.click();const dialog=page.getByRole('dialog',{name:'截图预览'});await dialog.waitFor();
  const image=dialog.getByRole('img');await image.evaluate(img=>img.decode());
  assert.ok((await image.boundingBox()).width<800);
  await dialog.getByRole('button',{name:'实际大小'}).click();assert.equal((await image.boundingBox()).width,1600);
  await dialog.getByRole('button',{name:'适应窗口'}).click();assert.ok((await image.boundingBox()).width<800);
  await image.dblclick();assert.equal((await image.boundingBox()).width,1600,'double click opens actual size');
  await dialog.getByRole('button',{name:'放大截图'}).click();assert.equal((await image.boundingBox()).width,2000);
  const canvas=dialog.getByLabel('截图画布');await canvas.hover({position:{x:300,y:180}});await page.mouse.down();await page.mouse.move(180,150);await page.mouse.up();
  assert.ok(await canvas.evaluate(el=>el.scrollLeft>0||el.scrollTop>0),'dragging pans enlarged pixels');
  await dialog.press('0');assert.ok((await image.boundingBox()).width<800,'zero restores fit');
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await thumbnail.evaluate(el=>document.activeElement===el),true);
  assert.equal(browser.contexts()[0].pages().length,1);
});
