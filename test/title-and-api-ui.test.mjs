import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Web title stays branded during thinking and authenticated APIs reject unknown or untrusted callers', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page, sessionId } = f;
  const origin = new URL(page.url()).origin;
  for (const path of ['/state', '/scope', '/context', '/context/catalog', '/context/global', '/better-todo']) {
    const response = await fetch(origin + '/trisoul-x/api' + path + '?session=' + sessionId);
    assert.equal(response.status, 401, path); await response.body?.cancel();
  }
  const unknown = await page.evaluate(async () => {
    const response = await fetch('trisoul-x/api/state?session=never-created-by-this-request');
    return { status: response.status, value: await response.json() };
  });
  assert.equal(unknown.status, 404);
  const cookies = await f.context.cookies();
  const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const denied = await fetch(origin + '/trisoul-x/api/settings', {
    method: 'POST', headers: { cookie, Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: '{"traceEnabled":false}',
  });
  assert.equal(denied.status, 403); await denied.body?.cancel();
  await until(async () => (await page.title()).endsWith('Oh My DSH'));
  await page.evaluate(() => {
    window.omdTitleSamples = [document.title];
    window.omdTitleObserver = new MutationObserver(() => window.omdTitleSamples.push(document.title));
    window.omdTitleObserver.observe(document.querySelector('title'), { childList: true, subtree: true, characterData: true });
  });
  f.replyWith(async function* () {
    for (let i = 0; i < 45; i++) {
      yield { delta: { reasoning_content: '正在核对状态。' }, finish_reason: null }; await delay(25);
    }
    yield { delta: { content: '标题回归验证完成。' }, finish_reason: 'stop' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '验证连续思考时标题保持稳定' }] });
  await page.getByText('标题回归验证完成。', { exact: true }).waitFor();
  const samples = await page.evaluate(() => { window.omdTitleObserver.disconnect(); return window.omdTitleSamples; });
  assert.ok(samples.every(title => !title.endsWith('DeepSeek Harness')), JSON.stringify(samples));
  await f.rpc('session/rename', { sessionId, title: '标题验证的新名字' });
  await page.getByText('标题验证的新名字', { exact: true }).first().waitFor();
  await until(async () => (await page.title()).endsWith('Oh My DSH'));
  await page.reload();
  await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
  assert.ok((await page.title()).endsWith('Oh My DSH'));
  assert.deepEqual(f.errors, []);
});
