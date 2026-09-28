import { createHash } from 'node:crypto';

export const DREAM_SCHEMA = 1;
export const LIMITS = Object.freeze({ session: 1200, project: 2400, global: 600, page: 20, input: 16000, read: 4000 });
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const nodeKey = (kind, id = '') => kind === 'global' ? 'global' : `${kind}:${id}`;
export const textSize = text => Array.from(String(text)).length;
// Deliberately conservative across CJK and opaque references. Actual provider
// usage replaces the reservation; missing usage never becomes a free call.
export const estimateTokens = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)) + 64;
export const quotaDay = now => new Date(now).toISOString().slice(0, 10);
export const quotaReset = now => Date.parse(quotaDay(now) + 'T00:00:00Z') + 86400000;
export function validateScope(value) {
  if (!['session', 'project', 'global'].includes(value)) throw Error('Dream 范围必须为会话、项目或全局');
  return value;
}
export function cursorFor(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
export function readCursor(value, scope) {
  if (!value) return { offset: 0 };
  try {
    if (value.length > 4096) throw Error();
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (parsed.scope !== scope || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw Error();
    return parsed;
  } catch { throw Error('目录游标无效，请从第一页重新读取'); }
}
export function summaryIdentity(record) {
  return digest([record.sessionId, record.originalSeqs || record.sourceSeqs || [], record.ranges || []]);
}
export function summaryFingerprint(record) {
  // Representation carriers/version changes are not new source content.
  return digest([summaryIdentity(record), record.summary, record.decisions || []]);
}
export function summaryMaterial(record) {
  return [record.summary, ...(record.decisions || []).map(d => `用户决定（event ${d.seq}）：${d.text}`)].filter(Boolean).join('\n');
}
export function validateMemory(value, kind, allowedRefs) {
  if (!value || typeof value.summary !== 'string' || !value.summary.trim()) throw Error('Dream 没有返回有效短记忆');
  const summary = value.summary.trim();
  if (textSize(summary) > LIMITS[kind]) throw Error(`Dream ${kind} 短记忆超过 ${LIMITS[kind]} 字符上限`);
  if (!Array.isArray(value.references) || !value.references.length || value.references.some(ref => typeof ref !== 'string' || !allowedRefs.has(ref))) throw Error('Dream 返回了缺失或越界的来源引用');
  return { summary, references: [...new Set(value.references)] };
}
export function splitSource(text, maxBytes = 8000, byteSize = Buffer.byteLength) {
  const parts = []; let chunk = '', bytes = 0, from = 0, offset = 0;
  for (const char of String(text)) {
    const size = byteSize(char);
    if (bytes + size > maxBytes && chunk) { parts.push({ from, to: offset, text: chunk }); chunk = ''; bytes = 0; from = offset; }
    chunk += char; bytes += size; offset += char.length;
  }
  if (chunk) parts.push({ from, to: offset, text: chunk });
  return parts;
}
