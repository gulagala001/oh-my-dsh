// Focused browser regression: real process-header renderer and pinned native
// CSS, with only decorative primitive containers/icons supplied by the fixture.
// Uses an installed browser; never connects to a user profile or model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { adaptChatStyleFactory } from '../scripts/chat-style-adapter.mjs';

const require = createRequire(import.meta.url), React = require('react');
const raw = (await readFile(new URL('../vendor/dsh/ui-chat/lib/client.js', import.meta.url), 'utf8')).replace(/^\/\/# sourceMappingURL=.*\n?/gm, '');
const headerSource = await readFile(new URL('../vendor/dsh/ui-chat/src/client/chat/ChatGroupSeat.tsx', import.meta.url), 'utf8');
const cssMap = runInNewContext('(' + raw.match(/var ChatGroupSeat_module_css_default = (\{[\s\S]*?\n\s*\});/)[1] + ')');
const headerCSS = code => JSON.parse(code.match(/const css\$\d+ = ("(?:[^"\\]|\\.)*");\n\s*const tagId\$\d+ = "@deepseek-ai\/dsh-client-ui-chat\/ChatGroupSeat\.module\.css";/)[1]);
function evaluate(source, loader = 'ts') {
  const module = { exports: {} };
  const primitives = new Proxy({}, { get: (_target, name) => name === 'TextShimmer'
    ? ({ className, children }) => React.createElement('span', { className, style: { display: 'block', minWidth: 0 } }, children)
    : () => React.createElement('svg', { width: 14, height: 14 }) });
  runInNewContext(transformSync(source, { loader, jsx: 'automatic', format: 'cjs', target: 'es2022' }).code, {
    module, exports: module.exports, require: name => name === 'react' || name === 'react/jsx-runtime' ? require(name)
      : name.endsWith('.css') ? cssMap : name.includes('ui-primitives') ? primitives
        : name === './step-process.ts' ? processTitles : {},
  });
  return module.exports;
}
const processTitles = evaluate(await readFile(new URL('../vendor/dsh/ui-chat/src/client/chat/step-process.ts', import.meta.url), 'utf8'));
const dictionaries = evaluate(await readFile(new URL('../vendor/dsh/ui-chat/src/client/locale.ts', import.meta.url), 'utf8'));
const { ProcessGroupHeader } = evaluate(headerSource + '\nexport { ProcessGroupHeader };', 'tsx');
const detail = 'Synthetic layout fixture: summarize the sample workspace and keep status labels visible. '.repeat(12);
function markup({ language = 'zh', closed = false, count = 24, failures = 1, stopped = 0, open = false } = {}) {
  const summary = { running: 'thinking', runningDetail: detail, counts: [{ kind: 'thinking', count }], failures, stopped };
  const t = (key, args = {}) => (dictionaries[language][key] ?? key).replace(/\{(\w+)\}/g, (_all, key) => args[key]);
  return renderToStaticMarkup(React.createElement(ProcessGroupHeader, {
    groupKey: 'fixture', useChatGroup: (_key, select) => select({ data: { closed, summary } }),
    usePresentation: select => select({ liveProcessDetail: true }), t, open, bodyId: 'fixture', toggle() {},
  }));
}
const dimensions = () => {
  const root = document.querySelector('main'), row = document.querySelector('button');
  const box = root.getBoundingClientRect();
  return { width: box.width, rowHeight: row.getBoundingClientRect().height,
    badges: [...row.querySelectorAll('[data-process-count],[data-process-failures],[data-process-stopped]')].map(el => {
      const range = document.createRange(); range.selectNodeContents(el);
      const lines = new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top)));
      const r = el.getBoundingClientRect();
      return { text: el.textContent, lines: lines.size, contained: r.left >= box.left - 1 && r.right <= box.right + 1, width: r.width };
    }) };
};

test('native and themed process headers keep status badges whole while long titles yield space', async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.OMD_TEST_BROWSER ? { executablePath: process.env.OMD_TEST_BROWSER } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1000, height: 400 } });
  const layout = await readFile(new URL('../src/client/skins/layout-base.css', import.meta.url), 'utf8');
  const set = async (css, scenario = {}) => {
    await page.setContent(`<html${scenario.theme ? ' data-omd-skin="codex-desktop"' : ''}><style>
      :root{--dsw-alias-label-tertiary:#85878f;--dsw-alias-label-secondary:#444;--dsh-content-font-size:${scenario.font ?? 16}px}
      body{margin:24px;font:16px/1.5 Arial,sans-serif;background:${scenario.dark ? '#181818' : 'white'}}
      main{width:${scenario.width ?? 700}px;max-width:100%} ${css} ${scenario.theme ? layout : ''}
      </style><main>${markup(scenario)}</main></html>`);
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(dimensions);
  };
  const before = await set(headerCSS(raw));
  assert.ok(before.badges.some(item => item.lines > 1), 'the unadapted native header reproduces the reported vertical badge');
  const evidence = process.env.OMD_HEADER_EVIDENCE;
  if (evidence) { await mkdir(evidence, { recursive: true }); await page.locator('main').screenshot({ path: evidence + '/before.png' }); }
  const css = headerCSS(adaptChatStyleFactory(raw).code);
  const cases = [
    {}, { stopped: 2 }, { language: 'en', count: 1234, failures: 234, stopped: 56 },
    { width: 240, language: 'en', stopped: 2, font: 22 }, { width: 160, stopped: 99 },
    { closed: true, open: true, failures: 999, stopped: 9, width: 300 },
    { theme: true, dark: true, stopped: 2, width: 320 }, { theme: true, closed: true, width: 240 },
  ];
  for (const scenario of cases) {
    const actual = await set(css, scenario);
    for (const badge of actual.badges) {
      assert.equal(badge.lines, 1, JSON.stringify({ scenario, badge }));
      assert.equal(badge.contained, true, JSON.stringify({ scenario, badge }));
    }
  }
  await set(css);
  if (evidence) await page.locator('main').screenshot({ path: evidence + '/after.png' });
  await page.locator('button').focus();
  assert.equal(await page.locator('button').evaluate(el => el === document.activeElement), true);
});
