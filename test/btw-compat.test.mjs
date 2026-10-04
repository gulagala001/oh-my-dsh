import test from 'node:test';
import assert from 'node:assert/strict';
import { createBtwCompatibility } from '../src/btw-compat.mjs';
import { isBtwSession } from '../src/btw-policy.mjs';
import { isAgentLoopRequest, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture() {
  const listeners=new Map(),sessions=new Map(),starts=[],disposers=[];
  let command,guard;
  const emit=(name,...args)=>{for(const fn of listeners.get(name)||[])fn(...args);};
  const parent={session:{id:'main',header:{id:'main'},snapshotEvents:()=>[{seq:0,type:'user/message',data:{}},{seq:1,type:'turn/end',data:{}}]},cancel(){throw Error('parent must not cancel');}};
  sessions.set('main',parent.session);
  const reference={sessionId:'main',provider:'fixture',model:'fixture',tools:[{name:'read'}],messages:[{role:'user',content:[{type:'text',text:'main'}]}]};
  const ctx={sessions,commands:{register:d=>{command=d;return ()=>{};}},tools:{guard:fn=>{guard=fn;return ()=>{};}},
    llm:{stream(options){emit('llm/stream',options,()=>[]);return options;},async prepareCall(){return {stream:options=>ctx.llm.stream(options)};}},
    effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d);},
    on:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);return ()=>{};},
    subagents:{getProvider:()=>({inheritsParentContext:true}),start:async(provider,request)=>{
      const source=parent.session.snapshotEvents(),end=source.findLastIndex(e=>e.type==='turn/end');
      const id='child-'+starts.length,events=source.slice(0,end+1),done=deferred();
      const agent={session:{id,header:{id,origin:'subagent',parentSession:request.parent.session.id},inheritedEventCount:events.length,snapshotEvents:()=>events},cancel:reason=>{agent.cancelled=reason;}};
      sessions.set(id,agent.session);emit('agent/created',{agent});
      starts.push({id,provider,request,done,agent,events});
      request.signal.addEventListener('abort',()=>done.resolve({stopReason:'aborted',output:[]}),{once:true});
      return {id,localAgent:agent,result:done.promise,dispose:async()=>{starts.find(s=>s.id===id).disposed=true;}};
    }}};
  const originalStream=ctx.llm.stream,originalPrepareCall=ctx.llm.prepareCall;
  const compatibility=createBtwCompatibility(ctx);
  // First-party stand-in exercises the façade only. It does not import or run
  // the downloaded upstream plugin; native/upstream integration is separate.
  compatibility.facade.commands.register({name:'btw',description:'fixture',handler:async invocation=>{
    try {
      const run=await compatibility.facade.subagents.start('fork',{parent:invocation.agent,signal:invocation.signal,label:'btw',prompt:[{type:'text',text:invocation.rawInput}]});
      const result=await run.result;await run.dispose();return {kind:result.stopReason==='completed'?'success':'error',text:result.output[0]?.text||'cancelled'};
    }catch(error){return {kind:'error',text:error.message};}
  }});
  const warm=()=>{emit('llm/stream',reference,()=>[]);emit('session/event',parent.session,{type:'turn/end'});};
  const ask=(rawInput='side',agent=parent,signal=new AbortController().signal)=>command.handler({rawInput,agent,signal});
  return {ctx,compatibility,starts,parent,reference,emit,warm,ask,guard:exec=>guard(exec),listeners,disposers,originalStream,originalPrepareCall};
}
test('side question uses fork with unique descriptor and leaves prompt, model and schemas untouched',async()=>{
  const f=fixture();f.warm();const pending=f.ask();await Promise.resolve();await Promise.resolve();
  const s=f.starts[0];assert.equal(s.provider,'fork');assert.match(s.request.label,/^omd-btw:v1:/);
  assert.equal(isBtwSession(s.agent.session),true);assert.equal(s.request.persona,undefined);assert.equal(s.request.toolFilter,undefined);assert.equal(s.request.agentOptions,undefined);
  f.emit('llm/stream',{...f.reference,sessionId:s.id,messages:[...f.reference.messages,{role:'user',content:[{type:'text',text:'side'}]}]},()=>[]);
  f.emit('session/event',s.agent.session,{type:'assistant/message',data:{usage:{cacheReadTokens:8}}});
  s.done.resolve({stopReason:'completed',output:[{type:'text',text:'answer'}]});const answer=await pending;
  assert.equal(answer.kind,'success');assert.match(answer.text,/缓存读取：8/);assert.equal(s.disposed,true);assert.equal(f.compatibility.active.size,0);
});
test('missing baseline fails visibly before starting or charging a side model',async()=>{
  const f=fixture();const answer=await f.ask();assert.equal(answer.kind,'error');assert.match(answer.text,/主模型开始响应/);assert.equal(f.starts.length,0);
});
test('first in-flight turn reuses the dispatched request through direct and prepared streams without waiting for completion',async()=>{
  const f=fixture();f.parent.session.snapshotEvents=()=>[{seq:0,type:'user/message',data:{}}];
  const reference=markAgentLoopRequest(Object.freeze({...f.reference,messages:Object.freeze(f.reference.messages)}));
  f.ctx.llm.stream(reference);
  const pending=f.ask();await Promise.resolve();await Promise.resolve();const s=f.starts[0];
  assert.equal(s.agent.session.inheritedEventCount,0);
  const question={role:'user',source:{kind:'user'},content:[{type:'text',text:'side'}]},reminder={role:'user',source:{kind:'plugin:reminder'},content:[]},child=markAgentLoopRequest(Object.freeze({...reference,sessionId:s.id,messages:Object.freeze([question,reminder])}));
  const before=JSON.stringify([reference,child]);
  for(const send of [options=>f.ctx.llm.stream(options),(await f.ctx.llm.prepareCall()).stream]){
    const projected=send(child);assert.deepEqual(projected.messages,[...reference.messages,question]);
    assert.equal(projected.messages[0],reference.messages[0]);assert.equal(projected.tools,reference.tools);
    assert.equal(isAgentLoopRequest(projected),true);assert.equal(Object.isFrozen(projected),true);
  }
  assert.equal(JSON.stringify([reference,child]),before);
  s.done.resolve({stopReason:'completed',output:[{type:'text',text:'answer'}]});assert.equal((await pending).kind,'success');
  await f.compatibility.close();for(const dispose of f.disposers)await dispose();
  assert.equal(f.ctx.llm.stream,f.originalStream);assert.equal(f.ctx.llm.prepareCall,f.originalPrepareCall);
});
test('an in-flight later step uses its latest history and freezes the baseline for each side question',async()=>{
  const f=fixture();f.warm();
  const latest={...f.reference,messages:[...f.reference.messages,{role:'assistant',content:[{type:'tool-call',id:'read'}]},{role:'tool',toolCallId:'read',content:[]}]};
  f.ctx.llm.stream(latest);const pending=f.ask();await Promise.resolve();await Promise.resolve();const s=f.starts[0];
  f.ctx.llm.stream({...latest,messages:[...latest.messages,{role:'user',content:[]}]});
  const question={role:'user',source:{kind:'user'},content:[{type:'text',text:'side'}]};
  const projected=f.ctx.llm.stream({...f.reference,sessionId:s.id,messages:[...f.reference.messages,question]});
  assert.deepEqual(projected.messages,[...latest.messages,question]);
  assert.equal(f.guard({agent:f.parent,name:'read'}),undefined);
  s.done.resolve({stopReason:'completed',output:[{type:'text',text:'answer'}]});assert.equal((await pending).kind,'success');
});
test('concurrent requests cancel only this parent and late completion cannot overwrite cancellation',async()=>{
  const f=fixture();f.warm();const first=f.ask('one'),second=f.ask('two');await Promise.resolve();await Promise.resolve();
  assert.equal(f.starts.length,2);assert.notEqual(f.starts[0].request.label,f.starts[1].request.label);
  const unrelated=await f.ask('cancel',{session:{id:'other'}});assert.match(unrelated.text,/没有/);assert.equal(f.starts[0].request.signal.aborted,false);
  const cancelled=await f.ask('cancel');assert.match(cancelled.text,/2 个/);
  for(const s of f.starts)s.done.resolve({stopReason:'completed',output:[{type:'text',text:'late'}]});
  for(const answer of await Promise.all([first,second])){assert.equal(answer.kind,'error');assert.match(answer.text,/取消/);}
});
test('guard denies owned tools without changing schema or affecting workflow agents; paired batch stops before next request',async()=>{
  const f=fixture();f.warm();const pending=f.ask();await Promise.resolve();await Promise.resolve();const s=f.starts[0];
  assert.match(f.guard({agent:s.agent,callId:'a',name:'read'}),/不执行工具/);
  assert.equal(f.guard({agent:{session:{header:{origin:'subagent'},snapshotEvents:()=>[]}},name:'read'}),undefined);
  s.events.push({seq:2,type:'assistant/message',data:{message:{content:[{type:'tool-call',id:'a'},{type:'tool-call',id:'b'}]}}});
  const pre=f.listeners.get('agent/pre-step')[0];await assert.rejects(pre({agent:s.agent,step:2},async()=>({kind:'enter'})),/尚未完整配对/);
  s.events.push({seq:3,type:'tool/result',data:{message:{toolCallId:'a',isError:true}}},{seq:4,type:'tool/result',data:{message:{toolCallId:'b',isError:true}}});
  assert.deepEqual(await pre({agent:s.agent,step:2},async()=>({kind:'enter'})),{kind:'reject'});assert.deepEqual(s.agent.cancelled,{kind:'user'});
  assert.throws(()=>f.emit('llm/stream',{...f.reference,sessionId:s.id},()=>[]),/不会继续/);
  s.done.resolve({stopReason:'aborted',output:[]});assert.match((await pending).text,/调用工具/);
});
test('unload aborts outstanding children and drains handler settlement',async()=>{
  const f=fixture();f.warm();const pending=f.ask();await Promise.resolve();await Promise.resolve();await f.compatibility.close();
  assert.equal((await pending).kind,'error');assert.equal(f.starts[0].disposed,true);assert.equal(f.compatibility.active.size,0);assert.match((await f.ask()).text,/停用/);
});
test('side questions refuse auxiliary compaction before dispatch while ordinary calls pass',async()=>{
  const f=fixture();f.warm();const pending=f.ask();await Promise.resolve();await Promise.resolve();const s=f.starts[0];let dispatched=false;
  assert.throws(()=>f.emit('llm/stream',{...f.reference,sessionId:s.id,purpose:'compaction'},()=>{dispatched=true;return [];}),/不运行后台压缩/);assert.equal(dispatched,false);
  s.done.resolve({stopReason:'error',output:[]});assert.match((await pending).text,/不运行后台压缩/);
});
