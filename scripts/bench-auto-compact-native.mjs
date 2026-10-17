import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { release, arch } from 'node:os';
import { nativeCompactionFixture, repositoryRoot } from '../test/fixtures/auto-compact-native.mjs';

const baseline = process.argv[2];
if (!baseline) throw Error('Usage: node scripts/bench-auto-compact-native.mjs <isolated baseline worktree>');
const roots = { baseline: resolve(baseline), current: repositoryRoot };
const ref = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
for (const file of ['src/context/pipeline.mjs', 'src/context/core.mjs', 'src/context/store.mjs', 'src/context/transactions.mjs', 'src/context/host.mjs', 'package.json', 'pnpm-lock.yaml']) {
  assert.deepEqual(await readFile(resolve(roots.baseline, file)), await readFile(resolve(roots.current, file)), `Different attribution input: ${file}`);
}
const report = { timestamp: new Date().toISOString(), platform: `${process.platform} ${release()} ${arch()}`, node: process.version,
  refs: Object.fromEntries(Object.entries(roots).map(([name, root]) => [name, ref(root)])),
  fixtureSha256: createHash('sha256').update(await readFile(resolve(repositoryRoot, 'test/fixtures/auto-compact-native.mjs'))).digest('hex'),
  conditions: { concurrency: 1, pairs: 3, data: [[300, 30], [1000, 100]], warmup: 'one complete 40-node/4-record operation per variant, discarded' },
  scope: 'Entire awaited AutoCompaction.check using native Session, host adapter, transactions and real fsync-backed ContextStore. Fresh controlled archive per operation; modules/OS caches warm. Setup, post-completion assertions and cold ContextStore reread excluded. Token threshold is a fixed local heuristic, not reported usage; outer session service flush is counted but stubbed. No real model, cloud cache, pricing, full desktop startup or GUI claim.', samples: [] };
for (const root of Object.values(roots)) {
  const f = await nativeCompactionFixture({ root, nodes: 40, records: 4 });
  try { await f.run(); } finally { await f.close(); }
}
for (const [nodes, records] of report.conditions.data) {
  const hashes = new Set();
  for (let pair = 0; pair < report.conditions.pairs; pair++) for (const variant of pair % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
    const f = await nativeCompactionFixture({ root: roots[variant], nodes, records });
    try {
      const result = await f.run(); hashes.add(result.completedRecordsHash);
      report.samples.push({ pair, variant, ...result });
    } finally { await f.close(); }
  }
  assert.equal(hashes.size, 1, 'Completed record content/selection/mode/archived references differ');
}
report.summary = report.conditions.data.map(([nodes, records]) => {
  const summarize = variant => {
    const values = report.samples.filter(s => s.records === records && s.variant === variant).map(s => s.wallMs).sort((a, b) => a - b);
    return { n: values.length, median: values[1], min: values[0], max: values.at(-1) };
  };
  const before = summarize('baseline'), after = summarize('current');
  return { nodes, records, before, after, deltaMs: after.median - before.median, percent: (after.median / before.median - 1) * 100 };
});
console.log(JSON.stringify(report, null, 2));
