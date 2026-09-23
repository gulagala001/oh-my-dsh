import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('generic job calls and failures join file operations and retain details across reload and completion', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let requests=0,release;
  const finish=new Promise(resolve=>{release=resolve;});t.after(release);
  f.replyWith(async payload=>{
    if(++requests===1){
      assert.ok(payload.tools.some(tool=>tool.function.name==='job_list'));
      return {delta:{role:'assistant',content:'现在创建测试文件。',tool_calls:[
        {index:0,id:'generic',type:'function',function:{name:'job_list',arguments:'{}'}},
        {index:3,id:'job-error',type:'function',function:{name:'job_output',arguments:JSON.stringify({job_id:'missing-fixture-job'})}},
        {index:1,id:'write-one',type:'function',function:{name:'write',arguments:JSON.stringify({file_path:join(f.root,'workspace','first.txt'),content:'FIRST_GROUP_FIXTURE'})}},
        {index:2,id:'write-two',type:'function',function:{name:'write',arguments:JSON.stringify({file_path:join(f.root,'workspace','second.txt'),content:'SECOND_GROUP_FIXTURE'})}},
      ]},finish_reason:'tool_calls'};
    }
    await finish;
    return {delta:{role:'assistant',content:'文件创建验证完成。'},finish_reason:'stop'};
  });
  await f.rpc('session/prompt',{requestId:crypto.randomUUID(),sessionId:f.sessionId,mode:'queue',content:[{type:'text',text:'创建两个测试文件'}]});
  await until(()=>requests>=2);
  assert.equal(await readFile(join(f.root,'workspace','first.txt'),'utf8'),'FIRST_GROUP_FIXTURE');
  const group=page.getByRole('button',{name:/4 次操作/});
  await group.waitFor({timeout:10000});
  assert.equal(await group.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('[data-chat-call-id="write-one"] :is(button,[role="button"]):not(.tx-cu-group-toggle):visible').count(),0);
  assert.equal(await page.locator('.tx-cu-group[data-cu-group]:visible').filter({has:page.getByRole('button',{name:/次操作/})}).count(),1,'generic jobs do not split the drawer');
  await group.click();
  await page.locator('[data-chat-call-id=generic]').waitFor();
  const jobOutput=page.locator('[data-chat-call-id=job-error]');await jobOutput.waitFor();
  await jobOutput.getByRole('button').first().click();
  assert.match(await jobOutput.textContent(),/missing-fixture-job/);
  await page.locator('[data-chat-call-id="write-one"] :is(button,[role="button"]):not(.tx-cu-group-toggle)').first().waitFor();
  await page.locator('[data-chat-call-id="write-two"] :is(button,[role="button"]):not(.tx-cu-group-toggle)').first().waitFor();
  await group.click();assert.equal(await page.locator('[data-chat-call-id="write-one"] :is(button,[role="button"]):not(.tx-cu-group-toggle):visible').count(),0);
  await page.reload();await group.waitFor();await group.click();
  await page.locator('[data-chat-call-id="write-two"] :is(button,[role="button"]):not(.tx-cu-group-toggle)').first().waitFor();
  release();await page.getByText('文件创建验证完成。',{exact:true}).waitFor();
  const completed=page.locator('button[data-turn-process-tool-calls="4"]');await completed.waitFor();
  if(await completed.getAttribute('aria-expanded')!=='true')await completed.click();
  for(const id of ['generic','write-one','write-two'])await page.locator(`[data-chat-call-id="${id}"] :is(button,[role="button"])`).first().waitFor();
  assert.equal(await group.getAttribute('aria-expanded'),'true','completed process preserves the independent file group');
  await group.click();
  assert.equal(await page.locator('[data-chat-call-id=write-one]:visible').count(),0);
  assert.equal(await completed.getAttribute('aria-expanded'),'true','closing the file group leaves the outer process open');
  assert.deepEqual(f.errors,[]);
});
