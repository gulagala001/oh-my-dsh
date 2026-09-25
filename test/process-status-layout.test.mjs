import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture } from './fixtures/frontend.mjs';

test('changing process text cannot wrap outcome badges or change the status row height', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let sent = false;
  f.replyWith(payload => {
    if (sent) return { delta: { content: '状态布局检查就绪。' }, finish_reason: 'stop' };
    sent = true;
    const fields = payload.tools.find(tool => tool.function.name === 'read').function.parameters.properties;
    const key = ['path', 'file_path'].find(key => key in fields);
    return { delta: { tool_calls: [0, 1].map(index => ({ index, id: 'layout-' + index, type: 'function',
      function: { name: 'read', arguments: JSON.stringify({ [key]: join(f.root, 'missing-' + index) }) } })) }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查运行状态的长短文字布局' }] });
  await page.getByText('状态布局检查就绪。', { exact: true }).waitFor();
  await page.locator('[data-turn-process-tool-calls="2"]').click();
  const row = page.locator('.tx-cu-group-toggle').filter({ hasText: '2 次操作' });
  await row.waitFor();
  // Recreate the live outcome badge after the fixture turn has settled, so
  // geometry measurements do not race the model stream or group retirement.
  await row.evaluate(element => {
    if (element.querySelector('[data-process-failures]')) return;
    const badge = document.createElement('span'); badge.dataset.processFailures = '';
    badge.className = 'tx-cu-error'; badge.textContent = '2 项失败'; element.append(badge);
  });
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const samples = await row.evaluate(async element => {
      const label = element.querySelector('[class*="label"]');
      const original = label.textContent, samples = [];
      for (const text of ['正在分析请求', '正在分析请求 · Dense sampling by Catmull-Rom: ```js const DENSE = (function(){ const out=[]; '.repeat(15), '正在分析请求']) {
        label.textContent = text;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = element.getBoundingClientRect(), badge = element.querySelector('[data-process-failures]'), count = element.querySelector('[data-process-count]');
        samples.push({ height: rect.height, width: rect.width, badgeHeight: badge.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(badge).lineHeight), badgeRight: badge.getBoundingClientRect().right,
          right: rect.right, countX: count.getBoundingClientRect().x });
      }
      label.textContent = original;
      return samples;
    });
    for (const sample of samples) {
      assert.ok(Math.abs(sample.height - samples[0].height) < 1, `${width}: row jumps when text changes: ${JSON.stringify(samples)}`);
      assert.ok(sample.badgeHeight <= sample.lineHeight + 1, `${width}: failure count wraps: ${JSON.stringify(samples)}`);
      assert.ok(sample.badgeRight <= sample.right + 1, `${width}: failure count overflows`);
      assert.ok(Math.abs(sample.countX - samples[0].countX) < 1, `${width}: operation count shifts horizontally`);
    }
  }
  if (process.env.TRISOUL_UI_ARTIFACTS) {
    await page.screenshot({ path: join(f.root, 'process-status-stable.png') });
    console.log('Status layout artifacts:', f.root);
  }
  assert.deepEqual(f.errors, []);
});
