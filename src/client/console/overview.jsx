import React, { useState } from 'react';
import { api, qs, usePoll, Card, Stat, Tag, Dot, Seg, BarChart, HBars, Strip, Steps, Empty, Skeleton, Alert, LinkButton, Button, useAction, cx } from './ui.jsx';
import { kindLabel, tokens, money, k, ago, clock, colorOf, modelColor, toneOf, splitMetrics, eventKindLabel, statusOf, duration, savedOf, SAVING_KINDS } from './model.mjs';
import { pipelineSteps } from './context.jsx';
import { Usage } from './usage.jsx';

export function Overview({ sessionId, visible, range, period, go }) {
  const [selectedCurrency, setCurrency] = useState('USD');
  const monitor = usePoll(signal => api(`/monitor?${qs({ session: sessionId, range, period, limit: 40 })}`, undefined, signal),
    `${sessionId}:${range}:${period}`, { enabled: visible });
  const events = usePoll(signal => api(`/monitor/events?${qs({ session: sessionId, range, period, limit: 6 })}`, undefined, signal),
    `${sessionId}:${range}:${period}`, { enabled: visible, interval: 5000 });
  const context = usePoll(signal => api(`/context?${qs({ session: sessionId, compact: true })}`, undefined, signal), sessionId, { enabled: visible && Boolean(sessionId) });
  const action = useAction(context.refresh, sessionId);
  const d = monitor.data;
  if (!d) return monitor.error ? <Alert>{monitor.error}</Alert> : <Skeleton cards={4} rows={4}/>;

  const t = d.totals || {}, total = tokens(t), split = splitMetrics(d.metrics);
  const kinds = events.data?.kinds || [], saved = savedOf(kinds);
  const replacements = kinds.filter(x => SAVING_KINDS.includes(x.key)).reduce((n, x) => n + x.events, 0);
  const ctxTokens = d.meter?.totalTokens, cap = d.contextCapacity;
  const live = d.liveCalls || [], costSummary = d.costSummary || {}, costs = costSummary.totals || [];
  const currency = costs.find(c => c.currency === selectedCurrency)?.currency || costs[0]?.currency || 'USD';
  const costFormat = amount => money({ amount, currency });
  const modelKeys = [...new Map((d.groups?.models || []).filter(m => m.key !== 'legacy-unattributed').map(m => {
    const key = JSON.stringify(m.model || null);
    return [key, { key, name: m.model || '未记录模型', color: modelColor(m.model) }];
  })).values()];
  const series = (d.seriesSplit || []).map(s => ({ cost: s.costs?.[currency] ?? (!s.costs || s.unpricedCalls && !Object.keys(s.costs).length ? null : 0), label: s.label.replace(/^\d{4}-/, '').replace(/^\d{2}-\d{2} (?=\d{2}:)/, period === 'today' ? '' : '$&'), parts: s.models || {} }));
  const kindRows = Object.entries(d.metrics || {}).map(([kind, m]) => ({ key: kind, label: kindLabel(kind), value: tokens(m) || 0,
    text: `${k(tokens(m) || 0)} · ${m.calls} 次`, color: colorOf(kind), onClick: () => go('calls', { kind }) })).sort((a, b) => b.value - a.value);
  const modelRows = (d.groups?.models || []).filter(m => m.model).slice(0, 6).map(m => ({ key: m.key, label: m.model, value: tokens(m) || 0,
    text: `${k(tokens(m) || 0)} · ${m.calls} 次`, color: modelColor(m.model), onClick: () => go('calls', { model: m.model, provider: m.provider || '' }) }));
  const ticks = [...(d.activity || [])].reverse().map(call => ({ key: call.id, tone: call.status === 'error' ? 'red' : call.status === 'cancelled' ? 'gray' : MAINISH(call.kind) ? 'blue' : 'teal',
    title: `${clock(call.at)} · ${kindLabel(call.kind)} · ${call.model || ''} · ${call.status === 'error' ? '失败' : k(tokens(call.usage || {}) || 0) + ' tokens'}` }));
  const c = context.data, estimate = c?.estimate?.pending, performance = d.performance || {};
  const speed = Number.isFinite(performance.avgTps) ? `${performance.avgTps.toLocaleString('zh-CN', { maximumFractionDigits: 1 })} tok/s` : '—';

  return <div className="omc-section">
    <div className="omc-stats">
      <Stat label="Token 用量" icon="bolt" value={k(total)} sub={<Usage metric={t}/>} onClick={() => go('calls')}/>
      <Stat label="性能" icon="events" value={<span className="omc-performance">
        <span><small>平均首字</small><b>{duration(performance.avgFirstTokenMs)}</b></span>
        <span><small>会话时长</small><b>{duration(performance.sessionMs)}</b></span>
        <span><small>平均 TPS</small><b>{speed}</b></span>
      </span>} title={`平均首字：${performance.firstTokenCalls || 0} 次实测；平均 TPS：${performance.tpsCalls || 0} 次实测的输出 Token 总量 ÷ 首字后生成总秒数，缺值不按零计。会话时长：当前范围内从首个请求到最后活动的跨度（含调用间等待），运行中继续计时，并行会话重叠时间只计一次${performance.sessionUntimedCalls ? `；${performance.sessionUntimedCalls} 次调用未记录起点，时长仅为已知跨度` : ''}。`}/>
      <Stat label="模型调用" icon="calls" value={(t.calls || 0).toLocaleString()} tone={t.errors ? 'red' : undefined}
        sub={t.errors ? <span className="omc-red">{t.errors} 次失败 ›</span> : '无失败'} onClick={() => go('calls', t.errors ? { status: 'error' } : {})}/>
      <Stat label="当前上下文" icon="context" value={ctxTokens == null ? '—' : `≈${k(ctxTokens)}`} unit={cap ? ` / ${k(cap)}` : undefined}
        sub={cap && ctxTokens != null ? `占窗口 ${Math.round(ctxTokens / cap * 100)}%` : '发送后可读'} onClick={() => go('context')}
        tone={cap && ctxTokens / cap > .8 ? 'amber' : undefined}/>
      <Stat label="OMD 节省" icon="compress" value={saved ? `≈${k(saved)}` : '—'} tone={saved ? 'green' : undefined}
        sub={`${replacements} 次替换 / 压缩`} onClick={() => go('events', { kind: 'replace' })} title="上下文替换与压缩的同口径估算节省"/>
      <Stat label="费用" icon="coin" value={costs.length ? <span className="omc-cost-values">{costs.map(cost => <span key={cost.currency}>{money(cost)}</span>)}</span> : t.calls ? '—' : costFormat(0)}
        sub={costSummary.unpricedCalls ? `${costSummary.unpricedCalls} 次未计价` : '当前范围累计'} onClick={() => go('calls')}
        title={[...costs.map(money), costSummary.partialCalls ? `${costSummary.partialCalls} 次调用未完整返回计费用量` : ''].filter(Boolean).join('；')}/>
    </div>

    <div className="omc-grid-2">
      <Card title="用量趋势" icon="overview" extra={<><span className="omc-muted">主执行 {k(split.main.tokens)} · OMD 后台 {k(split.background.tokens)}</span>
        {costs.length > 1 && <Seg label="费用币种" size="sm" value={currency} options={costs.map(c => [c.currency, c.currency])} onChange={setCurrency}/>}</>}>
        <BarChart series={series} format={k} secondary={{ name: `费用 · ${currency}`, format: costFormat, color: 'var(--omc-amber)' }} keys={modelKeys}/>
      </Card>
      {range === 'session' && sessionId ? <Card title="上下文流水线" icon="hub" extra={<LinkButton onClick={() => go('context')}>详情</LinkButton>}>
        {!c ? <Skeleton rows={3}/> : <>
          <Steps steps={pipelineSteps(c)}/>
          {estimate && !estimate.error && <div className="omc-callout omc-callout-green">
            <div><strong>已准备 {estimate.selectedRecords} 段替换</strong><span>预计节省 ≈{k(estimate.estimatedSavedTokens)} tokens</span></div>
            <Button kind="primary" icon="check" busy={action.busy === 'apply'} onClick={() => action.run('apply', () => api(`/compact?${qs({ session: sessionId })}`, {}),
              r => r.queued ? '已排队，下一次请求边界应用' : r.changed ? '已应用' : '没有可应用的结果')}>应用</Button>
          </div>}
          <Alert tone="info">{action.notice}</Alert><Alert>{action.error}</Alert>
        </>}
      </Card> : <Card title="模型分布" icon="calls"><HBars rows={modelRows}/></Card>}
    </div>

    <Card title="最近调用" icon="calls" extra={<><span className="omc-legend-inline"><i className="omc-tick-blue"/>主执行<i className="omc-tick-teal"/>后台<i className="omc-tick-red"/>失败</span><LinkButton onClick={() => go('calls')}>调用日志</LinkButton></>}>
      {ticks.length ? <Strip items={ticks}/> : <Empty icon="calls" title="还没有调用记录"/>}
      {live.length > 0 && <div className="omc-live">{live.map((call, i) => <div key={i} className="omc-live-row">
        <Dot tone="blue" pulse/><Tag tone={toneOf(call.kind)}>{kindLabel(call.kind)}</Tag><span className="omc-mono">{call.model || '—'}</span>
        <span className="omc-muted">{call.status === 'preparing' ? '准备中' : `运行 ${duration(Date.now() - (call.startedAt || call.preparingAt))}`}</span>
      </div>)}</div>}
    </Card>

    <div className="omc-grid-2">
      <Card title="组件用量" icon="layers"><HBars rows={kindRows}/></Card>
      <Card title="后台动态" icon="events" extra={<LinkButton onClick={() => go('events')}>后台日志</LinkButton>}>
        {events.data?.items?.length ? <ul className="omc-feed">{events.data.items.map(e => {
          const [label] = statusOf(e.status);
          return <li key={e.id}><Tag tone={toneOf(e.kind)}>{eventKindLabel(e.kind)}</Tag>
            <span className={cx('omc-feed-text', e.status === 'error' && 'omc-red', e.status === 'skip' && 'omc-muted')} title={e.detail || label}>{e.title}{e.status === 'error' && e.detail ? `：${e.detail}` : ''}{e.savedTokens > 0 && SAVING_KINDS.includes(e.kind) && <b className="omc-green"> −{k(e.savedTokens)}</b>}</span>
            <time>{ago(e.at)}</time></li>;
        })}</ul> : <Empty icon="events" title="暂无后台事件">预处理、中枢决定、替换与 Dream 会记录在这里。</Empty>}
      </Card>
    </div>
    {d.coverage?.message && <p className="omc-footnote">{d.coverage.message}</p>}
  </div>;
}
const MAINISH = kind => kind === 'main' || kind === 'subagent';
