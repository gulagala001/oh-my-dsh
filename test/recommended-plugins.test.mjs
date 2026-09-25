import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('recommendations search, categories and project links work in both themes and narrow layouts', { timeout: 30000 }, async t => {
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { RecommendedPlugins } from './src/client/recommended-plugins.jsx';
    const plugins = [
      { id: 'one', name: '检索示例', author: '示例作者 A', description: '检索资料与网页内容。', category: '研究', url: 'https://example.com/research' },
      { id: 'two', name: '文档示例', author: '示例作者 B', description: '整理文档并导出报告。', category: '效率', url: 'https://example.com/docs' },
    ];
    createRoot(document.getElementById('root')).render(<RecommendedPlugins plugins={plugins}/>);
  `, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  const browser = await chromium.launch({ args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html style="color-scheme:light dark"><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: await readFile(new URL('../src/client/style.css', import.meta.url), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const submission = page.getByRole('link', { name: '提交插件 / 申请适配' });
  await submission.waitFor();
  assert.equal(await submission.getAttribute('href'), 'https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml');
  assert.equal(await submission.getAttribute('target'), '_blank');
  assert.match(await submission.getAttribute('rel'), /noopener/);
  const cards = page.locator('.tx-recommended-card'), search = page.getByRole('searchbox', { name: '搜索推荐插件' });
  await cards.first().waitFor(); assert.equal(await cards.count(), 2);
  await search.fill('示例作者 B'); await page.getByRole('status').filter({ hasText: '1 个插件' }).waitFor();
  assert.equal(await cards.count(), 1); assert.match(await cards.innerText(), /文档示例/);
  await page.getByRole('combobox', { name: '插件分类' }).selectOption('研究');
  await page.getByRole('heading', { name: '没有找到匹配的插件' }).waitFor();
  await page.getByRole('button', { name: '清除筛选' }).click();
  assert.equal(await search.inputValue(), ''); assert.equal(await cards.count(), 2);
  const link = page.getByRole('link', { name: '查看 检索示例 项目（新窗口）' });
  assert.equal(await link.getAttribute('href'), 'https://example.com/research');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /noopener/);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [800, 360]) {
      await page.setViewportSize({ width, height: 700 });
      for (const card of await cards.all()) {
        const box = await card.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      }
      const columns = await page.locator('.tx-recommended-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 480 ? 1 : 2);
    }
  }
  assert.deepEqual(errors, []);
});
