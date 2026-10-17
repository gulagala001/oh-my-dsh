import { readFile, writeFile } from 'node:fs/promises';
import { MONITOR_PRICE_SOURCE as source, parseMonitorPriceSource } from '../src/monitor-price-source.mjs';
const raw = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (async () => {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Model prices: HTTP ${response.status}`);
  return response.text();
})();
const catalog = parseMonitorPriceSource(raw);
await writeFile(new URL('../src/monitor-prices.json', import.meta.url), JSON.stringify(catalog) + '\n');
console.log(`Saved ${catalog.entries.length} model prices across ${Object.keys(catalog.providers).length} providers`);
