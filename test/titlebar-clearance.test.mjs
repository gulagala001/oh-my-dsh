import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const shell = await readFile(new URL('../src/client/shell.css', import.meta.url), 'utf8');
const compiled = await transform(shell, { loader: 'css', minify: true });
// A source/build contract guard, not a native window or browser geometry test.
// The browser matrix must also exercise the real host CSS and title/tab boxes.
const selector = "html.trisoul-shell[data-platform='darwin'] .pI_x6G_frame[data-sidebar-collapsed]";
const rule = name => {
  const start = shell.indexOf(`${selector} .wSkVaW_${name} {`);
  assert.ok(start >= 0, `Missing narrowly scoped ${name} window-chrome rule`);
  return shell.slice(start, shell.indexOf('}', start) + 1);
};

test('titlebar clearance belongs to the whole reordered header', () => {
  const header = rule('header');
  assert.match(header, /padding-inline-start:\s*var\(--dsh-frame-leading-clearance,\s*0px\)\s*!important;/);
  assert.doesNotMatch(header, /(?:160|84|88)px|margin|display|position/,
    'The host owns fullscreen/window-control geometry; do not copy its constants');
});

test('titleRow does not reserve the host band a second time', () => {
  assert.match(rule('titleRow'), /padding-inline-start:\s*0\s*!important;/);
  assert.doesNotMatch(rule('titleRow'), /display:/,
    'Skins can retain display:contents and their native children');
});

test('compiled CSS retains the platform/state gates and skin precedence', () => {
  assert.deepEqual(compiled.warnings, []);
  assert.match(compiled.code, /html\.trisoul-shell\[data-platform=darwin\] \.pI_x6G_frame\[data-sidebar-collapsed\] \.wSkVaW_header\{padding-inline-start:var\(--dsh-frame-leading-clearance,\s*0px\)!important\}/);
  assert.match(compiled.code, /html\.trisoul-shell\[data-platform=darwin\] \.pI_x6G_frame\[data-sidebar-collapsed\] \.wSkVaW_titleRow\{padding-inline-start:0!important\}/);
});

test('the vendored host still exposes the titleRow and native drag contract', async () => {
  const root = new URL('../vendor/dsh/ui-conversation/src/client/skeleton/', import.meta.url);
  const css = await readFile(new URL('ConversationRoot.module.css', root), 'utf8');
  const header = await readFile(new URL('ConversationHeader.tsx', root), 'utf8');
  assert.match(css, /\.titleRow\s*\{[^}]*padding-inline-start:\s*max\(0px,\s*calc\(var\(--dsh-frame-leading-clearance,\s*0px\)\s*-\s*20px\)\)/);
  assert.match(header, /<header[^>]*css\.header[^>]*data-window-drag/);
  assert.match(header, /data-conversation-header-leading/);
  assert.doesNotMatch(rule('header') + rule('titleRow'), /app-region|pointer-events|z-index/,
    'The patch changes layout only, preserving native drag and hit testing');
});
