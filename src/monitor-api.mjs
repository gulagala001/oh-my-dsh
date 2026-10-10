import { monitorQuery } from './monitor-ledger.mjs';
import { monitorSelection } from './monitoring.mjs';
import { sourceName } from './message-source.mjs';
import { validateSessionId } from './hub-store.mjs';

export function handleMonitorApi({ hub, ctx, req, res, url, send }) {
  if (url.pathname !== '/trisoul-x/api/monitor') return false;
  if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
  const id = url.searchParams.get('session');
  if (id) validateSessionId(id);
  const agent = id ? ctx.agents.get(id) : undefined;
  const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
  // Monitoring uses metadata, even when the corresponding native archive can
  // no longer be inspected. monitorStates reports unreadable OMD sidecars.
  let stored;
  try { stored = id ? hub.store.peek(id) : undefined; } catch {}
  if (id && !session && !stored && !hub.monitor.hasSession(id)) {
    send(res, 404, { error: '会话不存在' }); return true;
  }
  res.setHeader('Cache-Control', 'no-store');
  send(res, 200, monitorSnapshot({ hub, ctx, params: url.searchParams, id, session, agent, stored }));
  return true;
}

// Read-only projections. Optional measurements must never prevent call history
// from being read, and the API never starts a model or loads message bodies.
export function monitorSnapshot({ hub, ctx, params, id, session, agent, stored }) {
  const query = monitorQuery(params);
  const states = hub.store.monitorStates();
  const selection = monitorSelection(states, id, query.range);
  const ids = new Set(selection.selected.map(state => state.id));
  if (id) ids.add(id);
  const data = hub.monitor.query(selection.selected, ids, query);
  const warnings = [];
  const optional = (label, read, fallback = null) => {
    try { return read() ?? fallback; } catch { warnings.push(`${label}暂时不可用。`); return fallback; }
  };
  const meter = session ? optional('当前上下文读数', () => ctx.tokenMeter.measure(session)) : null;
  const frame = session && meter ? optional('上下文记录', () => meter.nodes.map(node => {
    const event = session.eventAt(node.seq), message = session.deriveEventMessage(event);
    return { seq: node.seq, kind: sourceName(message?.source) || message?.source?.kind || event.type,
      tokens: node.tokens ?? node.heuristicTokens ?? null, checkpoint: Boolean(message?.source?.compactionId) };
  }), []) : [];
  const contextCapacity = session ? optional('模型窗口', () => hub.context.adapter.contextCapacity(session)) : null;
  const liveCalls = [...hub.live.values()].filter(call => query.range === 'all' || ids.has(call.sessionId));
  const budget = session ? optional('会话预算', () => {
    const value = hub.budgets?.snapshot(session);
    return value?.configured ? value : null;
  }) : stored?.budget?.configured ? stored.budget : null;
  const dream = optional('Dream 预算', () => {
    const jobs = hub.dream.store.jobs(0, { includeUnfinished: true });
    return { usage: hub.dream.store.usage(), dailyTokens: hub.config().dreamDailyTokens ?? 200000,
      activeJobs: jobs.filter(job => job.state === 'running').length,
      queuedJobs: jobs.filter(job => ['queued', 'budget'].includes(job.state)).length };
  });
  const memory = process.memoryUsage();
  const resources = { sampledAt: Date.now(), scope: '宿主进程', rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, uptimeSeconds: process.uptime() };
  const unreadable = hub.store.monitorErrors.size;
  if (unreadable) warnings.push(`${unreadable} 份历史档案无法读取，结果不完整；原文件已保留。`);
  return { ...data, sessionId: id, actions: selection.actions,
    actionsScope: '当前会话范围的累计计数，不随时间筛选变化',
    running: agent?.status ?? 'idle', liveCalls, meter, frame, contextCapacity,
    contextHistory: stored?.contextHistory || [], budget, dream, resources,
    coverage: { ...data.coverage, partial: data.coverage.partial || Boolean(unreadable),
      message: [data.coverage.message, ...warnings].filter(Boolean).join(' ') } };
}
