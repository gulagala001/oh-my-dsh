import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {frontendFixture,until} from './fixtures/frontend.mjs';
import {restoreFixtureLog} from './fixtures/restore-log.mjs';
import {hash} from '../src/context/core.mjs';
import {Hub} from '../src/hub.mjs';
import {HubStore} from '../src/hub-store.mjs';
import {ContextPipeline} from '../src/context/pipeline.mjs';
import {contextConfig} from '../src/config.mjs';

test('real private forks retain saved documents and independent budgets after the default scope changes', {timeout:90000}, async t=>{
 const captured=[];
 const f=await frontendFixture(t,{headless:true,omdConfig:{memoryScope:'session',computerUseEnabled:false,codegraphEnabled:false,keepTailEvents:0,coordinatorEvery:1000,budgetHintsEnabled:true},
  modelReply(payload){if(payload.tools?.length)captured.push(payload);}});
 const path=join(f.workspace,'fork-source.txt'); await writeFile(path,'Exact fork material 9007199254740993.\n'.repeat(400));
 const tool=(name,args)=>({delta:{role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls',usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}});
 let stage='parent',issued=false;
 f.replyWith(payload=>{
  if(payload.tools.some(t=>t.function.name==='prepare_segment'))return tool('prepare_segment',{summary:'Read fork-source.txt.',documents:[{title:'Exact detail',text:'Exact fork material 9007199254740993.'}]});
  if(payload.tools.some(t=>t.function.name==='submit_context_choices'))return tool('submit_context_choices',{choices:[]});
  if(!issued){issued=true;return stage==='parent'?tool('read',{file_path:path}):tool('recall',{id:record.id});}
  return {delta:{role:'assistant',reasoning_content:'Original material confirmed.',content:'Done.'},finish_reason:'stop',usage:{prompt_tokens:10,completion_tokens:3,total_tokens:13}};
 });
 const run=async(sessionId,text)=>{
  const before=captured.length;
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}]});
  await until(async()=>captured.length>=before+2&&(await f.api('/state?session='+sessionId)).running==='idle');
 };
 await run(f.sessionId,'读取原材料 +1000');
 await f.api('/context/prepare?session='+f.sessionId,{});
 const catalog=await until(async()=>{const c=await f.api('/context/catalog?session='+f.sessionId);return c.entries.length?c:null;});
 const record=catalog.entries[0];
 assert.equal((await f.api('/compact?session='+f.sessionId,{ids:[record.id],mode:'brief'})).changed,true);
 assert.equal((await f.call('commands/execute',{agentId:f.sessionId,line:'/budget token=1000',submittedAttachments:[]})).result.ok,true);
 const saved=id=>readFile(join(f.home,'trisoul-x/sessions',id+'.json'),'utf8').then(JSON.parse);
 const before=await saved(f.sessionId);
 await f.api('/settings',{memoryScope:'project'});
 const fork=await f.rpc('session/fork',{sessionId:f.sessionId});
 assert.equal((await f.api('/scope?session='+fork.sessionId)).scope,'session');
 assert.ok((await f.api('/context/catalog?session='+fork.sessionId)).entries.some(r=>r.id===record.id));
 assert.ok((await f.api('/context/document?session='+fork.sessionId+'&id='+record.id)).documents.some(d=>d.text.includes('9007199254740993')));
 stage='fork';issued=false;
 await run(fork.sessionId,'回查继承的详细资料 +20');
 const child=await saved(fork.sessionId),parent=await saved(f.sessionId);
 assert.equal(child.workflowBudget.pools[child.workflowBudget.active].total,20);
 assert.equal(child.workflowBudget.pools[child.workflowBudget.active].spent,6);
 assert.equal(child.workflowBudgetOwner,undefined);
 assert.deepEqual(parent.workflowBudget,before.workflowBudget);
 assert.deepEqual(parent.budget,before.budget);
 assert.ok(captured.at(-1).messages.some(m=>m.role==='tool'&&String(m.content).includes('Exact fork material 9007199254740993.')));
 const forkLog=await restoreFixtureLog(f.home,fork.sessionId);
 const restart=createPipelineForRestart(f.home);
 const {Session}=await import('@deepseek-ai/dsh-session');
 const restored=Session.create(fork.sessionId,forkLog.events,forkLog.header, forkLog.inheritedEventCount);
 assert.match(restart.recall(restored,{id:record.id}),/9007199254740993/);
 await restart.dispose();
});

function createPipelineForRestart(home){
 const store=new HubStore(join(home,'trisoul-x'));
 const hub=Object.assign(Object.create(Hub.prototype),{store,getConfig:()=>contextConfig({memoryScope:'project'}),ctx:{},action(){}});
 return new ContextPipeline(hub,{});
}

test('real multi-range compaction, tasks, Trace and exact user material survive native V4 persistence', {timeout:90000}, async t=>{
 const f=await frontendFixture(t,{headless:true,omdConfig:{computerUseEnabled:false,codegraphEnabled:false,keepTailEvents:0,coordinatorEvery:1000}});
 const path=join(f.workspace,'source.txt'),user='读取原材料 9007199254740993 并记录完成状态。';
 await writeFile(path,'Original material 9007199254740993.\n'.repeat(400));
 const tool=(name,args)=>({delta:{role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'});
 let step=0;
 f.replyWith(payload=>{
  if(payload.tools.some(t=>t.function.name==='prepare_segment'))return tool('prepare_segment',{summary:'Read original material 9007199254740993 and completed the task.',documents:[{title:'Details',text:'Original material 9007199254740993.'}]});
  if(payload.tools.some(t=>t.function.name==='submit_context_choices'))return tool('submit_context_choices',{choices:[]});
  if(step++===0)return tool('read',{file_path:path});
  if(step===2)return tool('todo_write',{op:'excerpt',from:user,to:user,tasks:[{title:'读取原材料',anchor:{from:user,to:user}}]});
  if(step===3)return tool('todo_write',{op:'check',updates:[{id:'T1',done:true}]});
  return {delta:{role:'assistant',reasoning_content:'材料已读取，任务已确认。',content:'运行完成。'},finish_reason:'stop'};
 });
 await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:user}]});
 await until(async()=>step>=4&&(await f.api('/state?session='+f.sessionId)).running==='idle');
 await f.api('/context/prepare?session='+f.sessionId,{});
 const catalog=await until(async()=>{const x=await f.api('/context/catalog?session='+f.sessionId);return x.entries.length?x:null;});
 const result=await f.api('/compact?session='+f.sessionId,{ids:catalog.entries.map(r=>r.id),mode:'detail'});
 assert.equal(result.changed,true);
 const restored=await restoreFixtureLog(f.home,f.sessionId);
 assert.ok(restored.events.some(e=>e.type==='compaction/summary'));
 assert.ok(restored.events.some(e=>e.type==='user/message'&&e.data.source.kind==='plugin:trisoul-x:shadow'));
 const state=JSON.parse(await readFile(join(f.home,'trisoul-x/context-v1/sessions',hash(f.sessionId)+'.json'),'utf8'));
 assert.ok(state.records.flatMap(r=>r.userOriginals??[]).some(u=>u.content.some(b=>b.text===user)));
 assert.equal((await f.api('/state?session='+f.sessionId)).tasks[0].done,true);
});
