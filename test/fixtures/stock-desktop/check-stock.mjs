import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
const from = createRequire(process.env.OMD_STOCK_TEST_DEPENDENCIES
  ? join(process.env.OMD_STOCK_TEST_DEPENDENCIES, 'package.json') : import.meta.url);
const { chromium } = from('playwright');
const sharp = from('sharp');

const [port, mode, directory] = process.argv.slice(2);
assert(/^\d+$/.test(port) && ['init', 'exercise'].includes(mode) && directory);
const origin = 'http://127.0.0.1:' + port;
let browser;
for (let attempt = 0; attempt < 100 && !browser; attempt++) {
  try { browser = await chromium.connectOverCDP(origin, { timeout: 2000 }); }
  catch { await sleep(600); }
}
assert(browser, 'The stock desktop debugging port did not open');
const pages = () => browser.contexts().flatMap(context => context.pages());
const button = (page, name) => page.getByRole('button', { name });
const fixture = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>OMD stock fixture</title><button onclick="this.textContent=\'clicked\'">Click fixture</button><br><input aria-label="Fixture text">');
});

function samplePDF() {
  const content = 'BT /F1 22 Tf 40 160 Td (Stock DSH document) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
  ];
  let file = '%PDF-1.4\n', entries = '0000000000 65535 f \n';
  objects.forEach((body, index) => {
    entries += String(file.length).padStart(10, '0') + ' 00000 n \n';
    file += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = file.length;
  return file + 'xref\n0 ' + (objects.length + 1) + '\n' + entries
    + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
}

try {
  let page;
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    const welcome = pages().find(value => value.url().endsWith('/welcome.html'));
    if (welcome) await welcome.evaluate(() => { if (window.dshWelcome?.skip) setTimeout(() => window.dshWelcome.skip(), 0); }).catch(() => {});
    page = pages().find(value => value.url() === 'dsh-app://app/');
    if (!page) await sleep(600);
  }
  assert(page, 'The product renderer did not load');
  page.setDefaultTimeout(25000);
  await page.waitForFunction(() => typeof window.dshDesktop?.browser?.acquire === 'function');
  assert.equal(await page.evaluate(() => typeof window.dshDesktop.browser.acquireOpenCU), 'undefined', 'The test used a patched desktop');
  if (mode === 'exercise') {
    await page.waitForFunction(async () => {
      const response = await fetch('/api/opencu', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'browserRoute/enabled' }) });
      return response.ok && (await response.json()).enabled === true;
    }, null, { timeout: 30000, polling: 500 });
    const request = (method, args = {}) => page.evaluate(async ({ method, args }) => {
      const response = await fetch('/api/opencu', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }) });
      return { status: response.status, body: await response.text() };
    }, { method, args });
    const call = async (method, args = {}) => {
      let response = await request(method, args);
      // A read can overlap the shell's initial Host handoff. Await readiness
      // again without replaying inputs or filesystem operations.
      if (method === 'capabilities' && response.status === 503) {
        for (let attempt = 0; attempt < 10 && response.status === 503; attempt++) {
          await sleep(500);
          response = await request(method, args);
        }
        if (response.status === 503) {
          const config = await request('config').catch(() => ({}));
          console.log('Stock desktop transport diagnosis', { configStatus: config.status, rendererPaths: pages().map(value => new URL(value.url()).pathname) });
        }
      }
      if (response.status !== 200 || !response.body) throw new Error(method + ' returned HTTP ' + response.status + ': ' + response.body.slice(0, 320));
      const result = JSON.parse(response.body);
      if (!result.ok) throw new Error(method + ' failed: ' + JSON.stringify(result.error));
      return result;
    };
    await mkdir(directory, { recursive: true });
    const fixturePath = await mkdtemp(resolve(directory, 'omd-stock-fixture-'));
    const workspaceName = basename(fixturePath);
    await writeFile(join(fixturePath, 'stock-preview.csv'), 'name,value\nfixture,42\n');
    await writeFile(join(fixturePath, 'stock-preview.pdf'), samplePDF());
    await sharp({ create: { width: 300, height: 200, channels: 3, background: '#4479be' } }).png().toFile(join(fixturePath, 'stock-image.png'));
    assert.equal((await call('capabilities')).ok, true);
    assert.equal((await call('extensionFiles/open')).revealed, true);
    assert.equal(await page.evaluate(async path => {
      const response = await fetch('/api/workspace/create', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'workspace/create', payload: { args: { request: { path } } } }) });
      return (await response.json()).result.ok;
    }, fixturePath), true);
    await page.reload();
    const workspace = page.getByRole('treeitem').filter({ hasText: workspaceName }).first();
    await workspace.hover();
    await button(workspace, /新建会话|new session|new chat/i).click();
    await button(page, /选择工作区|select workspace|choose workspace/i).filter({ hasText: workspaceName }).waitFor();
    const sidebar = button(page, /打开右侧边栏|open right sidebar/i);
    const files = button(page, /工作区文件|workspace files/i);
    const filesTab = page.getByRole('tab', { name: /^(文件|files\b)/i }).filter({ visible: true }).first();
    const visibleFile = name => page.getByText(name, { exact: true }).filter({ visible: true }).first();
    const image = visibleFile('stock-image.png');
    for (let attempt = 0; attempt < 12 && !await image.isVisible(); attempt++) {
      if (await sidebar.isVisible()) await sidebar.click();
      else if (await filesTab.isVisible() && await filesTab.getAttribute('aria-selected') === 'false') await filesTab.click();
      else {
        const show = button(page, /显示文件树|show file tree/i);
        if (await show.isVisible()) await show.click();
        else if (await files.isVisible()) await files.click();
      }
      await sleep(300);
    }
    await image.click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('*')).some(element =>
      element.shadowRoot?.querySelector('img[alt="stock-image.png"]')?.naturalWidth === 300));
    await page.getByRole('button', { name: /^(添加评论|comment|add (?:a )?comment)$/i }).click();
    const imageBounds = await page.locator('img[alt="stock-image.png"]').boundingBox();
    assert(imageBounds);
    await page.mouse.click(imageBounds.x + imageBounds.width / 2, imageBounds.y + imageBounds.height / 2);
    const comment = page.getByRole('textbox', { name: /添加评论|编辑评论|add (?:a )?comment|edit comment/i });
    await comment.fill('Stock image annotation');
    await comment.press('Enter');
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('opencu:image-comments:')
      && localStorage.getItem(key)?.includes('Stock image annotation')));
    console.log('Native workspace file tree and OpenCU image preview loaded with annotation controls.');
    if (await filesTab.isVisible() && await filesTab.getAttribute('aria-selected') === 'false') await filesTab.click();
    const showTree = button(page, /显示文件树|show file tree/i).filter({ visible: true }).first();
    if (await showTree.isVisible()) await showTree.click();
    await visibleFile('stock-preview.pdf').click();
    const pdfText = page.getByText('Stock DSH document', { exact: true });
    await pdfText.waitFor();
    await button(page, /请求修改|request (?:edits|changes)/i).click();
    await page.getByText(/选中内容并提出修改要求|select content and ask for changes/i).waitFor();
    const textBounds = await pdfText.boundingBox();
    assert(textBounds);
    const textY = textBounds.y + textBounds.height / 2;
    await page.mouse.move(textBounds.x + 2, textY);
    await page.mouse.down();
    await page.mouse.move(textBounds.x + textBounds.width - 2, textY, { steps: 15 });
    await page.mouse.up();
    await page.getByRole('textbox', { name: /PDF 注释|PDF annotation/i }).fill('Stock document annotation');
    await button(page, /^(评论|comment)$/i).click();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('opencu:document-comments:')
      && localStorage.getItem(key)?.includes('Stock document annotation')));
    console.log('The stock file tree opened the OpenCU document viewer and saved a PDF annotation.');

    const addon = button(page, /新标签页|new tab/i);
    if (await addon.isVisible()) await addon.click();
    await button(page, /^(浏览器|browser)/i).first().click();
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    const fixtureURL = 'http://127.0.0.1:' + fixture.address().port + '/';
    const activeGuest = '[data-app-shell-focus-area="right-panel"] > webview';
    await page.waitForFunction(selector => {
      try { return !!document.querySelector(selector)?.getURL(); } catch { return false; }
    }, activeGuest);
    await page.locator(activeGuest).evaluate((guest, url) => guest.loadURL(url), fixtureURL);
    let target;
    for (let attempt = 0; attempt < 20 && !target; attempt++) {
      target = (await call('targets')).targets.find(value => value.provider === 'dsh' && value.url === fixtureURL);
      if (!target) await sleep(250);
    }
    assert(target, 'The plugin did not publish the real sidebar page');
    await call('select', { reference: { id: target.id } });
    const { state } = await call('state');
    if (state.mode === 'recovery_required' && !state.explicitlyStopped) {
      await call('resume', { targetId: target.id, targetIdentity: target.identity });
    }
    const capture = await call('observe', { format: 'both' });
    const screenshot = capture.observation?.screenshot ?? capture.screenshot;
    assert(screenshot?.id && screenshot.width > 0);
    assert.match(capture.observation.ax, /button "Click fixture"/);
    const viewport = screenshot.viewport;
    await call('act', { action: 'click', x: 24 * screenshot.width / viewport.width, y: 14 * screenshot.height / viewport.height,
      coordinateSpace: 'screenshot-pixels', screenshotId: screenshot.id });
    const guestRead = expression => page.evaluate(async ({ url, expression }) => {
      const guest = [...document.querySelectorAll('webview')].find(value => { try { return value.getURL() === url; } catch { return false; } });
      return guest.executeJavaScript(expression);
    }, { url: fixtureURL, expression });
    assert.equal(await guestRead('document.querySelector("button").textContent'), 'clicked');
    const [x, y] = await guestRead('(() => { const r = document.querySelector("input").getBoundingClientRect(); return [r.x + 12, r.y + r.height / 2]; })()');
    await call('act', { action: 'click', x, y });
    await call('act', { action: 'type', text: 'stock browser input' });
    assert.equal(await guestRead('document.querySelector("input").value'), 'stock browser input');
    const annotate = button(page, /为此页面添加批注|annotate this page/i);
    await annotate.click();
    const [guestX, guestY] = await page.evaluate(url => {
      const guest = [...document.querySelectorAll('webview')].find(value => { try { return value.getURL() === url; } catch { return false; } });
      const bounds = guest.getBoundingClientRect();
      return [bounds.x, bounds.y];
    }, fixtureURL);
    await page.mouse.click(guestX + 24, guestY + 14);
    const webComment = page.getByRole('textbox', { name: /评论|注释|批注|comment|annotation/i }).last();
    await webComment.fill('Stock web annotation');
    await button(page, /^(评论|添加评论|保存|comment|add comment|save)$/i).last().click();
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('opencu:annotations:')
      && !key.endsWith(':drafts') && localStorage.getItem(key)?.includes('Stock web annotation')));
    console.log('OpenCU controlled the stock sidebar page with mouse and keyboard and saved an annotation.');

    const rendererId = crypto.randomUUID(), threadID = 'stock-monitor-fixture';
    const registration = await call('browser/connect', { rendererId, sessionIds: [threadID], browser: false, presentation: true });
    try {
      const frame = 'data:image/png;base64,' + (await sharp({ create: {
        width: 128, height: 96, channels: 3, background: '#4479be',
      } }).png().toBuffer()).toString('base64');
      const visible = await call('nativePresentation', { rendererId, operation: 'update', args: {
        frames: [{ threadID, presentationID: 'fixture', title: 'Stock monitor fixture', width: 128, height: 96, kind: 'screenshot', imageDataURL: frame }],
      } });
      assert.equal(visible.visible, true);
      assert.equal(visible.rendered, true);
    } finally {
      await call('nativePresentation', { rendererId, operation: 'close' });
      await call('browser/disconnect', { rendererId, connectionId: registration.connectionId, released: true });
    }
    await button(page, /^(DeepSeek 网页聊天|DeepSeek web chat)$/i).click();
    await page.waitForFunction(() => document.querySelector('.dswb-managed-browser img')?.src.startsWith('data:image/'));
    await button(page, /账号菜单|account menu/i).click();
    await page.getByRole('menuitem', { name: /^(设置|settings)/i }).click();
    await page.getByText(/^(电脑与浏览器|Computer and browsers)$/i).click();
    const settings = page.locator('div[class*="@container/settings-row"]');
    await settings.filter({ hasText: /AI 操作侧栏浏览器|AI control in the sidebar/i }).filter({
      has: page.getByText(/^(可用|Available)$/i),
    }).waitFor();
    const available = settings.filter({ has: page.getByText(/^(可用|Available)$/i) });
    await available.nth(7).waitFor();
    assert.equal(await available.count(), 8);
    await page.getByText(/^(未连接|Not connected)$/i).first().waitFor();
    console.log('Signed stock DSH loaded the plugin browser, previews, native monitor, extension folder and managed Workbench.');
  }
} finally {
  fixture.closeAllConnections();
  if (fixture.listening) await new Promise(resolve => fixture.close(resolve));
  await browser.close();
}
