// Run with the installed Electron in Node mode to use the application's own Playwright.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { join, relative, isAbsolute, sep } = require('node:path');
const resources = join(process.argv[2], 'resources');
process.env.PLAYWRIGHT_BROWSERS_PATH = join(resources, 'omd-browsers');
const fromPlugin = createRequire(join(resources, 'app.asar/dsh/node_modules/oh-my-dsh/package.json'));
const { chromium } = fromPlugin('playwright');
(async () => {
  const path = relative(process.env.PLAYWRIGHT_BROWSERS_PATH, chromium.executablePath());
  assert(path && !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
  const browser = await chromium.launch({ channel: 'chromium', headless: true, timeout: 30_000 });
  try {
    const page = await browser.newPage();
    await page.setContent('<title>Bundled Chromium</title>');
    assert.equal(await page.title(), 'Bundled Chromium');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
