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
