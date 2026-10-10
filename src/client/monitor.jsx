import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPoller } from './polling.mjs';
import { MonitorContext, contextMonitorCss } from './monitor-context.jsx';
import { kindLabel, known, number, fmt, compact, input, tokens, cacheRatio, duration, date, callKey, tokenParts } from './monitor-format.mjs';
import css from './monitor.css';
import { MonitorResources, resourcesMonitorCss } from './monitor-resources.jsx';

export const monitorCss = css + '\n' + contextMonitorCss + '\n' + resourcesMonitorCss;
const defaults = { period: 'all', provider: '', model: '', kind: '', status: 'all', query: '' };
const periods = [['all', '全部时间'], ['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天']];
const pages = [['overview', '概览'], ['usage', '用量'], ['context', '上下文']];

function Icon({ name, size = 16 }) {
  const paths = { chevron: 'm9 5 7 7-7 7', refresh: 'M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16A7 7 0 0 1 7 19l-3-3', check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6', arrow: 'M5 12h14m-5-5 5 5-5 5', activity: 'M3 13h4l3-8 4 15 3-7h4' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.activity}/></svg>;
}
function Empty({ title, children }) { return <div className="mon-empty"><Icon name="activity" size={23}/><strong>{title}</strong><p>{children}</p></div>; }
function Heading({ title, hint, action }) { return <header className="mon-section-head"><h3>{title}</h3>{hint && <small>{hint}</small>}{action}</header>; }
function MetricDetail({ metric = {} }) {
  return <><dl className="mon-detail-grid"><dt>输入总量</dt><dd>{fmt(input(metric))}</dd>{tokenParts(metric).map(([key, label, value]) => <React.Fragment key={key}><dt className={key === 'fresh' || key === 'read' || key === 'write' ? 'mon-indent' : ''}>{label}</dt><dd>{fmt(value)}</dd></React.Fragment>)}<dt>推理 Token</dt><dd>{metric.reasoningTokens == null ? '未返回' : fmt(metric.reasoningTokens)}</dd><dt>缓存命中</dt><dd>{cacheRatio(metric)}</dd><dt>峰值输入</dt><dd>{metric.peakContext == null ? '未记录' : compact(metric.peakContext)}</dd><dt>累计用时</dt><dd>{duration(metric.durationMs)}</dd><dt>调用 / 失败</dt><dd>{fmt(metric.calls)} / {fmt(metric.errors)}</dd></dl><p className="mon-note">输入总量包含未缓存输入和缓存读写；推理量按返回值单列，不重复计入总量。</p>{number(metric.cacheUnreported) > 0 && <p className="mon-note">{fmt(metric.cacheUnreported)} 次调用未单独披露缓存读取，无法计算完整命中率。</p>}{number(metric.unmetered) > 0 && <p className="mon-note mon-warning">{fmt(metric.unmetered)} 次调用未返回用量，Token 统计不完整。</p>}</>;
}
function Summary({ metric = {}, usage = false }) {
  return <div className={'mon-metrics' + (usage ? ' mon-metrics-usage' : '')}>
    <div><span>{usage ? 'Token 总用量' : '总用量'}</span><strong>{compact(tokens(metric))}</strong><small>输入 {compact(input(metric))} · 输出 {compact(metric.outputTokens)}</small></div>
    <div><span>缓存命中</span><strong>{cacheRatio(metric)}</strong><small>已报告读取量 / 输入总量</small></div>
    <div><span>模型调用</span><strong>{fmt(metric.calls)}</strong><small className={number(metric.errors) > 0 ? 'mon-warning' : undefined}>{fmt(metric.errors)} 次失败{number(metric.cancelled) > 0 ? ` · ${fmt(metric.cancelled)} 次取消` : ''}{number(metric.unmetered) > 0 ? ` · ${fmt(metric.unmetered)} 次未返回用量` : ''}</small></div>
    {!usage && <div><span>累计调用用时</span><strong>{duration(metric.durationMs)}</strong><small>各组件合计 · 可包含并行</small></div>}
  </div>;
}
function Timeline({ calls, live, onSelect }) {
  const ordered = [...calls].reverse().slice(-16), kinds = [...new Set([...ordered, ...live].map(call => call.kind))];
  return <section className="mon-section mon-timeline-section"><Heading title="调用轨迹" hint={`最近 ${ordered.length} 次 · 点击查看`} action={ordered.length > 0 && <button className="mon-link" type="button" onClick={() => onSelect(ordered.at(-1))}>查看记录 <Icon name="arrow"/></button>}/>
    {kinds.length ? <div className="mon-timeline">{kinds.map(kind => <div className="mon-timeline-row" key={kind}><span title={kindLabel(kind)}>{kindLabel(kind)}</span><div className="mon-timeline-track" style={{ '--mon-count': Math.max(1, ordered.length) }}>{ordered.map((call, i) => call.kind === kind ? <button type="button" key={callKey(call)} className={'mon-call-dot' + (call.status === 'cancelled' ? ' mon-cancelled' : call.error || call.status === 'error' ? ' mon-failed' : '')} onClick={() => onSelect(call)} aria-label={`${kindLabel(kind)} · ${date(call.at)} · ${duration(call.durationMs)}${call.status === 'cancelled' ? ' · 已取消' : call.error || call.status === 'error' ? ' · 失败' : ' · 完成'}`} title={`${kindLabel(kind)} · ${date(call.at)} · ${duration(call.durationMs)}`} style={{ gridColumn: i + 1 }}/> : <span key={callKey(call)} style={{ gridColumn: i + 1 }}/>)}</div></div>)}</div> : <Empty title="等待第一次执行">模型调用完成后，会在这里形成轨迹。</Empty>}
    {ordered.length > 0 && <div className="mon-legend"><span><i/>完成调用</span><span><i className="mon-failed"/>失败</span><span><i className="mon-cancelled"/>取消</span></div>}
  </section>;
}
function Activity({ calls, generatedAt, running }) {
  return <section className="mon-section mon-current"><Heading title="当前活动" hint={calls.length ? `${calls.length} 项运行中` : undefined}/>{calls.length ? <div className="mon-live-list">{calls.map((call, i) => <div key={call.id ?? `${call.kind}:${call.startedAt}:${i}`}><span className="mon-live-dot"/><div><strong>{kindLabel(call.kind)}</strong><small>{call.model || call.provider || '正在执行'}</small></div><span>{call.startedAt ? `已运行 ${duration(Math.max(0, new Date(generatedAt).getTime() - new Date(call.startedAt).getTime()))}` : '运行中'}</span></div>)}</div> : <p className="mon-note mon-idle">{running ? '主会话正在执行，等待调用数据。' : '暂无运行中的模型调用。'}</p>}</section>;
}
function Components({ metrics = {} }) {
  const rows = Object.entries(metrics).filter(([, metric]) => number(metric.calls) > 0);
  return <section className="mon-section"><Heading title="组件用量" hint="调用 · Token · 累计用时"/>{rows.length ? rows.map(([kind, metric]) => <details className="mon-component" key={kind}><summary><Icon name="chevron" size={13}/><span>{kindLabel(kind)}</span><b>{fmt(metric.calls)}</b><span>{compact(tokens(metric))}</span><span>{duration(metric.durationMs)}</span></summary><div className="mon-component-body"><MetricDetail metric={metric}/></div></details>) : <p className="mon-note">当前范围还没有组件用量。</p>}</section>;
}
function Background({ actions = {}, scope }) {
  const entries = [
    ['上下文预处理 / 失败', `${fmt(actions.preparedSegments)} / ${fmt(actions.contextprepareErrors)}`],
    ['替换决策 / 失败', `${fmt(actions.contextDecisions)} / ${fmt(actions.contextcoordinateErrors)}`],
    ['实际替换 / 文档回查', `${fmt(actions.contextReplacements)} / ${fmt(actions.documentRecalls)}`],
    ['记忆消化 / 失败', `${fmt(actions.digests)} / ${fmt(actions.digestErrors)}`], ['记忆整理 / 失败', `${fmt(actions.curations)} / ${fmt(actions.curationErrors)}`],
    ['注入 / 文档更新', `${fmt(actions.injections)} / ${fmt(actions.workdocVersions)}`], ['状态提炼 / 失败', `${fmt(actions.states)} / ${fmt(actions.stateErrors)}`],
    ['召回 / 命中', `${fmt(actions.recalls)} / ${fmt(actions.recallHits)}`], ['检索回退', fmt(actions.retrievalFallbacks)], ['压缩 / 失败', `${fmt(actions.surgeries)} / ${fmt(actions.surgeryErrors)}`],
    ['检查调用失败', fmt(actions.probeErrors)], ['原文回捞 / 旧快照清理', `${fmt(actions.rawRecalls)} / ${fmt(actions.staleVersions)}`],
    ['压缩后字符占比', actions.compactInputChars ? `${(number(actions.compactOutputChars) / number(actions.compactInputChars) * 100).toFixed(1)}%` : '—'],
  ].filter(([, value], i) => i < 3 || /[1-9]/.test(value));
  return <section className="mon-section"><Heading title="后台处理结果" hint="累计执行结果"/><dl className="mon-result-list">{entries.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>{scope && <p className="mon-note">{scope}</p>}</section>;
}
function chartParts(metric) {
  const parts = tokenParts(metric), total = tokens(metric);
  const remainder = known(total) ? Math.max(0, total - parts.reduce((sum, [, , value]) => sum + number(value), 0)) : 0;
  return remainder > 0 ? [...parts, ['unspecified', '未细分', remainder]] : parts;
}
function Trend({ series = [] }) {
  const peak = Math.max(...series.map(row => number(tokens(row))), 1), parts = [...tokenParts({}), ...(series.some(row => chartParts(row).length > 4) ? [['unspecified', '未细分']] : [])];
  return <section className="mon-section"><Heading title="用量趋势" hint="按当前筛选统计"/>{series.length ? <figure className="mon-trend"><div className="mon-chart" role="img" aria-label={series.map(row => `${row.label || date(row.at)}：${fmt(tokens(row))} tokens`).join('；')}><div className="mon-chart-scale"><span>{compact(peak)}</span><span>{compact(peak / 2)}</span><span>0</span></div><div className="mon-chart-bars">{series.map((row, i) => <div className="mon-bar-column" key={`${row.at}:${i}`}><div className="mon-bar-space"><div className="mon-bar" title={`${row.label || date(row.at)} · ${fmt(tokens(row))} tokens`} style={{ height: `${number(tokens(row)) / peak * 100}%` }}>{chartParts(row).map(([key, , value]) => <i key={key} data-token={key} style={{ height: `${tokens(row) ? number(value) / tokens(row) * 100 : 0}%` }}/>)}</div></div><span title={row.label || date(row.at)}>{row.label || date(row.at)}</span></div>)}</div></div><figcaption className="mon-legend">{parts.map(([key, label]) => <span key={key}><i data-token={key}/>{label}</span>)}</figcaption></figure> : <Empty title="暂无趋势数据">当前筛选范围内没有可统计的用量。</Empty>}</section>;
}
function Distribution({ groups = {} }) {
  const [group, setGroup] = useState('components'), items = groups[group] || [], total = items.reduce((sum, item) => sum + number(tokens(item)), 0);
  const label = item => item.label || (group === 'components' ? kindLabel(item.key) : group === 'models' ? `${item.provider || '未归因'} / ${item.model || item.key}` : item.key || '未归因');
  return <section className="mon-section"><Heading title="用量分布" action={<select className="mon-select" aria-label="用量分组" value={group} onChange={event => setGroup(event.target.value)}><option value="components">按组件</option><option value="models">按模型</option><option value="providers">按提供方</option><option value="sessions">按会话</option></select>}/>{items.length ? <div className="mon-distribution">{items.map(item => <details key={item.key}><summary><div><span title={label(item)}>{label(item)}</span><b>{compact(tokens(item))}</b><small>{total && known(tokens(item)) ? `${(tokens(item) / total * 100).toFixed(1)}%` : '—'}</small></div><div className="mon-distribution-track"><i style={{ width: `${total && known(tokens(item)) ? tokens(item) / total * 100 : 0}%` }}/></div></summary><div className="mon-component-body"><MetricDetail metric={item}/></div></details>)}</div> : <p className="mon-note">当前范围没有分组数据。</p>}</section>;
}
function CallDetails({ call }) {
  const usage = call.usage;
  return <div className="mon-call-detail"><dl className="mon-detail-grid"><dt>提供方</dt><dd>{call.provider || '未记录'}</dd><dt>模型</dt><dd>{call.model || '未记录'}</dd>{call.effort && <><dt>思考强度</dt><dd>{call.effort}</dd></>}<dt>会话</dt><dd className="mon-path">{call.sessionId || '未记录'}</dd><dt>耗时</dt><dd>{duration(call.durationMs)}</dd>{call.turn != null && <><dt>回合 / 步骤</dt><dd>{call.turn} / {call.step ?? '—'}</dd></>}{call.eventSeq != null && <><dt>原生事件</dt><dd>#{call.eventSeq}</dd></>}{call.source && <><dt>数据来源</dt><dd>{call.source}</dd></>}</dl>{usage ? <><h4>Token 用量</h4><dl className="mon-detail-grid">{tokenParts(usage).map(([key, label, value]) => <React.Fragment key={key}><dt>{label}</dt><dd>{fmt(value)}</dd></React.Fragment>)}<dt>输入总量</dt><dd>{fmt(input(usage))}</dd><dt>推理量</dt><dd>{usage.reasoningTokens == null ? '未返回' : fmt(usage.reasoningTokens)}</dd></dl></> : <p className="mon-note">本次调用未返回用量。</p>}{call.error && <p className="mon-call-error" role="note">{call.error}</p>}<p className="mon-note">完整消息、输入输出和工具往返可在 DSH「轨迹」中查看。{call.eventSeq != null ? `对应事件 #${call.eventSeq}。` : ''}</p></div>;
}
function Calls({ data, selected, pinned, openCalls, setOpenCalls, selectedRef, cursor, cursors, navigate, onClear }) {
  const calls = data?.activity || [], missing = pinned && !calls.some(call => callKey(call) === callKey(pinned));
  const row = call => { const key = callKey(call); return <details className={'mon-call-row' + (call.status === 'cancelled' ? ' mon-cancelled' : call.error || call.status === 'error' ? ' mon-failed' : '') + (selected === key ? ' mon-selected' : '')} key={key} open={openCalls.has(key)} onToggle={event => { const open = event.currentTarget.open; setOpenCalls(old => { if (old.has(key) === open) return old; const next = new Set(old); open ? next.add(key) : next.delete(key); return next; }); }}><summary ref={selected === key ? selectedRef : undefined}><span className="mon-call-status"><Icon name={call.error || call.status === 'error' || call.status === 'cancelled' ? 'close' : 'check'} size={13}/></span><div><strong>{kindLabel(call.kind)}{call.status === 'cancelled' ? ' · 已取消' : call.error || call.status === 'error' ? ' · 失败' : ''}</strong><small>{date(call.at)}{call.model ? ` · ${call.model}` : ''}</small></div><span className="mon-call-amount">{call.usage ? compact(tokens(call.usage)) : '未返回'}<small>{duration(call.durationMs)}</small></span></summary><CallDetails call={call}/></details>; };
  return <section className="mon-section mon-calls"><Heading title="调用记录" hint={`共 ${fmt(data?.activityTotal)} 次`}/>{missing && <div className="mon-pinned"><Heading title="选中的调用" hint="此记录不在当前页" action={<button className="mon-link" type="button" onClick={onClear}>收起详情</button>}/>{row(pinned)}</div>}{calls.length ? calls.map(row) : <Empty title="这里还没有调用记录">调整筛选，或继续一次对话后查看。</Empty>}<div className="mon-pagination"><button type="button" className="mon-button" disabled={!cursor} onClick={() => navigate('previous')}>上一页</button><span>第 {cursors.length + 1} 页</span><button type="button" className="mon-button" disabled={!data?.nextCursor} onClick={() => navigate('next', data.nextCursor)}>下一页</button></div><p className="mon-note">汇总与趋势统计全部匹配记录；此处仅加载当前页。</p></section>;
}

export function createMonitor({ api }) {
  function MonitorPanel({ sessionId, useTabInfo }) {
    const { tab } = useTabInfo(), id = useId();
    const [page, setPage] = useState('overview'), [range, setRange] = useState('session'), [filters, setFilters] = useState(defaults), [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(''), [cursors, setCursors] = useState([]), [snapshot, setSnapshot] = useState(null), [selected, setSelected] = useState(null), [pinned, setPinned] = useState(null), [openCalls, setOpenCalls] = useState(new Set());
    const observer = useRef(null), body = useRef(null), selectedRef = useRef(null), pendingSelection = useRef(null), tabs = useRef([]), activeKey = useRef('');
    const path = useMemo(() => {
      const selection = page === 'usage' ? filters : { ...defaults, period: filters.period };
      const params = new URLSearchParams({ session: sessionId || '', range, ...selection, cursor: page === 'usage' ? cursor : '' });
      return `/monitor?${params}`;
    }, [sessionId, range, page, filters, cursor]);
    activeKey.current = path;
    const data = snapshot?.key === path ? snapshot.data : null, error = snapshot?.key === path ? snapshot.error : '';
    useEffect(() => { setFilters(defaults); setQuery(''); setCursor(''); setCursors([]); setSelected(null); setPinned(null); setOpenCalls(new Set()); pendingSelection.current = null; }, [sessionId, range]);
    useEffect(() => { const timer = setTimeout(() => setFilters(old => old.query === query ? old : { ...old, query }), 300); return () => clearTimeout(timer); }, [query]);
    useEffect(() => {
      if (!tab.visible) return;
      const poller = createPoller({ read: signal => api(path, undefined, signal), onData: next => { if (activeKey.current === path) setSnapshot({ key: path, data: next, error: next.error || '' }); }, onError: failure => { if (activeKey.current === path) setSnapshot(old => ({ key: path, data: old?.key === path ? old.data : null, error: failure?.message || '暂时无法读取监控数据' })); } });
      observer.current = poller; poller.start(); return () => { poller.stop(); if (observer.current === poller) observer.current = null; };
    }, [path, tab.visible]);
    useLayoutEffect(() => {
      if (!tab.visible || page !== 'usage' || !data || !pendingSelection.current || pendingSelection.current !== selected || !selectedRef.current) return;
      pendingSelection.current = null; const target = selectedRef.current, viewport = body.current; target.focus({ preventScroll: true });
      if (viewport) { const bounds = viewport.getBoundingClientRect(), row = target.getBoundingClientRect(); viewport.scrollTop += row.top - bounds.top - viewport.clientTop - 16; }
    }, [page, selected, pinned, data, tab.visible]);
    const update = (key, value) => { setCursor(''); setCursors([]); setSelected(null); setPinned(null); pendingSelection.current = null; setFilters(old => ({ ...old, [key]: value, ...(key === 'provider' ? { model: '' } : {}) })); };
    const choose = call => { if (!call) return; const key = callKey(call); setPage('usage'); setFilters(defaults); setQuery(''); setCursor(''); setCursors([]); setPinned(call); setSelected(key); setOpenCalls(old => new Set([...old, key])); pendingSelection.current = key; };
    const reset = () => { setQuery(''); setFilters(defaults); setCursor(''); setCursors([]); setSelected(null); setPinned(null); pendingSelection.current = null; };
    const navigate = (direction, next) => { pendingSelection.current = null; setSelected(null); setPinned(null); if (direction === 'next') { setCursors(old => [...old, cursor]); setCursor(next); } else { setCursor(cursors.at(-1) || ''); setCursors(old => old.slice(0, -1)); } };
    const totals = data?.totals || {}, live = data?.liveCalls || [], running = Boolean(data?.running && data.running !== 'idle');
    const options = data?.filters || {}, providerOptions = [...new Set([...(options.providers || []), ...(filters.provider ? [filters.provider] : [])])];
    const modelOptions = (options.models || []).filter(model => !filters.provider || model.provider === filters.provider), models = [...new Set([...modelOptions.map(model => model.model), ...(filters.model ? [filters.model] : [])])];
    const kinds = [...new Set([...(options.kinds || []), ...(filters.kind ? [filters.kind] : [])])];
    const keyDown = (event, index) => { const next = event.key === 'ArrowRight' ? (index + 1) % pages.length : event.key === 'ArrowLeft' ? (index + pages.length - 1) % pages.length : event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : null; if (next == null) return; event.preventDefault(); setPage(pages[next][0]); tabs.current[next]?.focus(); };
    return <div className="tx-app omd-monitor">
      <header className="mon-head"><div><span className="mon-eyebrow">工作台 / 监控</span><h2>监控</h2></div><div className="mon-head-actions"><span className={'mon-running' + (running || live.length ? ' is-running' : '')}><i/>{running ? '执行中' : live.length ? '后台运行中' : '空闲'}{live.length ? ` · ${live.length} 项后台` : ''}</span><button type="button" className="mon-icon-button" aria-label="刷新监控" title="刷新监控" onClick={() => observer.current?.refresh()}><Icon name="refresh"/></button></div></header>
      <div className="mon-toolbar"><div role="tablist" aria-label="监控分类" className="mon-tabs">{pages.map(([key, label], index) => <button type="button" key={key} role="tab" id={`${id}-tab-${key}`} aria-controls={`${id}-panel-${key}`} aria-selected={page === key} tabIndex={page === key ? 0 : -1} ref={element => { tabs.current[index] = element; }} onClick={() => setPage(key)} onKeyDown={event => keyDown(event, index)}>{label}</button>)}</div><div className="mon-scope"><select aria-label="监控统计范围" value={range} onChange={event => setRange(event.target.value)}><option value="session">当前会话</option><option value="all">全部会话</option></select><select aria-label="统计时间范围" value={filters.period} onChange={event => update('period', event.target.value)}>{periods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
      <div className="mon-body" ref={body} aria-busy={!data && !error}>
        {error && <div className="mon-error" role="alert"><span>{error}{data ? '；保留上次读取的结果。' : ''}</span><button type="button" className="mon-link" onClick={() => observer.current?.refresh()}>重试</button></div>}
        {(data?.coverage?.message || data?.coverage?.partial || number(data?.coverage?.legacyCalls) > 0) && <p className="mon-coverage" role="note">{data.coverage.message || '部分历史记录缺少统计明细，当前结果不完整。'}</p>}
        {!data && !error && <p className="mon-loading" role="status">正在读取监控数据…</p>}
        <div role="tabpanel" id={`${id}-panel-overview`} aria-labelledby={`${id}-tab-overview`} hidden={page !== 'overview'} tabIndex={0}>
          {data && <><Summary metric={totals}/><div className="mon-overview-top"><Timeline calls={data.activity || []} live={live} onSelect={choose}/><Activity calls={live} generatedAt={data.generatedAt} running={running}/></div><div className="mon-overview-bottom"><Components metrics={data.metrics}/><Background actions={data.actions} scope={data.actionsScope}/></div><button type="button" className="mon-context-shortcut" onClick={() => setPage('context')}><span>本轮上下文</span><strong>{data.meter?.totalTokens == null ? '尚无读数' : `≈${compact(data.meter.totalTokens)}`}{data.contextCapacity ? ` / ${compact(data.contextCapacity)}` : ''}</strong><Icon name="arrow"/></button><MonitorResources data={data}/></>}
        </div>
        <div role="tabpanel" id={`${id}-panel-usage`} aria-labelledby={`${id}-tab-usage`} hidden={page !== 'usage'} tabIndex={0}>
          <div className="mon-filters"><input type="search" aria-label="搜索调用" placeholder="搜索模型或错误" value={query} onChange={event => { setQuery(event.target.value); setCursor(''); setCursors([]); setSelected(null); setPinned(null); pendingSelection.current = null; }}/><select aria-label="调用提供方" value={filters.provider} onChange={event => update('provider', event.target.value)}><option value="">全部提供方</option>{providerOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="调用模型" value={filters.model} onChange={event => update('model', event.target.value)}><option value="">全部模型</option>{models.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="调用组件" value={filters.kind} onChange={event => update('kind', event.target.value)}><option value="">全部组件</option>{kinds.map(value => <option key={value} value={value}>{kindLabel(value)}</option>)}</select><select aria-label="调用状态" value={filters.status} onChange={event => update('status', event.target.value)}><option value="all">全部状态</option><option value="error">仅失败</option><option value="cancelled">已取消</option></select><button type="button" className="mon-link" onClick={reset}>重置筛选</button></div>
          {data && <><Summary metric={totals} usage/><Trend series={data.series}/><Distribution groups={data.groups}/></>}
          {(data || pinned) && <Calls data={data} selected={selected} pinned={pinned} openCalls={openCalls} setOpenCalls={setOpenCalls} selectedRef={selectedRef} cursor={cursor} cursors={cursors} navigate={navigate} onClear={() => { setPinned(null); setSelected(null); }}/>}<p className="mon-note">输入、输出以模型返回用量为准；缺少记录的调用保留为未返回。</p>
        </div>
        <div role="tabpanel" id={`${id}-panel-context`} aria-labelledby={`${id}-tab-context`} hidden={page !== 'context'} tabIndex={0}>{data && <MonitorContext data={data} onSelectCall={choose}/>}</div>
        {data?.coverage?.scope && <p className="mon-note">{data.coverage.scope}</p>}{data && <footer className="mon-footer"><span>{range === 'all' ? `${fmt(data.sessionCount)} 个会话` : '当前会话'} · {periods.find(([key]) => key === filters.period)?.[1]}</span><span>{error ? '读取失败 · ' : ''}{date(data.generatedAt)} 更新</span></footer>}
      </div>
    </div>;
  }
  return function Monitor(props) { return <MonitorPanel key={props.sessionId || ''} {...props}/>; };
}
