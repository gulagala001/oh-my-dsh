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
    console.log('The published baseline returned OpenCU capabilities in the official Windows desktop.');
  }
} finally {
  fixture.closeAllConnections();
  if (fixture.listening) await new Promise(resolve => fixture.close(resolve));
  await browser.close();
}
