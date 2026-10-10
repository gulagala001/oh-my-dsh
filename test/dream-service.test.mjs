import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DreamService} from '../src/dream/service.mjs';
import {createEffortResolver} from '../src/effort.mjs';
import {DreamStore} from '../src/dream/store.mjs';
import {readDream} from '../src/dream/recall.mjs';
import {projectOf} from '../src/hub-store.mjs';
import {handleDreamApi} from '../src/dream/api.mjs';
import {handleContextApi} from '../src/context/api.mjs';
import {ContextPipeline} from '../src/context/pipeline.mjs';
import {createProjectlessWorkspaceService} from '../src/projectless-workspaces.mjs';
import {Hub} from '../src/hub.mjs';
import {Context,Service} from '@deepseek-ai/cordis';
import {LlmRuntime} from '@deepseek-ai/dsh-llm';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

function fixture(t,{generate,config={}}={}){
  const dir=mkdtempSync(join(tmpdir(),'omd-dream-service-')),logs=new Map(),archives=new Map(),states=new Map(),calls=[];
  let now=Date.now(),reads=0,closes=0;
  const cfg={dreamProvider:'fixture',dreamModel:'fixture',dreamDailyTokens:200000,dreamDeepAgeMs:7*86400000,backgroundMaxRetries:0,...config};
  const persistence={list:async()=>[...logs.values()].map(x=>({header:x.header,revision:x.revision})),open:async id=>{
    const log=logs.get(id);if(!log)throw Error('source missing');return {header:log.header,inheritedEventCount:log.inherited||0,read:async(offset=0,length)=>{reads++;return {events:log.events.slice(offset,length==null?undefined:offset+length)};},close:async()=>{closes++;}};
  }};
  const hub={ctx:{sessionPersistence:persistence,agents:new Map(),sessions:new Map()},store:{dir,peek:id=>states.get(id)},config:()=>cfg,scope:()=>({mode:'project',project:projectOf('/projects/a')}),context:{store:{peek:id=>archives.get(id)},adapter:{message:text=>({role:'user',content:[{type:'text',text}]})}}};
  hub.efforts=createEffortResolver(hub.ctx);
  const store=new DreamStore(dir,{now:()=>now}),service=hub.dream=new DreamService(hub,{store,generate:async(input,options)=>{
    calls.push(structuredClone(input));return generate?generate(input,options,{hub,service,store,logs,archives,states}):{value:{summary:input.sources.map(x=>x.text).join(' ').slice(0,150)||'none',references:input.sources.map(x=>x.id)},usage:{inputTokens:100,outputTokens:50}};
  }});
  const services=[service];
  t.after(async()=>{for(const owned of [...services].reverse())await owned.close();rmSync(dir,{recursive:true,force:true});});
  const add=(id,{scope='project',summary='已完成读取。',age=1000,cwd='/projects/a',inherited=0}={})=>{
    const event=(seq,type,data)=>({seq,time:now-age,type,data});
    const events=[event(0,'user/message',{source:{kind:'user'},content:[{type:'text',text:'仅保留四个入口。'}]}),event(1,'assistant/message',{message:{source:{kind:'model'},content:[{type:'text',text:'已读取配置。'}]}}),event(2,'turn/end',{})];
    logs.set(id,{header:{id,version:4,createdAt:now-age,cwd},events,revision:1,inherited});states.set(id,{id,memoryScope:scope});
    const record={id:'r-'+id,sessionId:id,summary,originalSeqs:[0,1],ranges:[{from:0,to:1}],documents:[],createdAt:now-10};
    archives.set(id,{binding:{scope:scope==='session'?'session':'project',project:projectOf(cwd)},records:summary?[record]:[]});return record;
  };
  const run=async(scope='global',target='global')=>{const job=await service.enqueue(scope,target);await service.draining;return store.job(job.id);};
  return {hub,service,services,store,logs,archives,states,calls,cfg,add,run,advance:n=>{now+=n;},reads:()=>({reads,closes})};
}

const inputOf=payload=>JSON.parse(payload.messages.findLast(m=>m.role==='user').content);

test('Dream monitor attributes actual levels and a failed recorder cannot change successful publication',async t=>{
  const f=fixture(t),records=[];f.add('a');f.hub.live=new Map();
  f.hub.monitor={append(entry){records.push(entry);throw Error('monitor unavailable');}};
  const job=await f.run();assert.equal(job.state,'complete',job.error);
  assert.deepEqual(records.map(entry=>[entry.kind,entry.sessionId]),[['dreamSession','a'],['dreamProject',null],['dreamGlobal',null]]);
  assert.equal(new Set(records.map(entry=>entry.id)).size,3);
  assert.ok(records.every(entry=>entry.status==='success'&&entry.source==='dream'&&entry.usage.inputTokens===100));
  assert.equal(f.hub.live.size,0);assert.equal(f.store.usage().used,450);
});

test('shared Dream isolates a format refusal discovered at manifest admission and completes healthy targets',async t=>{
  const f=fixture(t);f.add('a');f.add('healthy');await f.run();
  const saved=f.store.memory('session:a'),healthyBefore=f.store.memory('session:healthy');
  f.archives.get('a').records[0].summary='a 的新资料';f.archives.get('healthy').records[0].summary='健康会话的新资料';
  f.logs.get('a').revision++;f.logs.get('healthy').revision++;
  const open=f.hub.ctx.sessionPersistence.open;let attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{if(args[0]==='a'&&++attempts===2)throw Object.assign(Error('format became unsupported after successful index sync'),{name:'SessionFormatUnsupportedError'});return open(...args);};
  const job=await f.run();
  assert.equal(attempts,2);assert.equal(job.state,'complete',job.error);assert.deepEqual(f.store.memory('session:a'),saved);
  assert.equal(f.store.session('a').available,false);assert.equal(f.store.session('a').shared,false);
  assert.deepEqual(f.service.status().indexWarnings.map(w=>w.sessionId),['a']);assert(f.store.memory('session:healthy').revision>healthyBefore.revision);assert.match(job.notice,/1 个会话日志异常/);
});

test('explicit session Dream reports a manifest format refusal as failure',async t=>{
  const f=fixture(t);f.add('a');await f.run('session','a');
  const saved=f.store.memory('session:a'),calls=f.calls.length;f.archives.get('a').records[0].summary='尚未整理的新资料';f.logs.get('a').revision++;
  const open=f.hub.ctx.sessionPersistence.open;let attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{if(args[0]==='a'&&++attempts===2)throw Object.assign(Error('requested session format is unsupported'),{name:'SessionFormatUnsupportedError'});return open(...args);};
  const job=await f.run('session','a');assert.equal(attempts,2);assert.equal(job.state,'failed');assert.match(job.error,/requested session format is unsupported/);
  assert.deepEqual(f.store.memory('session:a'),saved);assert.equal(f.calls.length,calls);
});

