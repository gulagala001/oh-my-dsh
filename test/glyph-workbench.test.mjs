import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { launchFixtureBrowser } from './fixtures/browser.mjs';

test('native workbench surfaces mask glyphs through fullscreen, floating and layout changes', async () => {
  const { outputFiles } = await build({
    entryPoints: [new URL('../plugins/glyph-theme/src/theme/renderer.mjs', import.meta.url).pathname],
    bundle: true, write: false, format: 'iife', globalName: 'GlyphReplay',
  });
  const browser = await launchFixtureBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error));
    // The host retains the normal grid track in fullscreen. Floats have a
    // zero-sized grid host and a fixed child that can escape a closed panel.
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;height:100%;background:#111}
      #frame{display:grid;grid-template-columns:200px 600px 400px;height:100%}
      #sidebar,#conversation{min-width:0;overflow:hidden}
      #right{position:relative;overflow:visible}
      .wSkVaW_header{height:72px}
      #panel{position:absolute;right:0;top:0;bottom:0;width:400px;display:flex}
      #panel[data-sidebar-right-panel=fullscreen]{width:100vw}
      [data-dockkit-host=dock]{display:flex;flex:1;z-index:10}
      #panel[data-sidebar-right-panel=fullscreen] [data-dockkit-host=dock]{z-index:40}
      #panel:not([data-sidebar-right-open]) [data-dockkit-host=dock]{transform:translateX(100%);visibility:hidden}
      [data-dockkit-pane]{flex:1;min-width:0;background:#222}
      [data-dockkit-host=float]{width:0;height:0;z-index:60}
      [data-dockkit-float]{position:fixed;left:160px;top:40px;width:500px;height:380px;background:#333}
      [hidden]{display:none!important}
      .omd-glyph-canvas{position:fixed;inset:0;pointer-events:none;z-index:8}
      .omd-glyph-chrome{position:absolute;pointer-events:none;z-index:4}
      [data-glyph-anchor]{position:relative}
      [data-glyph-chrome-host]{isolation:isolate}
    </style></head><body>
      <main id="frame" data-omd-surface="frame">
        <aside id="sidebar" data-omd-surface="sidebar-column"></aside>
        <section id="conversation" data-omd-surface="conversation"><header class="wSkVaW_header"></header>
          <div id="preview" data-file-preview style="position:absolute;left:300px;top:130px;width:300px;height:200px"></div>
        </section>
        <aside id="right" data-omd-surface="workbench-column"><div id="panel" data-sidebar-right-panel="push" data-sidebar-right-open>
          <div data-dockkit-host="dock"><section data-dockkit-pane="preview"></section></div>
          <div data-dockkit-host="float" hidden><section id="float" data-dockkit-float="float"></section></div>
        </div></aside>
      </main><canvas class="omd-glyph-canvas"></canvas>
    </body></html>`);
    await page.addScriptTag({ content: outputFiles[0].text });
    await page.evaluate(() => {
      window.stopGlyphs = GlyphReplay.mountGlyphRenderer(document.querySelector('.omd-glyph-canvas'), { reduced: true });
      window.inkIn = ({ left, top, width, height }) => {
        const pixels = document.querySelector('.omd-glyph-canvas').getContext('2d').getImageData(left, top, width, height).data;
        let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
        return count;
      };
      window.inkInside = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return inkIn({ left: r.left + 32, top: r.top + 32, width: r.width - 64, height: r.height - 64 });
      };
    });
    const settle = () => page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
    const border = () => page.evaluate(() => inkIn({ left: 197, top: 100, width: 7, height: 400 }));
    await settle();
    assert.ok(await border() > 0, 'the theme retains the visible sidebar divider');
    assert.equal(await page.evaluate(() => inkInside('#preview')), 0, 'inline native content masks the conversation artwork too');
    await page.evaluate(() => {
      document.querySelector('#frame').setAttribute('data-rightbar-fullscreen', '');
      document.querySelector('#panel').dataset.sidebarRightPanel = 'fullscreen';
    });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('[data-dockkit-pane]')), 0, 'fullscreen must cover the old grid divider and header');

    await page.evaluate(() => {
      document.querySelector('#frame').removeAttribute('data-rightbar-fullscreen');
      document.querySelector('#panel').dataset.sidebarRightPanel = 'push';
      document.querySelector('[data-dockkit-host=float]').hidden = false;
    });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('#float')), 0, 'a float masks its full surface, including its header');
    await page.evaluate(() => { document.querySelector('#float').style.left = '650px'; });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('#float')), 0, 'moving a float without resizing invalidates its coverage');
    assert.ok(await border() > 0, 'moving a float restores the uncovered divider');
    await page.evaluate(() => {
      const el = document.querySelector('#float');
      el.style.transition = 'transform 400ms linear'; el.style.transform = 'translateX(-300px)';
    });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('#float')), 0, 'coverage follows a live transform even with reduced glyph motion');
    await page.evaluate(async () => { await Promise.all(document.querySelector('#float').getAnimations().map(animation => animation.finished)); });
    await page.evaluate(() => {
      document.querySelector('#panel').removeAttribute('data-sidebar-right-open');
    });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('#float')), 0, 'a float remains protected when its docked panel closes');
    await page.evaluate(() => { document.querySelector('[data-dockkit-host=float]').hidden = true; });
    await settle();
    assert.ok(await border() > 0, 'hiding the float restores the underlying chrome');
    assert.equal(await page.evaluate(() => inkIn({ left: 800, top: 100, width: 5, height: 400 })), 0, 'a closed dock leaves no track divider');
    await page.evaluate(() => { document.querySelector('#conversation').style.opacity = '0'; });
    await settle();
    assert.equal(await page.evaluate(() => inkIn({ left: 240, top: 10, width: 500, height: 750 })), 0, 'an invisible ancestor must not leave its scene or header on the global canvas');
    await page.evaluate(() => { stopGlyphs(); });
    assert.equal(await page.locator('.omd-glyph-chrome,[data-glyph-control],[data-glyph-icon]').count(), 0);
    assert.equal(await page.evaluate(() => inkIn({ left: 0, top: 0, width: 1200, height: 800 })), 0, 'disposal clears the global bitmap immediately');
    await page.evaluate(() => {
      document.querySelector('#conversation').style.opacity = '';
      document.querySelector('#sidebar').innerHTML = '<div id="ring-host"><button id="ring-target" style="overflow:hidden">Action</button></div><label><input id="toggle" type="checkbox" style="opacity:0"></label><button><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style="visibility:hidden"><path fill="currentColor" d="M0 0H20V20H0Z"/></svg></button>';
      window.stopGlyphs = GlyphReplay.mountGlyphRenderer(document.querySelector('.omd-glyph-canvas'));
    });
    await settle();
    assert.equal(await page.locator('#toggle').getAttribute('data-glyph-control'), '', 'visually hidden native inputs retain their character toggle');
    assert.equal(await page.locator('[data-glyph-icon]').count(), 0, 'native hidden icons must not be exposed by decoration');
    await page.dispatchEvent('#ring-target', 'pointerdown', { button: 0, clientX: 30, clientY: 10 });
    await settle();
    assert.equal(await page.locator('#ring-host > canvas').count(), 1);
    await page.evaluate(() => {
      document.querySelector('#ring-target').style.visibility = 'hidden';
      document.querySelector('#toggle').hidden = true;
    });
    await settle();
    assert.equal(await page.locator('#ring-host > canvas').count(), 0, 'hiding a click target also removes its ring from the parent layer');
    assert.equal(await page.locator('#toggle').getAttribute('data-glyph-control'), null, 'hidden controls must not leave a character toggle on their parent');
    await page.evaluate(() => {
      document.querySelector('#panel').setAttribute('data-sidebar-right-open', '');
      document.querySelector('#panel').dataset.sidebarRightPanel = 'fullscreen';
    });
    await settle();
    assert.equal(await page.evaluate(() => inkInside('[data-dockkit-pane]')), 0, 'fullscreen also masks an animated scene and its live input effects');
    await page.evaluate(() => { stopGlyphs(); });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
