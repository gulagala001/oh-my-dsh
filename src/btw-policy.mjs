import { AsyncLocalStorage } from 'node:async_hooks';

export const BTW_LABEL_PREFIX = 'omd-btw:v1:';
export const btwCreation = new AsyncLocalStorage();
const ownedSessions = new WeakSet();
export const markBtwSession = session => ownedSessions.add(session);

// Only the first descriptor in this child's own suffix is authoritative.
// An inherited descriptor must never classify an unrelated fork as a side question.
export function btwDescriptor(events, inherited = 0) {
  const event = events.slice(inherited).find(e => e.type === 'subagent/descriptor');
  const d = event?.data;
  return d?.version === 3 && d.mode === 'one-shot' && d.provider === 'fork'
    && typeof d.label === 'string' && /^omd-btw:v1:[0-9a-f-]{36}$/.test(d.label) ? d : null;
}
export function isBtwSession(session) {
  if (!session) return false;
  if (ownedSessions.has(session)) return true;
  if (session.header?.origin !== 'subagent' || !session.snapshotEvents) return false;
  return Boolean(btwDescriptor(session.snapshotEvents(), session.inheritedEventCount || 0));
}
const message = e => e.type === 'user/message' ? e.data : e.data?.message;
export function pendingToolCalls(events) {
  const pending = new Set();
  for (const e of events) {
    const m = message(e);
    for (const b of m?.content || []) if (b.type === 'tool-call') pending.add(b.id);
    if (e.type === 'tool/call') pending.add(e.data.callId);
    if (e.type === 'tool/result') pending.delete(m?.toolCallId || e.data?.callId);
  }
  return pending;
}
export function completedBtwPrefix(session, { allowEmpty = false } = {}) {
  const events = session.snapshotEvents(), end = events.findLastIndex(e => e.type === 'turn/end');
  if (end < 0) {
    if (allowEmpty) return [];
    throw Error('/btw 需要至少一个已完成回合；不会改用独立上下文。');
  }
  const prefix = events.slice(0, end + 1);
  if (prefix.some((e, i) => e.seq !== i) || pendingToolCalls(prefix).size)
    throw Error('/btw 的已完成上下文有未配对工具记录；已停止侧问。');
  return prefix;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Compare actual request envelopes without mutating tools, persona, messages,
// route or provider replay state. A new child sessionId is transport metadata.
export function assertBtwCachePrefix(parent, child) {
  if (!parent) throw Error('/btw 缺少可核对的主会话请求；请等主模型开始响应后再侧问。');
  for (const key of ['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop', 'system', 'tools', 'toolHistory']) {
    if (!same(parent[key], child[key])) throw Error(`/btw 缓存前缀不一致（${key}）；已停止，不会另发完整上下文请求。`);
  }
  if (!parent.messages?.length || child.messages.length <= parent.messages.length
    || !parent.messages.every((m, i) => same(m, child.messages[i])))
    throw Error('/btw 历史前缀发生变化；已停止，不会重新生成系统提示词或工具定义。');
}
export function cacheUsage(usage) {
  const n = usage?.cacheReadTokens;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
    ? { state: n > 0 ? 'hit' : 'miss', cacheReadTokens: n }
    : { state: 'unknown' };
}
export function cacheUsageText(usages) {
  const values = usages.map(cacheUsage);
  if (!values.length || values.some(v => v.state === 'unknown')) return '缓存命中：未知（渠道未完整返回 cacheReadTokens）';
  const n = values.reduce((sum, v) => sum + v.cacheReadTokens, 0);
  return `缓存读取：${n} tokens${n === 0 ? '（未命中）' : ''}`;
}
