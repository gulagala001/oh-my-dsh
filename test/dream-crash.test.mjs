import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const workerPath=fileURLToPath(new URL('./fixtures/dream-crash-worker.mjs',import.meta.url));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const ledgerTotal=snapshot=>snapshot.calls.reduce((n,c)=>n+c.charged,0);
const publicMemory=snapshot=>snapshot.memories.find(m=>m.key==='session:shared');
function trace(scenario,event,detail={}){
  if(process.env.DREAM_CRASH_EVIDENCE)appendFileSync(process.env.DREAM_CRASH_EVIDENCE,JSON.stringify({at:new Date().toISOString(),scenario,event,...detail})+'\n');
}
async function fixture(t,scenario){
  const directory=await mkdtemp(join(tmpdir(),'omd-dream-crash-')),children=[],requests=[],holds=new Map(),gates=new Map(),errors=[];
  const server=createServer((req,res)=>{void(async()=>{
    let body='';for await(const part of req)body+=part;const payload=JSON.parse(body),input=JSON.parse(payload.messages.findLast(m=>m.role==='user').content),ordinal=requests.length+1;
    requests.push({input,ordinal});trace(scenario,'request',{ordinal,kind:input.kind,target:input.target,sourceIds:input.sources.map(s=>s.id),privateText:JSON.stringify(input).includes('PRIVATE_CRASH_SENTINEL')});
    if(gates.has(ordinal)){
      holds.set(ordinal,{res,input});res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: '+JSON.stringify({id:'crash',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{role:'assistant',content:'awaiting completion'},finish_reason:null}]})+'\n\n');gates.get(ordinal).resolve();
    }else complete(res,input,ordinal);
  })().catch(error=>{errors.push(error);res.destroy();});});
  const complete=(res,input,ordinal)=>{
    if(!res.headersSent)res.writeHead(200,{'Content-Type':'text/event-stream'});
    const value={summary:`${input.kind} memory from local request ${ordinal}`,references:input.sources.map(s=>s.id)};
    res.end('data: '+JSON.stringify({id:'crash',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'save-'+ordinal,type:'function',function:{name:'save_memory',arguments:JSON.stringify(value)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}})+'\n\ndata: [DONE]\n\n');
  };
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{
    for(const child of children)if(child.process.exitCode===null&&child.process.signalCode===null){const exit=once(child.process,'exit');child.process.kill('SIGKILL');await exit;}
    server.closeAllConnections();await new Promise(r=>server.close(r));await rm(directory,{recursive:true,force:true});assert.deepEqual(errors,[]);
  });
  const boot=async seed=>{
    const child=fork(workerPath,[directory,`http://127.0.0.1:${server.address().port}/v1`,seed?'seed':'recover'],{stdio:['ignore','pipe','pipe','ipc']});
    let sequence=0,log='';const ready=deferred(),pending=new Map(),events=[],listeners=[];
    const readyTimer=setTimeout(()=>ready.reject(Error(`Crash fixture did not become ready:\n${log}`)),15000);
    child.stdout.on('data',s=>{log+=s;});child.stderr.on('data',s=>{log+=s;});
    child.on('message',message=>{
      if(message.event==='ready')ready.resolve(message.snapshot);
      else if(message.id){const wait=pending.get(message.id);if(wait){pending.delete(message.id);clearTimeout(wait.timer);message.error?wait.reject(Error(message.error)):wait.resolve(message.value);}}
      else{events.push(message);for(const listener of listeners)if(listener.match(message))listener.wait.resolve(message);}
    });
    child.on('error',error=>ready.reject(error));child.on('exit',(code,signal)=>{
      const error=Error(`Crash fixture exited (${code}/${signal}): ${log}`);ready.reject(error);for(const wait of pending.values()){clearTimeout(wait.timer);wait.reject(error);}pending.clear();for(const listener of listeners)listener.wait.reject(error);
    });
    const rpc=message=>new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Crash fixture command timed out: ${message.action}\n${log}`));},15000);pending.set(id,{resolve,reject,timer});child.send({...message,id},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});
    });
    const event=match=>{
      const old=events.find(match);if(old)return Promise.resolve(old);const wait=deferred(),listener={match,wait};listeners.push(listener);
      const timer=setTimeout(()=>wait.reject(Error(`Crash fixture event timed out:\n${log}`)),15000);
      return wait.promise.finally(()=>{clearTimeout(timer);const index=listeners.indexOf(listener);if(index>=0)listeners.splice(index,1);});
    };
    const handle={process:child,rpc,event,ready:null};children.push(handle);
    try{handle.ready=await ready.promise;}finally{clearTimeout(readyTimer);}
    trace(scenario,'worker-ready',{pid:child.pid,owner:handle.ready.owner});return handle;
  };
  return {directory,requests,holds,boot,hold(ordinal){const wait=deferred();gates.set(ordinal,wait);return wait.promise;},release(ordinal){const entry=holds.get(ordinal);assert(entry);complete(entry.res,entry.input,ordinal);},async awaitExpiry(lease){
    const remaining=lease.expires-Date.now();assert(remaining>0&&remaining<=60000);trace(scenario,'lease-wait',{remainingMs:remaining,epoch:lease.epoch});await new Promise(r=>setTimeout(r,remaining+35));
  }};
}
function checkpoint(snapshot,jobId){
  const job=snapshot.jobs.find(j=>j.id===jobId);assert.equal(job.state,'running');assert.equal(job.calls,2);assert.equal(publicMemory(snapshot).revision,1);assert(snapshot.progress.length>0);
  assert.equal(snapshot.targets.find(t=>t.kind==='session').cut.through,2);assert(snapshot.targets.every(t=>t.target!=='private'));
  assert.equal(snapshot.private.shared,false);assert.equal(snapshot.privateMemory,null);assert.equal(snapshot.privateSources,0);
  assert.equal(snapshot.calls[0].charged,150);assert.equal(snapshot.calls[1].charged,snapshot.calls[1].reserved);assert.equal(snapshot.calls[1].data.estimated,true);
}
function assertRecovery(snapshot,jobId,requests,before){
  const job=snapshot.jobs.find(j=>j.id===jobId);assert.equal(job.state,'complete',job.error);assert.equal(job.done,job.total);
  assert.deepEqual(snapshot.versions.find(v=>v.key==='session:shared'&&v.revision===1).data,publicMemory(before));
  const committed=new Set(requests[0].input.sources.map(s=>s.id));assert(requests.slice(2).every(r=>r.input.sources.every(s=>!committed.has(s.id))));
  const sessionVersions=snapshot.versions.filter(v=>v.key==='session:shared');assert.equal(sessionVersions.length,requests.filter((r,i)=>i!==1&&r.input.kind==='session').length);
  assert.equal(new Set(snapshot.progress.map(p=>p.source)).size,snapshot.progress.length);assert.equal(snapshot.targets.length,0);
  assert.equal(snapshot.private.shared,false);assert.equal(snapshot.privateMemory,null);assert.equal(snapshot.privateSources,0);assert(!JSON.stringify(requests).includes('PRIVATE_CRASH_SENTINEL'));
}

test('real process crash and suspension preserve durable Dream work across the default executor lease',{timeout:100000,concurrency:2,skip:process.platform==='win32'},async t=>{
  await Promise.all([
    t.test('SIGKILL keeps committed batches, unknown charges and the original cut',async t=>{
      const f=await fixture(t,'sigkill'),secondCall=f.hold(2),old=await f.boot(true),queued=await old.rpc({action:'enqueue'}),jobId=queued.job.id;
      await secondCall;const before=await old.rpc({action:'snapshot'});checkpoint(before,jobId);const disconnect=once(f.holds.get(2).res,'close'),exited=once(old.process,'exit');
      assert(old.process.kill('SIGKILL'));const [code,signal]=await exited;assert.equal(code,null);assert.equal(signal,'SIGKILL');await disconnect;
      trace('sigkill','killed-after-checkpoint',{pid:old.process.pid,jobId,epoch:before.lease.epoch,cut:before.targets[0].cut,charged:ledgerTotal(before),progress:before.progress.length});
      const next=await f.boot(false),blocked=await next.rpc({action:'drain'});assert.equal(f.requests.length,2);assert.equal(blocked.lease.owner,before.owner);assert.equal(blocked.jobs.find(j=>j.id===jobId).state,'running');assert.deepEqual(publicMemory(blocked),publicMemory(before));assert.deepEqual(blocked.progress,before.progress);
      trace('sigkill','live-lease-blocked',{owner:blocked.lease.owner,contender:next.ready.owner,requestCount:f.requests.length});
      await next.rpc({action:'append-after-cut',jobId});await f.awaitExpiry(before.lease);
      const recovered=await next.rpc({action:'drain'});assertRecovery(recovered,jobId,f.requests,before);
      assert.equal(recovered.lease.owner,next.ready.owner);assert(recovered.lease.epoch>before.lease.epoch);assert(!JSON.stringify(f.requests).includes('AFTER_KILL_NEW_SOURCE'));
      const interrupted=recovered.calls.find(c=>c.id===before.calls[1].id);assert.equal(interrupted.charged,interrupted.reserved);assert.equal(interrupted.data.estimated,true);assert.equal(ledgerTotal(recovered),ledgerTotal(before)+(f.requests.length-2)*150);
      assert.equal(recovered.usage.used,recovered.calls.filter(c=>c.day===recovered.usage.day).reduce((n,c)=>n+c.charged,0));
      const original=await next.rpc({action:'private-original'});assert.match(original.text,/PRIVATE_CRASH_SENTINEL/);
      trace('sigkill','recovered',{epoch:recovered.lease.epoch,job:recovered.jobs.find(j=>j.id===jobId),unknownCharge:interrupted.charged,progress:recovered.progress.length,versions:recovered.versions.map(v=>({key:v.key,revision:v.revision})),requestCount:f.requests.length,privateShared:recovered.private.shared});
      const fresh=await next.rpc({action:'enqueue'});await next.rpc({action:'drain'});const final=await next.rpc({action:'snapshot'});assert.equal(final.jobs.find(j=>j.id===fresh.job.id).state,'complete');assert(JSON.stringify(f.requests).includes('AFTER_KILL_NEW_SOURCE'));assert(!JSON.stringify(f.requests).includes('PRIVATE_CRASH_SENTINEL'));
      await next.rpc({action:'close'});
    }),
    t.test('SIGSTOP old executor cannot settle or claim work owned by the replacement',async t=>{
      const f=await fixture(t,'sigstop'),oldCall=f.hold(2),newCall=f.hold(3),old=await f.boot(true),queued=await old.rpc({action:'enqueue'}),jobId=queued.job.id;
      await oldCall;const before=await old.rpc({action:'snapshot'});checkpoint(before,jobId);assert(old.process.kill('SIGSTOP'));trace('sigstop','suspended-after-checkpoint',{pid:old.process.pid,jobId,epoch:before.lease.epoch,progress:before.progress.length});
      const next=await f.boot(false),blocked=await next.rpc({action:'drain'});assert.equal(blocked.lease.owner,before.owner);assert.equal(f.requests.length,2);
      await f.awaitExpiry(before.lease);const finishing=next.rpc({action:'drain'});finishing.catch(()=>{});await newCall;
      const active=await next.rpc({action:'snapshot'});assert.equal(active.lease.owner,next.ready.owner);assert(active.lease.epoch>before.lease.epoch);assert.equal(active.jobs.find(j=>j.id===jobId).state,'running');
      const waiting=await next.rpc({action:'enqueue',scope:'session',target:'shared'});assert.notEqual(waiting.job.id,jobId);assert.equal(waiting.job.state,'queued');
      f.release(2);assert(old.process.kill('SIGCONT'));const oldFinished=await old.event(m=>m.event==='drain-ended'&&m.jobId===jobId);assert(oldFinished.snapshot);
      const afterOld=await next.rpc({action:'snapshot'});assert.equal(afterOld.jobs.find(j=>j.id===jobId).state,'running');assert.equal(afterOld.jobs.find(j=>j.id===waiting.job.id).state,'queued');assert.equal(afterOld.lease.owner,next.ready.owner);assert.equal(f.requests.length,3);assert.deepEqual(publicMemory(afterOld),publicMemory(before));assert.deepEqual(afterOld.progress,before.progress);
      trace('sigstop','old-executor-fenced',{newEpoch:afterOld.lease.epoch,activeState:afterOld.jobs.find(j=>j.id===jobId).state,queuedState:afterOld.jobs.find(j=>j.id===waiting.job.id).state,requestCount:f.requests.length,oldCall:afterOld.calls.find(c=>c.id===before.calls[1].id)});
      await old.rpc({action:'close'});f.release(3);const recovered=await finishing;assertRecovery(recovered,jobId,f.requests,before);assert.equal(recovered.jobs.find(j=>j.id===waiting.job.id).state,'complete');assert(recovered.calls.find(c=>c.id===before.calls[1].id).charged>0);assert.equal(recovered.jobs.find(j=>j.id===jobId).calls,f.requests.length);
      trace('sigstop','recovered',{epoch:recovered.lease.epoch,job:recovered.jobs.find(j=>j.id===jobId),queuedJob:recovered.jobs.find(j=>j.id===waiting.job.id),requestCount:f.requests.length,privateShared:recovered.private.shared});await next.rpc({action:'close'});
    }),
  ]);
});
