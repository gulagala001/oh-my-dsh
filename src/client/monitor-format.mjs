export const kindNames = {
  main: '主执行', subagent: '子代理', compactFull: '全量压缩', autoCompact: 'Auto Compact', prepare: '上下文预处理', coordinate: '中枢判断', adaptive: '主动异步整理',
  dream: 'Dream', dreamSession: '会话记忆', dreamProject: '项目记忆', dreamGlobal: '全局记忆', promptOptimizer: '提示词优化',
  background: '记忆消化（历史）', recall: '记忆检索（历史）', state: '状态提炼（历史）', curation: '记忆整理（历史）', surgeon: '上下文整理（历史）', probeAsk: '探针出题（历史）', probeAnswer: '探针作答（历史）',
};
export const kindLabel = kind => kindNames[kind] || kind || '未归类';
export const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const number = value => known(value) ? value : 0;
export const fmt = value => known(value) ? value.toLocaleString('zh-CN') : '—';
export const compact = value => { if (!known(value)) return '—'; const n = value; return n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, '').replace(/\.$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k` : fmt(n); };
const inputBuckets = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
const sumKnown = (metric, keys) => keys.some(key => known(metric?.[key])) ? keys.reduce((sum, key) => sum + number(metric?.[key]), 0) : undefined;
const exactInput = metric => Object.hasOwn(metric || {}, 'inputTotalTokens') ? known(metric.inputTotalTokens) ? metric.inputTotalTokens : undefined
  : known(metric?.totalTokens) && known(metric?.outputTokens) && metric.totalTokens >= metric.outputTokens ? metric.totalTokens - metric.outputTokens
  : inputBuckets.every(key => known(metric?.[key])) ? sumKnown(metric, inputBuckets) : undefined;
export const input = metric => Object.hasOwn(metric || {}, 'knownInputTokens') ? known(metric.knownInputTokens) ? metric.knownInputTokens : undefined
  : exactInput(metric) ?? sumKnown(metric, inputBuckets);
export const tokens = metric => Object.hasOwn(metric || {}, 'knownTotalTokens') ? known(metric.knownTotalTokens) ? metric.knownTotalTokens : undefined
  : known(metric?.totalTokens) ? metric.totalTokens
  : known(input(metric)) || known(metric?.outputTokens) ? number(input(metric)) + number(metric?.outputTokens) : undefined;
export const inputPartial = metric => number(metric?.inputUnreported) > 0 || !known(exactInput(metric));
export const tokenPartial = metric => known(metric?.totalUnreported) ? metric.totalUnreported > 0 : number(metric?.unmetered) > 0
  || !known(metric?.totalTokens) && (inputPartial(metric) || !known(metric?.outputTokens));
// A rounded-up number after ≥ would overstate the known lower bound.
const boundCompact = value => !known(value) ? '—' : value >= 1e6 ? `${Math.floor(value / 1e4) / 100}M` : value >= 1e3 ? `${Math.floor(value / 100) / 10}k` : fmt(value);
export const tokenAmount = (metric, format = compact) => known(tokens(metric)) ? `${tokenPartial(metric) ? '≥' : ''}${tokenPartial(metric) && format === compact ? boundCompact(tokens(metric)) : format(tokens(metric))}` : '未返回';
export const inputAmount = (metric, format = compact) => known(input(metric)) ? `${inputPartial(metric) ? '≥' : ''}${inputPartial(metric) && format === compact ? boundCompact(input(metric)) : format(input(metric))}` : '未返回';
export const outputAmount = (metric, format = compact) => known(metric?.outputTokens) ? `${number(metric?.outputUnreported) ? '≥' : ''}${number(metric?.outputUnreported) && format === compact ? boundCompact(metric.outputTokens) : format(metric.outputTokens)}` : '未返回';
const cacheSample = metric => {
  if (Object.hasOwn(metric || {}, 'cacheMeasuredCalls')) return number(metric.cacheMeasuredCalls) > 0
    ? { total: metric.cacheMeasuredInputTokens, read: metric.cacheMeasuredReadTokens } : {};
  const total = exactInput(metric), read = metric?.cacheReadTokens, buckets = sumKnown(metric, inputBuckets);
  if (inputPartial(metric) || number(metric?.cacheUnreported) || buckets > total
    || inputBuckets.every(key => known(metric?.[key])) && buckets !== total
    || known(metric?.totalTokens) && known(metric?.outputTokens) && metric.totalTokens < metric.outputTokens) return {};
  return { total, read };
};
export const cacheRatio = metric => {
  const { total, read } = cacheSample(metric);
  return known(total) && total > 0 && known(read) && read <= total ? `${(read / total * 100).toFixed(1)}%` : '—';
};
export const cacheReason = metric => cacheRatio(metric) !== '—' ? '' : Object.hasOwn(metric || {}, 'cacheMeasuredCalls') ? '暂无输入总量与缓存读取均完整且有效的调用'
  : !known(metric?.cacheReadTokens) ? '缓存读取未披露'
  : number(metric?.cacheUnreported) ? '读取披露不完整' : inputPartial(metric) ? '输入总量不完整'
  : !exactInput(metric) ? '暂无可计算输入' : '读数不一致';
export const cacheTitle = metric => cacheRatio(metric) === '—' ? cacheReason(metric)
  : `缓存读取 ÷ 同批调用的输入总量（含缓存）${known(metric?.cacheMeasuredCalls) ? `；覆盖 ${fmt(metric.cacheMeasuredCalls)} / ${fmt(metric.calls)} 次调用` : ''}`;
export const usageNote = metric => {
  if (!metric) return '';
  if (number(metric?.calls) > 0 && !known(tokens(metric))) return `${fmt(metric.calls)} 次调用未返回可用用量`;
  const missing = [['inputTokens', 'inputBucketUnreported', '未缓存输入'], ['cacheReadTokens', 'cacheUnreported', '缓存读取'],
    ['cacheWriteTokens', 'cacheWriteUnreported', '缓存写入'], ['outputTokens', 'outputUnreported', '输出']]
    .filter(([field, counter]) => number(metric?.[counter]) > 0 || !known(metric?.[field])).map(([, , label]) => label);
  const notes = [];
  if (tokenPartial(metric) && known(tokens(metric))) notes.push('≥ 为已知下界，非完整消耗');
  if (missing.length && number(metric?.calls) !== 0) notes.push(`${missing.join('、')}未完整披露`);
  if (number(metric?.usageUnreported)) notes.push(`${fmt(metric.usageUnreported)} 次无可用用量`);
  return notes.join('；');
};
export const duration = value => {
  if (!known(value)) return '—';
  const seconds = Math.round(value / 1000);
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`
    : seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${(value / 1000).toFixed(1)}s`;
};
export const durationAmount = metric => !known(metric?.durationMs) ? '未知'
  : number(metric?.durationUnreported) > 0 ? `${duration(metric.durationMs)}（已知小计）` : duration(metric.durationMs);
export const date = at => { const value = new Date(at); return at && Number.isFinite(value.getTime()) ? value.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'; };
export const callKey = call => String(call?.id ?? `${call?.sessionId}:${call?.kind}:${call?.at}:${call?.eventSeq ?? call?.step ?? ''}`);
export const bucketAmount = (metric, key, format = fmt) => {
  const counter = { inputTokens: 'inputBucketUnreported', cacheReadTokens: 'cacheUnreported', cacheWriteTokens: 'cacheWriteUnreported', outputTokens: 'outputUnreported' }[key];
  const partial = number(metric?.[counter]) > 0, value = metric?.[key];
  return known(value) ? `${partial ? '≥' : ''}${partial && format === compact ? boundCompact(value) : format(value)}` : '—';
};
export const tokenParts = metric => [
  ['fresh', '未缓存输入', metric?.inputTokens], ['read', '缓存读取', metric?.cacheReadTokens],
  ['write', '缓存写入', metric?.cacheWriteTokens], ['output', '输出', metric?.outputTokens],
];
