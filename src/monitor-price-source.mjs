import { createHash } from 'node:crypto';

export const MONITOR_PRICE_SOURCE = 'https://models.dev/api.json';
const known = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const rates = cost => Object.fromEntries(['input', 'output', 'cache_read', 'cache_write', 'reasoning'].filter(key => known(cost?.[key])).map(key => [key, cost[key]]));
export function parseMonitorPriceSource(raw, now = Date.now()) {
  if (Buffer.byteLength(raw) > 32 * 1024 * 1024) throw Error('价格数据过大');
  const data = JSON.parse(raw), providers = {}, entries = [];
  for (const [provider, row] of Object.entries(data || {})) {
    if (!row?.models || typeof row.models !== 'object' || typeof row.name !== 'string') continue;
    providers[provider] = row.name;
    for (const [model, m] of Object.entries(row.models)) {
      if (!known(m?.cost?.input) || !known(m?.cost?.output)) continue;
      const cost = rates(m.cost);
      const tiers = (Array.isArray(m.cost.tiers) ? m.cost.tiers : []).filter(t => t?.tier?.type === 'context' && known(t.tier.size))
        .map(t => ({ above: t.tier.size, ...rates(t) })).sort((a, b) => a.above - b.above);
      if (tiers.length) cost.tiers = tiers;
      else if (m.cost.context_over_200k) cost.tiers = [{ above: 200000, ...rates(m.cost.context_over_200k) }];
      entries.push({ provider, model, name: typeof m.name === 'string' ? m.name : model,
        canonical: typeof m.canonical_model_id === 'string' ? m.canonical_model_id : model,
        updated: m.last_updated || m.release_date || null, cost });
    }
  }
  if (Object.keys(providers).length < 20 || entries.length < 500) throw Error('价格数据不完整，保留现有价格');
  entries.sort((a, b) => a.provider.localeCompare(b.provider, 'en') || a.model.localeCompare(b.model, 'en'));
  return { source: MONITOR_PRICE_SOURCE, fetchedAt: new Date(now).toISOString(),
    sha256: createHash('sha256').update(raw).digest('hex'), currency: 'USD', unit: '1M tokens', providers, entries };
}
