export const kindNames = {
  main: '主执行', subagent: '子代理', compactFull: '全量压缩', prepare: '上下文预处理', coordinate: '上下文替换', adaptive: '主动异步整理',
  dream: 'Dream', dreamSession: '会话记忆', dreamProject: '项目记忆', dreamGlobal: '全局记忆', promptOptimizer: '提示词优化',
  background: '记忆消化（历史）', recall: '记忆检索（历史）', state: '状态提炼（历史）', curation: '记忆整理（历史）', surgeon: '上下文整理（历史）', probeAsk: '探针出题（历史）', probeAnswer: '探针作答（历史）',
};
export const kindLabel = kind => kindNames[kind] || kind || '未归类';
export const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const number = value => known(value) ? value : 0;
export const fmt = value => known(value) ? value.toLocaleString('zh-CN') : '—';
export const compact = value => { if (!known(value)) return '—'; const n = value; return n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, '').replace(/\.$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : fmt(n); };
export const input = metric => known(metric?.inputTotalTokens) ? metric.inputTotalTokens
  : known(metric?.totalTokens) && known(metric?.outputTokens) && metric.totalTokens >= metric.outputTokens ? metric.totalTokens - metric.outputTokens
  : [metric?.inputTokens, metric?.cacheReadTokens, metric?.cacheWriteTokens].every(known) ? metric.inputTokens + metric.cacheReadTokens + metric.cacheWriteTokens : undefined;
export const tokens = metric => known(metric?.totalTokens) ? metric.totalTokens : known(input(metric)) && known(metric?.outputTokens) ? input(metric) + metric.outputTokens : undefined;
export const cacheRatio = metric => input(metric) && !number(metric?.inputUnreported) && !number(metric?.cacheUnreported) && known(metric?.cacheReadTokens) ? `${(metric.cacheReadTokens / input(metric) * 100).toFixed(1)}%` : '—';
export const duration = value => { if (!known(value)) return '—'; const ms = value; return ms >= 3600000 ? `${Math.floor(ms / 3600000)}h ${Math.floor(ms % 3600000 / 60000)}m` : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s` : `${(ms / 1000).toFixed(1)}s`; };
export const date = at => { const value = new Date(at); return at && Number.isFinite(value.getTime()) ? value.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; };
export const callKey = call => String(call?.id ?? `${call?.sessionId}:${call?.kind}:${call?.at}:${call?.eventSeq ?? call?.step ?? ''}`);
export const tokenParts = metric => [
  ['fresh', '未缓存输入', metric?.inputTokens], ['read', '缓存读取', metric?.cacheReadTokens],
  ['write', '缓存写入', metric?.cacheWriteTokens], ['output', '输出', metric?.outputTokens],
];
