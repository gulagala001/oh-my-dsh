import { readFileSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MONITOR_PRICE_SOURCE, parseMonitorPriceSource } from './monitor-price-source.mjs';

const known = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const fields = { inputTokens: 'input', outputTokens: 'output', cacheReadTokens: 'cache_read', cacheWriteTokens: 'cache_write' };
const providerAliases = { codex: 'openai', 'openai-codex': 'openai', 'google-generative-ai': 'google', gemini: 'google',
  vertex: 'google-vertex', bedrock: 'amazon-bedrock', 'azure-openai': 'azure', 'x-ai': 'xai', grok: 'xai',
  moonshot: 'moonshotai', 'moonshot-ai': 'moonshotai', dashscope: 'alibaba', qwen: 'alibaba',
  zhipu: 'zai', zhipuai: 'zai', 'z-ai': 'zai', 'minimax-cn': 'minimax', 'deepseek-api': 'deepseek' };
const providerKey = s => providerAliases[s] || s;
const normalize = value => String(value || '').trim().toLowerCase().replace(/[–—−_\s]+/g, '-');
const modelKey = value => normalize(value).replace(/^models\//, '').replace(/(claude-(?:opus|sonnet|haiku)-\d+)\.(\d+)/g, '$1-$2')
  .replace(/claude-(\d+)[.-](\d+)-(opus|sonnet|haiku)/g, 'claude-$3-$1-$2');
const origins = new Set(['openai', 'anthropic', 'google', 'deepseek', 'xai', 'moonshotai', 'minimax', 'zai', 'alibaba', 'mistral', 'cohere', 'xiaomi', 'inclusionai', 'stepfun', 'meituan']);
function originOf(model) {
  const id = modelKey(model).split('/').at(-1);
  return /^(gpt-|chatgpt-|chat-latest|o[134](?:-|$))/.test(id) ? 'openai' : id.startsWith('claude-') ? 'anthropic'
    : /^(gemini|gemma)-/.test(id) ? 'google' : id.startsWith('deepseek-') ? 'deepseek' : id.startsWith('grok-') ? 'xai'
    : id.startsWith('kimi-') ? 'moonshotai' : id.startsWith('minimax-') ? 'minimax' : id.startsWith('glm-') ? 'zai'
    : /^(qwen|qwq|qvq)/.test(id) ? 'alibaba' : /^(mistral|codestral|devstral|pixtral|ministral)/.test(id) ? 'mistral' : '';
}
function createPricing(data) {
  const routeKey = value => { const key = normalize(value); return Object.hasOwn(data.providers, key) ? key : providerKey(key); };
  const byModel = new Map(), undated = new Map(), selections = new Map();
  for (const entry of data.entries) {
    for (const key of new Set([modelKey(entry.model), modelKey(entry.canonical), modelKey(entry.model.split('/').at(-1)), modelKey(entry.canonical.split('/').at(-1))])) {
      const list = byModel.get(key) || []; list.push(entry); byModel.set(key, list);
      const alias = key.replace(/(?:-\d{4}-\d{2}-\d{2}|-\d{8})$/, '');
      if (alias !== key) { const versions = undated.get(alias) || []; versions.push(entry); undated.set(alias, versions); }
    }
  }
  function candidates(model) {
    const key = modelKey(model), exact = byModel.get(key);
    if (exact) return exact;
    const short = key.split('/').at(-1), variants = [short,
      short.replace(/^(?:us|eu|au|jp|global)\.(?:anthropic|openai)\./, '').replace(/^(?:anthropic|openai)\./, '').replace(/-v\d+:\d+$/, ''),
      short.replace(/(?:-\d{4}-\d{2}-\d{2}|-\d{8})$/, ''),
      short.replace(/-(?:latest|thinking|high|xhigh|low|medium|max)$/, ''), short.replace(/@\d{8}$/, '')];
    for (const variant of variants) if (byModel.has(variant)) return byModel.get(variant);
    for (const variant of [key, ...variants]) if (undated.has(variant)) {
      const versions = undated.get(variant), latest = versions.reduce((date, entry) => entry.updated > date ? entry.updated : date, '');
      return versions.filter(entry => entry.updated === latest);
    }
    return [];
  }
  function selectEntry(provider, model) {
    const route = routeKey(provider), key = modelKey(model), cacheKey = JSON.stringify([route, key]);
    if (selections.has(cacheKey)) return selections.get(cacheKey);
    const origin = originOf(model);
    const score = entry => (entry.provider === route ? 1000 : 0) + (entry.provider === origin ? 200 : 0)
      + (origins.has(entry.provider) ? 100 : 0) + (entry.provider === 'openrouter' ? 50 : 0)
      + (modelKey(entry.model) === key ? 20 : 0) + (entry.cost.input > 0 || entry.cost.output > 0 ? 10 : 0);
    const items = [...candidates(model)].sort((a, b) => score(b) - score(a) || a.provider.localeCompare(b.provider, 'en'));
    // Subscription/local initializer zeros are not a public API price for a paid model.
    const paid = items.find(e => e.cost.input > 0 || e.cost.output > 0);
    let entry = items[0];
    if (paid && entry?.cost.input === 0 && entry.cost.output === 0 && !/:free$/.test(key)
      && (!entry.provider || entry.provider !== route || /(?:coding|token|code)-plan|^(?:lmstudio|poe|github-copilot|gitlab|opencode(?:-go)?|ollama-cloud)$/.test(entry.provider))
      && !origins.has(entry.provider)) entry = paid;
    const selected = entry ? { entry, routeMatch: entry.provider === route } : null;
    if (selections.size >= 512) selections.delete(selections.keys().next().value);
    selections.set(cacheKey, selected);
    return selected;
  }
  return {
    price(call, custom = []) {
      const found = selectEntry(call.provider, call.model), override = custom.find(p => p.provider === call.provider && p.model === call.model);
      if (!found && !override) return null;
      const entry = found?.entry, base = entry?.cost, usage = call.usage || {};
      const totalInput = known(usage.totalTokens) && known(usage.outputTokens) && usage.totalTokens >= usage.outputTokens
        ? usage.totalTokens - usage.outputTokens : ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'].reduce((n, key) => n + (known(usage[key]) ? usage[key] : 0), 0);
      const tier = base?.tiers?.findLast(t => totalInput > t.above), cost = { ...base, ...tier };
      const price = { currency: override?.currency || 'USD', ...Object.fromEntries(Object.entries(fields).map(([key, raw]) => [key, cost[raw]])) };
      const fallback = [];
      for (const key of ['cacheReadTokens', 'cacheWriteTokens']) if (!known(price[key]) && known(price.inputTokens)) {
        price[key] = price.inputTokens; fallback.push(key);
      }
      if (override) {
        for (const key of Object.keys(fields)) {
          delete price[key];
          if (known(override[key])) price[key] = override[key];
        }
      }
      return { ...price, model: override ? call.model : entry.model, provider: override ? call.provider : entry.provider,
        providerName: override ? '自定义单价' : data.providers[entry.provider], source: override ? 'custom' : 'catalog',
        url: override ? null : data.source, updatedAt: data.fetchedAt, threshold: override ? null : tier?.above ?? null,
        matchedBy: override ? 'custom' : found.routeMatch ? 'provider' : 'model', cacheFallback: override ? [] : fallback };
    },
    catalog({ query = '', provider = '', offset = 0, limit = 30 } = {}) {
      const q = normalize(query), route = routeKey(provider);
      const rows = data.entries.filter(e => (!route || e.provider === route) && (!q || normalize(`${e.provider} ${e.model} ${e.canonical} ${e.name}`).includes(q)));
      return { source: data.source, updatedAt: data.fetchedAt, total: rows.length, catalogTotal: data.entries.length,
        providerCount: Object.keys(data.providers).length, providers: data.providers, offset, limit,
        items: rows.slice(offset, offset + limit).map(e => ({ provider: e.provider, model: e.model, name: e.name,
          providerName: data.providers[e.provider], currency: data.currency, ...Object.fromEntries(Object.entries(fields).map(([key, raw]) => [key, e.cost[raw]])),
          tiers: e.cost.tiers || [] })) };
    },
  };
}
// The 1.6 MB bundled table is parsed on first monitor use, not at startup.
let bundledPricing;
const bundled = () => bundledPricing ??= (data => ({ data, pricing: createPricing(data) }))(
  JSON.parse(readFileSync(new URL('./monitor-prices.json', import.meta.url), 'utf8')));
export const monitorCallPrice = (call, custom) => bundled().pricing.price(call, custom);
export const monitorPriceCatalog = options => bundled().pricing.catalog(options);
// The cache keeps the parsed table; older caches kept the raw upstream document.
function cachedPriceData(data, fetchedAt) {
  const text = value => typeof value === 'string';
  if (!data || typeof data.providers !== 'object' || !Array.isArray(data.entries) || data.fetchedAt !== new Date(fetchedAt).toISOString()
    || Object.keys(data.providers).length < 20 || data.entries.length < 500
    || !data.entries.every(e => text(e?.provider) && text(e.model) && text(e.canonical) && text(e.name)
      && known(e.cost?.input) && known(e.cost.output) && (e.cost.tiers === undefined || Array.isArray(e.cost.tiers)))) throw Error('价格缓存无效');
  return data;
}

const DAY = 86400000, MAX_BYTES = 32 * 1024 * 1024;
export class MonitorPricing {
  constructor(directory, { fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
    this.directory = directory; this.file = join(directory, 'monitor-prices-cache.json');
    this.fetch = fetcher; this.now = now; this.current = null; this.updatedAt = null;
    this.nextAt = 0; this.closed = false; this.pending = null; this.error = null; this.ready = null;
  }
  // Prices load and refresh only once the monitor is opened.
  loaded() { return this.ready ??= this.load(); }
  async load() {
    const fallback = bundled();
    this.current = fallback.pricing; this.updatedAt = fallback.data.fetchedAt;
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (!known(saved.fetchedAt) || saved.fetchedAt > this.now()) return;
      const data = typeof saved.raw === 'string' ? parseMonitorPriceSource(saved.raw, saved.fetchedAt) : cachedPriceData(saved.data, saved.fetchedAt);
      if (!this.closed && saved.fetchedAt >= Date.parse(this.updatedAt)) {
        this.current = createPricing(data); this.updatedAt = data.fetchedAt;
        this.nextAt = saved.fetchedAt + DAY;
      }
    } catch {}
  }
  price(call, custom) { return (this.current ?? bundled().pricing).price(call, custom); }
  catalog(options) { return { ...(this.current ?? bundled().pricing).catalog(options), updating: Boolean(this.pending), error: this.error, nextUpdateAt: this.nextAt }; }
  refresh() {
    if (this.closed) return this.pending;
    if (!this.timer) { this.timer = setInterval(() => { void this.refresh(); }, 3600000); this.timer.unref?.(); }
    if (this.now() < this.nextAt) return this.pending;
    if (this.pending) return this.pending;
    this.pending = this.update().catch(error => {
      if (!this.closed) { this.error = String(error.message); this.nextAt = this.now() + 3600000; }
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async update() {
    await this.loaded();
    if (this.closed || this.now() < this.nextAt) return;
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(20000)]);
    const response = await this.fetch(MONITOR_PRICE_SOURCE, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw Error(`价格更新 HTTP ${response.status}`);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) throw Error('价格数据过大');
      chunks.push(Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf8'), fetchedAt = this.now();
    const data = parseMonitorPriceSource(raw, fetchedAt), next = createPricing(data);
    if (this.closed) return;
    this.current = next; this.updatedAt = data.fetchedAt; this.nextAt = fetchedAt + DAY; this.error = null;
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(temporary, JSON.stringify({ fetchedAt, data }), { mode: 0o600 });
      await rename(temporary, this.file);
    } catch (error) {
      this.error = `价格已更新，缓存保存失败：${error.message}`;
    } finally { await unlink(temporary).catch(() => {}); }
  }
  async close() {
    this.closed = true; clearInterval(this.timer); this.controller?.abort();
    await this.ready; await this.pending;
  }
}
