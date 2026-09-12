import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {frontendFixture} from './fixtures/frontend.mjs';

test('capture the current collapsed and expanded process with illustrative reasoning',{timeout:45000},async t=>{
  const f=await frontendFixture(t),{page,rpc,sessionId}=f;
  await page.setViewportSize({width:1440,height:1600});
  let step=0,finish;const finalReply=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());
  f.replyWith(async()=>{
    step++;
    const thoughts=['【演示思考】先确认电脑工具是否就绪，再检查页面结构。','【演示思考】工具已就绪，接着检查操作记录的展示。','【演示思考】检查结束，将结果整理为简短回复。'];
    const reasoning_content=thoughts[Math.min(step-1,2)];
    if(step>=3){await finalReply;return {delta:{role:'assistant',reasoning_content,content:'演示完成：思考和操作记录保留在过程里，这段最终回复显示在外面。'},finish_reason:'stop'};}
    const name=step===1?'computer_use_reset':'bash',args=step===1?{}:{command:'printf demo-complete',description:'检查操作记录'};
    return {delta:{role:'assistant',reasoning_content,tool_calls:[{index:0,id:'reasoning-demo-'+step,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'};
  });
  await rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'演示：思考与操作的闭合和展开效果'}]});
  await page.waitForFunction(()=>[...document.querySelectorAll('.tx-cu-group-toggle')].some(el=>el.textContent.includes('2 次操作')));
  const liveGroup=page.locator('.tx-cu-group[data-cu-group]').filter({has:page.getByRole('button',{name:/2 次操作/})}),liveSummary=liveGroup.getByRole('button',{name:/2 次操作/});
  const liveTurn=await liveSummary.evaluate(el=>el.closest('[data-chat-turn]').dataset.chatTurn),liveNodes=page.locator('[data-chat-turn="'+liveTurn+'"]');
  assert.equal(await liveNodes.locator('[data-cu-group-hidden=true]').count()>0,true,'live process actually hides intermediate rows');
  assert.equal(await page.locator('[data-chat-turn="'+liveTurn+'"][data-chat-flow-kind="context"] [data-disclosure-row]:visible').count(),0,'injected context is not a separate visible row while running');
  await liveSummary.click();
  const liveContexts=page.locator('[data-chat-turn="'+liveTurn+'"][data-chat-flow-kind="context"] [data-disclosure-row]:visible');assert.ok(await liveContexts.count()>0,'expanding the live process restores actual injected context');
  const contextRow=liveContexts.first();await contextRow.click();assert.equal(await contextRow.getAttribute('aria-expanded'),'true');
  const openThought=liveNodes.locator('[data-variant="think"] [data-disclosure-row]').first();await openThought.click();assert.equal(await openThought.getAttribute('aria-expanded'),'true');
  const detail=liveNodes.locator('.tx-cu-card-heading');await detail.click();await liveNodes.locator('.tx-cu-card-body').waitFor();
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'context-process-expanded.png')});
  await liveSummary.click();assert.equal(await liveContexts.count(),0);
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'context-process-collapsed.png')});
  await liveSummary.click();
  assert.equal(await contextRow.getAttribute('aria-expanded'),'true','context detail stays open after closing and reopening its parent');
  assert.equal(await openThought.getAttribute('aria-expanded'),'true','thinking detail retains its disclosure state');
  assert.equal(await detail.getAttribute('aria-expanded'),'true','tool results retain their disclosure state');
  await page.getByRole('button',{name:'打开 Computer Use',exact:true}).focus();
  finish();
  await page.getByText('演示完成：思考和操作记录保留在过程里，这段最终回复显示在外面。',{exact:true}).waitFor();
  const summary=page.locator('[data-turn-process-tool-calls="2"]');await summary.waitFor();
  assert.equal(await summary.getAttribute('aria-expanded'),'true','completion preserves reading state even when focus moved outside the process');
  assert.equal(await contextRow.getAttribute('aria-expanded'),'true','completion retains context detail');
  assert.equal(await openThought.getAttribute('aria-expanded'),'true','completion retains thinking detail');
  assert.equal(await detail.getAttribute('aria-expanded'),'true','completion retains tool detail');
  await contextRow.click();await openThought.click();await detail.click();
  if(await summary.getAttribute('aria-expanded')==='true')await summary.click();
  const turn=await summary.evaluate(el=>el.closest('[data-chat-turn]').getAttribute('data-chat-turn'));
  const turnNodes=page.locator('[data-chat-turn="'+turn+'"]');
  const capture=async name=>{
    if(!process.env.TRISOUL_UI_ARTIFACTS)return;
    await page.mouse.move(0,0);
    const clip=await turnNodes.evaluateAll(nodes=>{
      const rects=nodes.filter(el=>!el.hidden&&el.getBoundingClientRect().height>0).map(el=>el.getBoundingClientRect());
      const x=Math.min(...rects.map(r=>r.x))-12,y=Math.min(...rects.map(r=>r.y))-12;
      return {x,y,width:Math.max(...rects.map(r=>r.right))-x+12,height:Math.max(...rects.map(r=>r.bottom))-y+12};
    });
    await page.screenshot({path:join(f.root,name+'.png'),clip,animations:'disabled'});
  };
  assert.equal(await turnNodes.locator('[data-variant="think"]:visible').count(),0);
  await capture('reasoning-collapsed');
  await summary.click();
  const thoughts=turnNodes.locator('[data-variant="think"]:visible');
  assert.equal(await thoughts.count(),3,'real reasoning blocks must be present, not just a synthetic label');
  const answer=page.getByText('演示完成：思考和操作记录保留在过程里，这段最终回复显示在外面。',{exact:true});
  const answerBox=await answer.boundingBox();
  for(const thought of await thoughts.all()){
    const box=await thought.boundingBox();assert.ok(box.y+box.height<=answerBox.y,'all expanded reasoning belongs before the final answer, even when the provider returns text and reasoning in one delta');
  }
  assert.equal(await page.locator('[data-chat-turn="'+turn+'"][data-chat-flow-kind="tool-call"]:visible').count(),2);
  const processRows=page.locator('[data-chat-turn="'+turn+'"]:is([data-turn-process-member],:has(.tx-cu-process-answer[data-process-open]))').locator('[data-disclosure-row], .tx-cu-card-heading, .CY-8Ka_root');
  const metrics=await processRows.evaluateAll(rows=>rows.filter(el=>el.getBoundingClientRect().height>0).map(el=>{const r=el.getBoundingClientRect();return {text:el.innerText,y:r.y,height:r.height};}));
  for(let i=1;i<metrics.length;i++){
    const gap=metrics[i].y-metrics[i-1].y-metrics[i-1].height;
    assert.ok(gap>=0&&gap<=4,'consistent process row spacing: '+JSON.stringify({previous:metrics[i-1],current:metrics[i],gap}));
  }
  await capture('reasoning-expanded');
  await thoughts.first().locator('[data-disclosure-row]').click();
  await thoughts.first().locator('.lcKema_thinkBody').waitFor();
  await capture('reasoning-detail');
  await thoughts.last().locator('[data-disclosure-row]').click();
  await thoughts.last().locator('.lcKema_thinkBody').waitFor();
  assert.ok((await thoughts.last().boundingBox()).y+(await thoughts.last().boundingBox()).height<(await answer.boundingBox()).y,'expanding final reasoning keeps the reply below it');
  await summary.click();assert.equal(await thoughts.count(),0);assert.equal(await answer.isVisible(),true);
  await page.reload();await answer.waitFor();
  assert.equal(await turnNodes.locator('[data-variant="think"]:visible').count(),0,'all reasoning stays inside the collapsed process after reload');
  await summary.click();assert.equal(await thoughts.count(),3);
  assert.ok((await thoughts.last().boundingBox()).y<(await answer.boundingBox()).y,'reloading preserves render-only reasoning ordering');
  console.log('Reasoning UI artifacts:',f.root);
  assert.deepEqual(f.errors,[]);
});
