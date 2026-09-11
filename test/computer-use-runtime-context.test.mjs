import test from'node:test';import assert from'node:assert/strict';
import{announceFreshComputerRuntime}from'../src/computer-use/runtime-context.mjs';

test('server restart announces lost CU bindings once without rearranging existing context',()=>{
  const system={type:'system/message',data:{text:'original'}},call={type:'tool/call',data:{name:'computer_use'}},events=[system,call];
  const session={id:'one',snapshotEvents:()=>events,append:(type,data,options)=>{assert.deepEqual(options,{surfaceOp:'append'});events.push({type,data});}};
  const manager={sessions:new Map()};assert.equal(announceFreshComputerRuntime(manager,session),true);assert.equal(events[0],system);assert.equal(events[1],call);assert.equal(events[2].data.source.plugin,'trisoul-x:computer-use-runtime');assert.match(events[2].data.content[0].text,/Do not reuse old element IDs or resend/);
  assert.equal(announceFreshComputerRuntime(manager,session),false);
  const runtime={worker:{},generation:0};manager.sessions.set('one',{runtime});assert.equal(announceFreshComputerRuntime(manager,session),false);
  runtime.worker=null;runtime.generation++;assert.equal(announceFreshComputerRuntime(manager,session),true);assert.equal(announceFreshComputerRuntime(manager,session),false);
  assert.equal(announceFreshComputerRuntime({sessions:new Map()},session),true,'a new server instance must announce independently of earlier notices');
});
test('sessions without CU history and live workers receive no reset notices',()=>{
  const session={id:'new',snapshotEvents:()=>[{type:'tool/call',data:{name:'todo_write'}}],append:()=>assert.fail('unexpected notice')};
  assert.equal(announceFreshComputerRuntime({sessions:new Map()},session),false);
  session.snapshotEvents=()=>[{type:'tool/call',data:{name:'computer_use'}}];assert.equal(announceFreshComputerRuntime({sessions:new Map([['new',{runtime:{worker:{},generation:2}}]])},session),false);
});
