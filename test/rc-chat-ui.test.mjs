import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

for (const [oldMode, newMode] of [['compact', 'standard'], ['expanded', 'detailed']]) {
  test(`old profile ${oldMode} migrates to ${newMode} and later choices persist`, { timeout: 60000 }, async t => {
    const f = await frontendFixture(t, { legacyChatConfig: { transcriptView: oldMode, linkOpening: 'new-tab' } });
    const config = () => readFile(join(f.home, 'profiles/trisoul-x/cordis.patch.yml'), 'utf8');
    await until(async () => (await config()).includes('transcriptView: ' + newMode));
    assert.match(await config(), /linkOpening: new-tab/);
    await f.page.getByRole('button', { name: '设置', exact: true }).click();
    await f.page.getByRole('dialog').getByRole('button', { name: '通用设置', exact: true }).click();
    const row = f.page.getByRole('dialog').getByText('工作步骤展示', { exact: true }).locator('..').locator('..');
    await row.getByRole('button').click();
    await f.page.getByRole('menuitem', { name: '简洁', exact: true }).click();
    await until(async () => /transcriptView: compact/.test(await config()));
    await f.page.keyboard.press('Escape'); await f.page.reload();
    await f.page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
    assert.match(await config(), /transcriptView: compact/);
    assert.equal(JSON.parse(await readFile(join(f.home, 'profiles/trisoul-x/.omd-ui-chat-transcript-v2.json'), 'utf8')).done, true);
    assert.deepEqual(f.errors, []);
  });
}

test('live tool preparation settles once and local image links retain preview actions', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t, { chatConfig: { transcriptView: 'standard' } }), { page } = f;
  const image = join(f.workspace, '中文 image.png'), output = join(f.workspace, 'prepared.txt');
  await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64'));
  let release, count = 0;
  const ready = new Promise(resolve => { release = resolve; });
  f.replyWith(() => ++count === 1 ? (async function* () {
    yield { delta: { role: 'assistant', tool_calls: [
      { index: 0, id: 'rc-cu', type: 'function', function: { name: 'computer_use_reset', arguments: '' } },
      { index: 1, id: 'rc-write', type: 'function', function: { name: 'write', arguments: JSON.stringify({ file_path: output, content: 'prepared' }).slice(0, -2) } },
    ] }, finish_reason: null };
    await ready;
    yield { delta: { tool_calls: [
      { index: 0, function: { arguments: '{}' } },
      { index: 1, function: { arguments: '"}' } },
    ] }, finish_reason: 'tool_calls' };
  })() : { delta: { role: 'assistant', content: `准备阶段验收完成。\n\n![RC 图片](<${image}>)\n\n[图片文件](<${image}>)` }, finish_reason: 'stop' });
  try {
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '检查工具准备与图片预览' }] });
    const group = page.locator('[data-step-process]').filter({ has: page.locator('[data-process-count]').filter({ hasText: '2 次操作' }) });
    await group.locator('.tx-cu-group-toggle').click();
    await group.locator('.tx-cu-card[data-state=preparing]').waitFor();
    assert.equal(await group.getByText('执行中', { exact: true }).count(), 0);
    await group.getByText(/正在准备内容/).waitFor();
    const anchor = await page.locator('[data-chat-call-id="rc-cu"]').elementHandle();
    release();
    await page.getByText('准备阶段验收完成。', { exact: true }).waitFor();
    assert.equal(await readFile(output, 'utf8'), 'prepared');
    assert.equal(await page.locator('[data-chat-call-id="rc-cu"]').count(), 1);
    assert.equal(await anchor.evaluate(node => node.isConnected), true);
    assert.equal(await page.locator('.tx-cu-card[data-state=preparing]').count(), 0);
    const picture = page.getByRole('img', { name: 'RC 图片', exact: true });
    await picture.click(); await page.getByRole('dialog', { name: '图片预览', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '图片文件', exact: true }).hover();
    await page.getByRole('img', { name: image, exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.reload(); await page.getByText('准备阶段验收完成。', { exact: true }).waitFor();
    assert.equal(await page.locator('.tx-cu-card[data-state=preparing]').count(), 0);
    assert.deepEqual(f.errors, []);
  } finally { release(); }
});
