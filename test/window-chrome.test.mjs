import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real Chromium CSS and the actual appearance runtime. This checks region
// declarations/lifecycle; OS window movement is verified separately in Electron.
test('appearance owners keep paint-only portals neutral and controls interactive', async () => {
  const { outputFiles } = await build({
    entryPoints: [new URL('../src/client/skins/runtime.mjs', import.meta.url).pathname],
    bundle: true, write: false, format: 'iife', globalName: 'AppearanceReplay', loader: { '.css': 'text' },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://window-chrome.invalid/**', route => route.fulfill({ contentType: 'text/html', body: `
      <!doctype html><html data-platform="darwin" style="--dsh-frame-top-clearance:48px"><head><style>
      html[data-platform=darwin] [data-window-drag]{-webkit-app-region:drag}
      html[data-platform=darwin] body>:not(#root){-webkit-app-region:no-drag}
      html[data-platform=darwin] :is(button,a,input,textarea,[tabindex],[role=dialog],[role=menu],[contenteditable=true]){-webkit-app-region:no-drag}
      [data-platform=darwin] :is(.wSkVaW_headerLeading,.wSkVaW_headerActions,.wSkVaW_headerUtilities,.wSkVaW_headerCorner){-webkit-app-region:no-drag}
      </style></head><body><div id="root" class="pI_x6G_frame" style="position:relative"><header class="wSkVaW_header" data-window-drag>
      <div class="wSkVaW_headerLeading" id="leading"><button id="button">Action</button></div>
      <div class="wSkVaW_headerActions" id="actions"><span>Label</span></div>
      <div class="wSkVaW_headerUtilities" id="utilities"><input id="input"><div id="editor" contenteditable="plaintext-only"></div></div>
      <div class="wSkVaW_headerCorner" id="corner"><a id="link" href="#">Link</a></div>
      <div class="wSkVaW_headerCorner" tabindex="0" id="focusable">Custom control</div>
      <div id="drag-source" draggable="true">Drag a file</div>
      </header><div class="pI_x6G_handle" id="splitter"></div></div><canvas class="omd-glyph-canvas" id="canvas"></canvas>
      <div data-omd-background-layer id="wallpaper"></div>
      <div role="presentation" id="modal"><div role="dialog" id="dialog">Modal</div></div>
      </body></html>` }));
    await page.goto('http://window-chrome.invalid');
    await page.addScriptTag({ content: outputFiles[0].text });
    const regions = () => page.evaluate(() => Object.fromEntries([
      'canvas', 'wallpaper', 'leading', 'actions', 'utilities', 'corner', 'button', 'input', 'editor', 'link', 'focusable', 'drag-source', 'splitter', 'modal', 'dialog',
    ].map(id => [id, getComputedStyle(document.getElementById(id)).webkitAppRegion])));
    assert.equal((await regions()).canvas, 'no-drag', 'fixture reproduces the host body-portal exclusion');
    await page.evaluate(() => {
      const theme = { active: { colorScheme: 'light' }, preference: 'system' };
      const ctx = { theme: { getTheme: () => theme, overrideTokens: () => () => {} }, on: () => () => {}, emit() {} };
      window.createAppearance = (id, priority) => AppearanceReplay.createSkinRuntime(ctx, '', {}, '', undefined, '', {
        defaultSkin: 'default', storageKey: id, owner: { id, priority },
      });
      window.first = createAppearance('chrome-first', 0);
    });
    const expected = {
      canvas: 'none', wallpaper: 'none', leading: 'none', actions: 'none', utilities: 'none', corner: 'none',
      button: 'no-drag', input: 'no-drag', editor: 'no-drag', link: 'no-drag', focusable: 'no-drag', 'drag-source': 'no-drag', splitter: 'no-drag', modal: 'no-drag', dialog: 'no-drag',
    };
    assert.deepEqual(await regions(), expected, 'native appearance shares the same drag contract');
    assert.deepEqual(await page.locator('#root').evaluate(el => {
      const style = getComputedStyle(el, '::before');
      return [style.webkitAppRegion, style.height, style.pointerEvents];
    }), ['drag', '48px', 'none'], 'the native frame clearance stays draggable on pages without a header');
    for (const skin of ['glyph-motion', 'codex-desktop', 'ios-liquid-glass', 'default']) {
      await page.evaluate(skin => first.select(skin), skin);
      assert.deepEqual(await regions(), expected, `region semantics survive ${skin}`);
      assert.equal(await page.locator('[data-omd-window-chrome]').count(), 1);
    }
    assert.equal(await page.locator('#editor').evaluate(el => getComputedStyle(el).userSelect), 'text');
    await page.evaluate(() => { window.second = createAppearance('chrome-second', 10); });
    assert.equal(await page.evaluate(() => first.getSnapshot().active), false);
    assert.equal(await page.locator('[data-omd-window-chrome]').count(), 1, 'ownership handoff replaces the interaction style');
    assert.deepEqual(await regions(), expected);
    await page.evaluate(() => second.dispose());
    assert.equal(await page.evaluate(() => first.getSnapshot().active), true);
    assert.equal(await page.locator('[data-omd-window-chrome]').count(), 1);
    await page.evaluate(() => { document.documentElement.dataset.platform = 'win32'; });
    assert.equal((await regions()).canvas, 'none');
    assert.equal(await page.locator('#root').evaluate(el => getComputedStyle(el, '::before').webkitAppRegion), 'none', 'Windows retains its host caption band');
    await page.evaluate(() => { document.documentElement.dataset.platform = 'darwin'; first.dispose(); });
    assert.equal(await page.locator('[data-omd-window-chrome]').count(), 0);
    assert.equal((await regions()).canvas, 'no-drag', 'unload restores host-owned portal semantics');
  } finally { await browser.close(); }
});
