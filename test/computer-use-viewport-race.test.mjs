import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BrowserActions } from '../src/computer-use/browser-actions.mjs';

test('viewport reset and resize survive an in-flight screenshot restoration', { timeout: 20000 }, async t => {
  const browser = await chromium.launch({ channel: 'chromium' });
  t.after(() => browser.close());
  for (const operation of ['reset', 'resize']) await t.test(operation, async () => {
    const context = await browser.newContext({ viewport: null });
    try {
      const page = await context.newPage(), cdp = await context.newCDPSession(page);
      await page.setContent('<style>body{width:1800px;height:1600px;background:#ccc}</style>Viewport restoration');
      const size = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      const original = await size(), actions = new BrowserActions();
      const record = { id: operation, page, cdp };
      await actions.setViewport(record, { width: 500, height: 350 });
      assert.deepEqual(await size(), { width: 500, height: 350 });

      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      const send = cdp.send.bind(cdp);
      cdp.send = (method, params) => {
        const result = send(method, params);
        // The screenshot is already submitted to Chromium, but its saved
        // emulation/view size has not yet been restored by the capture reply.
        if (method === 'Page.captureScreenshot') entered();
        return result;
      };
      // Distinct records for one target must still share the transaction.
      const capture = actions.observeScreenshot({ ...record }, {});
      capture.catch(() => {});
      await started;
      const expected = operation === 'reset' ? original : { width: 640, height: 360 };
      const changed = operation === 'reset' ? actions.resetViewport(record) : actions.setViewport(record, expected);
      await Promise.all([capture, changed]);
      assert.deepEqual(await size(), expected, 'the completed capture must not restore its old 500x350 viewport over the requested change');
      assert.equal(record.viewportOverride, operation !== 'reset');
    } finally { await context.close(); }
  });
});
