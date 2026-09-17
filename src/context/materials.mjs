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
// Same density/framing as the host; image and file pricing are route-owned.
export function contentTokens(blocks, { imagePricing, fileText } = {}) {
  let tokens = 0;
  const images = attachmentsOf(blocks, '', 0).filter(a => a.block.type === 'image').map(a => a.block);
  const prices = imagePricing ? imagePricing.priceImages(images) : null;
  if (prices && prices.length !== images.length) throw Error('Image pricing returned a mismatched occurrence count');
  let cursor = 0;
  const visit = values => {
    for (const b of values || []) {
      if (['text', 'reasoning'].includes(b.type)) tokens += Math.ceil((b.text || '').length / 4) + 4;
      else if (b.type === 'tool-call') tokens += Math.ceil(b.name.length / 4) + Math.ceil((typeof b.arguments === 'string' ? b.arguments : JSON.stringify(b.arguments)).length / 4) + 4;
      else if (b.type === 'tool-result') { tokens += 4; visit(b.content); }
      else if (b.type === 'image' && prices) { const p = prices[cursor++]; tokens += p.visualTokens + Math.ceil(p.text.length / 4) + 4; }
      else if (b.type === 'file' && fileText) tokens += Math.ceil(fileText(b.attachment).length / 4) + 4;
      else { const { offloaded, ...ref } = b; tokens += Math.ceil(JSON.stringify(b.type === 'image' ? ref : b).length / 4) + 4; }
    }
  };
  visit(blocks); return tokens;
}
export function messageTokens(message, pricing) {
  if (!message) return 0;
  if (message.role === 'system') return message.content.length ? Math.ceil(contentChars(message.content) / 4) + 4 : 0;
  return contentTokens(message.content, pricing) + 4;
}
export function recordAssets(record) { return record.assets || []; }
export function assetBlocks(record, { recall = false } = {}) {
  return recordAssets(record).flatMap((asset, i) => {
    const block = structuredClone(asset.block);
    if (recall && block.type === 'image') delete block.offloaded;
    return [{ type: 'text', text: describeAsset(asset, i) }, block];
  });
}
