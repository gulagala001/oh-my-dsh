const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Compare actual request envelopes without mutating tools, persona, messages,
// route or provider replay state. Background preparation appends to this prefix.
export function assertCachedRequestPrefix(parent, child) {
  if (!parent) throw Error('缺少可核对的主会话请求；等待主模型产生请求后再处理。');
  for (const key of ['provider', 'model', 'reasoningEffort', 'temperature', 'maxTokens', 'stop', 'system', 'tools', 'toolHistory']) {
    if (!same(parent[key], child[key])) throw Error(`缓存请求前缀不一致（${key}）；已停止，不会另发完整上下文请求。`);
  }
  if (!parent.messages?.length || child.messages.length <= parent.messages.length
    || !parent.messages.every((m, i) => same(m, child.messages[i])))
    throw Error('缓存请求的历史前缀发生变化；已停止，不会重新生成系统提示词或工具定义。');
}
