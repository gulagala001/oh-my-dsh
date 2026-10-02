import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';
import { pendingToolCalls } from '../src/btw-policy.mjs';
import { ULTRACODE_ON, ULTRACODE_OFF } from '../src/ultracode.mjs';

// Approval-gated integration: this starts only an isolated host with a localhost
// fake provider. It imports the pinned upstream plugin; do not run before approval.
test('native btw inherits the completed prefix and preserves actual wire schemas and history', {timeout:90000}, async t => {
  const requests=[],holds=new Map();let parentRelease,parentEntered;
  const parentReady=new Promise(resolve=>parentEntered=resolve);
  const f=await frontendFixture(t,{headless:true,installedPackage:true,initialPrompt:'BTW_MAIN_COMPLETE',
    omdConfig:{computerUseEnabled:false,codegraphEnabled:false,dreamAutoEnabled:false},
    async modelReply(payload){
      requests.push(structuredClone(payload));const text=JSON.stringify(payload.messages);
      if(text.includes('Question: BTW_TOOL_BATCH'))return {delta:{role:'assistant',tool_calls:[0,1].map(i=>({index:i,id:'denied-'+i,type:'function',function:{name:'read',arguments:JSON.stringify({file_path:'/should-not-read'})}}))},finish_reason:'tool_calls'};
      if(text.includes('Question: BTW_ULTRA_TOOL'))return {delta:{role:'assistant',tool_calls:[{index:0,id:'denied-workflow',type:'function',function:{name:'workflow',arguments:JSON.stringify({script:'return { ok: true };'})}}]},finish_reason:'tool_calls'};
      const hold=text.match(/Question: (BTW_HOLD_[AB])/);
      if(hold)await new Promise(resolve=>holds.set(hold[1],resolve));
      const latestUser=JSON.stringify(payload.messages.findLast(message=>message.role==='user'));
      if(!text.includes('Question:')&&latestUser.includes('BTW_MAIN_INFLIGHT')){parentEntered();await new Promise(resolve=>parentRelease=resolve);}
      return {delta:{role:'assistant',reasoning_content:'fixture reasoning',content:'fixture answer'},finish_reason:'stop',usage:{prompt_tokens:50,completion_tokens:5,prompt_tokens_details:{cached_tokens:32}}};
    },
    async setupWorkspace({root,home}) {
      const module=join(root,'btw-test-api.mjs');
      await writeFile(module,`export const inject=['commands','agents','sessions','webServer'];
export function apply(ctx){ctx.webServer.register({kind:'exact',path:'/api/btwTest/execute',async handler(req,res){
  let body='';for await(const b of req)body+=b;const {sessionId,line}=JSON.parse(body).payload.args;
  const agent=ctx.agents.get(sessionId);if(!agent){res.writeHead(404);res.end();return;}
  try{const value=await ctx.commands.execute(agent,line,[],new AbortController().signal);await ctx.sessions.flush(agent.session);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:{ok:true,value}}));}
  catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}
}});}`);
      const cli=process.env.OMD_DSH_CLI || fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js',import.meta.url));
      execFileSync(process.execPath,[cli,'--profile','trisoul-x','--from-default-profile','web','--dump-config'],{cwd:new URL('../',import.meta.url),env:{...process.env,DSH_HOME:home},stdio:'pipe'});
      const directory=join(home,'profiles','trisoul-x');await mkdir(directory,{recursive:true});
      await writeFile(join(directory,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'btw-test-api',name:pathToFileURL(module).href}]}]));
    }});
  await until(async()=>(await f.api('/state?session='+f.sessionId)).running==='idle');
  const parentBefore=await restoreFixtureLog(f.home,f.sessionId);
  const end=parentBefore.events.findLast(e=>e.type==='turn/end');assert.ok(end);
  const response=await f.call('btwTest/execute',{sessionId:f.sessionId,line:'/btw BTW_SIDE_QUESTION'});
  assert.equal(response.result?.ok,true,JSON.stringify(response));const execution=response.result.value;
  assert.equal(execution?.result?.kind,'success',JSON.stringify(execution));
  assert.match(execution.result.text,/缓存读取：32 tokens/);
  const after=await restoreFixtureLog(f.home,f.sessionId),catalog=after.events.findLast(e=>e.type==='subagent/catalog'&&e.data?.label?.startsWith('omd-btw:v1:'));
  assert.ok(catalog,'native fork must persist the owned child identity');
  const child=await restoreFixtureLog(f.home,catalog.data.childId);
  assert.deepEqual(child.events.slice(0,end.seq+1),parentBefore.events.slice(0,end.seq+1));
  const side=requests.find(r=>JSON.stringify(r.messages).includes('Question: BTW_SIDE_QUESTION'));
  const main=requests.find(r=>JSON.stringify(r.messages).includes('BTW_MAIN_COMPLETE')&&!JSON.stringify(r.messages).includes('BTW_SIDE_QUESTION'));
  assert.ok(main&&side);assert.deepEqual(side.tools,main.tools);
  assert.deepEqual(side.messages.slice(0,main.messages.length),main.messages);
  assert.equal(after.events.filter(e=>e.type==='assistant/message').length,parentBefore.events.filter(e=>e.type==='assistant/message').length);
  await f.api('/dream/refresh',{});const state=await f.api('/dream?session='+catalog.data.childId);
  assert.equal(state.session.shared,false);

  const command=async line=>{const r=await f.call('btwTest/execute',{sessionId:f.sessionId,line});assert.equal(r.result?.ok,true,JSON.stringify(r));return r.result.value;};
  const beforeBatch=requests.length,denied=await command('/btw BTW_TOOL_BATCH');assert.equal(denied.result.kind,'error');assert.match(denied.result.text,/调用工具/);
  assert.equal(requests.length,beforeBatch+1,'tool denial must stop before a second charged request');
  const withBatch=await restoreFixtureLog(f.home,f.sessionId),batchCatalog=withBatch.events.findLast(e=>e.type==='subagent/catalog');
  const batch=await restoreFixtureLog(f.home,batchCatalog.data.childId),results=batch.events.slice(end.seq+1).filter(e=>e.type==='tool/result');
  assert.equal(results.length,2);assert(results.every(e=>e.data.message.isError));assert.equal(pendingToolCalls(batch.events).size,0);

  const a=command('/btw BTW_HOLD_A'),b=command('/btw BTW_HOLD_B');await until(()=>holds.size===2);
  const cancelled=await command('/btw cancel');assert.match(cancelled.result.text,/2 个/);
  for(const release of holds.values())release();for(const r of await Promise.all([a,b])){assert.equal(r.result.kind,'error');assert.match(r.result.text,/取消/);}

  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'BTW_MAIN_INFLIGHT'}]});await parentReady;
  const during=await command('/btw BTW_DURING_MAIN');assert.equal(during.result.kind,'success',JSON.stringify(during));
  const partial=await restoreFixtureLog(f.home,f.sessionId),duringCatalog=partial.events.findLast(e=>e.type==='subagent/catalog');
  const duringChild=await restoreFixtureLog(f.home,duringCatalog.data.childId);
  assert(!duringChild.events.slice(0,end.seq+1).some(e=>JSON.stringify(e).includes('BTW_MAIN_INFLIGHT')));
  assert.equal(duringChild.events.slice(0,end.seq+1).length,end.seq+1);
  assert.equal((await f.api('/state?session='+f.sessionId)).running,'running','side question must leave the main turn running');
  parentRelease();await until(async()=>(await f.api('/state?session='+f.sessionId)).running==='idle');
  const later=await command('/btw BTW_AFTER_SECOND_TURN');assert.equal(later.result.kind,'success',JSON.stringify(later));

  // Combined acceptance: the newly approved Ultracode text must reach the
  // parent, while side questions retain that exact completed request prefix.
  const modePath='/model-mode?session='+f.sessionId;
  const systemText=wire=>wire.messages.filter(m=>['system','developer'].includes(m.role)).map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
  for(const enabled of [true,false]){
    await f.api(modePath,{provider:'fixture',model:'fixture',ultracode:enabled});
    const marker=enabled?'BTW_ULTRACODE_MAIN_ON':'BTW_ULTRACODE_MAIN_OFF';
    const before=requests.length;
    await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:marker}]});
    await until(async()=>requests.length>before&&(await f.api('/state?session='+f.sessionId)).running==='idle');
    const mainWire=requests.slice(before).findLast(r=>r.tools?.length&&JSON.stringify(r.messages).includes(marker));
    assert.ok(mainWire,'expected the native main request after the mode change');
    if(enabled){
      assert.ok(systemText(mainWire).includes(ULTRACODE_ON));
      assert.ok(systemText(mainWire).includes('delegate each requirement to a subagent'));
      assert.ok(systemText(mainWire).includes('**Implement** — concrete requirements → delegate implementation → integrate results'));
    }else{
      assert.ok(systemText(mainWire).includes(ULTRACODE_OFF));
      assert.ok(!systemText(mainWire).includes('Workflow authoring reference'));
    }
    const question=enabled?'BTW_ULTRA_SIDE_ON':'BTW_ULTRA_SIDE_OFF';
    const sideBefore=requests.length,result=await command('/btw '+question);
    assert.equal(result.result.kind,'success',JSON.stringify(result));
    const sideWire=requests.slice(sideBefore).find(r=>JSON.stringify(r.messages).includes('Question: '+question));
    assert.ok(sideWire);
    assert.deepEqual(sideWire.tools,mainWire.tools);
    assert.deepEqual(sideWire.messages.slice(0,mainWire.messages.length),mainWire.messages);
    assert.equal((await f.api(modePath)).enabled,enabled,'side questions must not change the parent mode');
    if(enabled){
      const toolBefore=requests.length,toolResult=await command('/btw BTW_ULTRA_TOOL');
      assert.equal(toolResult.result.kind,'error');assert.match(toolResult.result.text,/调用工具/);
      assert.equal(requests.length,toolBefore+1,'Ultracode workflow calls in a side question must stop before another model request');
      const history=await restoreFixtureLog(f.home,f.sessionId),entry=history.events.findLast(e=>e.type==='subagent/catalog');
      const toolChild=await restoreFixtureLog(f.home,entry.data.childId);
      const denied=toolChild.events.filter(e=>e.type==='tool/result'&&e.data.message.toolCallId==='denied-workflow');
      assert.equal(denied.length,1);assert.equal(denied[0].data.message.isError,true);
      assert.equal(pendingToolCalls(toolChild.events).size,0);
    }
  }
});
