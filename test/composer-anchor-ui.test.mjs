import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('theme composers stay at the viewport floor when nested records and image previews expand', { timeout: 150000 }, async t => {
  const f = await frontendFixture(t, { installedPackage: true }), { page } = f;
  t.after(() => { if (process.env.TRISOUL_UI_ARTIFACTS) console.log('Composer artifacts:', f.root); });
  const path = join(f.root, 'preview.png');
  await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#dce8f7' } }).png().toFile(path);
  let sent = false;
  f.replyWith(payload => {
    if (sent) return { delta: { role: 'assistant', content: '图片与展开记录已就绪。' }, finish_reason: 'stop' };
    sent = true;
    const fields = payload.tools.find(tool => tool.function.name === 'read_image').function.parameters.properties;
    const key = ['path', 'file_path', 'image_path'].find(key => key in fields);
    return { delta: { role: 'assistant', tool_calls: [0, 1, 2].map(index => ({ index, id: 'anchor-' + index, type: 'function', function: { name: 'read_image', arguments: JSON.stringify({ [key]: path }) } })) }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查图片缩略与展开记录' }] });
  await page.getByText('图片与展开记录已就绪。', { exact: true }).waitFor();
  let taskStep = 0;
  const taskPrompt = '记录八项展开检查，并逐项完成';
  f.replyWith(() => {
    const step = taskStep++;
    if (step > 1) return { delta: { role: 'assistant', content: '任务缩略记录已就绪。' }, finish_reason: 'stop' };
    const args = step === 0 ? { op: 'excerpt', from: taskPrompt, to: taskPrompt, tasks: Array.from({ length: 8 }, (_, i) => ({ title: `检查 ${i + 1}：展开缩略内容后，输入区仍停留在对话列底部，保留完整工具栏和草稿。`, anchor: { from: taskPrompt, to: taskPrompt } })) }
      : { op: 'check', updates: Array.from({ length: 8 }, (_, i) => ({ id: 'T' + (i + 1), done: true })) };
    return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'anchor-task-' + step, type: 'function', function: { name: 'todo_write', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: taskPrompt }] });
  await page.getByText('任务缩略记录已就绪。', { exact: true }).waitFor();
  const seat = page.locator('[data-composer-seat]').last();
  const summary = page.locator('[data-turn-process-tool-calls="3"]');
  const group = page.locator('[data-cu-group] > button').filter({ hasText: '3 次操作' });
  const imageRow = page.locator('[data-cu-operation]').getByText('已查看图像', { exact: true }).first();
  const floor = async label => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = await seat.boundingBox();
    const scroll = await page.locator('[data-conversation-scroll]').boundingBox();
    assert.ok(bounds && Math.abs(scroll.y + scroll.height - bounds.y - bounds.height) <= 2, label + ': ' + JSON.stringify({ bounds, scroll }));
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, 'the app document must not become the conversation scrollport');
  };
  for (const skin of ['codex-desktop', 'ios-liquid-glass', 'claude-cli-terminal', 'google-material-expressive']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByLabel('皮肤', { exact: true }).selectOption(skin);
    await page.keyboard.press('Escape');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await until(async () => await page.locator('[data-composer-input]').isVisible());
      await floor(skin + '/' + width + ' collapsed');
      await summary.click();
      await floor(skin + '/' + width + ' process expanded');
      await group.click();
      await floor(skin + '/' + width + ' operations expanded');
      await imageRow.click();
      await page.getByRole('button', { name: '查看截图大图', exact: true }).first().waitFor();
      await floor(skin + '/' + width + ' thumbnail expanded');
      await page.locator('[data-conversation-scroll]').evaluate(el => { el.scrollTop = 0; });
      await floor(skin + '/' + width + ' history scrolled');
      await imageRow.click(); await group.click(); await summary.click();
      await floor(skin + '/' + width + ' collapsed again');
      const record = page.locator('.omd-record-toggle').last();
      await record.click(); await floor(skin + '/' + width + ' task summary expanded');
      await record.click(); await floor(skin + '/' + width + ' task summary collapsed');
    }
  }
  assert.deepEqual(f.errors, []);
});
