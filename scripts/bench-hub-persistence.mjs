import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

// Counts real serialized writes and verifies cold recovery. No clock-based
// speed, storage-device wear, model-token or end-to-end latency claims.
const { values } = parseArgs({ options: { 'baseline-root': { type: 'string' } } });
if (!values['baseline-root']) throw Error('Usage: node scripts/bench-hub-persistence.mjs --baseline-root <matching baseline checkout>');
const roots = { baseline: resolve(values['baseline-root']), current: fileURLToPath(new URL('../', import.meta.url)) };
const variants = {};
for (const [name, root] of Object.entries(roots)) {
  const load = file => import(pathToFileURL(join(root, 'src', file)).href);
  variants[name] = { ...await load('hub.mjs'), ...await load('hub-store.mjs'), ...await load('task-budget.mjs') };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(Object.entries(roots).map(([name, root]) => [name,
  Object.fromEntries(['hub.mjs', 'task-budget.mjs', 'hub-store.mjs'].map(file => [file, hash(readFileSync(join(root, 'src', file)))]))]));
const samples = [];
for (let pair = 0; pair < 3; pair++) for (const variant of pair % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
  const { Hub, HubStore, TaskBudgets } = variants[variant];
  const dir = mkdtempSync(join(tmpdir(), 'omd-budget-write-replay-'));
  try {
    const store = new HubStore(dir), hub = { store }; hub.budgets = new TaskBudgets(hub);
    const state = store.state('synthetic-session');
    state.budget = { configured: true, visible: true, tokens: 0, rounds: 0, elapsedMs: 0, unmetered: 0,
      limits: { tokens: null, rounds: null, timeMs: null } };
    state.contextHistory = Array.from({ length: 80 }, (_, n) => ({ at: 1000 + n, turn: n, step: 0, totalTokens: 10000,
      nodes: Array.from({ length: 1000 }, (_, seq) => ({ seq, kind: 'assistant', tokens: 10 })) }));
    const writes = [], original = store.write.bind(store);
    store.write = (name, value) => {
      original(name, value); const bytes = readFileSync(join(dir, name));
      writes.push({ name, bytes: bytes.length, sha256: hash(bytes) });
    };
    Hub.prototype.record.call(hub, { id: 'synthetic-session', header: { cwd: '/synthetic/project' },
      requestHeader: () => ({ config: { provider: 'offline', model: 'fixture' } }), snapshotEvents: () => [] },
    'main', { id: 'fixed-call', at: 10000, durationMs: 10, usage: { inputTokens: 100, outputTokens: 10 } });
    const restored = new HubStore(dir).state('synthetic-session');
    assert.deepEqual(restored, JSON.parse(JSON.stringify(state)));
    const recovery = { calls: restored.metrics.main.calls, tokens: restored.budget.tokens, rounds: restored.budget.rounds,
      history: restored.contextHistory.length, activity: restored.activity.length };
    assert.deepEqual(recovery, { calls: 1, tokens: 110, rounds: 1, history: 80, activity: 1 });
    samples.push({ variant, pair, writes, bytesTotal: writes.reduce((sum, row) => sum + row.bytes, 0),
      finalSha256: hash(readFileSync(join(dir, 'sessions/synthetic-session.json'))), recovery });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
assert.equal(new Set(samples.map(sample => sample.finalSha256)).size, 1, 'Final archives differ');
console.log(JSON.stringify({ evidence: 'Mechanism-only native filesystem write counts and cold recovery; no timing measurement',
  platform: process.platform, node: process.version, conditions: { frames: 80, nodesPerFrame: 1000, pairs: 3, concurrency: 1 },
  sourceHashes, samples }, null, 2));
