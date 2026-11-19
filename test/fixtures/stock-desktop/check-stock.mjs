import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
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
  response.end('<!doctype html><title>OMD stock fixture</title><button onclick="this.textContent=\'clicked\'">Click fixture</button>');
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
  await page.waitForFunction(() => typeof window.dshDesktop?.browser?.acquire === 'function');
  assert.equal(await page.evaluate(() => typeof window.dshDesktop.browser.acquireOpenCU), 'undefined', 'The test used a patched desktop');
  if (mode === 'exercise') {
    await page.waitForFunction(async () => {
      const response = await fetch('/api/opencu', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'browserRoute/enabled' }) });
      return response.ok && (await response.json()).enabled === true;
    }, null, { timeout: 30000, polling: 500 });
    const call = (method, args = {}) => page.evaluate(async ({ method, args }) => {
      const response = await fetch('/api/opencu', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }) });
      const result = await response.json();
      if (!result.ok) throw new Error(method + ' failed: ' + JSON.stringify(result.error));
      return result;
    }, { method, args });
    const fixturePath = join(directory, 'omd-stock-fixture');
    await mkdir(fixturePath, { recursive: true });
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
    const workspace = page.getByRole('treeitem').filter({ hasText: 'omd-stock-fixture' }).first();
    await workspace.hover();
    await button(workspace, /新建会话|new session|new chat/i).click();
    await button(page, /选择工作区|select workspace|choose workspace/i).filter({ hasText: 'omd-stock-fixture' }).waitFor();
    const sidebar = button(page, /打开右侧边栏|open right sidebar/i);
    const files = button(page, /工作区文件|workspace files/i);
    const image = page.getByText('stock-image.png', { exact: true }).first();
    for (let attempt = 0; attempt < 12 && !await image.isVisible(); attempt++) {
      if (await sidebar.isVisible()) await sidebar.click();
      else if (await files.isVisible()) await files.click();
      else {
        const show = button(page, /显示文件树|show file tree/i);
        if (await show.isVisible()) await show.click();
      }
      await sleep(300);
    }
    await image.click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('*')).some(element =>
      element.shadowRoot?.querySelector('img[alt="stock-image.png"]')?.naturalWidth === 300));
    await page.getByRole('button', { name: /添加评论|add comment/i }).click();
    const imageBounds = await page.locator('img[alt="stock-image.png"]').boundingBox();
    assert(imageBounds);
    await page.mouse.click(imageBounds.x + imageBounds.width / 2, imageBounds.y + imageBounds.height / 2);
    const comment = page.getByRole('textbox', { name: /添加评论|编辑评论|add comment|edit comment/i });
    await comment.fill('Stock image annotation');
    await comment.press('Enter');
    await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith('opencu:image-comments:')
      && localStorage.getItem(key)?.includes('Stock image annotation')));
    console.log('Native workspace file tree and OpenCU image preview loaded with annotation controls.');
    const showTree = button(page, /显示文件树|show file tree/i);
    if (await showTree.isVisible()) await showTree.click();
    await page.getByText('stock-preview.pdf', { exact: true }).first().click();
    await page.getByText('Stock DSH document', { exact: true }).waitFor();
    await button(page, /请求修改|request changes/i).click();
    await page.getByText(/选中内容并提出修改要求|select.*request.*change/i).waitFor();
    console.log('The stock file tree opened the OpenCU document viewer.');

    const addon = button(page, /新标签页|new tab/i);
    if (await addon.isVisible()) await addon.click();
    await button(page, /^(浏览器|browser)/i).first().click();
    fixture.listen(0, '127.0.0.1');
    await once(fixture, 'listening');
    const fixtureURL = 'http://127.0.0.1:' + fixture.address().port + '/';
    await page.waitForFunction(() => [...document.querySelectorAll('webview')].some(guest => {
      try { return !!guest.getURL(); } catch { return false; }
    }));
    await page.evaluate(async url => {
      const guest = [...document.querySelectorAll('webview')].find(value => { try { return !!value.getURL(); } catch { return false; } });
      await guest.loadURL(url);
    }, fixtureURL);
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
    await call('act', { action: 'click', x: 24, y: 14, screenshotId: screenshot.id });
    assert.equal(await page.evaluate(async url => {
      const guest = [...document.querySelectorAll('webview')].find(value => { try { return value.getURL() === url; } catch { return false; } });
      return guest.executeJavaScript('document.querySelector("button").textContent');
    }, fixtureURL), 'clicked');
    await button(page, /为此页面添加批注|annotate this page/i).waitFor();
    assert.equal(await page.evaluate(async url => {
      const guest = [...document.querySelectorAll('webview')].find(value => { try { return value.getURL() === url; } catch { return false; } });
      return guest.executeJavaScript('typeof globalThis.__opencuAnnotations?.dispatch === "function"');
    }, fixtureURL), true);
    console.log('OpenCU controlled the stock sidebar page and installed its page annotation runtime.');

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
    await button(page, 'DeepSeek 网页聊天').click();
    await page.waitForFunction(() => document.querySelector('.dswb-managed-browser img')?.src.startsWith('data:image/'));
    console.log('Signed stock DSH loaded the plugin browser, previews, native monitor, extension folder and managed Workbench.');
  }
} finally {
  fixture.closeAllConnections();
  if (fixture.listening) await new Promise(resolve => fixture.close(resolve));
  await browser.close();
}
