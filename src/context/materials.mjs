import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const messageOf = e => e?.type === 'user/message' ? e.data : e?.data?.message;
export function attachmentsOf(blocks, sessionId, seq, path = [], result = []) {
  for (const [index, block] of (blocks || []).entries()) {
    const at = [...path, index];
    if (block.type === 'tool-result') attachmentsOf(block.content, sessionId, seq, at, result);
    else if (!['text', 'reasoning', 'tool-call'].includes(block.type)) {
      const { offloaded, ...identity } = block;
      result.push({ id: digest(identity), block: structuredClone(block), sources: [{ sessionId, seq, path: at }] });
    }
  }
  return result;
}
export function combineAssets(...lists) {
  const found = new Map();
  for (const asset of lists.flat()) {
    const old = found.get(asset.id), sources = [...(old?.sources || []), ...(asset.sources || [])];
    found.set(asset.id, { ...structuredClone(asset), sources: [...new Map(sources.map(s => [JSON.stringify(s), s])).values()] });
  }
  return [...found.values()];
}
export function combineUsers(...lists) {
  return [...new Map(lists.flat().map(u => [`${u.sessionId}:${u.seq}`, structuredClone(u)])).values()]
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq);
}
export function userDocument(users) {
  return users.length ? [{ kind: 'user-original', title: '用户原话（逐字附件 / User messages — verbatim, chronological archive）',
    text: users.map(u => `[${u.sessionId} · event ${u.seq}]\n` + u.content.filter(b => b.type === 'text').map(b => b.text).join('\n')).join('\n\n') }] : [];
}
export function describeAsset(asset, index) {
  const block = asset.block, ref = block.attachment || {};
  return `Attachment ${index + 1}: ${block.type}${ref.name || block.name ? ' · ' + (ref.name || block.name) : ''}; source ${asset.sources.map(s => `${s.sessionId}#${s.seq}`).join(', ')}. Contents are not inferred from the name.`;
}
export function materialText(blocks, seq) {
  return (blocks || []).map(b => {
    if (b.type === 'text') return b.text || '';
    if (b.type === 'reasoning') return '[Earlier analysis; not verified facts]\n' + (b.text || '');
    if (b.type === 'tool-call') return `${b.name}(${typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)})`;
    if (b.type === 'tool-result') return (b.isError ? '[error] ' : '') + materialText(b.content, seq);
    return `[${b.type} attachment at event ${seq}${b.attachment?.name || b.name ? '; ' + (b.attachment?.name || b.name) : ''}; content not supplied. The host retains the original.]`;
  }).join('\n');
}
export function contentChars(blocks) {
  return (blocks || []).reduce((n, b) => n + (['text', 'reasoning'].includes(b.type) ? (b.text || '').length
    : b.type === 'tool-call' ? b.name.length + (typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)).length
    : b.type === 'tool-result' ? contentChars(b.content) : 0), 0);
}
export { estimateContent as contentTokens, estimateMessage as messageTokens } from '../metering/estimate.mjs';
export function recordAssets(record) { return record.assets || []; }
export function assetBlocks(record, { recall = false } = {}) {
  return recordAssets(record).flatMap((asset, i) => {
    const block = structuredClone(asset.block);
    if (recall && block.type === 'image') delete block.offloaded;
    return [{ type: 'text', text: describeAsset(asset, i) }, block];
  });
}
