import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../src/monitor-prices.json' with { type: 'json' };
import { monitorCallPrice, monitorPriceCatalog, MonitorPricing } from '../src/monitor-pricing.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { monitorCallCost } from '../src/monitor-call.mjs';

test('exact catalog provider routes take priority over provider aliases', () => {
  const fields = { input: 'inputTokens', output: 'outputTokens', cache_read: 'cacheReadTokens', cache_write: 'cacheWriteTokens' };
  for (const entry of catalog.entries) {
    if (!entry.cost.input && !entry.cost.output) continue;
    const price = monitorCallPrice({ provider: entry.provider, model: entry.model });
    assert.equal(price.provider, entry.provider, `${entry.provider}/${entry.model}`);
    for (const [raw, field] of Object.entries(fields)) if (entry.cost[raw] != null) assert.equal(price[field], entry.cost[raw], `${entry.provider}/${entry.model}/${raw}`);
  }
});

test('regional provider filters retain the same route as the selected call price', () => {
  for (const provider of ['minimax-cn', 'zhipuai']) {
    const result = monitorPriceCatalog({ provider, limit: 1000 });
    assert.equal(result.total, catalog.entries.filter(entry => entry.provider === provider).length);
    assert.ok(result.items.every(entry => entry.provider === provider));
  }
});

test('exact regional price, tier and custom currency remain correct', () => {
  const call = { provider: 'zhipuai', model: 'glm-5v-turbo', usage: { inputTokens: 1000000, outputTokens: 1000000, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 2000000 } };
  assert.equal(monitorCallCost(call).amount, 27);
  const model = catalog.entries.find(entry => entry.provider === 'minimax-cn' && entry.model === 'MiniMax-M3');
  const tier = model.cost.tiers.at(-1);
  const price = monitorCallPrice({ provider: model.provider, model: model.model, usage: { inputTokens: tier.above + 1 } });
  assert.equal(price.threshold, tier.above);
  assert.equal(price.inputTokens, tier.input);
  assert.equal(monitorCallPrice({ provider: 'codex', model: 'gpt-5.4' }).provider, 'openai');
  const custom = [{ provider: call.provider, model: call.model, currency: 'CNY', inputTokens: 2, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 }];
  assert.deepEqual(monitorCallCost(call, custom), { amount: 5, currency: 'CNY', source: 'custom', partial: false });
});

test('route selections are bounded while tiers, overrides and refreshed catalogs stay live', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'omd-price-selections-'));
  let now = 1792170000000, rate = 2;
  const source = () => JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, provider) => ['fixture-' + provider, {
    name: 'Fixture ' + provider, models: Object.fromEntries(Array.from({ length: 25 }, (_, model) => ['model-' + model, {
      name: 'Model ' + model, cost: { input: rate, output: 4, tiers: [{ tier: { type: 'context', size: 100 }, input: rate * 3, output: 8 }] },
    }])),
  }])));
  const pricing = new MonitorPricing(directory, { now: () => now, fetch: async () => new Response(source()) });
  t.after(async () => { await pricing.close(); await rm(directory, { recursive: true, force: true }); });
  await pricing.refresh();
  const call = { provider: 'fixture-0', model: 'model-0', usage: { inputTokens: 100 } };
  const sort = Array.prototype.sort; let sorts = 0;
  Array.prototype.sort = function(...args) { sorts++; return sort.apply(this, args); };
  try {
  const first = pricing.price(call);
  assert.equal(first.inputTokens, 2);
  pricing.price(call); assert.equal(sorts, 1, 'same route uses its selected entry');
  assert.equal(pricing.price({ ...call, usage: { inputTokens: 101 } }).inputTokens, 6);
  first.cacheFallback.push('caller-only'); first.inputTokens = 999;
  assert.equal(pricing.price(call).inputTokens, 2);
  assert.ok(!pricing.price(call).cacheFallback.includes('caller-only'));
  const custom = [{ provider: call.provider, model: call.model, currency: 'CNY', inputTokens: 7 }];
  assert.equal(pricing.price(call, custom).inputTokens, 7);
  custom[0].inputTokens = 9; assert.equal(pricing.price(call, custom).inputTokens, 9);
  for (let i = 0; i < 512; i++) assert.equal(pricing.price({ provider: 'unknown', model: 'unknown-' + i }), null);
  const before = sorts; pricing.price(call);
  assert.equal(sorts, before + 1, 'old route is evicted instead of retaining unbounded identities');
  } finally { Array.prototype.sort = sort; }
  rate = 5; now += 86400001; await pricing.refresh();
  assert.equal(pricing.price(call).inputTokens, 5, 'new catalog replaces cached entry selections');
  assert.equal(pricing.price({ ...call, usage: { inputTokens: 101 } }).inputTokens, 15);
});
