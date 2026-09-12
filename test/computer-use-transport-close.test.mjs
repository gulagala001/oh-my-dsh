import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';

for (const mode of ['disconnect', 'close']) test('browser transport ' + mode + ' rejects pending real CDP sessions', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-transport-close-'));
  const host = new BrowserHost(root); let browser, transport;
  t.after(async () => { transport?.close(); await browser?.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const run = await host.start();
  transport = new BrowserTransport(run.endpoint);
  browser = await chromium.connectOverCDP(transport, { isLocal: true });
  const page = await browser.contexts()[0].newPage(), cdp = await page.context().newCDPSession(page);
  const write = transport.write.bind(transport); let sent;
  const intercepted = new Promise(resolve => { sent = resolve; });
  transport.write = message => {
    if (message.method === 'Runtime.evaluate' && message.params.expression === '21 * 2') { sent(); return; }
    write(message);
  };
  // A real Playwright CDPSession waits for this intentionally withheld reply.
  // Losing the real WebSocket must reject it even without a detach event.
  const pending = cdp.send('Runtime.evaluate', { expression: '21 * 2', returnByValue: true });
  pending.catch(() => {}); await intercepted;
  if (mode === 'close') transport.close(); else transport.socket.terminate();
  let timer;
  try {
    await assert.rejects(Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP request remained pending after disconnect')), 1000); })]), /transport closed|browser.*closed|session.*closed|Target closed/i);
  } finally { clearTimeout(timer); }
});
