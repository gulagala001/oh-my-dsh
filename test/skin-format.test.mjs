import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSkin, colors, geometry } from '../src/client/skins/format.mjs';
import { hostTokens } from '../src/client/skins/mapping.mjs';
import { packSkin } from '../scripts/pack-skin.mjs';
import sample from './fixtures/skin.json' with { type: 'json' };

test('skin contract requires both palettes, concrete values, valid keys and bounded packages', () => {
  assert.equal(validateSkin(sample).id, 'test-skin');
  const extended = structuredClone(sample); extended.tokens.common['sidebar-blur'] = '24px'; extended.tokens.dark['hairline'] = '#333'; extended.tokens.common.rule = '1px solid var(--omd-border)';
  assert.equal(validateSkin(extended).tokens.common['sidebar-blur'], '24px');
  assert.equal(validateSkin({ ...sample, layout: 'ios-liquid' }).layout, 'ios-liquid');
  assert.equal(validateSkin({ ...sample, layout: 'codex-desktop' }).layout, 'codex-desktop');
  assert.equal(validateSkin({ ...sample, layout: 'google-material-expressive' }).layout, 'google-material-expressive');
  assert.throws(() => validateSkin({ ...sample, layout: 'arbitrary-css' }), /布局/);
  for (const change of [s => delete s.id, s => s.id = 'default', s => s.schemaVersion = 99, s => delete s.tokens.dark.accent, s => s.tokens.common.gap = '1px;}body{display:none', s => s.tokens.light.accent = 'var(--missing)', s => s.tokens.light['bad;key'] = 'red', s => s.tokens.common.extra = 'var(--omd-extra)', s => s.css = 'x'.repeat(1024 * 1024)]) {
    const bad = structuredClone(sample); change(bad); assert.throws(() => validateSkin(bad));
  }
  assert.deepEqual(hostTokens(sample)['--dsw-alias-bg-base'], { light: sample.tokens.light.bg, dark: sample.tokens.dark.bg });
  const buttons = structuredClone(sample);
  buttons.tokens.light['button-bg'] = '#111111'; buttons.tokens.light['button-fg'] = '#ffffff';
  buttons.tokens.dark['button-bg'] = '#eeeeee'; buttons.tokens.dark['button-fg'] = '#111111';
  const aliases = hostTokens(buttons);
  assert.deepEqual(aliases['--dsw-alias-button-primary-fill'], { light: '#111111', dark: '#eeeeee' });
  assert.deepEqual(aliases['--dsw-alias-label-primary-foreground'], { light: '#ffffff', dark: '#111111' }, 'host primary controls keep readable text when skins separate buttons from accent');
});
test('packer reads production tokens, embeds local assets, rejects missing or escaped assets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-skin-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'skin.json'), JSON.stringify({ schemaVersion: 1, id: sample.id, name: sample.name, version: sample.version }));
  const tokens = Object.entries(sample.tokens).map(([mode, values]) => `.omd${mode === 'common' ? '' : `[data-appearance="${mode}"]`}{${Object.entries(values).map(([k, v]) => `--omd-${k}:${v};`).join('')}}`).join('\n');
  await writeFile(join(root, 'tokens.css'), tokens);
  await writeFile(join(root, 'assets', 'texture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(root, 'native.css'), '.omd [data-omd-part="composer"]{background-image:url(assets/texture.svg)}');
  const packed = JSON.parse(await readFile(await packSkin(root), 'utf8'));
  assert.deepEqual(packed.tokens, sample.tokens); assert.match(packed.css, /data:image\/svg\+xml;base64,/);
  for (const url of ['https://example.com/a.png', '../secret.png', 'assets/missing.png']) {
    await writeFile(join(root, 'native.css'), `.omd{background-image:url(${url})}`);
    await assert.rejects(packSkin(root));
  }
  assert.equal(colors.length, 16); assert.equal(Object.keys(geometry).length, 11);
});
