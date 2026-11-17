import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sidebarSections, mergeVisibleOrder, readSectionExpansion } from '../src/client/sidebar-sections.mjs';
await import('../scripts/build-sidebar-native.mjs');
const { createSidebarNative } = await import('../lib/host/sidebar-native.factory.mjs');
const require = createRequire(import.meta.url);
const native = createSidebarNative(name=>name==='@deepseek-ai/dsh-client-ui-primitives'||name==='@deepseek-ai/dsh-client-store'?{}:require(name));

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
