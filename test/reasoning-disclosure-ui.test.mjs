import test from 'node:test';
import assert from 'node:assert/strict';
import {frontendFixture,until} from './fixtures/frontend.mjs';

test('completed tools stop showing live actions before the model reply; nested reading state survives completion and reload',{timeout:90000},async t=>{
  const f=await frontendFixture(t,{chatConfig:{transcriptView:'detailed'}}),{page,rpc,sessionId}=f;
  await page.setViewportSize({width:1440,height:1600});
  let nextAction,finish,step=0;
  const nextActionReady=new Promise(resolve=>{nextAction=resolve;});
  const finalReply=new Promise(resolve=>{finish=resolve;});
  f.replyWith(async()=>{
    step++;
    const reasoning_content=['先确认电脑工具是否就绪。','接着检查操作记录的展示。','检查结束，整理回复。'][Math.min(step-1,2)];
    if(step>=3){await finalReply;return {delta:{role:'assistant',reasoning_content,content:'思考和操作保留在过程里，最终回复显示在外面。'},finish_reason:'stop'};}
    if(step===2)await nextActionReady;
    const name=step===1?'computer_use_reset':'bash',args=step===1?{}:{command:'sleep 2; printf demo-complete',description:'检查操作记录'};
    return {delta:{role:'assistant',reasoning_content,tool_calls:[{index:0,id:'reasoning-demo-'+step,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'};
  });
  try {
    await rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'演示思考与操作的折叠效果'}]});
    await page.locator('.tx-cu-group-toggle').filter({hasText:'1 次操作'}).waitFor();
    nextAction();
    const group=page.locator('[data-step-process]').filter({has:page.locator('.tx-cu-group-toggle').filter({hasText:'2 次操作'})});
    const title=group.locator('.tx-cu-group-toggle');
    await until(async()=>/检查操作记录/.test(await title.textContent()));
    await until(()=>step>=3);
    await until(async()=>!/检查操作记录/.test(await title.textContent()));
    assert.match(await title.textContent(),/已操作电脑并运行命令/);
    assert.equal(await group.locator('[data-step-process-body]').isVisible(),false);
    await title.click();
    const thought=group.locator('[data-variant="think"] [data-disclosure-row]').first();
    await thought.click();
    const detail=group.locator('.tx-cu-card-heading');await detail.click();
    await group.locator('.tx-cu-card-body').waitFor();
    await title.click();await title.click();
    assert.equal(await thought.getAttribute('aria-expanded'),'true');
    assert.equal(await detail.getAttribute('aria-expanded'),'true');
    finish();
    const answer=page.getByText('思考和操作保留在过程里，最终回复显示在外面。',{exact:true});await answer.waitFor();
    const summary=page.locator('[data-turn-process-tool-calls="2"]');await summary.waitFor();
    assert.equal(await summary.getAttribute('aria-expanded'),'true','completion preserves the process the user is reading');
    assert.doesNotMatch(await title.textContent(),/检查操作记录/);
    assert.equal(await thought.getAttribute('aria-expanded'),'true');
    assert.equal(await detail.getAttribute('aria-expanded'),'true');
    assert.equal(await group.locator('[data-variant="think"]').count(),3,'all original reasoning is retained');
    const answerBox=await answer.boundingBox();
    for(const node of await group.locator('[data-variant="think"]').all())assert.ok((await node.boundingBox()).y<answerBox.y,'reasoning stays before the final answer');
    await summary.click();assert.equal(await group.isVisible(),false);assert.equal(await answer.isVisible(),true);
    await page.reload();await answer.waitFor();
    await summary.click();assert.equal(await title.getAttribute('aria-expanded'),'false');
    assert.doesNotMatch(await title.textContent(),/检查操作记录/);
    await title.click();assert.equal(await group.locator('[data-variant="think"]:visible').count(),3);
    assert.deepEqual(f.errors,[]);
  } finally {nextAction();finish();}
});
