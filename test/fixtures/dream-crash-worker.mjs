import { Context, Service } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DreamStore } from '../../src/dream/store.mjs';
import { DreamService } from '../../src/dream/service.mjs';
import { createEffortResolver } from '../../src/effort.mjs';
import { ContextStore } from '../../src/context/store.mjs';
import { HubStore, projectOf } from '../../src/hub-store.mjs';
import { readDream } from '../../src/dream/recall.mjs';

const [directory,endpoint,seed]=process.argv.slice(2),ctx=new Context();
const archive=new ContextStore(directory),stateStore=new HubStore(directory),cwd=join(directory,'project'),project=projectOf(cwd);
await mkdir(cwd,{recursive:true});
new LlmRuntime(ctx);
class FixtureCredentials extends Service {
  constructor(context){super(context,'credentials');}
  async resolve(){return {value:'local-dream-crash-fixture'};}
  async readRecord(){return undefined;}
  async listRecords(){return [];}
}
new FixtureCredentials(ctx);
const requireHost=createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const pi=await import(pathToFileURL(requireHost.resolve('@deepseek-ai/dsh-llm-pi-ai')).href);
await ctx.plugin(pi,{providers:{fixture:{api:'openai-completions',baseURL:endpoint,apiKeyEnv:'DREAM_CRASH_FIXTURE',streamIdleTimeoutMs:120000,models:[{id:'fixture',contextWindow:1000000,maxTokens:8192,input:['text']}]}}});
await ctx.plugin(Persistence,{root:join(directory,'logs'),compression:'none'});
const config={memoryScope:'project',dreamProvider:'fixture',dreamModel:'fixture',dreamDailyTokens:1000000,dreamDeepAgeMs:7*86400000,backgroundMaxRetries:0,jobTimeoutMs:120000};
const store=new DreamStore(directory),hub={ctx,store:stateStore,config:()=>config,scope:()=>({mode:'project',project}),context:{store:archive,adapter:{message:text=>({role:'user',content:[{type:'text',text}]})}}};
hub.efforts=createEffortResolver(ctx);
const service=hub.dream=new DreamService(hub,{store});

if(seed==='seed'){
  const at=Date.now()-1000;
  for(const id of ['shared','private']){
    const writer=await ctx.sessionPersistence.create({id,version:4,isSeeded:false,delegationDepth:0,createdAt:at,agentPreset:'anchored-standard',cwd});
    try {
      await writer.append([
        {seq:0,time:at,type:'turn/start',data:{turn:1}},
        {seq:1,time:at+1,type:'user/message',data:{id:'user-'+id,role:'user',source:{kind:'user'},content:[{type:'text',text:id==='private'?'PRIVATE_CRASH_SENTINEL':'PUBLIC_CRASH_ORIGINAL'}]},surfaceOp:'append'},
        {seq:2,time:at+2,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
      ]);
    }finally{await writer.close();}
    const state=stateStore.state(id);state.memoryScope=id==='private'?'session':'project';state.cwd=cwd;stateStore.save(state);
    const context=archive.state(id,{scope:id==='private'?'session':'project',project,title:id});
    context.records.push({id:'record-'+id,sessionId:id,summary:id==='private'?'PRIVATE_CRASH_SENTINEL':'PUBLIC-CRASH-FACT '.repeat(1600),originalSeqs:[1],sourceSeqs:[1],ranges:[{from:1,to:1}],documents:[],createdAt:at});archive.save(context);
  }
}

function snapshot(){
  return {owner:store.owner,lease:store.db.prepare('SELECT * FROM lease WHERE id=1').get()||null,
    jobs:store.jobs(200),targets:store.db.prepare('SELECT * FROM job_targets ORDER BY job,ordinal').all().map(t=>({...t,cut:t.cut?JSON.parse(t.cut):null})),
    memories:store.db.prepare('SELECT data FROM memories ORDER BY key').all().map(r=>JSON.parse(r.data)),
    versions:store.db.prepare('SELECT key,revision,data FROM versions ORDER BY key,revision').all().map(r=>({...r,data:JSON.parse(r.data)})),
    progress:store.progress('session:shared'),calls:store.db.prepare('SELECT * FROM calls ORDER BY rowid').all().map(r=>({...r,data:JSON.parse(r.data)})),usage:store.usage(),
    private:store.session('private'),privateSources:store.db.prepare("SELECT count(*) n FROM sources WHERE session='private'").get().n,
    privateMemory:store.memory('session:private')};
}
const send=message=>{if(process.connected)process.send(message);};
process.on('message',message=>{void(async()=>{
  let value;
  if(message.action==='snapshot')value=snapshot();
  else if(message.action==='enqueue'){
    const job=await service.enqueue(message.scope||'global',message.target||'global');value={job,snapshot:snapshot()};
    const running=service.draining;if(running)void running.then(()=>send({event:'drain-ended',jobId:job.id,snapshot:snapshot()}),error=>send({event:'drain-error',error:String(error?.stack||error)}));
  }else if(message.action==='drain'){await service.drain();value=snapshot();}
  else if(message.action==='append-after-cut'){
    const writer=await ctx.sessionPersistence.open('shared','write'),now=Date.now();
    try{await writer.append([
      {seq:3,time:now,type:'turn/start',data:{turn:2}},
      {seq:4,time:now+1,type:'user/message',data:{id:'after-cut',role:'user',source:{kind:'user'},content:[{type:'text',text:'AFTER_KILL_NEW_SOURCE'}]},surfaceOp:'append'},
      {seq:5,time:now+2,type:'turn/end',data:{turn:2,reason:{kind:'completed'}}},
    ]);}finally{await writer.close();}
    const context=archive.state('shared');context.records.push({id:'record-after-cut',sessionId:'shared',summary:'AFTER_KILL_NEW_SOURCE',originalSeqs:[4],sourceSeqs:[4],ranges:[{from:4,to:4}],documents:[],createdAt:store.job(message.jobId).createdAt});archive.save(context);value=snapshot();
  }else if(message.action==='private-original')value=await readDream(hub,{sessionId:'private',from:1,to:1},{id:'shared',header:{cwd}});
  else if(message.action==='close'){await service.close();await ctx.fiber.dispose();send({id:message.id,value:{closed:true}});process.disconnect();return;}
  else throw Error('Unknown crash fixture action');
  send({id:message.id,value});
})().catch(error=>send({id:message.id,error:String(error?.stack||error)}));});
send({event:'ready',snapshot:snapshot()});
