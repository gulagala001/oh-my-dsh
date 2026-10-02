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

test('actual rewind recommendation stays optional and fits both themes at desktop and phone widths', {timeout:30000}, async t=>{
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {RecommendedPlugins} from './src/client/recommended-plugins.jsx';import {recommendedPlugins} from './src/recommended-plugin-catalog.mjs';createRoot(document.getElementById('root')).render(<RecommendedPlugins plugins={recommendedPlugins.filter(p=>p.id==='dsh-turn-rewind')}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife'});
  const browser=await chromium.launch({args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:800,height:700}}),posts=[],errors=[];let installed=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://omd.fixture/**',async route=>{
    if(route.request().url().includes('/trisoul-x/recommended-plugins')){
      if(route.request().method()==='POST'){posts.push(route.request().postDataJSON());installed=true;}
      return route.fulfill({json:{autoUpdate:false,plugins:[{id:'dsh-turn-rewind',installed,enabled:installed,version:installed?'0.3.9':undefined,removable:true}]}});
    }
    return route.fulfill({contentType:'text/html',body:'<html style="color-scheme:light dark"><body><main id="root"></main></body></html>'});
  });
  await page.goto('http://omd.fixture/');await page.addStyleTag({content:await readFile(new URL('../src/client/style.css',import.meta.url),'utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
  const card=page.locator('.tx-recommended-card');await card.getByRole('button',{name:'安装',exact:true}).waitFor();
  assert.match(await card.innerText(),/默认不安装/);assert.match(await card.innerText(),/0\.3\.9.*9610ab9/);assert(! (await card.innerText()).includes('undefined'));
  assert.deepEqual(posts,[]);
  for(const colorScheme of ['light','dark'])for(const width of [800,360]){await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:700});const box=await card.boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:800,height:700});await page.screenshot({path:'/tmp/omd-btw-rewind-20261001/evidence/rewind-recommendation-light.png'});
  await card.getByRole('button',{name:'安装',exact:true}).click();await card.getByRole('button',{name:'卸载',exact:true}).waitFor();assert.deepEqual(posts,[{id:'dsh-turn-rewind',action:'install'}]);assert.deepEqual(errors,[]);
});