for(const name of ['SessionPersistenceCorruptionError','SessionFormatUnsupportedError'])test('shared Dream rejects late unreadable sources before publication and continues healthy targets: '+name,async t=>{
  const f=fixture(t);f.add('a');f.add('healthy');await f.run();
  const saved=f.store.memory('session:a'),progress=f.store.progress('session:a'),healthyBefore=f.store.memory('session:healthy'),used=f.store.usage().used;
  f.archives.get('a').records[0].summary='未验证的新资料';f.archives.get('healthy').records[0].summary='健康会话的新资料';
  f.logs.get('a').revision++;f.logs.get('healthy').revision++;
  const open=f.hub.ctx.sessionPersistence.open;let attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{
    if(args[0]==='a'&&++attempts===3)throw Object.assign(Error('source became unreadable before publication'),{name});
    return open(...args);
  };
  const job=await f.run();
  assert.equal(attempts,3);assert.equal(job.state,'complete',job.error);
  assert.deepEqual(f.store.memory('session:a'),saved);assert.deepEqual(f.store.progress('session:a'),progress);
  assert.equal(f.store.session('a').available,false);assert.equal(f.store.session('a').shared,false);
  assert.deepEqual(f.service.status().indexWarnings.map(w=>w.sessionId),['a']);
  assert(f.store.memory('session:healthy').revision>healthyBefore.revision);assert(f.store.usage().used>used,'received model output is still charged');
});

test('pausing during late source refusal preserves cancellation without quarantining the session',async t=>{
  const f=fixture(t);f.add('a');await f.run();const saved=f.store.memory('session:a'),progress=f.store.progress('session:a');
  f.archives.get('a').records[0].summary='未验证的新资料';f.logs.get('a').revision++;
  const open=f.hub.ctx.sessionPersistence.open;let attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{
    if(args[0]==='a'&&++attempts===3){f.service.pause(f.service.activeJob);throw Object.assign(Error('source refusal after pause'),{name:'SessionFormatUnsupportedError'});}
    return open(...args);
  };
  const job=await f.run();assert.equal(attempts,3);assert.equal(job.state,'paused');
  assert.deepEqual(f.store.memory('session:a'),saved);assert.deepEqual(f.store.progress('session:a'),progress);
  assert.equal(f.store.session('a').available,true);assert.equal(f.store.session('a').shared,true);assert.equal(f.store.session('a').readError,undefined);
  assert.deepEqual(f.service.status().indexWarnings,[]);
});
const writeSse=(res,choice,usage)=>res.write('data: '+JSON.stringify({id:'dream-fixture',object:'chat.completion.chunk',model:'fixture',choices:choice?[{index:0,...choice}]:[],...(usage?{usage}:{})})+'\n\n');
const memoryDelta=payload=>({role:'assistant',tool_calls:[{index:0,id:'save-memory',type:'function',function:{name:'save_memory',arguments:JSON.stringify({summary:'真实传输保存的记忆',references:inputOf(payload).sources.map(s=>s.id)})}}]});
function completeSse(res,payload){res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:memoryDelta(payload),finish_reason:'tool_calls'},{prompt_tokens:100,completion_tokens:50,total_tokens:150});res.end('data: [DONE]\n\n');}
async function transportFixture(t,{respond=completeSse,config={},contextWindow=1000000}={}){
  const f=fixture(t,{config});f.add('transport');
  const requests=[],chunks=[],errors=[];
  const server=createServer((req,res)=>{void(async()=>{let body='';for await(const part of req)body+=part;const payload=JSON.parse(body);requests.push(payload);await respond(res,payload,requests.length);})().catch(error=>{errors.push(error);res.destroy();});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const ctx=new Context();new LlmRuntime(ctx);
  class FixtureCredentials extends Service {
    constructor(context){super(context,'credentials');}
    async resolve(){return {value:'local-dream-fixture-only'};}
    async readRecord(){return undefined;}
    async listRecords(){return [];}
  }
  new FixtureCredentials(ctx);
  t.after(async()=>{await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));assert.deepEqual(errors,[]);});
  const hostRequire=createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
  const plugin=await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-llm-pi-ai')).href);
  await ctx.plugin(plugin,{providers:{fixture:{api:'openai-completions',baseURL:`http://127.0.0.1:${server.address().port}/v1`,apiKeyEnv:'DREAM_TRANSPORT_FIXTURE',streamIdleTimeoutMs:5000,models:[{id:'fixture',contextWindow,maxTokens:8192,input:['text']}]}}});
  ctx.on('llm/stream',async function*(options,next){for await(const chunk of next()){chunks.push(structuredClone(chunk));yield chunk;}});
  f.hub.ctx.llm=ctx.llm;f.service.generateOverride=null;
  return {...f,requests,chunks,ctx,server};
}

