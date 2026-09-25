// Bounded views of the existing catalog; original records remain in the store.
export function catalogPage(records, { query = '', cursor, limit = 50, maxChars = 32000 } = {}) {
  if (typeof query !== 'string' || (cursor != null && typeof cursor !== 'string')) throw Error('目录查询或游标无效');
  const search = query.toLowerCase();
  const matches = records.filter(r => !search || `${r.summary} ${r.id} ${r.sessionTitle}`.toLowerCase().includes(search));
  const position = cursor ? matches.findIndex(r => r.id === cursor) : -1;
  if (cursor && position < 0) throw Object.assign(Error('摘要目录已变化，请从第一页重新读取'), { statusCode: 409 });
  const entries = []; let chars = 0;
  for (const record of matches.slice(position + 1)) {
    let entry = record;
    let size = record.summary.length + String(record.sessionTitle || '').length + record.id.length + 160;
    if (size > maxChars) {
      entry = { ...record, summary: '[Summary exceeds this page; recall this record by id for the complete text.]', summaryTruncated: true };
      size = entry.summary.length + entry.id.length + 160;
    }
    if (entries.length && (entries.length >= limit || chars + size > maxChars)) break;
    entries.push(entry); chars += size;
  }
  const hasMore = position + 1 + entries.length < matches.length;
  return { entries, total: matches.length, nextCursor: hasMore ? entries.at(-1).id : null };
}
