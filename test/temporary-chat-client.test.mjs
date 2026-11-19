import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
const require = createRequire(import.meta.url);

test('a blank temporary sidebar uses the native conversation directly without the workspace hero gate', async t => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
  const globals = new Map(['window','document','Event','IS_REACT_ACT_ENVIRONMENT'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
  const source = await build({entryPoints:[fileURLToPath(new URL('../src/client/temporary-chat.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'text'}});
  const load = code => {const module={exports:{}};new Function('require','module','exports',code)(name=>name==='@deepseek-ai/dsh-client-ui-primitives'?{Button:()=>null}:name.endsWith('.css')?{}:require(name),module,module.exports);return module.exports;};
  const sdk = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
  const nativePath = sdk.resolve('@deepseek-ai/dsh-client-ui-subagent/package.json').replace(/package.json$/, 'src/client/sidebar-chat/index.tsx');
  const native = load((await transform(await readFile(nativePath,'utf8'),{loader:'tsx',jsx:'automatic',format:'cjs'})).code);
  const slots=new Map(), disposers=[];
  const ctx={effect(fn){disposers.push(fn());},slots:{inject(n,fn){disposers.push(fn());},register(options,component){slots.set(options.name,component);return()=>slots.delete(options.name);},subscribe:()=>()=>{},entriesOfSlot:()=>[{component:native.ConversationSlotPanel}]},
    sidebarRightTabs:{register:()=>()=>{}},sidebarRight:{registerCloseHandler:()=>()=>{},openTabs:{subscribe:()=>()=>{}}},commandUi:{register:()=>()=>{}}};
  load(source.outputFiles[0].text).installTemporaryChat(ctx);
  const Component=slots.get('omd.temporary-chat.conversation'), observed=[];
  const {createRoot}=await import('react-dom/client'), root=createRoot(document.querySelector('main'));
  t.after(async()=>{await act(()=>root.unmount());for(const dispose of disposers.reverse())await dispose?.();dom.window.close();for(const[key,value]of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  await act(()=>root.render(React.createElement(Component,{sessionId:'temporary',useSession:select=>select({blank:true,running:false,openState:'open'}),useConversation:select=>select({activeTargets:new Set()}),useSessions:select=>select({byId:{temporary:{blank:true}}}),
    renderFactorySlot:(name,owner,options)=>{observed.push({name,owner,options});return React.createElement('textarea',{disabled:owner.hero,placeholder:owner.hero?'choose workspace':'message'});}})));
  assert.equal(observed[0].name,'conversation.content');assert.deepEqual(observed[0].owner,{variant:'embedded',phase:'active',hero:false});
  assert.equal(typeof observed[0].options.slots.views,'function');assert.equal(document.querySelector('textarea').disabled,false);
});

for (const scenario of ['pending-close', 'failed-close', 'unload-pending']) test(`temporary sidebar lifecycle: ${scenario}`, async t => {
  const dom = new JSDOM('<main></main>', {url:'http://localhost/'});
  const globals = new Map(['window','document','Event','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
  const opened=Promise.withResolvers(), requests=[], cleanups=[], slots=new Map();
  let closeHandler, subscriber, refs=0, retained=0, released=0, removed=0, present=true;
  t.mock.method(globalThis,'fetch', async path=>{
    if(String(path).endsWith('/open'))return opened.promise;
    if(String(path).endsWith('/close')){const request=Promise.withResolvers();requests.push(request);return request.promise;}
    throw Error('Unexpected request: '+path);
  });
  const tab={id:'fixture-tab',actions:{close:()=>ctx.sidebarRight.closeIn('parent',tab.id)}};
  const ctx={effect(fn){cleanups.push(fn());},slots:{inject(_name,fn){cleanups.push(fn());},register(options,component){slots.set(options.name,component);return()=>slots.delete(options.name);},subscribe:()=>()=>{},entriesOfSlot:()=>[]},
    sessions:{retain(){refs++;retained++;return{release(){refs--;released++;}};},refresh:async()=>{}},sidebarRightTabs:{register:()=>()=>{}},commandUi:{register:()=>()=>{}},
    sidebarRight:{registerCloseHandler(_kind,fn){closeHandler=fn;return()=>{closeHandler=undefined;};},closeIn(parent,id){closeHandler?.(parent,tab);assert.equal(id,tab.id);removed++;present=false;subscriber?.();},openTabs:{subscribe(fn){subscriber=fn;return()=>{subscriber=undefined;};},getSnapshot:()=>present?[{kind:'omd-temporary-chat',tabId:tab.id}]:[]}}};
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/client/temporary-chat.jsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'text'}}),module={exports:{}};
  new Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='@deepseek-ai/dsh-client-ui-primitives'?{Button:({children,onClick,disabled})=>React.createElement('button',{onClick,disabled},children)}:require(name),module,module.exports);
  module.exports.installTemporaryChat(ctx);
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.querySelector('main'));
  const dispose=async()=>{for(const off of cleanups.splice(0).reverse())await off?.();};
  t.after(async()=>{await act(()=>root.unmount());for(const request of requests)request.resolve(Response.json({closed:true}));opened.resolve(Response.json({id:'temporary'}));await act(dispose);dom.window.close();for(const[key,value]of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  await act(()=>root.render(React.createElement(slots.get('sidebar.right.pane.tab'),{sessionId:'parent',useTabInfo:()=>({tab}),SessionProvider:({children})=>children,renderSlot:()=>React.createElement('textarea')})));
  if(scenario==='failed-close'){
    await act(()=>opened.resolve(Response.json({id:'temporary'})));assert.equal(refs,1);
    await act(()=>assert.throws(()=>ctx.sidebarRight.closeIn('parent',tab.id),/正在清理/));
    await act(()=>requests[0].resolve(Response.json({error:'synthetic cleanup refusal'},{status:500})));
    assert.match(document.querySelector('[role=alert]').textContent,/synthetic cleanup refusal/);
    assert.equal(removed,0);assert.equal(refs,0);
    await act(()=>assert.throws(()=>ctx.sidebarRight.closeIn('parent',tab.id),/正在清理/));
    await act(()=>requests[1].resolve(Response.json({closed:true})));
    assert.equal(removed,1);assert.equal(released,1);assert.equal(retained,1);
  }else{
    let closing;
    if(scenario==='unload-pending')await act(()=>{closing=dispose();});
    else await act(()=>assert.throws(()=>ctx.sidebarRight.closeIn('parent',tab.id),/正在清理/));
    assert.equal(requests.length,0,'close waits for the admitted identity');
    await act(()=>opened.resolve(Response.json({id:'temporary'})));
    assert.equal(retained,0,'late open must not attach a conversation after close/unload');
    assert.equal(requests.length,1);
    await act(async()=>{requests[0].resolve(Response.json({closed:true}));await closing;});
    assert.equal(removed,scenario==='pending-close'?1:0);
    assert.equal(refs,0);
  }
});
