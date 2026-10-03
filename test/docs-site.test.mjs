import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Parser } from 'htmlparser2';
import { marked } from 'marked';
import { buildDocs } from '../scripts/build-docs.mjs';
import { staticSite } from './fixtures/static-site.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const launchOptions = { headless: true, args: ['--use-mock-keychain', '--password-store=basic'] };

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...(await files(join(directory, entry.name))).map(file => entry.name + '/' + file));
    else result.push(entry.name);
  }
  return result;
}

async function write(root, file, text) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), text);
}

async function screenshot(page, name) {
  const directory = process.env.OMD_DOCS_SCREENSHOTS_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, name), fullPage: false });
}

test('built documentation works on a plain static origin with desktop and mobile reading', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'omd-docs-site-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const outDir = join(temporary, 'site');
  const result = await buildDocs({ root, outDir });
  assert.ok(result.documents >= 20);
  assert.ok(result.diagrams >= 1, 'authored Mermaid fences become static diagrams');
  const built = await files(outDir);
  assert.equal(built.some(file => /(?:AGENTS|HANDOFF|BASELINE|ASSESSMENT|PROMPT_MAINTENANCE|PROMPT_CHANGES)\.md$/.test(file)), false);
  assert.equal(built.some(file => file.endsWith('.md') || file.startsWith('src/') || file.startsWith('vendor/')), false);
  assert.ok(built.includes('docs/site/media/launchpad-workbench.jpg'));
  assert.ok(built.some(file => /^docs\/site\/diagrams\/[a-f0-9]+\.svg$/.test(file)));
  assert.equal(built.some(file => /mermaid\.(?:tiny|esm)/.test(file)), false, 'no diagram runtime is shipped to readers');
  const origin = await staticSite(t, outDir);
  assert.match((await fetch(origin + '/docs/usage.html')).headers.get('content-type'), /^text\/html/);
  assert.equal((await fetch(origin + '/docs/usage.md')).status, 404, 'reading never relies on Markdown middleware');
  assert.equal((await fetch(origin + '/missing')).status, 404);
  const browser = await chromium.launch(launchOptions);
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  // README release badges are external; keep this test fully on loopback.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20"></svg>' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await t.test('home, document index, root README and installation links retain their correct paths', async () => {
    await page.goto(origin);
    await page.waitForURL('**/docs/index.html');
    await page.locator('#main-nav').getByRole('link', { name: '文档', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/docs/README.html');
    await screenshot(page, 'docs-index-desktop.png');
    const projectReadme = page.locator('.doc-article').getByRole('link', { name: '项目介绍', exact: true });
    assert.equal(await projectReadme.getAttribute('href'), '../README.html');
    await projectReadme.click();
    assert.equal(new URL(page.url()).pathname, '/README.html');
    await page.locator('.doc-footer').getByRole('link', { name: '文档目录' }).click();
    await page.locator('.doc-article').getByRole('link', { name: 'Web 安装', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/docs/usage.html');
    assert.equal(decodeURIComponent(new URL(page.url()).hash), '#安装到现有-dsh推荐');
    await page.waitForFunction(() => document.getElementById('安装到现有-dsh推荐').getBoundingClientRect().top >= 76);
    assert.equal(await page.locator('.doc-sidebar a[aria-current="page"]').textContent(), '完整使用指南');
    await page.locator('.doc-toc').getByRole('link', { name: 'Computer Use', exact: true }).click();
    assert.equal(new URL(page.url()).hash, '#computer-use');
    const y = await page.locator('#computer-use').evaluate(element => element.getBoundingClientRect().top);
    assert.ok(y >= 76 && y < 150, `section top ${y}`);
  });

  await t.test('copy preserves the installation command and denied clipboard access selects it with feedback', async () => {
    await page.goto(origin + '/docs/usage.html');
    const block = page.locator('.code-block').first(), copy = block.getByRole('button', { name: '复制代码' });
    const expected = (await block.locator('code').textContent()).replace(/\n$/, '');
    await copy.click();
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), expected);
    assert.match(expected, /github:gulagala001\/oh-my-dsh#v/);
    assert.equal(await page.getByRole('status').textContent(), '代码已复制。');
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('clipboard denied fixture'); }; });
    await copy.click();
    assert.equal(await page.evaluate(() => window.getSelection().toString()), expected);
    assert.match(await page.getByRole('status').textContent(), /已选中代码/);
    assert.equal(await copy.textContent(), '请手动复制');
    assert.equal(await copy.isEnabled(), true);
  });

  await t.test('320px and 390px pages scroll long code and tables without widening the document', async () => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const file of ['/docs/usage.html', '/docs/upgrade.html', '/README.html', '/docs/site/README.html']) {
        await page.goto(origin + file);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${width}px ${file}: page overflow ${overflow}`);
      }
      await page.goto(origin + '/docs/usage.html');
      assert.equal(await page.locator('.code-block pre').first().evaluate(element => element.scrollWidth > element.clientWidth), true);
      await page.locator('.mobile-nav > summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.mobile-nav').getAttribute('open'), '');
      await page.locator('.mobile-nav').getByRole('link', { name: '首次使用', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/docs/getting-started.html');
      await page.goto(origin + '/docs/upgrade.html');
      assert.equal(await page.locator('.table-scroll').nth(1).evaluate(element => {
        const excess = element.scrollWidth - element.clientWidth;
        if (excess <= 1) return element.getBoundingClientRect().right <= window.innerWidth;
        element.scrollLeft = excess;
        return element.scrollLeft > 0;
      }), true, 'the current migration table fits the viewport or scrolls inside its container');
      if (width === 390) await screenshot(page, 'docs-install-mobile.png');
      await page.goto(origin + '/docs/usage.html');
      await page.locator('.mobile-toc > summary').click();
      await page.locator('.mobile-toc').getByRole('link', { name: 'Computer Use', exact: true }).click();
      assert.equal(await page.locator('.mobile-toc').getAttribute('open'), null);
      assert.equal(new URL(page.url()).hash, '#computer-use');
      if (width === 390) await screenshot(page, 'docs-reading-mobile.png');
    }
  });

  await t.test('the reading page and native navigation remain useful with JavaScript disabled', async () => {
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const plain = await noJs.newPage();
    await plain.goto(origin + '/docs/usage.html');
    assert.match(await plain.locator('.doc-article h1').textContent(), /使用与开发指南/);
    assert.equal(await plain.getByRole('button', { name: '复制代码' }).count(), 0, 'no inactive copy affordance');
    await plain.locator('.mobile-nav > summary').click();
    await plain.locator('.mobile-nav').getByRole('link', { name: '首次使用', exact: true }).click();
    assert.equal(new URL(plain.url()).pathname, '/docs/getting-started.html');
    await noJs.close();
  });

  await t.test('static diagrams remain readable, scrollable and copyable without loading a browser diagram runtime', async () => {
    const markdown = await readFile(join(root, 'docs/dream-memory.md'), 'utf8');
    const definition = marked.lexer(markdown).find(token => token.type === 'code' && token.lang === 'mermaid').text;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + '/docs/dream-memory.html');
    const diagram = page.locator('.doc-diagram').first(), image = diagram.locator('img');
    assert.ok(await image.evaluate(image => image.complete && image.naturalWidth > 0));
    const svgUrl = await image.evaluate(image => image.src), svg = await (await fetch(svgUrl)).text();
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-labelledby="[^"]+"/);
    assert.match(svg, /aria-describedby="[^"]+"/);
    assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
    assert.match(svg, /<desc[^>]*>[^<]+<\/desc>/);
    const description = await page.evaluate(svg => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('desc').textContent, svg);
    assert.ok((await image.getAttribute('alt')).includes(description), 'embedded image exposes the source description to screen readers');
    assert.equal(svg.includes('foreignObject'), false, 'portable static SVG text labels');
    await screenshot(page, 'docs-dream-diagram-desktop.png');
    await diagram.locator('summary').focus(); await page.keyboard.press('Enter');
    const source = diagram.locator('code');
    assert.equal((await source.textContent()).replace(/\n$/, ''), definition);
    await diagram.getByRole('button', { name: '复制代码' }).click();
    // Windows clipboard text uses CRLF; all source characters remain exact.
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), definition);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + '/docs/dream-memory.html');
      const scroll = page.locator('.diagram-scroll').first();
      assert.ok(await scroll.evaluate(element => element.scrollWidth > element.clientWidth));
      await scroll.focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.diagram-scroll').scrollLeft > 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
      await scroll.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await screenshot(page, `docs-dream-diagram-${width}.png`);
    }
    const popupPromise = context.waitForEvent('page');
    await page.locator('.doc-diagram').getByRole('link', { name: '放大图示' }).click();
    const popup = await popupPromise; await popup.waitForLoadState();
    assert.equal(popup.url(), svgUrl);
    assert.equal(await popup.locator('svg').getAttribute('role'), 'img');
    assert.match(await popup.locator('svg > desc').textContent(), /会话|记忆/);
    await popup.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const plain = await noJs.newPage();
    await plain.goto(origin + '/docs/dream-memory.html');
    assert.ok(await plain.locator('.doc-diagram img').evaluate(image => image.complete && image.naturalWidth > 0));
    await plain.locator('.diagram-source > summary').click();
    assert.equal((await plain.locator('.diagram-source code').textContent()).replace(/\n$/, ''), definition);
    assert.equal(await plain.getByRole('button', { name: '复制代码' }).count(), 0);
    await screenshot(plain, 'docs-dream-no-js.png');
    await noJs.close();
  });

  await t.test('keyboard focus stays below the sticky header during 200% and 400% equivalent reflow', async () => {
    for (const [width, height, ratio] of [[1440, 1000, 1], [720, 500, 2], [320, 250, 4]]) {
      const reflow = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: ratio, reducedMotion: 'reduce' });
      const reader = await reflow.newPage();
      await reader.goto(origin + '/docs/usage.html');
      await reader.keyboard.press('Tab');
      assert.equal(await reader.evaluate(() => document.activeElement.textContent), '跳到文档内容');
      await reader.keyboard.press('Enter');
      assert.equal(new URL(reader.url()).hash, '#document');
      await reader.locator('.code-copy').first().evaluate(button => {
        const tabbable = [...document.querySelectorAll('a[href],button,summary,[tabindex]')].filter(element => element.getClientRects().length && !element.hidden);
        tabbable[tabbable.indexOf(button) - 1].focus();
        window.scrollBy(0, button.getBoundingClientRect().top - 24);
      });
      await reader.keyboard.press('Tab');
      const focus = await reader.evaluate(() => ({
        tag: document.activeElement.tagName,
        top: document.activeElement.getBoundingClientRect().top,
        bottom: document.activeElement.getBoundingClientRect().bottom,
        header: document.querySelector('.doc-header').getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      assert.equal(focus.tag, 'BUTTON');
      assert.ok(focus.top >= focus.header && focus.bottom <= height, JSON.stringify(focus));
      assert.ok(focus.overflow <= 1);
      await screenshot(reader, `docs-keyboard-reflow-${ratio}x.png`);
      await reflow.close();
    }
  });

  await t.test('a nested deployment keeps navigation, Chinese sections, clipboard and original media within its prefix', async () => {
    const base = await staticSite(t, outDir, { basePath: '/preview/omd/' });
    const serverOrigin = new URL(base).origin;
    const redirected = await fetch(base, { redirect: 'manual' });
    assert.equal(redirected.status, 301);
    assert.equal(redirected.headers.get('location'), '/preview/omd/');
    assert.equal((await fetch(serverOrigin + '/docs/README.html')).status, 404, 'unprefixed URLs cannot accidentally pass');
    const prefixed = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await prefixed.route('**/*', route => new URL(route.request().url()).origin === serverOrigin ? route.continue() : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20"></svg>' }));
    const reader = await prefixed.newPage(), badRequests = [];
    reader.setDefaultTimeout(5000);
    reader.on('pageerror', error => errors.push(error.message));
    reader.on('response', response => { if (response.url().startsWith(serverOrigin) && response.status() >= 400) badRequests.push(response.url()); });
    await reader.goto(base);
    await reader.waitForURL('**/preview/omd/docs/index.html');
    await reader.locator('#main-nav').getByRole('link', { name: '文档', exact: true }).click();
    await reader.locator('.doc-article').getByRole('link', { name: '项目介绍', exact: true }).click();
    assert.equal(new URL(reader.url()).pathname, '/preview/omd/README.html');
    await reader.locator('.doc-footer').getByRole('link', { name: '文档目录' }).click();
    await reader.locator('.doc-article').getByRole('link', { name: 'Web 安装', exact: true }).click();
    assert.equal(new URL(reader.url()).pathname, '/preview/omd/docs/usage.html');
    assert.equal(decodeURIComponent(new URL(reader.url()).hash), '#安装到现有-dsh推荐');
    await reader.locator('.doc-article').getByRole('link', { name: '更新与卸载', exact: true }).click();
    const section = reader.locator('.doc-article > details').first();
    await reader.waitForFunction(() => document.querySelector('.doc-article > details').open);
    await section.locator('summary').click();
    assert.equal(await section.getAttribute('open'), null);
    await reader.locator('.doc-article').getByRole('link', { name: '更新与卸载', exact: true }).click();
    assert.equal(await section.getAttribute('open'), '', 'repeated current-fragment links reveal the closed section again');
    await screenshot(reader, 'docs-prefix-update-uninstall.png');
    const copy = reader.locator('.code-block').first();
    await copy.getByRole('button', { name: '复制代码' }).click();
    assert.equal((await reader.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), (await copy.locator('code').textContent()).replace(/\n$/, ''));
    await reader.locator('.brand').click();
    assert.equal(new URL(reader.url()).pathname, '/preview/omd/docs/index.html');
    await reader.getByRole('tab', { name: 'DSH Web', exact: true }).click();
    await reader.locator('[data-copy="web-command"]').click();
    assert.match(await reader.evaluate(() => navigator.clipboard.readText()), /github:gulagala001\/oh-my-dsh#v/);
    const popupPromise = prefixed.waitForEvent('page');
    await reader.locator('#theme-original').click();
    const original = await popupPromise; await original.waitForLoadState();
    assert.equal(new URL(original.url()).pathname, '/preview/omd/docs/site/media/theme-codex-light.jpg');
    assert.equal(await original.locator('img').evaluate(image => image.naturalWidth), 1280);
    await original.close();
    for (const file of ['usage', 'upgrade', 'windows', 'skins', 'dream-memory']) {
      await reader.goto(`${base}/docs/${file}.html`);
      assert.equal(await reader.locator('.doc-article h1').isVisible(), true);
      assert.ok(await reader.locator('.doc-toc a').count() > 0, file + ': long-guide sections');
    }
    assert.ok((await reader.locator('.doc-diagram img').evaluate(image => image.src)).startsWith(base + '/docs/site/diagrams/'));
    assert.deepEqual(badRequests, []);

    let attempts = 0, release;
    const pending = new Promise(resolve => { release = resolve; });
    await reader.route('**/images/context-records.png', async route => {
      if (++attempts === 1) return route.fulfill({ status: 404, body: 'image failure fixture' });
      await pending;
      await route.fulfill({ status: 200, contentType: 'image/png', body: await readFile(join(root, 'docs/images/context-records.png')) });
    });
    await reader.setViewportSize({ width: 390, height: 844 });
    await reader.goto(base + '/docs/usage.html#界面与入口');
    const image = reader.locator('.doc-article img[src*="context-records.png"]');
    const notice = reader.locator('.doc-article p:has(img[src*="context-records.png"]) .image-fallback');
    await notice.waitFor();
    assert.equal(await image.isVisible(), false);
    assert.equal(await notice.getByRole('link', { name: '打开原图' }).getAttribute('href'), base + '/docs/images/context-records.png');
    await notice.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await screenshot(reader, 'docs-prefix-image-failure-mobile.png');
    assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    const retry = notice.getByRole('button', { name: '重试图片' });
    await retry.focus(); await reader.keyboard.press('Enter');
    assert.equal(await retry.isEnabled(), false);
    assert.equal(await notice.getAttribute('aria-busy'), 'true');
    assert.match(await notice.textContent(), /正在加载图片/);
    release();
    await reader.waitForFunction(() => { const image = document.querySelector('.doc-article img[src*="context-records.png"]'); return !image.hidden && image.naturalWidth > 0; });
    assert.equal(await reader.locator('.image-fallback:visible').count(), 0);
    assert.equal(await notice.getAttribute('aria-busy'), null, 'a recovered image ends its loading state');
    assert.equal(attempts, 2, 'one explicit retry makes one new image request');
    await image.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await screenshot(reader, 'docs-prefix-image-recovered-mobile.png');

    await reader.route('**/site/docs.js', route => route.abort('failed'));
    await reader.goto(base + '/docs/usage.html');
    assert.equal(await reader.getByRole('button', { name: '复制代码' }).count(), 0, 'failed script loading leaves no inactive button');
    await reader.locator('.doc-article').getByRole('link', { name: '更新与卸载', exact: true }).click();
    await reader.locator('.doc-article > details').first().locator('summary').click();
    assert.equal(await reader.locator('.doc-article > details').first().getAttribute('open'), '', 'native details remain readable after a script failure');
    await reader.locator('.mobile-nav > summary').click();
    await reader.locator('.mobile-nav').getByRole('link', { name: '首次使用', exact: true }).click();
    assert.equal(new URL(reader.url()).pathname, '/preview/omd/docs/getting-started.html');
    await reader.locator('.brand').click();
    assert.equal(new URL(reader.url()).pathname, '/preview/omd/docs/index.html');
    await prefixed.close();
  });
  assert.deepEqual(errors, []);
});

test('Markdown compilation preserves Chinese and duplicate anchors, raw commands and publication boundaries', { timeout: 30000 }, async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'omd-docs-edge-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fixture = join(temporary, 'source'), outDir = join(temporary, 'site');
  const sentinel = 'private-machine-fixture-do-not-publish';
  const command = 'printf \'<script>globalThis.__injected=true</script> & "\'\n[私密](../AGENTS.md)';
  await write(fixture, 'package.json', JSON.stringify({ version: '1.2.3', repository: 'https://github.com/example/product.git' }));
  await write(fixture, 'README.md', '# 项目介绍\n\n[文档](docs/README.md)');
  await write(fixture, 'docs/README.md', '# 文档\n\n[中文章节](usage.md?view=print#中文标题-1) · [根介绍](../README.md#项目介绍)');
  await write(fixture, 'docs/usage.md', '# 使用\n\n## 中文标题\n\n第一次。\n\n## 中文标题\n\n第二次。\n\n<a id="manual"></a>\n\n## **格式** 与 `code` & 标点！\n\n```sh\n' + command + '\n```\n\n<details>\n<summary>展开更多</summary>\n\n## 折叠章节\n\n保留内容。\n\n</details>\n\n## Computer Use\n');
  await write(fixture, 'docs/index.html', '<!doctype html><html><body><a href="README.md">文档</a><a href="../README.md">介绍</a></body></html>');
  await write(fixture, 'docs/images/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  for (const file of ['AGENTS.md', 'COMPUTER_USE_HANDOFF.md', '.credentials.yaml', 'docs/private.md', 'docs/images/.private.png', 'docs/site/media/private.txt']) await write(fixture, file, sentinel);
  for (const file of ['docs/site/site.css', 'docs/site/site.js', 'docs/site/docs.css', 'docs/site/docs.js']) {
    await mkdir(dirname(join(fixture, file)), { recursive: true });
    await copyFile(join(root, file), join(fixture, file));
  }
  await buildDocs({ root: fixture, outDir });
  const outputFiles = await files(outDir);
  for (const file of outputFiles) assert.equal((await readFile(join(outDir, file), 'utf8')).includes(sentinel), false, file);
  const html = await readFile(join(outDir, 'docs/usage.html'), 'utf8'), ids = [], code = [];
  let inCode = false;
  const parser = new Parser({ onopentag(name, attrs) { if (attrs.id) ids.push(attrs.id); if (name === 'code' && attrs.class === 'language-sh') inCode = true; }, ontext(text) { if (inCode) code.push(text); }, onclosetag(name) { if (name === 'code') inCode = false; } });
  parser.end(html);
  for (const id of ['中文标题', '中文标题-1', '格式-与-code--标点', 'manual', '折叠章节']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(code.join(''), command + '\n');
  assert.equal(html.includes('<script>globalThis.__injected=true</script>'), false);
  assert.match(await readFile(join(outDir, 'docs/README.html'), 'utf8'), /href="usage\.html\?view=print#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98-1"/);
  assert.match(await readFile(join(outDir, 'docs/index.html'), 'utf8'), /href="\.\.\/README\.html"/);
  const origin = await staticSite(t, outDir);
  const browser = await chromium.launch(launchOptions); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(origin + '/docs/usage.html#%E6%8A%98%E5%8F%A0%E7%AB%A0%E8%8A%82');
  await page.waitForFunction(() => document.querySelector('.doc-article details').open);
  await page.locator('.doc-article details > summary').click();
  await page.locator('.mobile-toc > summary').click();
  await page.locator('.mobile-toc').getByRole('link', { name: '折叠章节', exact: true }).click();
  assert.equal(await page.locator('.doc-article details').getAttribute('open'), '', 'same-fragment TOC link reopens a closed ancestor');
  assert.equal(await page.evaluate(() => globalThis.__injected), undefined);

  const originalMarkdown = await readFile(join(fixture, 'docs/usage.md'), 'utf8');
  const missingChromium = join(temporary, 'missing-chromium');
  assert.equal((await buildDocs({ root: fixture, outDir, chromiumExecutablePath: missingChromium })).diagrams, 0, 'no diagrams require no browser');
  const definitions = [
    'flowchart TD\naccTitle: 事实整理\naccDescr: 将事实整理为短记忆。\nA[事实] --> B[短记忆]',
    'sequenceDiagram\nparticipant U as 用户\nparticipant A as 助手\nU->>A: 回查来源',
  ];
  await write(fixture, 'docs/usage.md', originalMarkdown + definitions.map(source => '\n```mermaid\n' + source + '\n```\n').join(''));
  const launch = chromium.launch, launched = [];
  chromium.launch = async function (options) { const browser = await launch.call(this, options); launched.push(browser); return browser; };
  try { assert.equal((await buildDocs({ root: fixture, outDir })).diagrams, 2); }
  finally { chromium.launch = launch; }
  assert.equal(launched.length, 1, 'multiple diagrams share one build browser');
  assert.equal(launched[0].isConnected(), false, 'the build browser closes after success');
  const generated = (await files(outDir)).filter(file => file.startsWith('docs/site/diagrams/') && file.endsWith('.svg'));
  assert.equal(generated.length, 2);
  const previous = await readFile(join(outDir, 'docs/usage.html'), 'utf8');
  await assert.rejects(buildDocs({ root: fixture, outDir, chromiumExecutablePath: missingChromium }), /需要本地 Chromium.*playwright install chromium/);
  assert.equal(await readFile(join(outDir, 'docs/usage.html'), 'utf8'), previous);
  for (const [definition, expected] of [
    ['flowchart TD\nA[unterminated', /图示 1 渲染失败.*Mermaid/s],
    ['mindmap\nroot((知识))\n  分支', /图示 1 渲染失败.*Tiny/s],
    ['flowchart TD\nA[链接] --> B[目标]\nclick A "https://example.invalid/never-request"', /图示 1 渲染失败.*(?:外部|交互)/s],
    ['---\nconfig:\n  themeCSS: \'.node { fill: url("https://example.invalid/asset.svg") }\'\n---\nflowchart TD\nA[远程] --> B[素材]', /图示 1 渲染失败.*(?:外部|远程)/s],
  ]) {
    await write(fixture, 'docs/usage.md', originalMarkdown + '\n```mermaid\n' + definition + '\n```\n');
    const launchedOnFailure = [];
    chromium.launch = async function (options) { const browser = await launch.call(this, options); launchedOnFailure.push(browser); return browser; };
    try { await assert.rejects(buildDocs({ root: fixture, outDir }), expected); }
    finally { chromium.launch = launch; }
    assert.equal(launchedOnFailure.length, 1);
    assert.equal(launchedOnFailure[0].isConnected(), false, 'the build browser closes after a render failure');
    assert.equal(await readFile(join(outDir, 'docs/usage.html'), 'utf8'), previous, 'failed diagrams preserve the previous static site');
  }
  await write(fixture, 'docs/usage.md', originalMarkdown);
  await write(fixture, 'README.md', '# 项目介绍\n\n[私密资料](AGENTS.md)');
  await assert.rejects(buildDocs({ root: fixture, outDir }), /private document cannot be published/);
  assert.match(await readFile(join(outDir, 'README.html'), 'utf8'), /项目介绍/, 'invalid build leaves the previous site intact');
  await write(fixture, 'README.md', '# 项目介绍');
  await symlink(join(fixture, 'AGENTS.md'), join(fixture, 'docs/images/symlink.png'));
  await assert.rejects(buildDocs({ root: fixture, outDir }), /cannot be symlinks/);
  await assert.rejects(buildDocs({ root: fixture, outDir: fixture }), /inside dist or outside/);
  await assert.rejects(buildDocs({ root: fixture, outDir: join(fixture, 'docs') }), /inside dist or outside/);
  const unrelated = join(temporary, 'unrelated');
  await write(unrelated, 'keep.txt', sentinel);
  await assert.rejects(buildDocs({ root: fixture, outDir: unrelated }), /nonempty directory without/);
  assert.equal(await readFile(join(unrelated, 'keep.txt'), 'utf8'), sentinel);
  const linkedOutput = join(temporary, 'linked-output');
  await symlink(join(fixture, 'docs'), linkedOutput, 'junction');
  await assert.rejects(buildDocs({ root: fixture, outDir: join(linkedOutput, 'generated') }), /inside dist or outside/);
  assert.equal(await readFile(join(fixture, 'docs/private.md'), 'utf8'), sentinel);
  await symlink(join(fixture, 'docs'), join(fixture, 'dist'), 'junction');
  await assert.rejects(buildDocs({ root: fixture }), /inside dist or outside/);
  await unlink(join(fixture, 'dist'));
  await rename(join(fixture, 'docs/images'), join(fixture, 'saved-images'));
  const privateImages = join(temporary, 'private-images');
  await write(privateImages, 'leaked.png', sentinel);
  await symlink(privateImages, join(fixture, 'docs/images'), 'junction');
  await assert.rejects(buildDocs({ root: fixture, outDir }), /Public paths cannot contain symlinks/);
  assert.equal((await files(outDir)).includes('docs/images/leaked.png'), false);
  assert.match(await readFile(join(outDir, 'README.html'), 'utf8'), /项目介绍/, 'unsafe public asset directory leaves the previous site intact');
  await symlink(join(fixture, 'AGENTS.md'), join(outDir, 'leak.txt'));
  assert.equal((await fetch(origin + '/leak.txt')).status, 404, 'loopback fixture refuses symlink escapes');
  assert.equal((await fetch(origin + '/%2e%2e%2fsource/AGENTS.md')).status, 404, 'loopback fixture refuses decoded path escapes');
});
