import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {frontendFixture,until} from './fixtures/frontend.mjs';
import {restoreFixtureLog} from './fixtures/restore-log.mjs';
import {hash} from '../src/context/core.mjs';

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
