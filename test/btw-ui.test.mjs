import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('first-turn side question stays visible outside the running process drawer through reply and reload', {timeout:90000}, async t => {
  let releaseMain, releaseSide;const requests=[];
  t.after(()=>{releaseMain?.();releaseSide?.();});
  const f=await frontendFixture(t,{installedPackage:true,omdConfig:{computerUseEnabled:false,codegraphEnabled:false,dreamAutoEnabled:false},async modelReply(payload){
    if(!payload.tools?.length)return null;
    requests.push(payload);const text=JSON.stringify(payload.messages),side=text.includes('Question: BTW_UI_SIDE');
    if(side)await new Promise(resolve=>releaseSide=resolve);
    else if(!releaseMain&&payload.tools?.length&&text.includes('BTW_UI_MAIN'))await new Promise(resolve=>releaseMain=resolve);
    return {delta:{role:'assistant',content:side?'首轮侧问答案':'主任务完成'},finish_reason:'stop'};
  }});
  const workspace=await f.rpc('workspace/create',{path:f.workspace});
  const {sessionId}=await f.rpc('session/create',{workspaceId:workspace.workspace.workspaceId,agentPreset:'trisoul-x'});
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'BTW_UI_MAIN'}]});await until(()=>releaseMain);
  await f.rpc('session/rename',{sessionId,title:'侧问首轮测试'});
  await f.page.getByText('侧问首轮测试',{exact:true}).first().click();
  const input=f.page.locator('[data-composer-input]');await input.fill('/btw BTW_UI_SIDE');await input.press('Enter');
  const record=f.page.locator('[data-omd-record=btw]');
  await record.getByText('侧问处理中…',{exact:true}).waitFor();await until(()=>releaseSide);
  assert.equal(await record.locator('xpath=ancestor::*[@data-cu-process-node or @data-turn-process]').count(),0);
  releaseSide();await record.getByText(/首轮侧问答案/).waitFor();
  const origin=new URL(f.page.url()).origin;
  const state=async()=>{const r=await f.page.request.get(origin+'/trisoul-x/api/state?session='+sessionId);return r.json();};
  assert.equal((await state()).running,'running');assert.equal(await record.count(),1);
  const main=requests.find(r=>r.tools?.length&&JSON.stringify(r.messages).includes('BTW_UI_MAIN')&&!JSON.stringify(r.messages).includes('Question: BTW_UI_SIDE'));
  const side=requests.find(r=>JSON.stringify(r.messages).includes('Question: BTW_UI_SIDE'));
  assert.deepEqual(side.tools,main.tools);assert.deepEqual(side.messages.slice(0,main.messages.length),main.messages);
  for(const colorScheme of ['dark','light']){
    await f.page.emulateMedia({colorScheme});assert.equal(await record.isVisible(),true);
    assert.equal(await record.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  }
  await f.page.reload();await record.getByText(/首轮侧问答案/).waitFor();assert.equal(await record.count(),1);assert.equal((await state()).running,'running');
  releaseMain();await until(async()=>(await state()).running==='idle');assert.equal(await record.isVisible(),true);assert.deepEqual(f.errors,[]);
});
