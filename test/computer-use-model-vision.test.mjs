import test from 'node:test';import assert from 'node:assert/strict';
import {computerVision} from '../src/computer-use/model-vision.mjs';
test('vision follows pending model switch and actual request route independently',async()=>{
 const routes=[],ctx={sessionProjections:{stateOf:()=>({pending:{provider:'p',model:'vision'}})},llm:{resolveModelInfo:async(p,m)=>{routes.push(m);return {inputModalities:m==='vision'?['text','image']:['text']};}}},session={requestHeader:()=>({config:{provider:'p',model:'text'}})};
 assert.equal((await computerVision(ctx,session)).input,'image');assert.equal((await computerVision(ctx,session,session.requestHeader().config)).input,'text');assert.deepEqual(routes,['vision','text']);
});
test('unknown capabilities never assert text-only; draft sessions use host default',async()=>{
 const ctx={llm:{listModels:async()=>[{id:'default',inputModalities:['text']}]},get:()=>({currentSelection:()=>({provider:'p',model:'default'})})};assert.equal((await computerVision(ctx)).input,'text');ctx.llm.listModels=async()=>[];assert.equal((await computerVision(ctx)).input,'unknown');ctx.llm.listModels=async()=>{throw Error('offline');};assert.equal((await computerVision(ctx)).input,'unknown');
});

test('text-only screenshot results retain the attachment and state the actual limitation',async()=>{
 const {registerComputerTools}=await import('../src/computer-use/tools.mjs');const tools=new Map();
 const ctx={tools:{register:t=>tools.set(t.name,t)},get:name=>name==='attachments'?{saveImage:async()=>({attachmentId:'test-image'})}:undefined,llm:{resolveModelInfo:async()=>({inputModalities:['text']})}};
 registerComputerTools(ctx,{config:()=>({}),computerUse:{execute:async()=>({blocks:[{type:'image',data:'AA==',mediaType:'image/png'}]})}});
 const value=JSON.parse(await tools.get('computer_use').execute({code:''},{agent:{session:{id:'s',requestHeader:()=>({config:{provider:'p',model:'m'}})}}}));
 assert.equal(value.content[0].type,'image');assert.equal(value.content[0].attachment.attachmentId,'test-image');assert.match(value.content[1].text,/host omits this image/);
});
