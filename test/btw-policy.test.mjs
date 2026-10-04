import test from 'node:test';
import assert from 'node:assert/strict';
import { btwDescriptor, isBtwSession, completedBtwPrefix, pendingToolCalls, assertBtwCachePrefix, cacheUsage, cacheUsageText } from '../src/btw-policy.mjs';
import { DreamSources } from '../src/dream/sources.mjs';
import { publishDreamMemory } from '../src/dream/publication.mjs';

const descriptor = {version:3,mode:'one-shot',provider:'fork',label:'omd-btw:v1:12345678-1234-4234-8234-123456789abc'};
const event = (seq,type,data={}) => ({seq,type,data});
const session = (events,inheritedEventCount=0) => ({id:'child',header:{id:'child',origin:'subagent',cwd:'/project'},inheritedEventCount,snapshotEvents:()=>events});
const wire = () => ({provider:'fixture',model:'fixture',tools:[{name:'read',parameters:{type:'object'}}],toolHistory:{tools:[],updates:[]},messages:[{role:'system',content:[{type:'text',text:'unchanged'}]},{role:'user',content:[{type:'text',text:'main'}]}]});
test('own durable descriptor survives restored sessions and ignores generic btw labels',()=>{
  const events=[event(0,'turn/end'),event(1,'subagent/descriptor',descriptor)];
  assert(isBtwSession(session(events,1)));
  assert.equal(btwDescriptor([event(0,'subagent/descriptor',{...descriptor,label:'btw'})]),null);
  assert.equal(btwDescriptor([event(0,'subagent/descriptor',{...descriptor,provider:'spawn'})]),null);
});
test('inherited and later descriptors cannot classify another workflow or fork',()=>{
  const events=[event(0,'subagent/descriptor',descriptor),event(1,'subagent/descriptor',{...descriptor,label:'workflow'}),event(2,'subagent/descriptor',descriptor)];
  assert.equal(isBtwSession(session(events,1)),false);
  assert.equal(isBtwSession(session(events,3)),false);
});
test('completed prefix excludes a partial turn and rejects empty or malformed history',()=>{
  const events=[event(0,'user/message'),event(1,'turn/end'),event(2,'assistant/message',{message:{content:[{type:'tool-call',id:'inflight'}]}})];
  assert.deepEqual(completedBtwPrefix(session(events)),events.slice(0,2));
  assert.throws(()=>completedBtwPrefix(session([event(0,'user/message')])),/已完成/);
  assert.throws(()=>completedBtwPrefix(session([event(1,'turn/end')])),/配对/);
});
test('a batch retains all pending calls until every Error result is paired',()=>{
  const events=[event(0,'assistant/message',{message:{content:[{type:'tool-call',id:'a'},{type:'tool-call',id:'b'}]}}),event(1,'tool/call',{callId:'a'}),event(2,'tool/result',{message:{toolCallId:'a',isError:true}})];
  assert.deepEqual([...pendingToolCalls(events)],['b']);
  assert.throws(()=>completedBtwPrefix(session([...events,event(3,'turn/end')])),/配对/);
  events.push(event(3,'tool/result',{message:{toolCallId:'b',isError:true}}));
  assert.equal(pendingToolCalls(events).size,0);
});
test('cache admission preserves original request objects and provider replay bytes',()=>{
  const parent=wire();parent.messages[1].source={replayState:{cacheKey:'stable',body:'opaque'}};
  const child={...structuredClone(parent),sessionId:'new-child',messages:[...structuredClone(parent.messages),{role:'assistant',content:[]},{role:'user',content:[{type:'text',text:'side'}]}]};
  const before=JSON.stringify([parent,child]);assertBtwCachePrefix(parent,child);assert.equal(JSON.stringify([parent,child]),before);
  child.messages[1].source.replayState.cacheKey='changed';assert.throws(()=>assertBtwCachePrefix(parent,child),/历史前缀/);
});
test('route, system and schema drift fail before dispatch with no standalone fallback',()=>{
  const parent=wire();
  for(const key of ['provider','model','tools','system','toolHistory']) {
    const child={...structuredClone(parent),messages:[...parent.messages,{role:'user',content:[]}],[key]:'changed'};
    assert.throws(()=>assertBtwCachePrefix(parent,child),/缓存前缀/);
  }
  assert.throws(()=>assertBtwCachePrefix(null,wire()),/主模型开始响应/);
});
test('cache usage differentiates real hit, explicit zero and absent usage',()=>{
  assert.deepEqual(cacheUsage({cacheReadTokens:32}),{state:'hit',cacheReadTokens:32});
  assert.deepEqual(cacheUsage({cacheReadTokens:0}),{state:'miss',cacheReadTokens:0});
  for(const usage of [undefined,{}, {inputTokens:100},{cacheReadTokens:null},{cacheReadTokens:-1}])assert.deepEqual(cacheUsage(usage),{state:'unknown'});
  assert.match(cacheUsageText([]),/未知/);assert.match(cacheUsageText([{cacheReadTokens:0}]),/未命中/);
  assert.match(cacheUsageText([{cacheReadTokens:10},{}]),/未知/);
});
test('btw publication leaves inherited memory bytes intact and never adds a new block',()=>{
  const s=session([event(0,'subagent/descriptor',descriptor)]);
  publishDreamMemory({},s);assert.equal(s.snapshotEvents().length,1);
});
test('Dream scan classifies restored btw locally while other children inherit project scope',async()=>{
  const records=new Map(),logs=new Map();
  logs.set('child',{header:{id:'child',origin:'subagent',parentSession:'main',cwd:'/project',createdAt:1},inherited:1,events:[event(0,'turn/end'),event(1,'subagent/descriptor',descriptor),event(2,'user/message',{source:{kind:'user'},content:[{type:'text',text:'private side'}]})]});
  const hub={ctx:{sessions:new Map(),sessionPersistence:{open:async id=>({header:logs.get(id).header,inheritedEventCount:logs.get(id).inherited,read:async()=>({events:logs.get(id).events}),close:async()=>{}})}},store:{peek:id=>id==='main'?{memoryScope:'project'}:undefined},context:{store:{peek:()=>null}},config:()=>({memoryScope:'project'})};
  const store={session:id=>records.get(id),saveSession:r=>records.set(r.id,r)};
  const sources=new DreamSources(hub,store);
  const captured=await sources.inspect('child',new AbortController().signal);
  assert.equal(captured.metadata.shared,false);assert.equal(captured.metadata.mode,'session');
  assert.equal(captured.metadata.sideQuestion,true);
  assert.equal(sources.scope({id:'workflow',parentSession:'main',cwd:'/project'}).shared,true);
  await assert.rejects(sources.manifest('child',{signal:new AbortController().signal,deepAgeMs:0}),/不参与/);
  await sources.close();
});
