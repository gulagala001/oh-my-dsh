import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

for (const ending of ['completed', 'cancelled']) test(`background workflow stays live across parent closure and reload, then becomes ${ending}`, { timeout: 120000 }, async t => {
  let armed = false, issued = false, childStarted = false, releaseChild, jobId;
  const heldChild = new Promise(resolve => { releaseChild = resolve; });
  t.after(() => releaseChild());
  const fx = await frontendFixture(t, { async modelReply(payload) {
    if (!payload.tools?.length || !armed) return;
    const user = payload.messages.filter(message => message.role === 'user').map(message =>
      typeof message.content === 'string' ? message.content : message.content?.map(block => block.text ?? '').join('\n')).join('\n');
    if (user.includes('OMD_BACKGROUND_UI_CHILD')) {
      childStarted = true; await heldChild;
      return { delta: { role: 'assistant', content: 'Background child completed.' }, finish_reason: 'stop' };
    }
    if (!issued) {
      issued = true;
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'background-ui', type: 'function', function: {
        name: 'workflow', arguments: JSON.stringify({ run_in_background: true,
          script: "export const meta = {name:'background-ui',description:'Background UI lifecycle'}; return await agent('OMD_BACKGROUND_UI_CHILD', {label:'held-child',phase:'Build'});",
        }),
      } }] }, finish_reason: 'tool_calls' };
    }
    const toolText = String(payload.messages.filter(message => message.role === 'tool').at(-1)?.content ?? '');
    jobId ??= toolText.match(/background as job ([^.\s]+)/)?.[1];
    return { delta: { role: 'assistant', content: 'Parent turn finished while the background child works.' }, finish_reason: 'stop' };
  } });
  armed = true;
  await fx.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: fx.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Run the authorized background workflow UI test.' }] });
  await until(() => childStarted);
  await fx.page.getByText('Parent turn finished while the background child works.', { exact: true }).waitFor();
  const panel = fx.page.locator('[data-workflow-run]');
  await panel.locator('[data-member-status]').waitFor({ state: 'attached' });
  assert.equal(await panel.getAttribute('data-run-status'), 'running', 'ending the tool step or parent turn does not stop a background workflow');
  const member = panel.locator('[data-member-status="running"]');
  assert.equal(await member.evaluate(element => element.tagName), 'BUTTON', 'a live child remains navigable');
  await fx.page.reload();
  await until(async () => await panel.getAttribute('data-run-status') === 'running');
  assert.equal(await member.evaluate(element => element.tagName), 'BUTTON');
  assert.ok(jobId);
  if (ending === 'completed') releaseChild();
  else await fx.rpc('job/kill', { sessionId: fx.sessionId, jobId });
  await until(async () => await panel.getAttribute('data-run-status') === ending);
  releaseChild();
  assert.equal(await panel.locator('[data-member-status="interrupted"]').count(), 0);
  assert.deepEqual(fx.errors, []);
});

test('partial child failure remains failed in the native workflow UI after script completion and reload', {timeout:120000}, async t => {
  let armed = false, issued = false;
  const fx = await frontendFixture(t, {modelReply(payload) {
    if (!payload.tools?.length || !armed) return;
    const users = payload.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content.trim() : message.content?.map(block => block.text ?? '').join('\n').trim());
    if (users.includes('OMD_PARTIAL_UI_BAD')) return {delta:{role:'assistant',content:'unfinished'},finish_reason:'length'};
    if (users.includes('OMD_PARTIAL_UI_GOOD')) return {delta:{role:'assistant',content:'good'},finish_reason:'stop'};
    if (!issued) { issued = true; return {delta:{role:'assistant',tool_calls:[{index:0,id:'partial-ui',type:'function',function:{name:'workflow',arguments:JSON.stringify({run_in_background:true,script:`export const meta={name:'partial-ui',description:'Partial failure UI'}; return (await parallel([() => agent('OMD_PARTIAL_UI_BAD', {label:'bad-child'}), () => agent('OMD_PARTIAL_UI_GOOD', {label:'good-child'})])).filter(Boolean);`})}}]},finish_reason:'tool_calls'}; }
    return {delta:{role:'assistant',content:'Partial failure recorded.'},finish_reason:'stop'};
  }});
  armed = true;
  await fx.rpc('session/prompt', {requestId:crypto.randomUUID(), sessionId:fx.sessionId, mode:'queue',content:[{type:'text',text:'Run the authorized partial failure UI fixture.'}]});
  const panel = fx.page.locator('[data-workflow-run]');
  await until(async () => await panel.getAttribute('data-run-status') === 'failed');
  assert.equal(await panel.locator('[data-member-status="failed"]').count(), 1);
  assert.equal(await panel.locator('[data-member-status="completed"]').count(), 1);
  await fx.page.reload();
  await until(async () => await panel.getAttribute('data-run-status') === 'failed');
  assert.equal(await panel.locator('[data-member-status="failed"]').count(), 1);
  assert.deepEqual(fx.errors, []);
});
