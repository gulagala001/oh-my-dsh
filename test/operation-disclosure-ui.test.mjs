import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {join} from 'node:path';
import {frontendFixture,until} from './fixtures/frontend.mjs';

test('all tool families share one disclosure before and after completion, with a screenshot modal',{timeout:45000},async t=>{
  const f=await frontendFixture(t),{page,rpc,sessionId}=f;
  const path=join(f.root,'screenshot.png');await sharp({create:{width:1000,height:700,channels:3,background:'#e5edf9'}}).png().toFile(path);
  let sent=false,release;
  f.replyWith(payload=>{
    if(sent)return {delta:{role:'assistant',content:'四层结构正文'},finish_reason:'stop'};
    sent=true;release=f.holdNextReply();
    const read=payload.tools.find(tool=>tool.function.name==='read_image');assert.ok(read);
    const fields=read.function.parameters.properties,key=['path','file_path','image_path'].find(key=>key in fields);assert.ok(key,JSON.stringify(fields));
    return {delta:{role:'assistant',tool_calls:[['bash',{command:'printf operation-fixture',description:'检查操作列表'}],['computer_use_reset',{}],['read_image',{[key]:path}]].map(([name,args],index)=>({index,id:'operation-'+index,type:'function',function:{name,arguments:JSON.stringify(args)}}))},finish_reason:'tool_calls'};
  });
  await rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'检查操作折叠'}]});
  const running=page.locator('.tx-cu-group-toggle').filter({hasText:'3 次操作'});await running.waitFor();
  assert.equal(await running.getAttribute('aria-expanded'),'false');await running.click();
  await until(async()=>await page.locator('[data-chat-flow-kind="tool-call"]:visible').count()===3);
  release();await page.getByText('四层结构正文',{exact:true}).waitFor();
  assert.equal(await page.getByText(/Error: invalid|Unsupported or malformed/).count(),0);
  const summary=page.locator('[data-turn-process-tool-calls="3"]');await summary.waitFor();
  assert.equal(await summary.getAttribute('aria-expanded'),'true','completion preserves the process the user is already reading');
  assert.match(await summary.innerText(),/运行命令/);assert.match(await summary.innerText(),/查看图像/);
  await summary.click();assert.equal(await page.locator('[data-chat-flow-kind="tool-call"]:visible').count(),0);assert.equal(await page.getByText('四层结构正文',{exact:true}).isVisible(),true);
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'operation-summary.png')});
  await summary.click();
  assert.equal(await page.locator('.tx-cu-group-toggle:visible').count(),1);
  const rows=page.locator('[data-chat-flow-kind="tool-call"]:visible');assert.equal(await rows.count(),3);
  const geometry=await rows.evaluateAll(elements=>elements.map(el=>{
    const row=el.querySelector('.CY-8Ka_root, .tx-cu-card-heading, .o3BgMG_row'),rect=row.getBoundingClientRect();
    return {x:rect.x,y:rect.y,height:rect.height};
  }));
  for(const item of geometry){assert.equal(item.height,26);assert.equal(item.x,geometry[0].x);}
  for(let i=1;i<geometry.length;i++)assert.ok(geometry[i].y-geometry[i-1].y<=30,'operations form a compact column');
  const cuRow=rows.nth(1).getByRole('button',{name:/重置 Computer Use/});
  await cuRow.hover();assert.equal(await cuRow.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','no standalone Computer Use card background');
  await cuRow.focus();await cuRow.press('Enter');assert.equal(await cuRow.getAttribute('aria-expanded'),'true');
  await rows.nth(1).locator('.tx-cu-card-body').waitFor();await cuRow.press('Enter');assert.equal(await cuRow.getAttribute('aria-expanded'),'false');
  await page.mouse.move(0,0);
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'operation-list.png')});
  await rows.last().getByText('已查看图像',{exact:true}).click();
  await page.getByRole('button',{name:'查看截图大图',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'截图预览',exact:true});await dialog.waitFor();
  if(process.env.TRISOUL_UI_ARTIFACTS){await page.screenshot({path:join(f.root,'four-level-image-dialog.png')});console.log('Operation UI artifacts:',f.root);}
  await dialog.press('Escape');await dialog.waitFor({state:'hidden'});
  await rows.last().getByText('已查看图像',{exact:true}).click();
  await page.mouse.move(0,0);
  const computerEntry=page.getByRole('button',{name:'打开 Computer Use',exact:true}),lightColor=await computerEntry.evaluate(el=>getComputedStyle(el).color);
  await page.emulateMedia({colorScheme:'dark'});
  await until(async()=>await computerEntry.evaluate(el=>getComputedStyle(el).color)!==lightColor);
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'operation-list-dark.png')});
  await page.setViewportSize({width:390,height:844});
  await summary.scrollIntoViewIfNeeded();
  const fits=await summary.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth;});assert.equal(fits,true,'summary fits a narrow conversation');
  for(const row of await rows.all())assert.equal(await row.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'long paths cannot widen the operation list');
  if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(f.root,'operation-list-narrow.png')});
  let failedSent=false;
  f.replyWith(payload=>{
    if(failedSent)return {delta:{role:'assistant',content:'失败状态示例完成'},finish_reason:'stop'};
    failedSent=true;const tool=payload.tools.find(tool=>tool.function.name==='read');assert.ok(tool);
    const fields=tool.function.parameters.properties,key=['path','file_path'].find(key=>key in fields);assert.ok(key);
    return {delta:{role:'assistant',tool_calls:[{index:0,id:'read-failure',type:'function',function:{name:'read',arguments:JSON.stringify({[key]:join(f.root,'missing-file.txt')})}}]},finish_reason:'tool_calls'};
  });
  await rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'检查失败记录'}]});
  await page.getByText('失败状态示例完成',{exact:true}).waitFor();
  const failedSummary=page.locator('[data-turn-process-tool-calls="1"]');await failedSummary.waitFor();assert.match(await failedSummary.innerText(),/1 项失败/);
  if(await failedSummary.getAttribute('aria-expanded')!=='true')await failedSummary.click();
  await page.getByText('读取失败',{exact:true}).waitFor();
  assert.deepEqual(f.errors,[]);
});
