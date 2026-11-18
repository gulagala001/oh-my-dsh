export const DEFAULT_USD_CNY = 6.6661;
export const DEFAULT_RATE_DATE = '2026-11-17';
const SOURCE = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY';

export async function latestUsdCny(signal, fetcher = fetch) {
  const response = await fetcher(SOURCE, { signal, cache: 'no-store' });
  if (!response.ok) throw Error(`汇率更新 HTTP ${response.status}`);
  const { base, rates, date } = await response.json();
  if (base !== 'USD' || !Number.isFinite(rates?.CNY) || rates.CNY <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw Error('汇率来源未返回有效的美元兑人民币报价');
  return { rate: rates.CNY, date };
}

export function displayPrice(price, currency, rate) {
  if (!price || !['USD', 'CNY'].includes(currency) || price.currency === currency
    || !['USD', 'CNY'].includes(price.currency) || !(rate > 0)) return price;
  const factor = currency === 'CNY' ? rate : 1 / rate;
  const convert = (row, keys) => Object.fromEntries(keys.filter(key => Number.isFinite(row[key]))
    .map(key => [key, row[key] * factor]));
  return { ...price, currency, ...convert(price, ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']),
    ...(price.tiers ? { tiers: price.tiers.map(t => ({ ...t, ...convert(t, ['input', 'output', 'cache_read', 'cache_write', 'reasoning']) })) } : {}) };
}
