import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { recommendedPlugins } from '../src/recommended-plugin-catalog.mjs';
import { RecommendedPluginManager } from '../src/recommended-plugins.mjs';

test('unpublished OpenDesign adapter is manual only and never fetches or auto installs', async () => {
  const plugin = { ...recommendedPlugins.find(p => p.id === 'dsh-open-design'), githubRelease: undefined, review: undefined, manualInstall: '待发布：固定上游 a9d4f4c' };
  assert.equal(plugin.packageName, 'dsh-open-design'); assert.equal(plugin.githubRelease, undefined);
  assert.equal(plugin.review, undefined); assert.match(plugin.manualInstall, /待发布.*a9d4f4c/);
  const fail = () => { throw Error('Must not query or install unpublished package'); };
  const service = new RecommendedPluginManager({ catalog: [plugin], getConfig: () => ({ recommendedPluginsAutoUpdate: true }),
    saveConfig: fail, latest: fail, preparePackage: fail,
    manager: { listBundles: async () => [{ name: 'dsh-open-design', installed: true, enabled: true }], installBundle: fail, removeBundle: fail },
  });
  assert.throws(() => service.start(plugin.id, 'install'), /待发布/);
  assert.throws(() => service.start(plugin.id, 'update'), /待发布/);
  await service.tick(); service.close();
});

test('OpenDesign recommendation offers the reviewed release asset and keeps search, themes and links usable', { timeout: 30000 }, async t => {
  const bundled = await build({ stdin: { contents: `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { RecommendedPlugins } from './src/client/recommended-plugins.jsx';
    createRoot(document.getElementById('root')).render(<RecommendedPlugins/>);`,
    resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  const browser = await chromium.launch({ args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 850 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().resourceType() === 'document'
    ? route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;font-family:system-ui,sans-serif"><main id="root"></main></body></html>' })
    : route.fulfill({ json: { autoUpdate: false, plugins: [], busy: null } }));
  await page.goto('https://omd.test/');
  await page.addStyleTag({ content: await readFile(new URL('../src/client/style.css', import.meta.url), 'utf8') });
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.getByRole('searchbox', { name: '搜索推荐插件' }).fill('OpenDesign');
  const card = page.locator('.tx-recommended-card');
  await card.getByRole('heading', { name: 'OpenDesign · DSH 技能桥接', exact: true }).waitFor();
  assert.equal(await card.count(), 1);
  assert.match(await card.innerText(), /52 个设计技能/); assert.match(await card.innerText(), /已核验 v0\.1\.0-omd\.1\.0\.0/);
  assert.match(await card.innerText(), /部分技能包含网络或浏览器流程/);
  assert.equal(await card.getByRole('button', { name: '安装', exact: true }).count(), 1);
  const link = card.getByRole('link', { name: '查看 OpenDesign · DSH 技能桥接 项目（新窗口）' });
  assert.equal(await link.getAttribute('href'), 'https://github.com/omegapaopao/dsh-open-design');
  assert.match(await link.getAttribute('rel'), /noopener/);
  assert.equal(await page.getByRole('alert').count(), 0);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(theme => { document.documentElement.style.colorScheme = theme;
      document.querySelector('#root').style.cssText = `--tx-bg:${theme === 'dark' ? '#181b21' : '#fff'};--tx-text:${theme === 'dark' ? '#e8ecf4' : '#111827'};--tx-muted:${theme === 'dark' ? '#a3b0c2' : '#475569'};--tx-line:#708090;--tx-blue:#2864d7;--tx-soft:${theme === 'dark' ? '#252b36' : '#f3f6fa'};color:var(--tx-text);background:var(--tx-bg)`; }, theme);
    for (const width of [800, 360]) {
      await page.setViewportSize({ width, height: 850 });
      const box = await card.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.OMD_OPEN_DESIGN_EVIDENCE) {
        await mkdir(process.env.OMD_OPEN_DESIGN_EVIDENCE, { recursive: true });
        await page.screenshot({ path: join(process.env.OMD_OPEN_DESIGN_EVIDENCE, `recommendation-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(errors, []);
});
