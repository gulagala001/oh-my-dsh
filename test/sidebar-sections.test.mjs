import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { sidebarSections, mergeVisibleOrder, readSectionExpansion } from '../src/client/sidebar-sections.mjs';
await import('../scripts/build-sidebar-native.mjs');
const { createSidebarNative } = await import('../lib/host/sidebar-native.factory.mjs');
const require = createRequire(import.meta.url);
const native = createSidebarNative(name=>name==='@deepseek-ai/dsh-client-ui-primitives'||name==='@deepseek-ai/dsh-client-store'?{}:require(name));

test('installer decorates the real native slot ledger and rebinds after host registration reload', async t => {
  const host = createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
  const { SlotCore } = await import(host.resolve('@deepseek-ai/dsh-client-ui-slots'));
  const compiled = await build({entryPoints:[new URL('../src/client/sidebar-sections.jsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',loader:{'.css':'text'}});
  const module={exports:{}};
  const resolve=name=>name==='@deepseek-ai/dsh-client-ui-primitives'||name==='@deepseek-ai/dsh-client-store'?{}:require(name);
  new Function('require','module','exports',compiled.outputFiles[0].text)(resolve,module,module.exports);
  const dom=new JSDOM('<html><head></head><body></body></html>'), prior=Object.getOwnPropertyDescriptor(globalThis,'document');
  globalThis.document=dom.window.document;
  const slots=new SlotCore(), cleanups=[];
  const effect=fn=>{const off=fn();if(off)cleanups.push(off);return off;};
  slots.inject=(_name,fn)=>effect(fn);
  slots.register({name:'root',children:{'sidebar.workspaces':{kind:'single',scope:'root'}}},()=>null);
  const Original=()=>null, inject=()=>({}), store={create:()=>({})};
  const options={name:'sidebar.workspaces',locale:'workspace',store,inject,children:{'sidebar.workspaces.session.row.action':{kind:'list',scope:'root'}}};
  let unregister=slots.register(options,Original);
  const entry=slots.entries('sidebar.workspaces')[0];
  t.after(()=>{for(const off of cleanups.reverse())off();unregister();dom.window.close();if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;});
  assert.equal(entry.options.locale,undefined);
  module.exports.installSidebarSections({slots,effect,locale:{register:()=>()=>{},bind:()=>key=>key},uiWorkspace:{}});
  assert.notEqual(entry.component,Original,'native StoredEntry must receive the section renderer');
  assert.equal(entry.locale,'workspace');assert.equal(entry.store,store);assert.equal(entry.inject,inject);assert.equal(entry.children,options.children);
  assert.equal(slots.entries('sidebar.workspaces').length,1,'decoration must not shadow child-slot authority');
  unregister();unregister=slots.register(options,Original);await new Promise(resolve=>setImmediate(resolve));
  const replacement=slots.entries('sidebar.workspaces')[0];assert.notEqual(replacement,entry);assert.notEqual(replacement.component,Original);
  for(const off of cleanups.splice(0).reverse())off();
  assert.equal(replacement.component,Original,'unload restores the actual native renderer');
});

test('three sections retain native pin/archive/blank visibility and leave workspace membership intact', () => {
  const summary=(id,extra={})=>({id,blank:false,retainedBy:{},...extra});
  const state={list:{ids:['p','workspace','loose','archive','child','blank','current'],byId:{p:summary('p'),workspace:summary('workspace'),loose:summary('loose'),archive:summary('archive'),child:summary('child',{origin:'subagent'}),blank:summary('blank',{blank:true}),current:summary('current',{blank:true,retainedBy:{mainView:1}})}},rowState:{pinnedSessionIds:['p','archive'],archivedSessionIds:['archive'],archivedFilter:'default'},orderedFlatSessionIds:['p','workspace','loose','archive','current'],recentSessionIds:['current','archive','loose','p','workspace'],orderedWorkspaces:[{workspaceId:'project',sessionIds:['p','workspace']}]};
  const before=structuredClone(state);
  assert.deepEqual(sidebarSections(state,native.visibleSessionIds),{pinned:['p'],recent:['current','loose','workspace']});
  assert.deepEqual(state,before);
  const archived={...state,rowState:{...state.rowState,archivedFilter:'only'}};
  assert.deepEqual(sidebarSections(archived,native.visibleSessionIds),{pinned:[],recent:['archive']});
  assert.deepEqual(sidebarSections({...state,rowState:{...state.rowState,pinnedSessionIds:[]}},native.visibleSessionIds),{pinned:[],recent:['current','loose','p','workspace']});
});

test('reordering pinned rows preserves the rest of the complete native order account', () => {
  assert.deepEqual(mergeVisibleOrder(['p1','hidden','p2','ordinary'],['p2','p1']),['p2','hidden','p1','ordinary']);
  assert.deepEqual(mergeVisibleOrder(['a','b','c'],['outside','b','b','a']),['b','a','c']);
});

test('section expansion is independent and tolerates unavailable or malformed storage', t => {
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');t.after(()=>{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>'{"pinned":false,"workspaces":true,"recent":false}'}});
  assert.deepEqual(readSectionExpansion(),{pinned:false,workspaces:true,recent:false});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied')}});
  assert.deepEqual(readSectionExpansion(),{pinned:true,workspaces:true,recent:true});
});

// Exercise the extracted native browser and SlotCore; primitives only supply
// passive wrappers here because layout/animation are checked in Chromium.
test('empty sections stay compact and native search can move between headers', async () => {
const require=createRequire(new URL('../package.json',import.meta.url));
const {build}=require('esbuild'),{JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const keys=['window','document','Node','HTMLElement','Element','MouseEvent','getComputedStyle','localStorage','MutationObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
const prior=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const dom=new JSDOM('<main/>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','Node','HTMLElement','Element','MouseEvent','getComputedStyle','localStorage','MutationObserver'])globalThis[key]=key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const e=React.createElement;
const primitives=new Proxy({Tooltip:({children})=>children,HoverCard:({anchor})=>anchor,relativeTime:()=>({unit:'now',n:0}),useRowDragPreview:()=>({start(){},clear(){return false;}}),Menu:({anchor})=>anchor,AnimatedRows:({children})=>e('div',{},children),HoverCardGroup:({children})=>e('div',{},children)}, {get:(target,key)=>target[key]??(()=>null)});
const compiled=await build({entryPoints:[new URL('../src/client/sidebar-sections.jsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',loader:{'.css':'text'}}),module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(name=>name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:name==='@deepseek-ai/dsh-client-store'?{}:require(name),module,module.exports);
const host=createRequire(require.resolve('@deepseek-ai/dsh/package.json')), {SlotCore}=await import(host.resolve('@deepseek-ai/dsh-client-ui-slots'));
const slots=new SlotCore(),off=[];const effect=fn=>{const result=fn();if(result)off.push(result);};slots.inject=(_name,fn)=>effect(fn);
slots.register({name:'root',children:{'sidebar.workspaces':{kind:'single',scope:'root'}}},()=>null);
slots.register({name:'sidebar.workspaces',locale:'workspace',children:{'sidebar.workspaces.session.row.action':{kind:'list',scope:'root'}}},()=>null);
module.exports.installSidebarSections({slots,effect,locale:{register:()=>()=>{},bind:()=>key=>key},uiWorkspace:{}});
let shortcut={searchRequest:0,addRequested:false};const listeners=new Set();const sub=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const view={groupBy:'workspace',orderBy:'updated',archivedFilter:'default',groupExpansion:{},sessionOrderByAccount:{}}; let list={phase:'ready',ids:[],byId:{},projectionsBySession:{}},workspaces={items:[],phase:'ready',state:'ready',archivedSessionIds:[],pinnedSessionIds:[]};
const noop=()=>{};const props={wide:true,t:key=>key,usePanelInfo:s=>s({activePanelId:null}),useSectionScroller:()=>({bindScrollerRef:noop}),useSessions:s=>s(list),useWorkspaces:s=>s(workspaces),useStore:s=>s(view),useSessionStatus:s=>s(new Map()),useSessionAccess:()=>true,useWorkspaceAccess:()=>true,useRemoteAccess:()=>true,useHostInfo:s=>s({home:'/synthetic'}),useShortcuts:s=>s([]),useWorkspaceShortcuts:s=>s(React.useSyncExternalStore(sub,()=>shortcut)),useDirectoryFlow:s=>s(false),useWorkspaceActionRequest:s=>s(null),useContextMenuTarget:s=>s(null),useContextMenu:()=>({getTriggerProps:()=>({})}),renderSlot:()=>null,renderFactorySlot:()=>null,actions:new Proxy({}, {get:()=>noop}),requestSearch:()=>{shortcut={...shortcut,searchRequest:shortcut.searchRequest+1};listeners.forEach(fn=>fn());},closeAddWorkspace:noop,requestAddWorkspace:noop,startSession:noop,expandSidebar:noop,searchSessions:async()=>({items:[],hasMore:false})};
const {createRoot}=require('react-dom/client'),root=createRoot(document.querySelector('main'));
const selector=key=>document.querySelector(`[data-omd-sidebar-section="${key}"]`);
try{
 await act(()=>root.render(e(slots.entries('sidebar.workspaces')[0].component,props)));
 assert.equal(selector('pinned').querySelector('[data-row-key=empty]'),null,'no large placeholder under an empty Pinned header');
 assert.equal(selector('pinned').querySelector('.omd-motion-collapse').getAttribute('aria-hidden'),'true');
 for(const key of ['workspaces','recent'])assert.equal(getComputedStyle(selector(key).querySelector('[data-row-key=empty]')).marginTop,'0px');
 list={...list,ids:['p'],byId:{p:{id:'p',title:'Pinned fixture',blank:false,retainedBy:{},updatedAt:1}}};workspaces={...workspaces,pinnedSessionIds:['p']};
 await act(()=>root.render(e(slots.entries('sidebar.workspaces')[0].component,{...props})));
 assert.ok(selector('pinned').querySelector('[data-row-key="session:p"]'));
 workspaces={...workspaces,pinnedSessionIds:[]};
 await act(()=>root.render(e(slots.entries('sidebar.workspaces')[0].component,{...props})));
 assert.equal(selector('pinned').querySelector('.omd-motion-collapse').getAttribute('aria-hidden'),'true','last unpin starts the section exit');
 assert.equal(selector('pinned').querySelector('[data-row-key=empty]'),null,'the exit must retain the old row, never the large empty state');
 await act(()=>new Promise(resolve=>setTimeout(resolve,240)));
 assert.equal(selector('pinned').querySelector('[data-row-key]'),null);
 assert.ok(selector('recent').querySelector('[data-row-key="session:p"]'));
 await act(()=>selector('workspaces').querySelector('[aria-label="search.sessions.aria"]').click());
 assert.ok(selector('workspaces').querySelector('[data-search-open]'));
 await act(()=>selector('recent').querySelector('[aria-label="search.sessions.aria"]').click());
 assert.ok(selector('recent').querySelector('[data-search-open]'));
 assert.equal(document.activeElement,selector('recent').querySelector('input'));
} finally{await act(()=>root.unmount());for(const fn of off.reverse())fn();dom.window.close();for(const [key,value]of prior){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}
});
