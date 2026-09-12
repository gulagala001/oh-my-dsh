import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

test('page annotation cancels encoding across sessions and the next draft remains usable',async t=>{
  // Component tests declare their React runtime; pnpm's store is not a public
  // dependency API, and a clean DSH installation only contains bundled React.
  const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
  const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PageAnnotation}from'./src/client/page-annotation.jsx';
    const root=createRoot(document.getElementById('root'));window.added=[];window.created=[];window.released=[];
    window.renderAnnotation=sessionId=>root.render(<PageAnnotation sessionId={sessionId} target={{id:'tab-1',browserId:'browser'}} frame={{tabId:'tab-1',data:window.pixels,mediaType:'image/png',at:1,url:'http://fixture/'}} conversation={{createDrafts:(session,files)=>{window.created.push(session);return files.map((file,i)=>({id:session+'-'+i}));},releaseDraftAttachments:drafts=>window.released.push(drafts)}} inputActions={{addAttachments:ids=>{window.added.push(ids);return true;}}}/>);`,resolveDir:root,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',alias:{react:require.resolve('react'),'react-dom/client':require.resolve('react-dom/client')}});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.evaluate(data=>{window.pixels=data;},(await sharp({create:{width:400,height:200,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64'));
  await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>window.renderAnnotation('first'));
  const select=async()=>{await page.getByRole('button',{name:'批注页面',exact:true}).click();const img=page.getByAltText('待批注的冻结页面');await img.evaluate(img=>img.decode());const box=await img.boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+150,box.y+90);await page.mouse.up();};
  await select();
  await page.evaluate(()=>{window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){window.finishEncoding=()=>window.originalToBlob.apply(this,args);};});
  await page.getByRole('button',{name:'加入输入框',exact:true}).click();
  await page.waitForFunction(()=>!!window.finishEncoding);
  await page.evaluate(()=>window.renderAnnotation('second'));
  await page.locator('dialog').waitFor({state:'hidden'});
  await page.evaluate(async()=>{HTMLCanvasElement.prototype.toBlob=window.originalToBlob;window.finishEncoding();await new Promise(resolve=>setTimeout(resolve,100));});
  assert.deepEqual(await page.evaluate(()=>({created:window.created,added:window.added})),{created:[],added:[]});
  await select();
  assert.equal(await page.getByRole('button',{name:'加入输入框',exact:true}).count(),1,'the new session must not inherit the old encoding busy state');
  await page.getByRole('button',{name:'加入输入框',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>({created:window.created,added:window.added})),{created:['second'],added:[['second-0','second-1']]});
});
