import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export { launchFixtureBrowser } from './browser.mjs';
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export async function bundleSidebar({ ref } = {}) {
  const plugins = ref ? [{ name: 'git-baseline', setup(builder) {
    builder.onLoad({ filter: /\.(jsx?|mjs|css)$/ }, ({ path }) => ({
      contents: execFileSync('git', ['show', `${ref}:${relative(repositoryRoot, path)}`], { cwd: repositoryRoot, encoding: 'utf8' }),
      loader: path.endsWith('.css') ? 'text' : path.endsWith('.jsx') ? 'jsx' : 'js', resolveDir: resolve(path, '..'),
    }));
  } }] : [];
  const result = await build({ entryPoints: [resolve(repositoryRoot, 'src/client/sidebar.jsx')], bundle: true,
    platform: 'browser', format: 'iife', globalName: 'SidebarReplay', loader: { '.css': 'text' }, plugins, write: false });
  const code = result.outputFiles[0].text;
  return { code, ref: ref ?? 'working-tree', sha256: createHash('sha256').update(code).digest('hex') };
}

export async function openSidebarReplay(browser, bundle, { rows = 50, history = 500, width = 1280 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error));
  const assertNoPageErrors = () => { if (pageErrors.length) throw new AggregateError(pageErrors, 'Sidebar replay page errors'); };
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><html class="trisoul-shell"><head><style>body{margin:0}main{display:flex}nav{width:250px}[role=treeitem]{min-height:24px}section{flex:1}</style></head><body><main id="fixture-frame" data-omd-surface="frame" data-sidebar-collapsed="false"><aside id="fixture-sidebar-column" data-omd-surface="sidebar-column"></aside><section id="fixture-conversation" data-omd-surface="conversation"><div id="fixture-history"></div><div id="fixture-output"></div></section><aside id="fixture-workbench" data-omd-surface="workbench-column"></aside></main></body></html>');
  await page.evaluate(({ rows, history }) => {
    let counters;
    const resetCounters = () => { counters = { observerCalls: 0, observerCallbackMs: 0, observerRecords: 0, sidebarScanCalls: 0, sidebarScanNodes: 0 }; };
    resetCounters();
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) { super((records, observer) => {
        const start = performance.now(); counters.observerCalls++; counters.observerRecords += records.length;
        try { callback(records, observer); } finally { counters.observerCallbackMs += performance.now() - start; }
      }); }
    };
    const query = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function(selector) {
      const result = query.call(this, selector);
      if (selector === '[class]' && this.matches('[data-omd-surface="sidebar"]')) { counters.sidebarScanCalls++; counters.sidebarScanNodes += result.length; }
      return result;
    };
    const makeRow = index => {
      const row = document.createElement('div'); row.className = 'Tree_sessionRow'; row.role = 'treeitem'; row.dataset.rowKey = `session:${index}`;
      row.innerHTML = `<span class="Tree_title">Session ${index}</span>`;
      row.addEventListener('click', () => { window.__sidebarFixture.clicks++; }); return row;
    };
    const makeSidebar = () => {
      const nav = document.createElement('nav'); nav.id = 'fixture-sidebar'; nav.className = 'Nav_root'; nav.dataset.omdSurface = 'sidebar';
      nav.innerHTML = '<button class="Nav_toggle">Toggle</button><div id="fixture-browser"><header class="Tree_sectionHeader">Sessions</header><div id="fixture-rows"></div></div>';
      for (let i = 0; i < rows; i++) nav.querySelector('#fixture-rows').append(makeRow(i)); return nav;
    };
    document.querySelector('#fixture-sidebar-column').append(makeSidebar());
    document.querySelector('#fixture-history').innerHTML = Array.from({ length: history }, (_, i) => `<p>Historical message ${i}</p>`).join('');
    const nextTask = () => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); }; channel.port2.postMessage(null); });
    const settle = async () => { await nextTask(); await new Promise(requestAnimationFrame); await nextTask(); };
    const api = window.__sidebarFixture = { rows, history, clicks: 0, makeRow, makeSidebar, nextTask, settle, resetCounters,
      snapshot: () => ({ ...counters }), disposers: [], stop() { for (const dispose of this.disposers.splice(0)) dispose(); },
      async run({ operations = 120, kind = 'structural' } = {}) {
        if (!['structural', 'characterData'].includes(kind)) throw Error('Unknown replay kind');
        const output = document.querySelector('#fixture-output'), workbench = document.querySelector('#fixture-workbench');
        output.replaceChildren(document.createTextNode('')); await settle(); resetCounters();
        const start = performance.now();
        for (let i = 0; i < operations; i++) {
          if (kind === 'characterData') output.firstChild.data = `Token ${i}`;
          else { const block = document.createElement('p'); block.className = i % 2 ? 'markdown-block' : 'tool-result'; block.textContent = `Result ${i}`; output.append(block); workbench.className = i % 2 ? 'preview-open' : 'preview-ready'; }
          await nextTask();
        }
        await settle(); const layoutHeight = document.querySelector('#fixture-frame').getBoundingClientRect().height;
        return { ...counters, wallMs: performance.now() - start, rows, history, operations, kind, layoutHeight,
          produced: kind === 'structural' ? output.children.length : operations, last: output.lastChild.textContent };
      },
    };
  }, { rows, history });
  await page.addScriptTag({ content: bundle.code });
  const initialization = await page.evaluate(async () => {
    const fixture = __sidebarFixture; fixture.resetCounters(); const start = performance.now();
    SidebarReplay.applySidebarPresentation({ effect: fn => fixture.disposers.push(fn()), layout: { toggleSidebar() {
      const frame = document.querySelector('[data-omd-surface="frame"]'); frame.dataset.sidebarCollapsed = String(frame.dataset.sidebarCollapsed !== 'true');
    } } });
    const bindMs = performance.now() - start, settleStart = performance.now();
    await fixture.settle(); const settleMs = performance.now() - settleStart, layoutStart = performance.now();
    const layoutHeight = document.querySelector('#fixture-frame').getBoundingClientRect().height;
    return { ...fixture.snapshot(), wallMs: performance.now() - start, bindMs, settleMs, layoutMs: performance.now() - layoutStart, layoutHeight };
  });
  assertNoPageErrors();
  return { page, initialization, metadata: { ref: bundle.ref, sha256: bundle.sha256, rows, history, width },
    run: async options => { const result = await page.evaluate(options => __sidebarFixture.run(options), options); assertNoPageErrors(); return result; },
    close: async () => { await page.close(); assertNoPageErrors(); } };
}
