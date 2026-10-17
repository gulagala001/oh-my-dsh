import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ranges = { lastHour: 3600000, lastDay: 86400000, lastWeek: 604800000, lastMonth: 2419200000, allTime: Infinity };

export function createBrowserHistory(getDirectory) {
  let tail = Promise.resolve(), cached, generation = 0;
  const path = () => join(getDirectory(), 'browser-history.json');
  const signature = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  async function read(useCache = true) {
    try {
      const expected = generation, file = path(), info = useCache ? await stat(file, { bigint: true }) : null;
      const key = info && `${file}:${signature(info)}`;
      if (useCache && cached?.key === key) return cached.value;
      if (useCache) cached = undefined;
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(value)) throw new Error('Invalid persisted browser history');
      if (useCache && info.size <= 4 * 1024 * 1024) {
        const current = await stat(file, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error; });
        if (expected === generation && current && signature(info) === signature(current)) cached = { key, value };
      }
      return value;
    } catch (error) { cached = undefined; if (error.code === 'ENOENT') return []; throw error; }
  }
  function change(update) {
    const work = tail.then(async () => {
      generation++; cached = undefined;
      const rows = await read(false), result = update(rows);
      await mkdir(getDirectory(), { recursive: true, mode: 0o700 });
      await writeFile(`${path()}.pending`, JSON.stringify(rows) + '\n', { mode: 0o600 });
      await rename(`${path()}.pending`, path());
      cached = undefined;
      return result;
    });
    tail = work.catch(() => undefined);
    return work;
  }
  function startTime(range) {
    if (!Object.hasOwn(ranges, range)) throw new Error('Unknown browsing history time range');
    return Date.now() - ranges[range];
  }
  return {
    async handle(method, args = {}) {
      if (method === 'record') {
        const url = new URL(args.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only visited web addresses belong in browser history');
        return change(rows => {
          const existing = rows.find(row => row.id === args.id);
          const entry = { id: existing?.id ?? randomUUID(), url: url.href, title: String(args.title || url.hostname),
            visitTime: existing?.visitTime ?? Date.now(), isActorVisit: args.isActorVisit === true };
          if (existing) Object.assign(existing, entry); else rows.unshift(entry);
          return entry;
        });
      }
      if (method === 'remove') {
        if (!Array.isArray(args.entries)) throw new Error('Expected history entries to remove');
        return change(rows => {
          const days = new Map();
          for (const item of args.entries) {
            let selected = days.get(item.url);
            if (!selected) days.set(item.url, selected = new Set());
            selected.add(new Date(item.visitTime).toDateString());
          }
          let retained = 0;
          for (const row of rows) if (!days.get(row.url)?.has(new Date(row.visitTime).toDateString())) rows[retained++] = row;
          rows.length = retained;
          return { removed: true };
        });
      }
      if (method === 'clear') {
        if (!Array.isArray(args.dataTypes) || args.dataTypes.some(type => type !== 'history')) throw new Error('This browser host cannot clear the requested storage categories; no browsing data was changed');
        const start = startTime(args.timeRange);
        return change(rows => {
          let retained = 0;
          for (const row of rows) if (!(row.visitTime >= start)) rows[retained++] = row;
          rows.length = retained;
          return { cleared: true };
        });
      }
      await tail;
      const rows = await read();
      if (method === 'search') {
        const query = String(args.text || '').toLowerCase();
        const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
        const count = Math.min(100, Math.max(1, Math.floor(Number(args.maxResults) || 100)));
        const found = []; let matched = 0;
        for (const row of rows) {
          if (!(row.visitTime >= (args.startTime ?? 0) && row.visitTime < (args.endTime ?? Infinity)
            && `${row.title} ${row.url}`.toLowerCase().includes(query)
            && (args.visitSource === 'agent' ? row.isActorVisit : args.visitSource === 'other' ? !row.isActorVisit : true))) continue;
          if (matched++ < offset) continue;
          found.push(row);
          if (found.length === count) break;
        }
        return structuredClone(found);
      }
      if (method === 'summary') {
        const sites = [...new Set(rows.filter(row => row.visitTime >= startTime(args.timeRange)).map(row => new URL(row.url).hostname))];
        return { history: { siteCount: sites.length, firstSite: sites[0] ?? '' } };
      }
      throw new Error(`Unknown browser history operation: ${method}`);
    },
    async close() { await tail; generation++; cached = undefined; },
  };
}
