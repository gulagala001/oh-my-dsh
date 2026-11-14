import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const require=createRequire(import.meta.url),host=createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
const primitives=createRequire(host.resolve('@deepseek-ai/dsh-client-ui-primitives'));
const compiled=await build({entryPoints:[new URL('../vendor/rewind/src/client/index.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'test-css',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}));}}],external:['react','react-dom','react-dom/client','react/jsx-runtime'],alias:{'@deepseek-ai/dsh-client-ui-primitives':host.resolve('@deepseek-ai/dsh-client-ui-primitives')}});

test('rewind confirms directly and closes after success even when an attachment is missing',async t=>{
 const dom=new JSDOM('<!doctype html><div data-conversation-session="synthetic"><div data-chat-anchor-key="user-1" data-chat-flow-kind="user"><div data-clock="start"><button>copy</button></div></div></div><div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const calls=[],draft={seq:1,text:'original request',attachments:[{contentIndex:1,attachment:{name:'missing.png'}}]};
 const base={revision:0,hiddenRanges:[],undoAvailable:false};let snapshot={draftRev:0,draft:'saved draft',attachmentIds:[],phase:'idle'};
 const values={window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,
 fetch:async(path,options)=>{const op=path.split('/').at(-1);calls.push(op);
  if(op==='state')return Response.json(base);
  if(op==='preview')return Response.json({planId:'preview',canApply:true,canStop:true,files:[],warnings:[],conversationOnly:true,target:draft});
  if(op==='apply'){assert.equal(JSON.parse(options.body).messageSeq,1);return Response.json({state:{...base,revision:1,undoAvailable:true,pendingDraft:{id:'receipt',draft}},draft});}
  if(op==='attachment')return Response.json({error:'missing attachment'},{status:404});
  throw Error('Unexpected request '+op);
 }};
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));Object.assign(globalThis,values);
 const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(name=>{try{return require(name);}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;return primitives(name);}},module,module.exports);
 let Controls;const ctx={inject(){},get(){},slots:{inject(){},register(_,component){Controls=component;}},sessions:{scope:id=>id,binding:()=>({eventSource:{getSnapshot:()=>({entries:[]}),subscribe:()=>()=>{}}})},conversation:{input:{for:()=>({state:{getSnapshot:()=>snapshot},pruneAttachments(){},setDraft:text=>{snapshot={...snapshot,draft:text,draftRev:snapshot.draftRev+1};},addAttachments:()=>true,persistDraft(){}})},createDrafts:()=>[]}};
 module.exports.install(ctx);
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(()=>root.unmount());dom.window.close();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const nodes=new Map([['user-1',{data:{seq:1}}]]);
 await act(()=>root.render(React.createElement(Controls,{sessionId:'synthetic',useChat:select=>select({nodes})})));
 await act(()=>document.querySelector('[data-rewind-plus-action]').click());
 const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='确认撤回');assert.ok(confirm);assert.equal(confirm.disabled,false);assert.ok(!document.body.textContent.includes('停止当前会话并重新检查'));
 await act(()=>confirm.click());assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(snapshot.draft,'original request');assert.match(document.body.textContent,/附件暂时不可用/);assert.match(document.body.textContent,/回填撤回内容/);
 assert.deepEqual(calls,['state','preview','apply','attachment','state']);
});
