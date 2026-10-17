import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { platform, release, arch } from 'node:os';
import { bundleSidebar, launchFixtureBrowser, openSidebarReplay } from '../test/fixtures/sidebar-replay.mjs';

const { values } = parseArgs({ options: {
  'baseline-ref': { type: 'string' }, rows: { type: 'string', default: '50,250' },
  operations: { type: 'string', default: '120' }, pairs: { type: 'string', default: '3' },
} });
if (!values['baseline-ref']) throw Error('Usage: node scripts/bench-sidebar-presentation.mjs --baseline-ref <commit>');
const positive = value => { const number = Number(value); if (!Number.isSafeInteger(number) || number <= 0) throw Error('Expected a positive integer'); return number; };
const sizes = values.rows.split(',').map(positive), operations = positive(values.operations), pairs = positive(values.pairs);
const bundles = { baseline: await bundleSidebar({ ref: values['baseline-ref'] }), current: await bundleSidebar() };
const browser = await launchFixtureBrowser();
const report = { scenario: 'Offline synthetic host-shaped DOM; actual sidebar adapter and Chromium MutationObservers',
  timestamp: new Date().toISOString(), node: process.version, os: `${platform()} ${release()} ${arch()}`, chromium: browser.version(),
  conditions: { history: 500, operations, pairs, sizes, concurrency: 1, width: 1280, warmupOperations: 12 },
  interpretation: 'wallMs spans DOM updates, native observer settling and final layout read. observerCallbackMs is synchronous callback elapsed time, not OS CPU. Fresh-page adapter initialization starts after bundle execution and excludes browser startup and bundle parsing. No model, network or full-app timing.',
  bundles: Object.fromEntries(Object.entries(bundles).map(([name, { ref, sha256 }]) => [name, { ref, sha256 }])), samples: [] };
try {
  for (const rows of sizes) for (let pair = 0; pair < pairs; pair++) {
    const order = pair % 2 ? ['current', 'baseline'] : ['baseline', 'current'];
    for (const variant of order) {
      const fixture = await openSidebarReplay(browser, bundles[variant], { rows, history: 500 });
      try {
        await fixture.run({ operations: 12 }); // Discarded warmup, separate from fresh-page initialization.
        const structural = await fixture.run({ operations, kind: 'structural' });
        const characterData = await fixture.run({ operations, kind: 'characterData' });
        assert.equal(structural.produced, operations); assert.equal(structural.last, `Result ${operations - 1}`);
        assert.equal(characterData.last, `Token ${operations - 1}`);
        report.samples.push({ variant, pair, rows, initialization: fixture.initialization, structural, characterData });
      } finally { await fixture.close(); }
    }
  }
} finally { await browser.close(); }
const median = values => { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
report.summary = [];
for (const rows of sizes) for (const kind of ['initialization', 'structural', 'characterData']) for (const metric of ['wallMs', 'observerCallbackMs', 'sidebarScanCalls', 'sidebarScanNodes']) {
  const summarize = variant => {
    const values = report.samples.filter(s => s.rows === rows && s.variant === variant).map(s => s[kind][metric]);
    return { n: values.length, median: median(values), min: Math.min(...values), max: Math.max(...values) };
  };
  const before = summarize('baseline'), after = summarize('current');
  report.summary.push({ rows, kind, metric, before, after, delta: after.median - before.median,
    percent: before.median ? (after.median / before.median - 1) * 100 : null });
}
console.log(JSON.stringify(report, null, 2));
