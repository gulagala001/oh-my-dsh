import { monitorQuery, monitorEventQuery } from './monitor-ledger.mjs';
import { monitorCallCost } from './monitor-call.mjs';
import { monitorCallPrice, monitorPriceCatalog } from './monitor-pricing.mjs';
import { monitorSelection, monitorPerformance } from './monitoring.mjs';
import { sourceName } from './message-source.mjs';
import { validateSessionId } from './hub-store.mjs';
import { coldNativeMonitorTarget } from './monitor-session.mjs';

export async function handleMonitorApi({ hub, ctx, req, res, url, send }) {
  if (url.pathname === '/oh-my-dsh/api/monitor/prices') {
    if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
    const query = url.searchParams.get('query') || '', provider = url.searchParams.get('provider') || '';
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 30);
    if (query.length > 200 || provider.length > 256 || !Number.isInteger(offset) || offset < 0 || offset > 100000
      || !Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('价格筛选无效');
    hub.pricing?.refresh(); await hub.pricing?.loaded();
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, hub.pricing ? hub.pricing.catalog({ query, provider, offset, limit }) : monitorPriceCatalog({ query, provider, offset, limit }));
    return true;
  }
  if (url.pathname === '/oh-my-dsh/api/monitor/events') {
    if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
    const id = url.searchParams.get('session');
    if (id) validateSessionId(id);
    const query = monitorEventQuery(url.searchParams);
    const selection = monitorSelection(hub.store.monitorStates(), id, query.range);
    const ids = new Set(selection.selected.map(state => state.id));
    if (id) ids.add(id);
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, hub.monitor.events(ids, query));
    return true;
  }
  if (url.pathname === '/oh-my-dsh/api/monitor/live') {
    // Lightweight composer-dock poll: Dream job state and live background calls only.
    if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
    const id = url.searchParams.get('session');
    if (id) validateSessionId(id);
    const activity = hub.dream.store.jobActivity({ includeJob: true });
    res.setHeader('Cache-Control', 'no-store');
    send(res, 200, { dream: { usage: hub.dream.store.usage(), dailyTokens: hub.config().dreamDailyTokens ?? 200000,
      ...activity },
      liveCalls: [...hub.live.values()].filter(call => !id || call.sessionId === id) });
    return true;
  }
  if (url.pathname !== '/oh-my-dsh/api/monitor') return false;
  if (req.method !== 'GET') { send(res, 405, { error: '不支持此方法' }); return true; }
  const id = url.searchParams.get('session');
  if (id) validateSessionId(id);
  monitorQuery(url.searchParams);
  const agent = id ? ctx.agents.get(id) : undefined;
  const session = agent?.session ?? (id ? ctx.sessions.get(id) : undefined);
  // Monitoring uses metadata, even when the corresponding native archive can
  // no longer be inspected. monitorStates reports unreadable OMD sidecars.
  let stored;
  try { stored = id ? hub.store.peek(id) : undefined; } catch {}
  if (id && !session && !stored && !hub.monitor.hasSession(id)
    && !await coldNativeMonitorTarget(ctx, id, req, res)) {
    send(res, 404, { error: '会话不存在' }); return true;
  }
  res.setHeader('Cache-Control', 'no-store');
  if (!['context', 'usage'].includes(url.searchParams.get('view'))) await hub.pricing?.loaded();
  send(res, 200, monitorSnapshot({ hub, ctx, params: url.searchParams, id, session, agent, stored }));
  return true;
}