test('native HTTP SSE transport saves completed calls and rejects EOF without finish_reason',async t=>{
  const good=await transportFixture(t);const saved=await good.run('session','transport');
  assert.equal(saved.state,'complete',saved.error);assert.equal(good.store.usage().used,150);assert.equal(good.requests.length,1);
  assert.equal(good.chunks.findLast(c=>c.type==='finish').reason.kind,'tool-calls');
  const eof=await transportFixture(t,{respond:(res,payload)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:memoryDelta(payload)});res.end();}});
  const failed=await eof.run('session','transport');assert.equal(failed.state,'failed');assert.match(failed.error,/finish_reason/);
  assert.equal(eof.store.memory('session:transport'),null);assert.equal(eof.store.progress('session:transport').length,0);assert(eof.store.usage().used>150);
  assert.equal(eof.chunks.findLast(c=>c.type==='finish').reason.kind,'error');
});
test('native declared model capacity is checked before HTTP dispatch and token reservation',async t=>{
  const f=await transportFixture(t,{contextWindow:1024});
  const info=await f.ctx.llm.resolveModelInfo('fixture','fixture');assert.equal(info.context.contextWindow,1024);
  const job=await f.run('session','transport');assert.equal(job.state,'failed');assert.match(job.error,/模型容量/);
  assert.equal(f.requests.length,0);assert.equal(f.store.usage().used,0);assert.equal(job.calls,0);
});
test('status retains every unfinished job beyond recent history and supplies concrete target titles',t=>{
  const f=fixture(t);f.add('a');f.store.saveSession({id:'a',project:'p',shared:true,title:'现用任务标题',activity:0});const running=f.store.enqueue('session','a');f.store.updateJob(running.id,{state:'running'});
  for(let i=0;i<25;i++){f.advance(1);const queued=f.store.enqueue('project','/projects/'+i);if(i<3)f.store.updateJob(queued.id,{state:['paused','budget','failed'][i]});}
  f.store.enqueue('project','@unclassified');f.store.enqueue('global','global');
  for(let i=0;i<25;i++){f.advance(1);const old=f.store.enqueue('session','history'+i);f.store.updateJob(old.id,{state:'complete'});}
  const status=f.service.status(),active=status.jobs.filter(j=>j.state!=='complete');
  assert.equal(active.length,28);assert.equal(active.find(j=>j.id===running.id)?.targetTitle,'现用任务标题');
  assert.equal(active.find(j=>j.target==='/projects/0')?.targetTitle,'/projects/0');
  assert.equal(active.find(j=>j.target==='@unclassified')?.targetTitle,'未归类');assert.equal(active.find(j=>j.scope==='global')?.targetTitle,'全部共享项目');
  assert(status.jobs.length<=48);assert(status.jobs.every((j,i)=>!i||j.createdAt<=status.jobs[i-1].createdAt));
  assert.equal(f.store.jobs().length,20,'ordinary history reads remain bounded');
});
test('due quota jobs are resumed even when more than one hundred newer historical jobs exist',async t=>{
  const f=fixture(t);f.add('a');const job=f.store.enqueue('session','a',false,{route:f.service.route()});f.store.updateJob(job.id,{state:'budget',resumeAt:0});
  for(let i=0;i<125;i++){f.advance(1);const other=f.store.enqueue('session','old'+i);f.store.updateJob(other.id,{state:'complete'});}
  await f.service.tick();assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.calls.length,1);
});
test('native HTTP disconnect rejects received tool JSON, settles known usage and retries the same job',async t=>{
  const f=await transportFixture(t,{respond:async(res,payload,n)=>{
    if(n>1)return completeSse(res,payload);
    res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:memoryDelta(payload)},{prompt_tokens:100,completion_tokens:50,total_tokens:150});
    await new Promise(r=>setTimeout(r,20));res.destroy();
  }});
  const job=await f.run('session','transport');assert.equal(job.state,'failed');assert(f.chunks.some(c=>c.type==='tool-call-delta'));
  assert.equal(f.chunks.findLast(c=>c.type==='finish').reason.kind,'error');assert.equal(f.store.memory('session:transport'),null);assert.equal(f.store.progress('session:transport').length,0);assert.equal(f.store.usage().used,150);
  f.service.resume(job.id);await f.service.draining;assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.store.job(job.id).calls,2);assert.equal(f.store.usage().used,300);assert.equal(f.requests.length,2);
});
test('native HTTP stream timeout leaves progress untouched and charges its reservation',async t=>{
  const f=await transportFixture(t,{config:{jobTimeoutMs:150},respond:(res,payload)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:memoryDelta(payload)});}});
  const job=await f.run('session','transport');assert.equal(job.state,'failed');assert.match(job.error,/超时/);assert.equal(job.calls,1);
  assert.equal(f.store.memory('session:transport'),null);assert.equal(f.store.progress('session:transport').length,0);assert(f.store.usage().used>150);
  const call=f.store.db.prepare('SELECT reserved,charged,data FROM calls').get();assert.equal(call.charged,call.reserved);assert.equal(JSON.parse(call.data).estimated,true);
});
test('native HTTP cancellation discards late provider usage and results before immediate resume',async t=>{
  let entered,response;const started=new Promise(r=>{entered=r;});
  const f=await transportFixture(t,{respond:(res,payload,n)=>{
    if(n>1)return completeSse(res,payload);
    response=res;res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:{role:'assistant',content:'pending'}});entered(payload);
  }});
  const job=await f.service.enqueue('session','transport'),payload=await started;
  const disconnected=new Promise(r=>response.once('close',r));f.service.pause(job.id);await f.service.draining;await disconnected;
  const held=f.store.usage().used;assert(held>150);assert.equal(f.store.job(job.id).state,'paused');
  writeSse(response,{delta:memoryDelta(payload),finish_reason:'tool_calls'},{prompt_tokens:1,completion_tokens:1,total_tokens:2});response.end('data: [DONE]\n\n');
  f.service.resume(job.id);await f.service.draining;assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.store.memory('session:transport').revision,1);
  assert.equal(f.store.usage().used,held+150);assert.equal(f.store.job(job.id).calls,2);assert.equal(f.requests.length,2);
});
test('native HTTP service replacement resumes durable batches and the original source cut',async t=>{
  let entered;const waiting=new Promise(r=>{entered=r;});
  const f=await transportFixture(t,{respond:(res,payload,n)=>{
    if(n!==2)return completeSse(res,payload);
    res.writeHead(200,{'Content-Type':'text/event-stream'});writeSse(res,{delta:{role:'assistant',content:'waiting for another batch'}});entered();
  }});
  f.archives.get('transport').records[0].summary='长期约定。'.repeat(1600);
  const job=await f.service.enqueue('session','transport');await waiting;
  const previous=f.store.memory('session:transport'),held=f.store.usage().used;
  assert.equal(previous.revision,1);assert(f.store.progress('session:transport').length>0);
  const processed=new Set(inputOf(f.requests[0]).sources.map(s=>s.id));
  f.logs.get('transport').events.push({seq:3,time:Date.now(),type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'after persisted cut'}]}});f.logs.get('transport').revision++;
  f.archives.get('transport').records.push({id:'record-after-restart',sessionId:'transport',summary:'after persisted cut',originalSeqs:[3],ranges:[{from:3,to:3}],createdAt:0});
  await f.service.close();
  const store=new DreamStore(f.hub.store.dir),replacement=new DreamService(f.hub,{store});f.hub.dream=replacement;f.services.push(replacement);
  try {
    assert.equal(store.job(job.id).state,'queued');assert.equal(store.usage().used,held);assert.equal(store.memory('session:transport',1).ref,previous.ref);
    await replacement.start();assert.equal(store.job(job.id).state,'complete');
    assert(f.requests.length>2);assert(f.requests.slice(2).every(p=>inputOf(p).sources.every(s=>!processed.has(s.id))));
    assert(!f.requests.slice(2).some(p=>JSON.stringify(p).includes('after persisted cut')));
    assert.equal(store.usage().used,held+(f.requests.length-2)*150);assert.equal(store.job(job.id).calls,f.requests.length);
    assert.equal(store.db.prepare('SELECT count(*) n FROM job_targets').get().n,0);
    const next=await replacement.enqueue('session','transport');await replacement.draining;assert.equal(store.job(next.id).state,'complete');assert(JSON.stringify(f.requests.at(-1)).includes('after persisted cut'));
  } finally {await replacement.close();}
});

