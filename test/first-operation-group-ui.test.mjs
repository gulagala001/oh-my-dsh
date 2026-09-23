import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('first operation group after user input stays visible with an injected runtime record', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t, { omdConfig: { stateHintsEnabled: true } });
  const { page, sessionId } = f;
  const file = join(f.root, 'workspace', 'reference.md');
  const image = join(f.root, 'workspace', 'reference.png');
  await writeFile(file, 'FIRST_OPERATION_REFERENCE');
  await sharp({ create: { width: 400, height: 250, channels: 3, background: '#e5edf9' } }).png().toFile(image);
  let step = 0, finish;
  const pending = new Promise(resolve => { finish = resolve; });
  t.after(finish);
  f.replyWith(async payload => {
    step++;
    if (step === 1) return { delta: { role: 'assistant', tool_calls: [['read', file], ['read_image', image]].map(([name, path], index) => {
      const fields = payload.tools.find(tool => tool.function.name === name).function.parameters.properties;
      const key = ['path', 'file_path', 'image_path'].find(key => key in fields);
      assert.ok(key);
      return { index, id: 'first-operation-' + index, type: 'function', function: { name, arguments: JSON.stringify({ [key]: path }) } };
    }) }, finish_reason: 'tool_calls' };
    if (step === 2) return { delta: { role: 'assistant', content: '接着检查第二组操作。', tool_calls: [{ index: 0, id: 'later-operation', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'printf second-group', description: '第二组操作' }) } }] }, finish_reason: 'tool_calls' };
    await pending;
    return { delta: { role: 'assistant', content: '首条操作展开验证完成。' }, finish_reason: 'stop' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '读取参考文件和图片，然后检查第二组操作。' }] });
  await until(() => step === 3);
  const groupFor = id => page.locator(`[data-cu-group]:has([data-chat-call-id="${id}"]) .tx-cu-group-toggle`);
  const first = groupFor('first-operation-0'), later = groupFor('later-operation');
  await first.waitFor();
  await later.waitFor();
  assert.equal(await page.locator('[data-omd-record=injection]:visible').count(), 0, 'runtime records stay inside collapsed groups');
  await later.click();
  assert.equal(await later.isVisible(), true, 'later groups remain visible');
  await first.click();
  assert.equal(await first.isVisible(), true, 'expanding the first group must not hide its own summary');
  assert.equal(await page.locator('[data-chat-call-id="first-operation-0"]').isVisible(), true);
  assert.equal(await page.locator('[data-chat-call-id="first-operation-1"]').isVisible(), true);
  const injection = page.locator('[data-step-process-body] [data-omd-record=injection]:visible');
  assert.equal(await injection.count(), 1, 'the expanded group contains the current runtime record once');
  await injection.getByRole('button').click();
  assert.match(await injection.locator('pre').textContent(), /\[runtime state/);
  // read opens a file viewer; read_image owns an inline result disclosure.
  const imageRow = page.locator('[data-chat-call-id="first-operation-1"]');
  await imageRow.getByText('已查看图像', { exact: true }).click();
  const preview = imageRow.getByRole('button', { name: '查看截图大图', exact: true });
  await preview.waitFor();
  await first.click(); await first.click();
  assert.equal(await first.isVisible(), true, 'the first group can be closed and reopened');
  assert.equal(await preview.isVisible(), true, 'the actual image detail retains its expansion');
  assert.equal(await later.getAttribute('aria-expanded'), 'true', 'the later group keeps its independent state');
  finish();
  await page.getByText('首条操作展开验证完成。', { exact: true }).waitFor();
  assert.equal(await first.isVisible(), true, 'completion retains the expanded group');
  const processToggle = page.locator('[data-turn-process-tool-calls="3"]');
  await processToggle.click(); await processToggle.click();
  assert.equal(await first.isVisible(), true, 'outer process folding cannot lose the first group');
  await page.reload(); await processToggle.waitFor(); await processToggle.click();
  assert.equal(await first.getAttribute('aria-expanded'), 'false');
  await first.click();
  assert.equal(await first.isVisible(), true, 'replayed history can expand the first group');
  assert.equal(await page.locator('[data-chat-call-id="first-operation-0"]').isVisible(), true);
  assert.equal(await page.locator('[data-chat-call-id="first-operation-1"]').isVisible(), true);
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(f.root, 'first-operation-expanded.png') });
    console.log('First operation UI artifacts:', f.root);
  }
  assert.deepEqual(f.errors, []);
});
