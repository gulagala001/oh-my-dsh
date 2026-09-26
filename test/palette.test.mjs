import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/client/skins/format.mjs';
import { bundledSkins } from '../src/client/skins/bundled.mjs';
import { extraPalettes } from '../src/client/skins/palettes.mjs';
import { composePalette, paletteCatalog } from '../src/client/skins/palette.mjs';

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, amount) => rgb(a).map((v, i) => v * (1 - amount) + rgb(b)[i] * amount);
const luminance = value => (typeof value === 'string' ? rgb(value) : value).map(c => {
  const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('palette catalog contains 28 unique choices without adding theme layouts', () => {
  const catalog = paletteCatalog(bundledSkins);
  assert.equal(catalog.length, 28); assert.equal(extraPalettes.length, 24);
  assert.equal(new Set(catalog.map(p => p.id)).size, 28);
  assert.equal(new Set(catalog.map(p => p.name)).size, 28);
  assert.equal(new Set(extraPalettes.map(p => JSON.stringify(p.tokens))).size, 24);
  for (const p of extraPalettes) {
    assert.match(p.id, /^palette:[a-z-]+$/);
    for (const field of ['layout', 'css', 'schemaVersion']) assert.equal(p[field], undefined);
    assert.equal(p.tokens.common, undefined);
    for (const mode of ['light', 'dark']) for (const key of colors) assert.match(p.tokens[mode][key], /^#[a-f0-9]{6}$/i);
  }
});

// WCAG 2.2 SC 1.4.3, opaque token pairs (not a claim about arbitrary wallpapers):
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
// Text checks include button gradient endpoints and hover, not just canvas text.
test('new palettes keep text, status labels and active buttons readable in both modes', () => {
  for (const p of extraPalettes) for (const mode of ['light', 'dark']) {
    const t = p.tokens[mode];
    for (const bg of ['bg', 'surface', 'surface-solid', 'sidebar', 'hover', 'selected', 'code-bg']) {
      for (const fg of ['text', 'muted']) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${p.id}/${mode}/${fg}/${bg}: ${contrast(t[fg], t[bg])}`);
    }
    for (const fg of ['accent', 'success', 'warning', 'danger']) {
      for (const bg of ['bg', 'surface-solid']) assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${p.id}/${mode}/${fg}/${bg}`);
    }
    for (const bg of [t.accent, mix(t.accent, t.text, 0.1), mix(t.accent, '#ffffff', 0.15)]) {
      assert.ok(contrast(t['on-accent'], bg) >= 4.5, `${p.id}/${mode}/button: ${contrast(t['on-accent'], bg)}`);
    }
  }
});

test('all new palettes compose without mutating theme geometry or their source', () => {
  for (const theme of bundledSkins) for (const p of extraPalettes) {
    const before = JSON.stringify(theme), result = composePalette(theme, p);
    assert.equal(result.id, theme.id); assert.equal(result.layout, theme.layout); assert.equal(result.css, theme.css);
    assert.deepEqual(result.tokens.common, theme.tokens.common);
    for (const mode of ['light', 'dark']) assert.equal(result.tokens[mode].bg, p.tokens[mode].bg);
    assert.equal(JSON.stringify(theme), before);
  }
});
