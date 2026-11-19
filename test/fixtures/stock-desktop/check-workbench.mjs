import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createManagedWorkbench } from '../../../plugins/deepseek-workbench/src/managed-browser.mjs';

const from = createRequire(process.env.OMD_STOCK_TEST_DEPENDENCIES
  ? join(process.env.OMD_STOCK_TEST_DEPENDENCIES, 'package.json') : import.meta.url);
const { chromium } = from('playwright');
const directory = await mkdtemp(join(tmpdir(), 'omd-workbench-check-'));
const origin = 'https://chat.deepseek.com';
const startBrowser = async profile => {
  const context = await chromium.launchPersistentContext(profile, {
    channel: process.platform === 'win32' ? 'msedge' : 'chrome',
    headless: true, acceptDownloads: true, viewport: { width: 980, height: 760 },
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/artifact') return route.fulfill({ headers: {
      'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="fixture.txt"',
    }, body: 'OMD Workbench download fixture' });
    if (url.pathname === '/login') return route.fulfill({ headers: {
      'content-type': 'text/html', 'set-cookie': 'workbenchTest=ready; Max-Age=3600; Secure; HttpOnly; Path=/',
    }, body: '<title>Signed in</title>' });
    const signedIn = (await request.allHeaders()).cookie?.includes('workbenchTest=ready');
    return route.fulfill({ contentType: 'text/html', body: '<title>' + (signedIn ? 'Signed in after restart' : 'Sign-in required')
      + '</title><a style="display:block;padding:10px;width:180px" href="/artifact">Download fixture</a>' });
  });
  return context;
};

try {
  const first = createManagedWorkbench(directory, { startBrowser });
  try {
    const { id } = await first.request({ operation: 'open', url: origin + '/login' });
    assert.equal((await first.request({ operation: 'touch', id })).title, 'Signed in');
  } finally { await first.dispose(); }
  const second = createManagedWorkbench(directory, { startBrowser });
  try {
    const url = origin + '/', { id } = await second.request({ operation: 'open', url });
    assert.equal((await second.request({ operation: 'touch', id })).title, 'Signed in after restart');
    await second.request({ operation: 'click', id, value: { x: 32, y: 26, url } });
    let items = [];
    for (let i = 0; i < 20 && !items.length; i++) {
      items = (await second.request({ operation: 'frame', id })).downloads;
      if (!items.length) await delay(150);
    }
    assert.equal(items.length, 1);
    const { stream, name } = await second.download(id, items[0].id);
    const downloaded = [];
    for await (const chunk of stream) downloaded.push(chunk);
    assert.equal(name, 'fixture.txt');
    assert.equal(Buffer.concat(downloaded).toString('utf8'), 'OMD Workbench download fixture');
  } finally { await second.dispose(); }
  console.log('Workbench kept a signed-in fixture across Chromium restarts and returned the downloaded file bytes.');
} finally { await rm(directory, { recursive: true, force: true }); }
