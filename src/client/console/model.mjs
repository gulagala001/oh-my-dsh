// Console vocabulary: mechanism names, tones and formatting shared by the
// console sections and the composer dock.
export { kindLabel, known, fmt, compact, tokens, input, cacheRatio, cacheTitle, duration, date, tokenAmount } from '../monitor-format.mjs';
import { tokens as metricTokens } from '../monitor-format.mjs';

export const SECTIONS = [
  ['overview', '概览', 'overview'],
  ['context', '上下文', 'context'],
  ['memory', '记忆', 'memory'],
  ['calls', '调用日志', 'calls'],
  ['events', '后台日志', 'events'],
];
export const HIDDEN_SECTIONS = [['evidence', '任务证据', 'evidence']];

// Main execution vs OMD background mechanisms.
export const MAIN_KINDS = new Set(['main', 'subagent']);
export const KIND_TONES = {
  main: 'blue', subagent: 'indigo', prepare: 'teal', coordinate: 'violet', adaptive: 'cyan', compactFull: 'amber', compactProcessed: 'amber', autoCompact: 'amber',
  replace: 'green', dream: 'pink', dreamSession: 'pink', dreamProject: 'pink', dreamGlobal: 'pink', promptOptimizer: 'orange',
};
export const toneOf = kind => KIND_TONES[kind] || 'gray';
export const COLORS = {
  blue: 'var(--omc-blue)', indigo: 'var(--omc-indigo)', teal: 'var(--omc-teal)', violet: 'var(--omc-violet)', cyan: 'var(--omc-cyan)',
  amber: 'var(--omc-amber)', green: 'var(--omc-green)', pink: 'var(--omc-pink)', orange: 'var(--omc-orange)', gray: 'var(--omc-gray)', red: 'var(--omc-red)',
};
export const colorOf = kind => COLORS[toneOf(kind)];

// Model identity, not rank or provider, keeps colours stable across filters and polls.
export function modelColor(model) {
  if (!model) return COLORS.gray;
  let hash = 2166136261;
  for (const char of model) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return `hsl(${60 + hash % 300} 65% 50%)`;
}

export const EVENT_KINDS = {
  prepare: '预处理', coordinate: '中枢决定', replace: '应用替换', compactProcessed: '压缩已处理', compactFull: '全量压缩',
  adaptive: '主动异步', autoCompact: 'Auto Compact', dream: 'Dream', imagePreparation: '图片预检', toolOptimization: '工具优化',
};
// Replacement events carry the savings; Auto Compact reports the same replacement again.
export const SAVING_KINDS = ['replace', 'compactFull', 'compactProcessed'];
export const savedOf = kinds => (kinds || []).filter(x => SAVING_KINDS.includes(x.key)).reduce((n, x) => n + (x.savedTokens || 0), 0);
export const eventKindLabel = kind => EVENT_KINDS[kind] || kind;
export const STATUS = { local: ['本地预检', 'gray'], recovered: ['已恢复', 'green'],
  success: ['成功', 'green'], error: ['失败', 'red'], cancelled: ['已取消', 'gray'], skip: ['保留', 'gray'],
  stale: ['已过期', 'amber'], running: ['运行中', 'blue'], info: ['信息', 'gray'],
};
export const statusOf = status => STATUS[status] || [status, 'gray'];

export const PERIODS = [['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天'], ['all', '全部时间']];
export const RANGES = [['session', '本会话'], ['all', '全部会话']];

export const k = value => {
  if (!Number.isFinite(value)) return '—';
  const n = Math.abs(value), sign = value < 0 ? '-' : '';
  return sign + (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(n)));
};
export const ago = at => {
  if (!at) return '—';
  const s = Math.max(0, (Date.now() - at) / 1000);
  return s < 45 ? '刚刚' : s < 3600 ? `${Math.round(s / 60)} 分钟前` : s < 86400 ? `${Math.round(s / 3600)} 小时前` : `${Math.round(s / 86400)} 天前`;
};
export const clock = at => at ? new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '—';
export const pct = (a, b) => b > 0 ? `${(a / b * 100).toFixed(a / b >= .995 ? 0 : 1)}%` : '—';
export const money = cost => {
  if (!Number.isFinite(cost?.amount) || cost.amount < 0 || !/^[A-Z]{3}$/.test(cost.currency)) return '—';
  const amount = cost.amount > 0 && cost.amount < .000001 ? '<0.000001'
    : cost.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `${cost.currency} ${amount}`;
};
export const apiPrice = price => price ? `${price.currency} ${price.inputTokens ?? '未公开'} / ${price.outputTokens ?? '未公开'}` : '未收录';

/** Split ledger metrics into main execution and OMD background. */
export function splitMetrics(metrics = {}) {
  const out = { main: { tokens: 0, calls: 0 }, background: { tokens: 0, calls: 0 } };
  for (const [kind, m] of Object.entries(metrics)) {
    const side = MAIN_KINDS.has(kind) ? out.main : out.background;
    side.tokens += metricTokens(m) || 0; side.calls += m.calls || 0;
  }
  return out;
}

// Node composition and request-envelope estimates stay separate from usage anchoring.
export const COMPOSITION = [
  { key: 'system', name: '系统提示', color: 'var(--omc-gray)' },
  { key: 'instructions', name: '目录／技能指令', color: 'var(--omc-violet)' },
  { key: 'summary', name: 'OMD 摘要', color: 'var(--omc-green)' },
  { key: 'omd', name: 'OMD 注入', color: 'var(--omc-teal)' },
  { key: 'user', name: '用户', color: 'var(--omc-blue)' },
  { key: 'model', name: '模型', color: 'var(--omc-indigo)' },
  { key: 'tool', name: '工具结果', color: 'var(--omc-amber)' },
  { key: 'other', name: '其他上下文', color: 'var(--omc-pink)' },
];
export function composition(frame, total, toolsTokens) {
  const sums = Object.fromEntries(COMPOSITION.map(c => [c.key, 0]));
  for (const node of frame || []) {
    const kind = String(node.kind || ''), t = Number(node.tokens) || 0;
    const key = node.checkpoint || kind === 'compact-checkpoint' || kind === 'oh-my-dsh:context-record' ? 'summary'
      : kind.startsWith('oh-my-dsh:') && kind !== 'oh-my-dsh:shadow' ? 'omd'
      : ['agent-instructions', 'skill-catalog', 'skill-invocation'].includes(kind) ? 'instructions'
      : node.role === 'system' || kind === 'system/message' || (kind === '@deepseek-ai/dsh-system-prompt' && !node.role) ? 'system'
      : kind === 'user' || kind === 'user/message' ? 'user'
      : node.role === 'assistant' || ['model', 'assistant', 'assistant/message'].includes(kind) ? 'model'
      : node.role === 'tool' || ['tool', 'tool/result'].includes(kind) ? 'tool' : 'other';
    sums[key] += t;
  }
  const parts = COMPOSITION.map(c => ({ ...c, value: sums[c.key] }));
  const toolsKnown = Number.isFinite(toolsTokens) && toolsTokens >= 0;
  if (toolsKnown) parts.push({ key: 'tools', name: '工具定义', color: 'var(--omc-rest)', value: toolsTokens });
  const estimatedTokens = toolsKnown && Array.isArray(frame) && frame.every(n => Number.isFinite(n.tokens)) ? parts.reduce((n, p) => n + p.value, 0) : null;
  // A signed difference reconciles estimates with pressure; it is not another message.
  return { parts, estimatedTokens, adjustmentTokens: estimatedTokens != null && Number.isFinite(total) ? total - estimatedTokens : null };
}
