import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createContentExclusion, inClosedDetails, NATIVE_CONTENT } from '../plugins/glyph-theme/src/theme/semantics.mjs';
import { createCharacterScene } from '../plugins/glyph-theme/src/theme/scene.mjs';
import { createOcclusionIndex } from '../plugins/glyph-theme/src/theme/occlusion.mjs';
import { prepareWaves } from '../plugins/glyph-theme/src/theme/waves.mjs';

test('one geometry read preserves native content and closed-details exclusions', () => {
  const dom = new JSDOM(`<main><details><summary><button id="summary">Open</button></summary><div><button id="closed">Hidden</button></div></details>
    <details open><summary>Open</summary><details><summary>Nested</summary><button>Hidden</button></details><button>Visible</button></details>
    <div data-glyph-external><details open><summary>External</summary><button>Native</button></details></div>
    <div class="monaco-editor"><span><button>Editor</button></span></div><button id="plain">Plain</button></main>`);
  const { document } = dom.window;
  const verify = () => {
    const excluded = createContentExclusion(NATIVE_CONTENT);
    for (const el of [...document.querySelectorAll('*')].reverse())
      assert.equal(Boolean(excluded(el)), Boolean(el.closest(NATIVE_CONTENT) || inClosedDetails(el)), el.outerHTML);
  };
  verify();
  document.querySelector('details').open = true;
  document.querySelector('#plain').setAttribute('data-glyph-external', '');
  document.querySelector('.monaco-editor').className = '';
  verify();
  dom.window.close();
});

test('covered destination cells preserve waves sampling covered source cells', () => {
  const full = createCharacterScene(), masked = createCharacterScene();
  let checked = 0;
  for (const [width, height] of [[480, 320], [1440, 1000], [480, 320]]) {
    const bounds = { left: 12, top: 24, right: width - 18, bottom: height - 20 };
    for (const rectangles of [[], [{ left: 60, top: 50, right: width - 120, bottom: height - 80 }],
      [{ left: 0, top: 0, right: width, bottom: height }]]) {
      const hidden = createOcclusionIndex(rectangles, width, height);
      for (const [time, still] of [[400, false], [1400, false], [2800, false], [3400, true]]) {
        const a = full.begin(bounds, width, height), b = masked.begin(bounds, width, height, hidden);
        for (let y = 0; y < height; y += a.stepY) for (let x = 0; x < width; x += a.stepX) {
          const light = (1 + Math.sin(x * .03 + y * .07)) / 2;
          full.write('·', x, y, '#161616', light); masked.write('·', x, y, '#161616', light);
        }
        assert.deepEqual(b, a);
        const expected = [], actual = [], trails = [{ x: width / 2, y: height / 2, time: time - 150 }];
        const waves = prepareWaves([{ x: 180, y: 110, time: 0 }], [{ x: 120, y: 90, time: 0 }], time, Math.hypot(width, height));
        full.paint(time, trails, still, (...args) => { if (!hidden(args[1], args[2])) expected.push(args); }, '#161616', waves);
        masked.paint(time, trails, still, (...args) => actual.push(args), '#161616', waves);
        assert.deepEqual(actual, expected); checked += actual.length;
      }
      // A replaced layout and absent occlusion must invalidate the old mask.
      masked.begin(bounds, width, height);
    }
  }
  assert.ok(checked > 10000);
});
