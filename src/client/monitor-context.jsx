import React, { useId, useState } from 'react';
import css from './monitor-context.css';

export const contextMonitorCss = css;

// Keep names and colours stable as categories appear, disappear and recur.
const categories = [
  { id: 'system', name: '系统', color: '#3978ed' },
  { id: 'user', name: '用户', color: '#739fec' },
  { id: 'model', name: '模型', color: '#a4c6f4' },
  { id: 'tool', name: '工具', color: '#5f93dc' },
  { id: 'tasks', name: '任务', color: '#8296c2' },
  { id: 'memory', name: '记忆', color: '#80b8d5' },
  { id: 'checkpoint', name: '纪要', color: '#b4cfeb' },
  { id: 'state', name: '状态', color: '#a2aaba' },
];
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const format = value => count(value) === null ? '未记录' : value.toLocaleString('zh-CN');
const compact = value => count(value) === null ? '—' : value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : format(value);
function category(node) {
  const kind = String(node.checkpoint ? 'checkpoint' : node.kind || 'system');
  const id = kind === 'checkpoint' ? 'checkpoint' : kind.includes('state') ? 'state' : kind.includes('memory') ? 'memory' : kind.includes('task') || kind.includes('todo') ? 'tasks' : kind === 'model' ? 'model' : kind === 'user' ? 'user' : kind.includes('tool') ? 'tool' : 'system';
  return categories.find(item => item.id === id);
}
function estimate(nodes) {
  if (!Array.isArray(nodes) || nodes.some(node => count(node.tokens) === null)) return null;
  return nodes.reduce((total, node) => total + node.tokens, 0);
}
function composition(nodes) {
  return categories.map(item => ({ ...item, tokens: (nodes || []).filter(node => category(node).id === item.id).reduce((total, node) => total + (count(node.tokens) ?? 0), 0) })).filter(item => item.tokens > 0);
}
function time(value) {
  if (value == null || !Number.isFinite(new Date(value).getTime())) return '';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
const frameLabel = frame => `第 ${frame.turn ?? '—'} 回合 · 第 ${frame.step ?? '—'} 步`;
function frameKey(frame, index) {
  const identity = frame.callId ?? frame.eventSeq ?? (frame.at != null ? `${frame.at}:${frame.turn ?? ''}:${frame.step ?? ''}` : `unidentified:${index}`);
  return `${frame.sessionId ?? ''}:${identity}`;
}
function associatedCall(frame, data) {
  const calls = Array.isArray(data?.activity) ? data.activity : Array.isArray(data?.calls) ? data.calls : [];
  const matches = calls.filter(call => {
    if (frame.sessionId && call.sessionId !== frame.sessionId) return false;
    if (frame.callId != null && frame.callId !== '') return call.callId === frame.callId || call.id === frame.callId;
    // Event sequence numbers are local to a session; a bare sequence is not a call identity.
    return Boolean(frame.sessionId) && frame.eventSeq != null && call.eventSeq === frame.eventSeq;
  });
  return matches.length === 1 ? matches[0] : null;
}
function Segments({ nodes, scale, label }) {
  return <span className="mon-context-segments" role="img" aria-label={label}>{(nodes || []).map((node, index) => {
    const tokens = count(node.tokens), item = category(node);
    return tokens > 0 ? <i key={`${node.seq ?? index}:${index}`} style={{ width: `${tokens / scale * 100}%`, background: item.color }} title={`#${node.seq ?? '—'} ${item.name} · 约 ${format(tokens)} Token`}/> : null;
  })}</span>;
}
function Legend({ items, amounts = false }) {
  return <div className="mon-context-legend">{items.map(item => <span key={item.id}><i style={{ background: item.color }}/>{item.name}{amounts && <b>{compact(item.tokens)}</b>}</span>)}</div>;
}
function Records({ nodes, label }) {
  const [filter, setFilter] = useState('all'), id = useId();
  const items = categories.filter(item => nodes.some(node => category(node).id === item.id));
  const effective = items.some(item => item.id === filter) ? filter : 'all';
  const shown = nodes.filter(node => effective === 'all' || category(node).id === effective);
  return <details className="mon-context-records"><summary>{label}<span>{nodes.length} 条</span></summary><div className="mon-context-records-body"><label className="mon-context-filter" htmlFor={id}>记录类型<select id={id} value={effective} onChange={event => setFilter(event.target.value)}><option value="all">全部类型</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="mon-context-record-table" role="table" aria-label={label}><div role="row" className="mon-context-record-head"><span role="columnheader">序号</span><span role="columnheader">类型</span><span role="columnheader">估算 Token</span></div>{shown.map((node, index) => <div role="row" key={`${node.seq ?? index}:${index}`}><span role="cell">#{node.seq ?? '—'}</span><span role="cell"><i style={{ background: category(node).color }}/>{category(node).name}</span><span role="cell">{count(node.tokens) === null ? '未记录' : `≈ ${format(node.tokens)}`}</span></div>)}</div>{!shown.length && <p className="mon-context-help">没有对应记录。</p>}</div></details>;
}
function Reading({ label, value, estimated = false, hint }) {
  return <div className="mon-context-reading"><span>{label}</span><strong>{estimated && value !== null ? '≈ ' : ''}{value === null ? '未记录' : compact(value)}</strong><small>{hint || (value === null ? '等待读数' : `${format(value)} Token`)}</small></div>;
}
function Difference({ previous, current }) {
  if (!previous) return null;
  const readings = [
    ['记录估算', estimate(current.nodes), estimate(previous.nodes)],
    ['实际输入', count(current.inputTokens), count(previous.inputTokens)],
    ['缓存读取', count(current.cacheReadTokens), count(previous.cacheReadTokens)],
  ].filter(([, next, before]) => next !== null && before !== null);
  if (!readings.length) return null;
  return <details className="mon-context-difference"><summary>与前一请求比较</summary><div>{readings.map(([label, next, before]) => <p key={label}><span>{label}</span><strong>{next === before ? '无变化' : `${next > before ? '+' : '−'}${format(Math.abs(next - before))}`}</strong></p>)}<small>仅比较读数；缓存变化不说明上下文整理的原因或效果。</small></div></details>;
}

export function MonitorContext({ data, onSelectCall }) {
  const [limit, setLimit] = useState('6'), [selected, setSelected] = useState(null), limitId = useId();
  const frames = Array.isArray(data?.contextHistory) ? data.contextHistory.slice(-80) : [];
  const nodes = Array.isArray(data?.frame) ? data.frame : [];
  const current = count(data?.meter?.totalTokens), capacity = count(data?.contextCapacity) > 0 ? data.contextCapacity : null;
  const currentRecords = estimate(Array.isArray(data?.frame) ? data.frame : null), currentComposition = composition(nodes);
  // Use the complete retained series for the scale, even when only six rows are visible.
  // Request pressure/totalTokens never rescales the per-record history estimates.
  const scale = Math.max(1, capacity ?? 0, ...frames.flatMap(frame => [estimate(frame.nodes) ?? 0, count(frame.inputTokens) ?? 0, count(frame.cacheReadTokens) ?? 0]));
  const indexed = frames.map((frame, index) => ({ frame, index, key: frameKey(frame, index) }));
  const chosen = indexed.find(row => row.key === selected) || indexed.at(-1);
  const visible = limit === 'all' ? indexed : indexed.slice(-Number(limit));
  const historicalCategories = categories.filter(item => frames.some(frame => composition(frame.nodes).some(value => value.id === item.id)));
  const call = chosen && associatedCall(chosen.frame, data), percent = current !== null && capacity !== null ? current / capacity * 100 : null;
  const currentScale = Math.max(1, currentRecords ?? 0, capacity ?? 0);
  const selectedVisible = !chosen || visible.some(row => row.key === chosen.key);

  return <div className="mon-context">
    <section className="mon-context-current" aria-label="当前上下文">
      <div className="mon-context-current-head"><div><h3>当前上下文</h3><div className="mon-context-number">{current === null ? '—' : compact(current)}<span>Token</span></div><p className="mon-context-help">瞬时估算 · {nodes.length} 条记录</p></div><div className="mon-context-capacity"><span>模型窗口</span><strong>{capacity === null ? '容量未知' : `${compact(capacity)} Token`}</strong>{percent !== null && <small className={percent > 100 ? 'mon-context-over' : ''}>约 {percent.toFixed(1)}%{percent > 100 ? ' · 超出窗口' : ''}</small>}</div></div>
      {nodes.length > 0 && <><div className="mon-context-current-track"><Segments nodes={nodes} scale={currentScale} label={`当前记录组成，估算 ${format(currentRecords)} Token`}/></div><Legend items={currentComposition} amounts/></>}
      <p className="mon-context-source">来源：宿主 Token Meter；当前估算包含请求封装，分类色块按记录估算{currentRecords === null ? '（有记录未返回估算）' : `（≈ ${format(currentRecords)} Token）`}。</p>
      {current === null && <p className="mon-context-help">尚无当前上下文读数，发出请求后即可查看。</p>}
      <p className="mon-context-help">这里显示当前上下文，累计输入与输出见「用量」。</p>
      {nodes.length > 0 && <Records nodes={nodes} label="当前逐条记录"/>}
    </section>

    <section className="mon-context-history" aria-label="上下文演变"><header className="mon-context-section-head"><div><h3>上下文演变</h3><p className="mon-context-help">逐请求记录 · 统一刻度 0–{compact(scale)} Token</p></div>{frames.length > 0 && <label className="mon-context-range" htmlFor={limitId}><span className="mon-context-sr-only">历史请求范围</span><select id={limitId} value={limit} onChange={event => setLimit(event.target.value)}><option value="6">最近 6 次</option><option value="20">最近 20 次</option><option value="all">全部 {frames.length} 次</option></select></label>}</header>
      {!frames.length ? <div className="mon-context-empty"><strong>等待下一次请求</strong><p>请求发出后，可以查看记录组成、实际输入和缓存的变化。</p></div> : <>
        <div className="mon-context-chart" aria-label="选择请求查看明细">{visible.map(({ frame, key }) => {
          const tokens = estimate(frame.nodes), input = count(frame.inputTokens), cache = count(frame.cacheReadTokens);
          const cacheWidth = (input === null ? cache ?? 0 : Math.min(cache ?? 0, input)) / scale * 100;
          return <button type="button" className={`mon-context-history-row${chosen?.key === key ? ' is-selected' : ''}`} aria-pressed={chosen?.key === key} key={key} onClick={() => setSelected(key)} title={`${frameLabel(frame)} · 记录估算 ${format(tokens)} · 实际输入 ${format(input)} · 缓存读取 ${format(cache)}`}>
            <span className="mon-context-request">{frame.turn ?? '—'}.{frame.step ?? '—'}</span><span className="mon-context-history-tracks"><span className="mon-context-history-track"><span className="mon-context-track-label">估算</span><Segments nodes={frame.nodes} scale={scale} label={`记录估算 ${format(tokens)} Token`}/><span className="mon-context-track-value">{tokens === null ? '未记录' : `≈ ${compact(tokens)}`}</span></span><span className="mon-context-history-track"><span className="mon-context-track-label">实际</span><span className={`mon-context-actual-track${input === null ? ' is-unknown' : ''}`}><i style={{ width: `${(input ?? 0) / scale * 100}%` }}/><b style={{ width: `${cacheWidth}%` }}/></span><span className="mon-context-track-value">{input === null ? '未记录' : compact(input)}</span></span></span>
          </button>;
        })}</div>
        <div className="mon-context-chart-key"><span><i className="is-estimate"/>色块：记录估算</span><span><i className="is-input"/>细轨：实际输入</span><span><i className="is-cache"/>蓝色：缓存读取</span></div><Legend items={historicalCategories}/>
        <p className="mon-context-source">实际输入与缓存来自提供方用量回执。未记录不同于 0；历史估算来自请求发出时的记录快照。</p>
        {chosen && <div className="mon-context-selected"><header className="mon-context-section-head"><div><h4>{frameLabel(chosen.frame)}</h4><small>{time(chosen.frame.at)}{!selectedVisible ? ' · 所选请求位于当前范围外' : ''}</small></div>{call && typeof onSelectCall === 'function' && <button type="button" className="mon-context-link" onClick={() => onSelectCall(call)}>查看对应调用 <span aria-hidden="true">↗</span></button>}</header><div className="mon-context-readings"><Reading label="记录估算" value={estimate(chosen.frame.nodes)} estimated/><Reading label="实际输入" value={count(chosen.frame.inputTokens)}/><Reading label="缓存读取" value={count(chosen.frame.cacheReadTokens)}/></div><Difference current={chosen.frame} previous={frames[chosen.index - 1]}/>{Array.isArray(chosen.frame.nodes) && <Records key={chosen.key} nodes={chosen.frame.nodes} label="所选请求逐条记录"/>}</div>}
      </>}
    </section>
  </div>;
}
