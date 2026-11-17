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
  const source = await build({entryPoints:[new URL('../src/client/temporary-chat.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'text'}});
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
