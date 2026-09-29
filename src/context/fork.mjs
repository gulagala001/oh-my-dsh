import { sourceName } from '../message-source.mjs';

// Forks copy native events, not plugin sidecar files. Pin only archives named
// by inherited OMD checkpoints and their historical dependencies. User/tool
// text cannot grant archive access, and later parent work stays outside the cut.
export function forkArchiveSnapshot(session, state, store, parentOf) {
  const parentSession = session.header?.parentSession, count = session.inheritedEventCount;
  if (state.forkArchive?.version === 1 || !parentSession || !session.header.isSeeded
    || session.header.origin === 'subagent' || Number(session.header.delegationDepth) > 0 || !Number.isSafeInteger(count)) return null;
  const ids = new Set();
  for (const event of session.snapshotEvents().slice(0, count)) {
    let blocks;
    if (event.type === 'compaction/summary' && event.data.omdBatchId) blocks = event.data.summary;
    else if (event.type === 'user/message' && sourceName(event.data.source) === 'trisoul-x:context-record') blocks = event.data.content;
    for (const block of blocks || []) {
      if (block.type !== 'text') continue;
      const match = /^\[Context record ([^\s\]]+) ·/.exec(block.text);
      if (match) ids.add(match[1]);
    }
  }
  const forkArchive = { version: 1, parentSession, inheritedEventCount: count };
  if (!ids.size) return { inheritedRecords: [], forkArchive };
  const candidates = new Map(), seen = new Set([session.id]);
  for (let id = parentSession; id && !seen.has(id);) {
    seen.add(id);
    const source = store.peek(id);
    for (const record of [...(source?.records || []), ...(source?.inheritedRecords || [])]) {
      if (!candidates.has(record.id)) candidates.set(record.id, { ...record, sessionTitle: record.sessionTitle || source.binding?.title || id });
    }
    id = source?.forkArchive?.parentSession ?? parentOf(id);
  }
  const inherited = new Map(), queue = [...ids];
  for (let i = 0; i < queue.length; i++) {
    const record = candidates.get(queue[i]), seqs = record?.originalSeqs || record?.sourceSeqs;
    if (!record || inherited.has(record.id) || !seqs?.length || seqs.some(seq => !Number.isSafeInteger(seq) || seq < 0 || seq >= count)) continue;
    inherited.set(record.id, structuredClone(record));
    queue.push(...(record.parents || []));
  }
  for (const record of inherited.values()) if (record.mergedInto && !inherited.has(record.mergedInto)) delete record.mergedInto;
  return { inheritedRecords: [...inherited.values()], forkArchive };
}