test('global Dream updates session → project → global; unchanged material makes zero further model calls',async t=>{
  const f=fixture(t);f.add('a');const job=await f.run();assert.equal(job.state,'complete');assert.deepEqual(f.calls.map(c=>c.kind),['session','project','global']);
  assert.equal((await f.run()).calls,0);assert.equal(f.calls.length,3);assert.equal(f.store.memory('global').revision,1);
  const record=f.archives.get('a').records[0];record.mode='brief';record.carrierSeq=99;record.version=7;
  assert.equal((await f.run()).calls,0);assert.equal(f.calls.length,3);
});
test('single-session Dream stays local; upper pending versions propagate without another conversation event',async t=>{
  const f=fixture(t);f.add('a');assert.equal((await f.run('session','a')).state,'complete');assert.equal(f.store.memory('global'),null);
  await f.run();assert.deepEqual(f.calls.map(c=>c.kind),['session','project','global']);
});
test('unchanged completed jobs leave no target manifests and do not reread native source bodies',async t=>{
  const f=fixture(t);f.add('a');await f.run();const reads=f.reads().reads;const next=await f.run();assert.equal(f.reads().reads,reads);assert.equal(next.calls,0);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM job_targets').get().n,0);
});
test('many long session summaries stay under each request budget and repeat for zero model calls',async t=>{
  const f=fixture(t,{config:{dreamDailyTokens:1000000},generate:async(input,{request})=>{
    assert(Buffer.byteLength(JSON.stringify(request))+64<=16000);assert(input.sources.length<=24);
    return {value:{summary:'项目约定'.repeat(input.kind==='global'?100:input.kind==='project'?550:275),references:input.sources.map(x=>x.id)},usage:{inputTokens:200,outputTokens:100}};
  }});
  for(let i=0;i<50;i++)f.add('s'+i,{summary:'会话事实'.repeat(300),cwd:'/projects/p'+i%3});
  const job=await f.run();assert.equal(job.state,'complete');assert(f.calls.length>53);const n=f.calls.length;await f.run();assert.equal(f.calls.length,n);
});
test('quote and backslash dense raw logs are batched against the actual serialized request',async t=>{
  const f=fixture(t,{generate:async(input,{request})=>{
    assert(Buffer.byteLength(JSON.stringify(request))+64<=16000);
    return {value:{summary:'已读取 JSON 日志。',references:input.sources.map(s=>s.id)},usage:{inputTokens:100,outputTokens:50}};
  }});
  f.add('json',{summary:'',age:8*86400000});
  f.logs.get('json').events[0].data.content[0].text='"\\'.repeat(2400);
  const job=await f.run('session','json');assert.equal(job.state,'complete',job.error);
  assert(f.calls.length>0);assert(f.store.memory('session:json'));
  const refs=f.calls.flatMap(c=>c.sources).map(s=>f.store.source(s.id)).filter(s=>s.kind==='raw'&&s.seq===0).sort((a,b)=>a.from-b.from);
  assert.equal((await Promise.all(refs.map(s=>f.service.sources.sourceText(s)))).join(''),f.logs.get('json').events[0].data.content[0].text);
});
test('closing waits for manual admission and cancels indexing before closing its database',async t=>{
  const f=fixture(t);f.add('a');
  let release,entered;const started=new Promise(r=>{entered=r;}),list=f.hub.ctx.sessionPersistence.list;
  f.hub.ctx.sessionPersistence.list=async options=>{entered();await new Promise(r=>{release=r;});return list(options);};
  const admitted=f.service.enqueue('session','a').then(()=>null,error=>error);await started;
  const closing=f.service.close();await new Promise(r=>setImmediate(r));
  const closedDuringRead=f.store.closed;release();const error=await admitted;await closing;
  assert.equal(closedDuringRead,false);assert.match(error?.message||'',/退出|关闭|取消/);
  assert.equal(f.calls.length,0);assert.equal(f.store.closed,true);
});
test('closing waits for a native read handle and repeated close calls share completion',async t=>{
  const f=fixture(t);f.add('a');await f.service.sources.sync();
  let release,entered;const started=new Promise(r=>{entered=r;}),open=f.hub.ctx.sessionPersistence.open;
  let handleClosed=false;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{
    const handle=await open(...args);
    return {...handle,read:async(...readArgs)=>{entered();await new Promise(r=>{release=r;});return handle.read(...readArgs);},close:async()=>{handleClosed=true;await handle.close();}};
  };
  const reading=f.service.sources.inspect('a').then(()=>null,error=>error);await started;
  const closing=f.service.close();assert.equal(f.service.close(),closing);
  await new Promise(r=>setImmediate(r));assert.equal(f.store.closed,false);
  release();assert.match((await reading).message,/退出/);await closing;
  assert.equal(handleClosed,true);assert.equal(f.store.closed,true);
  await assert.rejects(f.service.sources.sync(),/退出/);
});
test('closing removes a Dream call waiting in the shared native background queue',async t=>{
  const f=fixture(t);f.add('a');
  let entered;const waiting=new Promise(r=>{entered=r;}),slots={activeCalls:1,callWaiters:[],config:()=>({backgroundConcurrency:1})};
  f.hub.context.withCallSlot=(run,signal,lowPriority)=>{const call=ContextPipeline.prototype.withCallSlot.call(slots,run,signal,lowPriority);entered();return call;};
  await f.service.enqueue('session','a');await waiting;
  assert.equal(slots.callWaiters.length,1);await f.service.close();
  assert.equal(slots.callWaiters.length,0);assert.equal(slots.activeCalls,1);assert.equal(f.calls.length,0);
});
test('independent sessions can be read and dreamt explicitly but never enter project/global jobs',async t=>{
  const f=fixture(t);f.add('private',{scope:'session',summary:'不共享的私人内容'});f.add('shared');
  await f.run();assert.equal(f.store.memory('session:private'),null);assert(!JSON.stringify(f.calls).includes('不共享'));
  await f.run('session','private');const n=f.calls.length;await f.run();assert.equal(f.calls.length,n);
  const r=await readDream(f.hub,{sessionId:'private',id:'r-private'},{id:'shared'});assert.match(r.text,/不共享的私人内容/);
});
for(const preset of ['standard','intelligent-chat'])test('managed projectless Chat never enters shared Dream despite an old project binding: '+preset,async t=>{
  const f=fixture(t,{config:{memoryScope:'project'}});
  const directory=realpathSync(f.hub.store.dir);
  f.hub.projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir:join(directory,'projectless')});
  const workspace=await f.hub.projectless.prepare({requestId:'chat-'+preset,prompt:'无工作区聊天'});
  f.add('chat',{cwd:workspace.cwd,summary:'PROJECTLESS_CHAT_SENTINEL',age:8*86400000});
  f.logs.get('chat').header.agentPreset=preset;
  f.add('shared');
  const job=await f.run();assert.equal(job.state,'complete',job.error);
  assert(!JSON.stringify(f.calls).includes('PROJECTLESS_CHAT_SENTINEL'),'shared Dream model input must exclude managed Chat material');
  assert.equal(f.store.session('chat').mode,'session');assert.equal(f.store.session('chat').shared,false);
  assert.equal(f.store.memory('session:chat'),null);
  assert(!f.store.projects().includes(projectOf(workspace.cwd)),'the generated Chat directory must not become a Dream project');
  await assert.rejects(f.run('project',projectOf(workspace.cwd)),/没有可共享的会话/);
  await f.run('session','chat');assert(f.store.memory('session:chat'),'explicit session Dream remains available');
  assert.match((await readDream(f.hub,{sessionId:'chat',id:'r-chat'},{id:'shared'})).text,/PROJECTLESS_CHAT_SENTINEL/);
  const calls=f.calls.length;await f.run();assert.equal(f.calls.length,calls,'explicit Chat memory must not propagate later');
});
test('automatic Dream excludes managed projectless Chat and withdraws its legacy shared contribution on restart',async t=>{
  const f=fixture(t,{config:{memoryScope:'project',dreamAutoEnabled:true}});
  const directory=realpathSync(f.hub.store.dir);
  const projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir:join(directory,'projectless')});
  const workspace=await projectless.prepare({requestId:'legacy-chat',prompt:'旧聊天'});
  f.add('chat',{cwd:workspace.cwd,summary:'LEGACY_PROJECTLESS_CHAT_SENTINEL'});f.add('shared');
  await f.run();const saved=f.store.memory('session:chat');assert(saved,'fixture reproduces an existing shared Chat memory');
  // Recreate the real service from durable claims, as an upgraded/restarted host does.
  f.hub.projectless=createProjectlessWorkspaceService({root:projectless.root,storeDir:join(directory,'projectless')});
  const first=f.calls.length;await f.service.sources.sync();
  assert.equal(f.store.session('chat').shared,false);assert.equal(f.store.memory('global').invalid,true);
  await f.service.start();
  const automatic=f.store.jobs().find(job=>job.automatic);
  assert(automatic);assert.equal(automatic.state,'complete',automatic.error);
  assert(!JSON.stringify(f.calls.slice(first)).includes('LEGACY_PROJECTLESS_CHAT_SENTINEL'),'automatic Dream must exclude legacy Chat sources');
  assert.deepEqual(f.store.memory('session:chat'),saved,'completed session memory remains available locally');
  assert(!f.store.projects().includes(projectOf(workspace.cwd)));
  assert.equal(f.store.memory('global').invalid,undefined);
  assert.equal((await readDream(f.hub,{memory:'global'},{id:'shared'})).kind,'global');
});
test('projectless ancestry stays independent without Hub state, while explicit Workspace membership admits a promoted session',async t=>{
  const f=fixture(t),directory=realpathSync(f.hub.store.dir);
  f.hub.projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir:join(directory,'projectless')});
  const chat=await f.hub.projectless.prepare({requestId:'parent-chat',prompt:'独立Chat'});
  f.add('parent',{cwd:chat.cwd,summary:'PRIVATE_PARENT_SENTINEL'});f.states.delete('parent');
  f.add('child',{cwd:'/projects/fork',summary:'PRIVATE_CHILD_SENTINEL'});f.logs.get('child').header.parentSession='parent';
  f.add('promoted',{cwd:chat.cwd,summary:'PROMOTED_WORKSPACE_SENTINEL'});
  f.add('same-directory-unattached',{cwd:chat.cwd,summary:'PRIVATE_UNATTACHED_SENTINEL'});
  f.hub.ctx.workspaceRegistry={list:()=>[{path:chat.cwd,sessionIds:['promoted']}]};
  await f.run();const payload=JSON.stringify(f.calls);
  assert(!/PRIVATE_(?:PARENT|CHILD|UNATTACHED)_SENTINEL/.test(payload));
  assert(payload.includes('PROMOTED_WORKSPACE_SENTINEL'));
  assert.equal(f.store.session('child').shared,false);assert.equal(f.store.session('promoted').shared,true);
});
test('projectless claims remain independent after the configured allocation root changes',async t=>{
  const f=fixture(t),directory=realpathSync(f.hub.store.dir),storeDir=join(directory,'projectless');
  const before=createProjectlessWorkspaceService({root:join(directory,'old-chats'),storeDir});
  const chat=await before.prepare({requestId:'old-root-chat',prompt:'旧根目录Chat'});
  f.hub.projectless=createProjectlessWorkspaceService({root:join(directory,'new-chats'),storeDir});
  f.add('old-chat',{cwd:chat.cwd,summary:'OLD_ROOT_PRIVATE_SENTINEL'});f.add('shared');
  await f.run();assert(!JSON.stringify(f.calls).includes('OLD_ROOT_PRIVATE_SENTINEL'));
  assert.equal(f.store.session('old-chat').shared,false);
});
test('deleted Chat files do not erase persistent allocation provenance or share its history',async t=>{
  const f=fixture(t),directory=realpathSync(f.hub.store.dir);
  f.hub.projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir:join(directory,'projectless')});
  const chat=await f.hub.projectless.prepare({requestId:'deleted-chat',prompt:'已删除文件的Chat'});
  f.add('chat',{cwd:chat.cwd,summary:'DELETED_CHAT_PRIVATE_SENTINEL'});f.add('shared');
  rmSync(chat.cwd,{recursive:true});
  assert.equal(await f.hub.projectless.owns(chat.cwd),false,'file operations still require a live directory');
  assert.equal(await f.hub.projectless.owns(chat.cwd,{requireDirectory:false}),true,'Dream checks durable allocation provenance');
  await f.run();assert(!JSON.stringify(f.calls).includes('DELETED_CHAT_PRIVATE_SENTINEL'));
  assert.equal(f.store.session('chat').shared,false);
});
test('a claimed parent promoted to Workspace admits a workflow child in another directory',async t=>{
  const f=fixture(t),directory=realpathSync(f.hub.store.dir);
  f.hub.projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir:join(directory,'projectless')});
  const chat=await f.hub.projectless.prepare({requestId:'promoted-parent',prompt:'转工作区Chat'});
  f.add('parent',{cwd:chat.cwd});f.states.delete('parent');
  f.add('child',{cwd:'/projects/worktree',summary:'SHARED_WORKFLOW_SENTINEL'});f.logs.get('child').header.parentSession='parent';
  f.hub.ctx.workspaceRegistry={list:()=>[{path:chat.cwd,sessionIds:['parent']}]};
  await f.run();assert.equal(f.store.session('child').shared,true);
  assert(JSON.stringify(f.calls).includes('SHARED_WORKFLOW_SENTINEL'));
});
test('ownership refresh isolates Hub injection and recovers from optional storage failure',async t=>{
  const f=fixture(t);f.add('chat');const header=f.logs.get('chat').header;
  f.hub.projectless={owns:async()=>{throw Error('ownership storage failure');}};
  await f.service.sources.refreshScope(header);
  assert.equal(f.store.session('chat').shared,false);assert.match(f.store.session('chat').scopeError,/ownership storage failure/);
  assert.equal(Hub.prototype.scope.call(f.hub,{id:'chat',header}).mode,'session');
  assert.equal(Hub.prototype.scope.call(f.hub,{id:'chat',header},{effective:false}).mode,'project','temporary effective isolation never overwrites the configured preference');
  f.hub.projectless={owns:async()=>false};await f.service.sources.refreshScope(header);
  assert.equal(f.store.session('chat').shared,true);assert.equal(f.store.session('chat').scopeError,undefined);
  assert.equal(Hub.prototype.scope.call(f.hub,{id:'chat',header}).mode,'project');
});
test('a completed independent archive remains private after Workspace attachment without overwriting the saved preference',async t=>{
  const f=fixture(t);f.add('chat');f.states.get('chat').started=true;
  f.archives.get('chat').binding.scope='session';
  f.hub.ctx.workspaceRegistry={list:()=>[{sessionIds:['chat']}]};
  const session={id:'chat',header:f.logs.get('chat').header};
  assert.equal(Hub.prototype.scope.call(f.hub,session).mode,'session');
  assert.equal(Hub.prototype.scope.call(f.hub,session,{effective:false}).mode,'project');
  assert.equal((await f.service.sources.scopeFor(session.header)).shared,false);
});
test('resumed legacy shared targets and owned-only parents make no further Chat model calls',async t=>{
  const f=fixture(t),directory=realpathSync(f.hub.store.dir),storeDir=join(directory,'projectless');
  const projectless=createProjectlessWorkspaceService({root:join(directory,'chats'),storeDir});
  const chat=await projectless.prepare({requestId:'queued-chat',prompt:'旧Chat队列'});
  f.add('chat',{cwd:chat.cwd,summary:'QUEUED_PRIVATE_SENTINEL'});await f.run();
  const prior=f.calls.length,job=f.store.enqueue('global','global',false,{route:f.service.route()});
  const epoch=f.store.acquire();
  assert.equal(f.store.claimJob(epoch).id,job.id);
  f.store.setTargets(job.id,[{kind:'session',target:'chat'},{kind:'project',target:projectOf(chat.cwd)},{kind:'global',target:'global'}],epoch);
  f.store.updateJob(job.id,{state:'queued'});
  f.store.release(epoch);
  f.hub.projectless=projectless;await f.service.drain();
  assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.calls.length,prior);
  assert.equal(f.store.memory('global').invalid,true);assert.equal(f.store.memory('project:'+projectOf(chat.cwd)).invalid,true);
});
test('Dream close waits for an ownership read and rejects its late scope commit',async t=>{
  const f=fixture(t);f.add('chat');
  let entered,release;const waiting=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});
  f.hub.projectless={owns:async()=>{entered();await held;return true;}};
  const inspection=f.service.sources.inspect('chat');
  const rejected=assert.rejects(inspection,/退出/);await waiting;
  let closed=false;const closing=f.service.close().then(()=>{closed=true;});
  await new Promise(r=>setImmediate(r));assert.equal(closed,false);
  release();await rejected;await closing;
});
test('read-only scope GET is tracked through shutdown and cannot publish a late success',async t=>{
  const f=fixture(t);f.add('chat');
  let entered,release,sent=false;const waiting=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});
  f.hub.projectless={owns:async()=>{entered();await held;return true;}};
  const request=handleContextApi({hub:f.hub,ctx:f.hub.ctx,req:{method:'GET'},res:{},
    url:new URL('http://localhost/trisoul-x/api/scope?session=chat'),id:'chat',
    session:{id:'chat',header:f.logs.get('chat').header,snapshotEvents:()=>[]},
    send(){sent=true;},readBody:async()=>({})});
  const rejected=assert.rejects(request,/退出/);await waiting;
  let closed=false;const closing=f.service.close().then(()=>{closed=true;});
  await new Promise(r=>setImmediate(r));assert.equal(closed,false);release();
  await rejected;await closing;assert.equal(sent,false);
});
test('unbound native sessions inherit the independent default while existing project bindings remain shared',async t=>{
  const f=fixture(t,{config:{memoryScope:'session'}});
  f.add('unbound',{summary:'',age:8*86400000});f.states.delete('unbound');f.archives.delete('unbound');
  f.add('bound');f.states.delete('bound');
  const job=await f.run();assert.equal(job.state,'complete');
  assert.equal(f.store.session('unbound').shared,false);assert.equal(f.store.session('bound').shared,true);
  assert.equal(f.store.memory('session:unbound'),null);assert(f.store.memory('session:bound'));
  assert(!f.calls.flatMap(c=>c.sources).some(s=>f.store.source(s.id)?.sessionId==='unbound'));
  await f.run('session','unbound');assert(f.store.memory('session:unbound'));
  const raw=f.calls.at(-1).sources.map(s=>f.store.source(s.id)).find(s=>s.kind==='raw'&&s.seq===0);
  assert.match((await readDream(f.hub,{reference:raw.id},{id:'bound'})).text,/仅保留四个入口/);
  f.cfg.memoryScope='project';f.add('explicit-private',{scope:'session',age:8*86400000});
  await f.run();assert.equal(f.store.session('explicit-private').shared,false);assert.equal(f.store.memory('session:explicit-private'),null);
  assert.match((await readDream(f.hub,{sessionId:'explicit-private',id:'r-explicit-private'},{id:'bound'})).text,/已完成读取/);
});
test('old raw material is separately eligible; missing summaries never bypass the age gate',async t=>{
  const f=fixture(t);f.add('fresh',{summary:''});f.add('old',{summary:'',age:8*86400000});
  await f.run('session','fresh');assert.equal(f.calls.length,0);await f.run('session','old');assert.equal(f.calls.length,1);assert(f.calls[0].sources.some(s=>s.text.includes('[user')));
  f.advance(8*86400000);await f.run('session','fresh');assert.equal(f.calls.length,2);await f.run('session','old');assert.equal(f.calls.length,2);
});
test('new summaries and deep progress are independent, and merged decision records remain eligible',async t=>{
  const f=fixture(t);const r=f.add('a');r.decisions=[{seq:0,text:'四个入口',quote:'四个入口'}];r.mergedInto='new';
  await f.run('session','a');assert.match(f.calls[0].sources[0].text,/四个入口/);assert(!f.calls[0].sources.some(x=>x.text.includes('[user')));
  f.advance(8*86400000);await f.run('session','a');assert(f.calls[1].sources.some(x=>x.text.includes('[user')));
  assert(!f.calls[1].sources.some(x=>x.text.startsWith('用户决定')));
});
test('source mutation while generation runs rejects the result and leaves progress untouched',async t=>{
  const f=fixture(t,{generate:async(input,_,f)=>{f.archives.get('a').records[0].summary='Changed';return {summary:'stale',references:input.sources.map(x=>x.id)};}});f.add('a');
  const job=await f.run('session','a');assert.equal(job.state,'failed');assert.match(job.error,/摘要在生成期间改变/);assert.equal(f.store.memory('session:a'),null);assert.equal(f.store.progress('session:a').length,0);
});
test('pause blocks late results and charges unknown usage; resume processes the original cut',async t=>{
  let resolve,entered;const started=new Promise(r=>{entered=r;});let first=true;
  const f=fixture(t,{generate:async input=>{if(first){first=false;entered();await new Promise(r=>{resolve=r;});}return {summary:'saved',references:input.sources.map(x=>x.id)};}});f.add('a');
  const job=await f.service.enqueue('session','a');await started;f.service.pause(job.id);resolve();await f.service.draining;
  assert.equal(f.store.job(job.id).state,'paused');assert.equal(f.store.memory('session:a'),null);assert(f.store.usage().used>0);
  f.service.resume(job.id);await f.service.draining;assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.store.memory('session:a').summary,'saved');
});
test('immediate resume restarts the same pinned cut and never publishes the abandoned response',async t=>{
  let entered,release;const started=new Promise(r=>{entered=r;});let first=true;
  const f=fixture(t,{generate:async input=>{
    if(first){first=false;entered();await new Promise(r=>{release=r;});return {summary:'abandoned',references:input.sources.map(s=>s.id)};}
    return {summary:'resumed',references:input.sources.map(s=>s.id)};
  }});f.add('a');
  const job=await f.service.enqueue('session','a');await started;
  f.logs.get('a').events.push({seq:3,time:Date.now(),type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'after pinned cut'}]}});f.logs.get('a').revision++;
  f.archives.get('a').records.push({id:'r-after',sessionId:'a',summary:'after pinned cut',originalSeqs:[3],ranges:[{from:3,to:3}],createdAt:0});
  f.service.pause(job.id);f.service.resume(job.id);await f.service.draining;
  assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.store.memory('session:a').summary,'resumed');
  assert.equal(f.calls.length,2);assert(!JSON.stringify(f.calls).includes('after pinned cut'));
  release();await new Promise(r=>setImmediate(r));assert.equal(f.store.memory('session:a').summary,'resumed');
  await f.run('session','a');assert.equal(f.calls.length,3);assert.match(f.calls.at(-1).sources[0].text,/after pinned cut/);
});
test('daily quota is enforced before a model call and persists through resumption',async t=>{
  const f=fixture(t,{config:{dreamDailyTokens:1}});f.add('a');const job=await f.run();assert.equal(job.state,'budget');assert.equal(f.calls.length,0);
  f.cfg.dreamDailyTokens=200000;f.service.resume(job.id);await f.service.draining;assert.equal(f.store.job(job.id).state,'complete');assert.equal(f.calls.length,3);
});
test('zero background timeout leaves Dream generation running until completion or cancellation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let entered,release,modelSignal;const started=new Promise(r=>{entered=r;});
  const f=fixture(t,{config:{jobTimeoutMs:0},generate:async(input,{signal})=>{modelSignal=signal;entered();await new Promise(r=>{release=r;});return {summary:'finished',references:[]};}});
  const job=f.store.enqueue('session','a',false,{route:f.service.route()});
  f.service.epoch=f.store.acquire();f.store.claimJob(f.service.epoch);
  const generating=f.service.generate({kind:'session',target:'a',sources:[]},job,new AbortController().signal);
  generating.catch(()=>{});await started;
  try{t.mock.timers.tick(600001);assert.equal(modelSignal.aborted,false,'0 must not silently install the default ten-minute deadline');}
  finally{release();await generating.catch(()=>{});}
  assert.equal((await generating).summary,'finished');
});
test('an expired executor cannot fail a job already taken over or consume the next queued job',async t=>{
  let releaseOld,enteredOld,releaseNew,enteredNew;
  const oldStarted=new Promise(r=>{enteredOld=r;}),newStarted=new Promise(r=>{enteredNew=r;});
  const answer=input=>({summary:'current owner result',references:input.sources.map(s=>s.id)});
  const f=fixture(t,{generate:async input=>{enteredOld();await new Promise(r=>{releaseOld=r;});return answer(input);}});
  f.add('a');f.add('b');
  const first=await f.service.enqueue('session','a');await oldStarted;
  const second=await f.service.enqueue('session','b');
  f.advance(60001);
  const store=new DreamStore(f.hub.store.dir,{now:f.store.now});
  const successor=new DreamService(f.hub,{store,generate:async input=>{if(input.target==='a'){enteredNew();await new Promise(r=>{releaseNew=r;});}return answer(input);}});
  f.services.push(successor);
  const takingOver=successor.drain();await newStarted;
  releaseOld();await f.service.draining;
  try{
    assert.equal(store.job(first.id).state,'running','the stale executor must leave its successor in control');
    assert.equal(store.job(second.id).state,'queued','the stale executor must not claim more queue work');
    assert.equal(store.memory('session:a'),null);
  }finally{releaseNew();await takingOver;}
  assert.equal(store.job(first.id).state,'complete');assert.equal(store.job(second.id).state,'complete');
  assert.equal(store.memory('session:a').revision,1);assert.equal(store.memory('session:b').revision,1);
});
test('changing scope invalidates already-published aggregates before another Dream and removes the contribution',async t=>{
  const f=fixture(t);f.add('a');await f.run();f.states.get('a').memoryScope='session';f.archives.get('a').binding.scope='session';await f.service.sources.sync();
  assert.equal(f.store.memory('global').invalid,true);assert.equal((await readDream(f.hub,{memory:'global'},{id:'a'})).kind,'awaiting_refresh');
  const calls=f.calls.length;await f.run();assert.equal(f.calls.length,calls,'an empty shared scope needs no background model');
  assert.equal(f.store.memory('global').invalid,true,'historic private contributions remain unavailable for injection');
});
test('removed native sessions are excluded; remembered shared summaries do not recreate the session',async t=>{
  const f=fixture(t);f.add('a');await f.run();f.logs.delete('a');await f.service.sources.sync();assert.equal(f.store.session('a').available,false);assert.deepEqual(f.store.projects(),[]);assert.equal(f.hub.ctx.agents.size,0);
});