// Read-only projections. Optional measurements must never prevent call history
// from being read, and the API never starts a model or loads message bodies.
export function monitorSnapshot({ hub, ctx, params, id, session, agent, stored }) {
  const query = monitorQuery(params);
  const view = params instanceof URLSearchParams ? params.get('view') : params?.view;
  if (view === 'context') {
    const { warnings, ...readings } = monitorContextReadings({ hub, ctx, session });
    return { generatedAt: Date.now(), sessionId: id, ...readings, coverage: { message: warnings.join(' ') } };
  }
  const callsOnly = view === 'calls';
  const states = hub.store.monitorStates();
  const selection = monitorSelection(states, id, query.range);
  const ids = new Set(selection.selected.map(state => state.id));
  if (id) ids.add(id);
  if (view === 'usage') {
    const data = hub.monitor.query(selection.selected, ids, query, undefined, { usageOnly: true });
    const unreadable = hub.store.monitorErrors.size;
    return { ...data, sessionId: id, coverage: { partial: Boolean(unreadable || hub.monitor.error),
      message: [unreadable ? `${unreadable} 份历史档案无法读取，结果不完整；原文件已保留。` : '', hub.monitor.error ? '部分监控记录写入失败；原生执行不受影响。' : ''].filter(Boolean).join(' ') } };
  }
  const prices = hub.config().monitorPrices || [];
  hub.pricing?.refresh();
  const priceOf = call => hub.pricing ? hub.pricing.price(call, prices) : monitorCallPrice(call, prices);
  const data = hub.monitor.query(selection.selected, ids, query, call => monitorCallCost(call, prices, priceOf(call)), { callsOnly });
  data.activity = data.activity.map(call => {
    const price = priceOf(call);
    return { ...call, price, cost: monitorCallCost(call, prices, price) };
  });
  if (callsOnly) {
    const unreadable = hub.store.monitorErrors.size;
    return { ...data, sessionId: id, coverage: { ...data.coverage, partial: data.coverage.partial || Boolean(unreadable),
      message: [data.coverage.message, unreadable ? `${unreadable} 份历史档案无法读取，结果不完整；原文件已保留。` : ''].filter(Boolean).join(' ') } };
  }
  const { meter, frame, toolsTokens, contextCapacity, warnings } = monitorContextReadings({ hub, ctx, session });
  const optional = (label, read, fallback = null) => {
    try { return read() ?? fallback; } catch { warnings.push(`${label}暂时不可用。`); return fallback; }
  };
  const liveCalls = [...hub.live.values()].filter(call => query.range === 'all' || ids.has(call.sessionId));
  const timingCalls = [...liveCalls, ...[...(hub.requestStarts?.entries() || [])].map(([sessionId, call]) => ({ ...call, sessionId, kind: 'main' }))]
    .filter(call => (query.range === 'all' || ids.has(call.sessionId)) && (!query.kind || call.kind === query.kind)
      && (!query.model || call.model === query.model || call.route?.model === query.model)
      && (!query.provider || call.provider === query.provider || call.route?.provider === query.provider));
  if (!query.kind && !query.model && !query.provider && !query.query) {
    const active = [...(hub.agents?.values() || []), ...(agent ? [agent] : [])];
    for (const owner of active) {
      if (owner.status !== 'running' || query.range !== 'all' && !ids.has(owner.session.id)) continue;
      const span = data.performance.sessionSpans.find(row => row.sessionId === owner.session.id);
      if (span) timingCalls.push({ sessionId: span.sessionId, startedAt: span.startedAt });
    }
  }
  data.performance = monitorPerformance(data.performance, query.status === 'all' && !query.query ? timingCalls : [], data.generatedAt, data.selection.from);
  const budget = session ? optional('会话预算', () => {
    const value = hub.budgets?.snapshot(session);
    return value?.configured ? value : null;
  }) : stored?.budget?.configured ? stored.budget : null;
  const dream = optional('Dream 预算', () => {
    return { usage: hub.dream.store.usage(), dailyTokens: hub.config().dreamDailyTokens ?? 200000,
      ...hub.dream.store.jobActivity() };
  });
  const resources = optional('宿主资源', () => {
    const memory = process.memoryUsage();
    return { sampledAt: Date.now(), scope: '宿主进程', rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, uptimeSeconds: process.uptime() };
  });
  const unreadable = hub.store.monitorErrors.size;
  if (unreadable) warnings.push(`${unreadable} 份历史档案无法读取，结果不完整；原文件已保留。`);
  return { ...data, sessionId: id, actions: selection.actions,
    actionsScope: '当前会话范围的累计计数，不随时间筛选变化',
    running: agent?.status ?? 'idle', liveCalls, meter, frame, toolsTokens, contextCapacity,
    budget, dream, resources,
    coverage: { ...data.coverage, partial: data.coverage.partial || Boolean(unreadable),
      message: [data.coverage.message, ...warnings].filter(Boolean).join(' ') } };
}

function monitorContextReadings({ hub, ctx, session }) {
  const warnings = [];
  const optional = (label, read, fallback = null) => {
    try { return read() ?? fallback; } catch { warnings.push(`${label}暂时不可用。`); return fallback; }
  };
  const meter = session ? optional('当前上下文读数', () => ctx.tokenMeter.measure(session)) : null;
  const frame = session && meter ? optional('上下文记录', () => meter.nodes.map(node => {
    const event = session.eventAt(node.seq), message = event ? session.deriveEventMessage(event) : null;
    return { seq: node.seq, kind: sourceName(message?.source) || message?.source?.kind || event?.type || 'unknown', role: message?.role,
      tokens: node.tokens ?? node.heuristicTokens ?? null, checkpoint: Boolean(message?.source?.compactionId) };
  })) : null;
  const toolsTokens = session ? optional('工具定义读数', () => {
    const header = session.requestHeader?.();
    if (!header) return null;
    // Same fixed text-density and framing as the host's tool-schema estimate.
    return header.tools?.length ? Math.ceil(JSON.stringify(header.tools).length / 4) + 4 : 0;
  }) : null;
  const contextCapacity = session ? optional('模型窗口', () => hub.context.adapter.contextCapacity(session)) : null;
  return { meter, frame, toolsTokens, contextCapacity, warnings };
}
