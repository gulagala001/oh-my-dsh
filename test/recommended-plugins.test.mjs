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
      { id: 'one', name: '检索示例', author: '示例作者 A', description: '检索资料与网页内容。', category: '研究', url: 'https://example.com/research',
        review: { version: '0.4.0', dsh: '0.1.7-rc.2', omd: '0.1.7-rc.2.19', platforms: ['Web'], source: { commit: '5e377394fe9d6aeab6380e2a5a5f959bc1384426' }, note: '固定源码快照，非正式发行包。' } },
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
  assert.match(await cards.first().innerText(), /已核验源码 v0\.4\.0 · 5e37739/);
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

async function managedRecommendationFixture(t, id, { unavailable, version = '0.9.8' } = {}) {
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RecommendedPlugins} from './src/client/recommended-plugins.jsx';import {recommendedPlugins} from './src/recommended-plugin-catalog.mjs';createRoot(document.getElementById('root')).render(<RecommendedPlugins plugins={recommendedPlugins.filter(p=>p.id===${JSON.stringify(id)})}/>);`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  const browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } }), posts = [], errors = [], state = { installed: false };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://omd.fixture/**', async route => {
    if (route.request().url().includes('/trisoul-x/recommended-plugins')) {
      if (route.request().method() === 'POST') { const action = route.request().postDataJSON(); posts.push(action); state.installed = action.action !== 'uninstall'; }
      return route.fulfill({ json: { autoUpdate: false, plugins: [{ id, installed: state.installed, enabled: state.installed, version: state.installed ? version : undefined, removable: true,
        ...(unavailable !== undefined ? { unavailable } : {}) }] } });
    }
    return route.fulfill({ contentType: 'text/html', body: '<html style="color-scheme:light dark"><body><main id="root"></main></body></html>' });
  });
  await page.goto('http://omd.fixture/');
  await page.addStyleTag({ content: await readFile(new URL('../src/client/style.css', import.meta.url), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const card = page.locator('.tx-recommended-card'); await card.locator('.tx-recommended-version').getByText('未安装', { exact: true }).waitFor();
  const poll = async () => {
    // The real observer refreshes when its page becomes visible.
    await Promise.all([page.waitForResponse(response => response.url().includes('/trisoul-x/recommended-plugins')), page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))]);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  return { page, card, posts, errors, state, poll };
}

test('incompatible rewind blocks installation and updates, retains uninstall and fits both themes', {timeout:30000}, async t=>{
  const { page, posts, errors, state, poll } = await managedRecommendationFixture(t, 'dsh-turn-rewind', { version: '0.3.9' });
  const card=page.locator('.tx-recommended-card');await card.getByRole('button',{name:'安装',exact:true}).waitFor();
  assert.match(await card.innerText(),/尚不兼容 DSH 0\.2\.1-alpha\.1/);assert.equal(await card.getByRole('button',{name:'安装',exact:true}).isEnabled(),false);assert.match(await card.innerText(),/0\.3\.9.*9610ab9/);assert(! (await card.innerText()).includes('undefined'));
  assert.deepEqual(posts,[]);
  for(const colorScheme of ['light','dark'])for(const width of [800,360]){await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:700});const box=await card.boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  state.installed=true; await poll();
  const uninstall=card.getByRole('button',{name:'卸载',exact:true});await uninstall.waitFor();
  assert.equal(await card.getByRole('button',{name:'更新',exact:true}).isEnabled(),false);
  assert.equal(await uninstall.isEnabled(),true);
  await uninstall.click();await card.getByRole('button',{name:'安装',exact:true}).waitFor();
  assert.equal(await card.getByRole('button',{name:'安装',exact:true}).isEnabled(),false);
  assert.deepEqual(posts,[{id:'dsh-turn-rewind',action:'uninstall'}]);assert.deepEqual(errors,[]);
});

test('Turn Rewind rc explicit null permits installing the reviewed source snapshot', { timeout: 30000 }, async t => {
  const id = 'dsh-turn-rewind';
  const { card, posts, errors } = await managedRecommendationFixture(t, id, { unavailable: null, version: '0.3.9' });
  assert.equal(await card.locator('.tx-recommended-result.tx-warn').count(), 0);
  assert.match(await card.locator('.tx-recommended-review').innerText(), /已核验源码 v0\.3\.9 · 9610ab9.*DSH 0\.2\.0-rc\.2/);
  const install = card.getByRole('button', { name: '安装', exact: true });
  assert.equal(await install.isEnabled(), true); await install.click();
  await card.getByRole('button', { name: '更新', exact: true }).waitFor();
  assert.equal(await card.getByRole('button', { name: '更新', exact: true }).isEnabled(), true);
  assert.deepEqual(posts, [{ id, action: 'install' }]); assert.deepEqual(errors, []);
});

for (const { id, version, label } of [
  { id: 'dsh-plugin-subscriptions', version: '0.9.8-omd.1', label: /已核验 v0\.9\.8-omd\.1/ },
  { id: 'omd-intent-assistant', version: '0.3.0', label: /已核验 v0\.3\.0/ },
]) {
  test(`${id} offers the reviewed release when older servers omit availability and completes install/update/uninstall`, { timeout: 30000 }, async t => {
    const { page, card, posts, errors } = await managedRecommendationFixture(t, id, { version });
    assert.match(await card.locator('.tx-recommended-review').innerText(), label);
    assert.match(await card.innerText(), /DSH 0\.2\.0-rc\.2 · OMD 0\.2\.0-rc\.2\.omd\.0\.9\.0/);
    assert.match(await card.innerText(), /DSH 0\.2\.1-alpha\.1 · OMD 0\.2\.1-alpha\.1\.omd\.0\.9\.0/);
    assert.match(await card.innerText(), /非上游/);
    assert.equal(await card.locator('.tx-recommended-result.tx-warn').count(), 0);
    const install = card.getByRole('button', { name: '安装', exact: true });
    assert.equal(await install.isEnabled(), true); await install.click();
    const update = card.getByRole('button', { name: '更新', exact: true }); await update.waitFor();
    assert.equal(await update.isEnabled(), true); assert.match(await card.innerText(), new RegExp('已安装.*v' + version.replaceAll('.', '\\.')));
    await update.click();
    const uninstall = card.getByRole('button', { name: '卸载', exact: true }); await uninstall.click();
    await card.getByRole('button', { name: '安装', exact: true }).waitFor();
    assert.deepEqual(posts, [{ id, action: 'install' }, { id, action: 'update' }, { id, action: 'uninstall' }]);
    for (const colorScheme of ['light', 'dark']) for (const width of [800, 360]) {
      await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width, height: 700 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
  });
  test(`${id} keeps a later server restriction authoritative and still permits uninstall`, { timeout: 30000 }, async t => {
    const unavailable = '当前宿主不兼容，暂不提供安装或更新。已有安装仍可卸载。';
    const { card, posts, errors, state, poll } = await managedRecommendationFixture(t, id, { unavailable, version });
    assert.equal(await card.locator('.tx-recommended-result.tx-warn').textContent(), unavailable);
    assert.match(await card.locator('.tx-recommended-review').innerText(), label);
    assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), false);
    state.installed = true; await poll();
    assert.equal(await card.getByRole('button', { name: '更新', exact: true }).isEnabled(), false);
    const uninstall = card.getByRole('button', { name: '卸载', exact: true });
    assert.equal(await uninstall.isEnabled(), true); await uninstall.click();
    await card.getByRole('button', { name: '安装', exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: '安装', exact: true }).isEnabled(), false);
    assert.deepEqual(posts, [{ id, action: 'uninstall' }]); assert.deepEqual(errors, []);
  });
}