test('unsupported historical formats do not block startup, automatic Dream or healthy sessions',async t=>{
  const f=fixture(t,{config:{dreamAutoEnabled:true}});f.add('legacy');f.add('healthy');
  const open=f.hub.ctx.sessionPersistence.open;let attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{
    if(args[0]==='legacy'){attempts++;throw Object.assign(Error('cannot safely transform unclassified message source'),{name:'SessionFormatUnsupportedError'});}
    return open(...args);
  };
  f.store.setMeta('indexError','previous startup failure');
  await f.service.start();
  assert.equal(f.service.status().indexError,null);
  assert.equal(f.store.session('legacy').available,false);assert.equal(f.store.session('legacy').shared,false);
  assert.equal(f.service.status().indexWarnings[0].sessionId,'legacy');
  assert.equal(f.store.session('healthy').available,true);assert(f.store.memory('session:healthy'));
  assert.equal(f.store.jobs()[0].state,'complete');assert.match(f.store.jobs()[0].notice,/1 个会话日志异常/);
  assert.equal(attempts,1,'unchanged format refusals are not reparsed on every internal scan');
  assert.equal((await f.run()).state,'complete');assert.equal(attempts,1);
});

for(const name of ['SessionPersistenceCorruptionError','SessionFormatUnsupportedError'])test(`manual refresh retries ${name} even when host compatibility changes without a log revision`,async t=>{
  const f=fixture(t);f.add('recovering');f.add('healthy');
  const open=f.hub.ctx.sessionPersistence.open;let broken=true,attempts=0;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{
    if(args[0]==='recovering'){attempts++;if(broken)throw Object.assign(Error('historical source unavailable'),{name});}
    return open(...args);
  };
  await f.service.sources.sync();
  const revision=f.logs.get('recovering').revision,healthyReads=f.reads().reads;
  broken=false;await f.service.sources.sync();assert.equal(attempts,1);
  let response;
  await handleDreamApi({hub:f.hub,ctx:f.hub.ctx,req:{method:'POST'},url:new URL('http://local/trisoul-x/api/dream/refresh'),send:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);assert.deepEqual(response.data.indexWarnings,[]);assert.equal(response.data.indexError,null);
  assert.equal(attempts,2);assert.equal(f.logs.get('recovering').revision,revision);
  assert.equal(f.reads().reads,healthyReads+1,'refresh retries failed sources without rereading unchanged healthy logs');
  assert.equal(f.store.session('recovering').available,true);assert.equal(f.store.session('recovering').shared,true);
  assert.equal(f.calls.length,0,'recovery refresh does not call a model');
  assert.equal((await f.run()).state,'complete');assert(f.store.memory('session:recovering'));
});

test('format refusal withdraws shared contributions, preserves prior memory and recovers on revision change',async t=>{
  const f=fixture(t);f.add('a');f.add('b');await f.run();
  const saved=f.store.memory('session:a'),open=f.hub.ctx.sessionPersistence.open;let broken=true;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{if(args[0]==='a'&&broken)throw Object.assign(Error('unsupported historical source'),{name:'SessionFormatUnsupportedError'});return open(...args);};
  f.logs.get('a').revision++;await f.service.sources.sync();
  assert.deepEqual(f.store.memory('session:a'),saved);assert.equal(f.store.memory('global').invalid,true);
  assert.equal((await f.run()).state,'complete');assert.equal(f.store.session('b').shared,true);
  broken=false;f.logs.get('a').revision++;await f.service.sources.sync();
  assert.equal(f.store.session('a').shared,true);assert.deepEqual(f.service.status().indexWarnings,[]);
  assert.equal((await f.run()).state,'complete');assert.equal(f.store.memory('global').invalid,undefined);
});

test('resumed shared jobs skip unreadable persisted targets and still process healthy targets',async t=>{
  let failing=true;
  const f=fixture(t,{generate:input=>{if(failing)throw Error('provider interrupted');return {summary:'健康来源的记忆',references:input.sources.map(source=>source.id)};}});
  f.add('a');f.add('b');const first=await f.run();assert.equal(first.state,'failed');assert.equal(first.targetsReady,true);
  const open=f.hub.ctx.sessionPersistence.open;
  f.hub.ctx.sessionPersistence.open=async(...args)=>{if(args[0]==='a')throw Object.assign(Error('unsupported historical source'),{name:'SessionFormatUnsupportedError'});return open(...args);};
  f.logs.get('a').revision++;failing=false;
  f.service.resume(first.id);await f.service.draining;
  assert.equal(f.store.job(first.id).state,'complete',f.store.job(first.id).error);
  assert.equal(f.store.session('a').shared,false);assert(f.store.memory('session:b'));assert(f.store.memory('global'));
  assert.match(f.store.job(first.id).notice,/1 个会话日志异常/);
});

test('one corrupt archived session leaves healthy Dream sources usable and retries after its revision changes',async t=>{
  const f=fixture(t);f.add('broken');f.add('healthy');
  const persistence=f.hub.ctx.sessionPersistence,open=persistence.open;let broken=true,attempts=0,brokenCloses=0;
  persistence.open=async(...args)=>{const handle=await open(...args);return args[0]==='broken'?{...handle,read:async()=>{
    attempts++;if(broken)throw Object.assign(Error('stored log has a seq gap'),{name:'SessionPersistenceCorruptionError'});
    return handle.read();
  },close:async()=>{brokenCloses++;await handle.close();}}:handle;};
  const first=await f.run();assert.equal(first.state,'complete');assert.match(first.notice,/1 个会话日志异常/);
  assert.equal(f.store.session('broken').available,false);
  assert.equal(f.store.session('broken').shared,false);
  assert.equal(f.store.session('healthy').available,true);
  assert.equal(f.store.memory('session:broken'),null);
  assert.equal(f.service.status().indexWarnings[0].sessionId,'broken');
  assert.equal(f.service.status().indexError,null);
  const tried=attempts;await f.service.sources.sync();assert.equal(attempts,tried,'unchanged corruption is not reparsed on every scan');
  assert.equal(brokenCloses,attempts,'failed native reads also close their handles');
  broken=false;f.logs.get('broken').revision++;
  let response;
  await handleDreamApi({hub:f.hub,ctx:f.hub.ctx,req:{method:'POST'},url:new URL('http://local/trisoul-x/api/dream/refresh'),send:(_res,status,data)=>{response={status,data};}});
  assert.equal(response.status,200);assert.equal(response.data.indexWarnings.length,0);
  assert.equal(f.store.session('broken').available,true);assert.equal(f.store.session('broken').shared,true);
  assert.equal((await f.run()).state,'complete');assert(f.store.memory('session:broken'));
});

test('corruption withdraws an indexed session from shared memory without deleting its last readable version',async t=>{
  const f=fixture(t);f.add('a');f.add('b');await f.run();const saved=f.store.memory('session:a');
  const persistence=f.hub.ctx.sessionPersistence,open=persistence.open;
  persistence.open=async(...args)=>{if(args[0]==='a')throw Object.assign(Error('corrupt source'),{name:'SessionPersistenceCorruptionError'});return open(...args);};
  f.logs.get('a').revision++;await f.service.sources.sync();
  assert.equal(f.store.memory('global').invalid,true);assert.deepEqual(f.store.memory('session:a'),saved);
  assert.equal((await f.run()).state,'complete');assert.equal(f.store.session('b').shared,true);
});

test('source cancellation and unrelated failures remain failures instead of unreadable-session warnings',async t=>{
  const f=fixture(t);f.add('a');const controller=new AbortController();
  f.hub.ctx.sessionPersistence.open=async()=>{controller.abort(Error('stop scan'));throw Object.assign(Error('corrupt while stopping'),{name:'SessionPersistenceCorruptionError'});};
  await assert.rejects(f.service.sources.sync(controller.signal),/stop scan/);assert.equal(f.store.session('a'),null);
  f.hub.ctx.sessionPersistence.open=async()=>{throw Error('storage unavailable');};
  await assert.rejects(f.service.sources.sync(),/storage unavailable/);assert.equal(f.store.session('a'),null);
});
test('fork inherited prefix is not distilled again; native source reads close handles',async t=>{
  const f=fixture(t);f.add('fork',{inherited:3,age:8*86400000});await f.run('session','fork');assert.equal(f.calls.length,0);assert(f.reads().closes>0);assert.equal(f.hub.ctx.agents.size,0);
});
test('paged archive and provenance reads retain exact reference identity and bounded text',async t=>{
  const f=fixture(t);f.add('a');await f.run();let read=await readDream(f.hub,{memory:'global'},{id:'a'});let depth=0;
  while(read.sources?.length){read=await readDream(f.hub,{reference:read.sources[0].reference},{id:'a'});assert(Buffer.byteLength(JSON.stringify(read))<4000);depth++;}
  assert.equal(depth,3);assert.equal(read.recordId,'r-a');const records=await readDream(f.hub,{sessionId:'a'},{id:'b'});assert.equal(records.entries[0].id,'r-a');
});

test('native title events refresh the Dream directory without changing activity or sharing', async t => {
  const f = fixture(t);
  f.add('rename-session', { scope: 'session' });
  await f.service.sources.inspect('rename-session');
  const before = f.store.session('rename-session'), revision = f.store.meta('catalogRevision'), reads = f.reads();
  f.service.sources.observe({ id: 'rename-session', header: f.logs.get('rename-session').header }, { type: 'session/title', data: { title: '确认新版交付清单' }, time: before.activity + 99999 });
  assert.deepEqual(f.store.session('rename-session'), { ...before, title: '确认新版交付清单' });
  assert.equal(f.store.meta('catalogRevision'), revision + 1);
  assert.deepEqual(f.reads(), reads, 'a rename does not scan the session archive');
  assert.equal(f.calls.length, 0, 'a rename never invokes the model');
});

test('a title before the first observed message seeds directory metadata without making the session active', t => {
  const f = fixture(t);
  f.add('early-title', { scope: 'session' });
  const reads = f.reads();
  f.service.sources.observe({ id: 'early-title', header: f.logs.get('early-title').header }, { type: 'session/title', data: { title: '先命名再开始的会话' }, time: Date.now() });
  const session = f.store.session('early-title');
  assert.equal(session?.title, '先命名再开始的会话');
  assert.equal(session.activity, 0);
  assert.equal(session.shared, false);
  assert.deepEqual(f.reads(), reads);
  assert.equal(f.calls.length, 0);
});
