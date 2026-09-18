import { createPoller } from './polling.mjs';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { frameTokens, contextHistoryLayout } from './context-history.mjs';
import css from './style.css';
import shellCss from './shell.css';
import { ComputerIcon } from '#opencu/src/client/computer-icons.jsx';
import { applyComputerUseClient } from '#opencu/client-source';
import { BrandMark } from './brand.jsx';
import { BrandNameWithVersion } from './version-info.jsx';
import versionCss from './version-info.css';
import { whaleCss, whaleSvg } from './brand.mjs';
import { createContextUI } from './context-client.mjs';

export { CONTEXT_UI_VERSION as contextUIVersion } from './context-client.mjs';
const { ContextSettings, ScopeChip, wrapWorkbench, applyStyle } = createContextUI(React);

const api = async (path, value, signal) => {
  const response = await fetch(`/trisoul-x/api${path}`, value === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const suffix = id => `?${id ? `session=${encodeURIComponent(id)}` : ''}`;
const fmt = n => Number(n || 0).toLocaleString();
const kindName = { main: '主执行', subagent: '子代理', compactFull: '全量压缩', prepare: '上下文预处理', coordinate: '上下文替换', background: '记忆消化', recall: '记忆检索', state: '状态提炼', curation: '记忆整理', surgeon: '上下文整理（历史）', probeAsk: '探针出题（历史）', probeAnswer: '探针作答（历史）' };
const componentEntries = kinds => [...new Set(kinds)].map(kind => [kind, kindName[kind] || kind]);
function BetterTodoChip({ sessionId, useSessionStatus }) {
  const [state, setState] = useState(null), [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState(false), dialog = useRef(null), noticeId = useId();
  const running = useSessionStatus(s => s.get(sessionId)?.running), active = useRef(sessionId), revision = useRef(0), writing = useRef(null); active.current = sessionId;
  const load = useCallback(async () => {
    if (writing.current?.sessionId === sessionId) return;
    const ticket = ++revision.current;
    try { const next = await api('/better-todo' + suffix(sessionId)); if (active.current === sessionId && revision.current === ticket) { setState({ sessionId, ...next }); setError(''); } }
    catch (e) { if (active.current === sessionId && revision.current === ticket) setError(e.message); }
  }, [sessionId]);
  useEffect(() => { setOpen(false); setSaving(false); setError(''); setNotice(false); }, [sessionId]);
  useEffect(() => { if (notice && !dialog.current?.open) dialog.current?.showModal(); else if (!notice) dialog.current?.close(); }, [notice]);
  useEffect(() => { void load(); }, [load, running]);
  const ready = state?.sessionId === sessionId;
  const toggle = async key => {
    if (!ready || saving) return;
    const write = { sessionId }; writing.current = write; ++revision.current;
    setSaving(true); setError('');
    try {
      const next = await api('/better-todo' + suffix(sessionId), { [key]: !state[key] });
      if (active.current === sessionId) {
        setState({ sessionId, ...next });
        if (key === 'verification' && !state.verification && next.verification) { setOpen(false); setNotice(true); }
      }
    } catch (e) { if (active.current === sessionId) setError(e.message); }
    finally { if (writing.current === write) writing.current = null; if (active.current === sessionId) setSaving(false); }
  };
  const chip = <button type="button" className={cx('tx-scope-chip', 'tx-bt-chip', ready && !state.todo && !state.verification && 'tx-bt-off')} aria-label="BT · Better Todo" aria-haspopup="menu" aria-expanded={open} title="Better Todo · 收尾提醒" onClick={() => { void load(); setOpen(!open); }}><strong>BT</strong><span>▾</span></button>;
  const items = [{ type: 'label', id: 'title', text: 'Better Todo' }, ...[
    ['todo', '待办完成提醒', '仍有未完成待办时提醒继续'],
    ['verification', '验证完成提醒', '缺少验证证据时提醒，含文字证据复核'],
  ].map(([id, label, hint]) => ({ id, disabled: !ready || saving, label: <span className="tx-bt-option"><span><strong>{label}</strong><small>{hint}</small></span><span className="tx-bt-state"><small>{ready ? state[id] ? '开' : '关' : '…'}</small><i className={cx('tx-bt-toggle', ready && state[id] && 'tx-on')} aria-hidden="true"/></span></span> }))];
  return <><Menu open={open} anchor={chip} items={items} footer={[{ type: 'label', id: 'status', text: error || '仅本会话 · 可随时更改' }]} onSelect={toggle} onClose={() => setOpen(false)} portal side="top" align="end" compact autoFocus/>
    <dialog ref={dialog} className="tx-bt-notice" aria-labelledby={noticeId} aria-describedby={noticeId+'-body'} onCancel={()=>setNotice(false)} onClose={()=>setNotice(false)}>
      <h2 id={noticeId}>验证完成提醒</h2><p id={noticeId+'-body'}>此选项将会带来更高的任务完成率，同时也会消耗更多时间和 token。</p>
      <div><button type="button" autoFocus onClick={()=>setNotice(false)}>知道了</button></div>
    </dialog></>;
}

function useSnapshot(id, visible = true, range = 'session', view = 'full') {
  const [snapshot, setSnapshot] = useState(null), poller = useRef(null);
  const key = `${id}:${range}:${view}`;
  useEffect(() => {
    if (!visible) return;
    const observer = createPoller({
      read: signal => api(`/state${suffix(id)}&range=${range}&view=${view}`, undefined, signal),
      onData: data => setSnapshot({ key, data, error: '' }),
      onError: error => setSnapshot(old => ({ key, data: old?.key === key ? old.data : null, error: error.message })),
    });
    poller.current = observer; observer.start();
    return () => { observer.stop(); if (poller.current === observer) poller.current = null; };
  }, [id, visible, range, view, key]);
  const reload = useCallback(() => poller.current?.refresh(), []);
  return { data: snapshot?.key === key ? snapshot.data : null, error: snapshot?.key === key ? snapshot.error : '', reload };
}


const compactNumber = n => Number(n || 0) >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : Number(n || 0) >= 1000 ? (n / 1000).toFixed(1) + 'k' : fmt(n);
const duration = ms => !ms ? '—' : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
const shortDate = at => at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const inputTokens = m => (m?.inputTokens || 0) + (m?.cacheReadTokens || 0) + (m?.cacheWriteTokens || 0);
const cx = (...parts) => parts.filter(Boolean).join(' ');
function Icon({ name, size = 16 }) {
  const paths = {
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6', memory: 'M8 3h8l4 4v10l-4 4H8l-4-4V7l4-4ZM9 8h6v8H9z',
    context: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5', monitor: 'M3 17h4l3-10 4 14 3-10h4',
    search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', plus: 'M12 5v14M5 12h14',
    arrow: 'M14 5l-7 7 7 7', check: 'M5 12l4 4L19 6', close: 'M6 6l12 12M6 18L18 6',
    filter: 'M4 7h16M7 12h10M10 17h4', pin: 'M9 3h6l-1 5 4 4v2H6v-2l4-4-1-5ZM12 14v7',
    refresh: 'M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16A7 7 0 0 1 7 19l-3-3',
    chevron: 'M9 5l7 7-7 7', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    edit: 'M15 5l4 4M4 20l5-1L20 8l-4-4L5 15l-1 5Z', layers: 'M12 3l10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.context}/></svg>;
}
function Action({ children, icon, primary, quiet, className, ...props }) {
  return <button type="button" className={cx('tx-button', primary && 'tx-primary', quiet && 'tx-quiet', !children && 'tx-icon-button', className)} {...props}>{icon && <Icon name={icon}/>} {children}</button>;
}
function Tabs({ value, onChange, items, label }) {
  return <div className="tx-tabs" role="tablist" aria-label={label}>{items.map(([id, title, count]) => <button type="button" role="tab" aria-selected={value === id} key={id} onClick={() => onChange(id)}>{title}{count != null && <span>{count}</span>}</button>)}</div>;
}
function Segments({ value, onChange, items, label }) {
  return <div className="tx-segments" role="group" aria-label={label}>{items.map(([id, title]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{title}</button>)}</div>;
}
function Header({ icon, title, subtitle, actions }) {
  return <header className="tx-page-head"><div className="tx-title-line"><span className="tx-page-icon"><Icon name={icon} size={20}/></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{actions && <div className="tx-head-actions">{actions}</div>}</header>;
}
function Empty({ icon = 'layers', title, children }) { return <div className="tx-empty"><span><Icon name={icon} size={24}/></span><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
function Badge({ children, tone }) { return <span className={cx('tx-badge', tone && 'tx-' + tone)}>{children}</span>; }
function Alert({ children, error }) { return children ? <div className={cx('tx-alert', error && 'tx-alert-error')} role={error ? 'alert' : 'status'}>{children}</div> : null; }
function Fold({ title, subtitle, children, count, open = false }) {
  return <details className="tx-fold" open={open || undefined}><summary><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>{count != null && <Badge>{count}</Badge>}<Icon name="chevron"/></summary><div className="tx-fold-body">{children}</div></details>;
}
function Evidence({ link }) {
  const verdict = link.kind === 'test' ? link.lastRun ? link.lastRun.timedOut ? '超时' : link.lastRun.pass ? '通过' : '未通过' : '未运行' : '文字证据';
  return <div className="tx-evidence"><div className="tx-row-between"><strong>{link.path || (link.kind === 'test' ? '测试验证' : '文字记录')}</strong><Badge tone={link.lastRun?.pass ? 'good' : link.lastRun ? 'warn' : undefined}>{verdict}</Badge></div>
    {link.cmd && <pre>{link.cmd}</pre>}{link.note && <p className="tx-prose">{link.note}</p>}{link.reason && <p className="tx-help">原因：{link.reason}</p>}
    {link.lastRun?.tail && <details className="tx-subfold"><summary>查看运行输出</summary><pre>{link.lastRun.tail}</pre></details>}
  </div>;
}
function ContextPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), { data, error, reload } = useSnapshot(sessionId, tab.visible);
  const [page, setPage] = useState('tasks'), [status, setStatus] = useState(''), [compacting, setCompacting] = useState(false), [failed, setFailed] = useState(false);
  const context = data?.context, tasks = data?.tasks || [], done = tasks.filter(t => t.status === 'completed').length;
  const compact = async () => { setCompacting(true); setStatus(''); setFailed(false); try { const r = await api('/compact' + suffix(sessionId), {}); setStatus(r.changed ? '已整理较早上下文，原文仍可回捞。' : '目前没有适合整理的较早内容。'); await reload(); } catch (e) { setFailed(true); setStatus(e.message); } finally { setCompacting(false); } };
  return <div className="tx-app"><Header icon="context" title="工作上下文" subtitle="任务与验收；旧状态及旧记忆仅作历史查阅" actions={<Action quiet icon={compacting ? 'clock' : 'layers'} disabled={data?.running !== 'idle' || compacting} onClick={compact}>{compacting ? '整理中' : '整理'}</Action>}/>
    <div className="tx-context-summary"><div><span className="tx-status-dot"/><span>{data?.running !== 'idle' && data?.running ? '正在执行' : tasks.length && done === tasks.length ? '任务已完成' : tasks.length ? '任务待继续' : '等待新任务'}</span></div>{tasks.length > 0 && <span><strong>{done}</strong> / {tasks.length} 完成</span>}</div>
    {tasks.length > 0 && <div className="tx-progress" role="progressbar" aria-label="任务完成进度" aria-valuenow={done} aria-valuemin={0} aria-valuemax={tasks.length}><i style={{ width: `${done / tasks.length * 100}%` }}/></div>}
    <Tabs label="上下文分类" value={page} onChange={setPage} items={[[ 'tasks', '任务', tasks.length || undefined ], [ 'state', '工作状态' ], [ 'memory', '记忆文档' ]]}/>
    <div className="tx-body"><Alert error>{error}</Alert><Alert error={failed}>{status}</Alert>
      {page === 'tasks' && <>{tasks.length ? <div className="tx-task-list">{tasks.map((task, i) => <article className="tx-task" key={task.id || i}>
        <div className="tx-task-title"><span className={cx('tx-task-check', task.status === 'completed' && 'is-done')}>{task.status === 'completed' ? <Icon name="check" size={13}/> : <span/>}</span><strong>{task.content}</strong><span className="tx-task-id">{task.id}</span></div>
        <div className="tx-task-badges"><Badge tone={task.status === 'completed' ? 'good' : undefined}>{task.status === 'completed' ? '已完成' : '待完成'}</Badge>{task.links?.some(l => l.lastRun?.pass) ? <Badge tone="good">测试通过</Badge> : <Badge>{task.links?.length ? '已有证据' : '待验证'}</Badge>}</div>
        <details className="tx-task-detail"><summary>需求原文与验证 <Icon name="chevron" size={13}/></summary><div className="tx-quote">{task.source || '尚未绑定原文锚点'}{task.anchor && <small>消息 {task.sourceMessage} · 摘录 {task.sourceExcerpt}</small>}</div>
          {task.links?.length ? task.links.map(link => <Evidence key={link.id} link={link}/>) : <p className="tx-help">完成任务后，关联实际验证证据。</p>}
          {task.verification && <p className="tx-prose">{task.verification.method}<br/>{task.verification.result}</p>}
        </details>
      </article>)}</div> : <Empty icon="check" title="任务会在这里展开">多步骤工作开始后，可以查看需求、进展与验证结果。</Empty>}
      {data?.taskRelease?.total > 0 && <div className="tx-footnote">最近收尾 · {data.taskRelease.done}/{data.taskRelease.total} 完成 · 测试型 {data.taskRelease.tested} · 文字型 {data.taskRelease.textOnly}</div>}</>}
      {page === 'state' && <><section className="tx-section"><div className="tx-section-heading"><h3>当前状态</h3><Badge>{fmt(context?.digestCount)} 个已消化区间</Badge></div>{context?.status ? <div className="tx-prose tx-state-text">{context.status}</div> : <Empty icon="context" title="状态尚未形成">对话推进后，这里会更新计划、进度和结论。</Empty>}{context?.stateFailures > 0 && <Alert error>状态提炼连续失败 {context.stateFailures} 次。</Alert>}</section>
        <section className="tx-section"><div className="tx-section-heading"><h3>约束与决定</h3><Badge>{context?.pins?.length || 0}</Badge></div>{context?.pins?.length ? context.pins.map((pin, i) => <div className="tx-pin" key={i}><Icon name="pin"/><span>{pin}</span></div>) : <p className="tx-help">用户确定的约束和决定会保留在这里。</p>}</section>
        {context?.notes?.length > 0 && <Fold title="工作笔记" count={context.notes.length}>{context.notes.map((note, i) => <div className="tx-note-line" key={i}><p className="tx-prose">{note.text}</p><small>{shortDate(note.at)}</small></div>)}</Fold>}
      </>}
      {page === 'memory' && <><section className="tx-section"><div className="tx-section-heading"><h3>任务记忆文档</h3>{context?.workdocVersion > 0 && <Badge>v{context.workdocVersion}</Badge>}</div>{context?.workdoc ? <div className="tx-prose tx-document">{context.workdoc}</div> : <Empty icon="memory" title="还没有任务记忆">找到与当前工作相关的记忆后，会在这里汇集与更新。</Empty>}{context?.supplementPending > 0 && <p className="tx-help">另有 {context.supplementPending} 条记忆等待补入。</p>}</section>
        {context?.checkpoint && <Fold title="较早工作的纪要" subtitle={shortDate(context.checkpoint.at)}><div className="tx-prose tx-document">{context.checkpoint.text}</div></Fold>}
        {context?.probe && <Fold title="最近压缩检查" subtitle={context.probe.error ? '调用失败' : context.probe.ok ? '事实检查通过' : '发现遗漏，已记录补记'}><p>{context.probe.question}</p><div className="tx-detail-grid"><span>参考答案</span><strong>{context.probe.expected || '—'}</strong><span>实际回答</span><strong>{context.probe.got || '—'}</strong></div><Alert error>{context.probe.error}</Alert></Fold>}
        {context?.probeNotes?.length > 0 && <Fold title="待写入纪要的补记" count={context.probeNotes.length}>{context.probeNotes.map((line, i) => <div className="tx-note-line" key={i}>{line}</div>)}</Fold>}
      </>}
    </div>
  </div>;
}

const frameKind = kind => kind === 'checkpoint' ? '纪要' : kind.includes('state') ? '状态' : kind.includes('memory') ? '记忆' : kind.includes('task') || kind.includes('todo') ? '任务' : kind === 'model' ? '模型' : kind === 'user' ? '用户' : kind === 'tool' || kind.includes('tool') ? '工具' : '系统';
const frameColor = kind => ({ 纪要: '#3476e6', 状态: '#759be4', 记忆: '#82bfe4', 任务: '#8490bf', 模型: '#476fad', 用户: '#a0bcdf', 工具: '#669aaf', 系统: '#a2aaba' })[frameKind(kind)];
const callId = call => `${call.sessionId}:${call.kind}:${call.at}`;
function FrameBar({ nodes = [] }) {
  return <div className="tx-frame-bar">{nodes.map(n => <i key={n.seq} style={{ flex: n.tokens || 0, background: frameColor(n.kind) }} title={`#${n.seq} ${frameKind(n.kind)} · 约 ${fmt(n.tokens)} tokens`}/>)}</div>;
}
function FrameLegend() { return <div className="tx-legend">{['checkpoint', 'state', 'memory', 'tasks', 'model', 'user', 'tool', 'system'].map(kind => <span key={kind}><i style={{ background: frameColor(kind) }}/>{frameKind(kind)}</span>)}</div>; }
function ContextHistory({ data }) {
  const frames = data.contextHistory || [], [selected, setSelected] = useState(null);
  const selectedFrame = frames.find(f => f.at === selected) || frames.at(-1), rows = contextHistoryLayout(frames);
  if (!frames.length) return <Empty icon="layers" title="等待下一次请求">请求发出后，可以在这里查看上下文与缓存的变化。</Empty>;
  return <div className="tx-context-history"><div className="tx-section-heading"><h3>上下文演变</h3><span className="tx-muted">最近 {frames.length} 次请求</span></div><p className="tx-help">色块按记录估算，所有行共用刻度。下方细轨为实际输入，蓝色部分为缓存读取量。</p>
    <div className="tx-history-chart">{rows.map(({ frame, tokens, width, inputWidth, cacheWidth }, i) => <button key={frame.at + ':' + i} type="button" className={cx('tx-history-row', selectedFrame === frame && 'tx-selected')} onClick={() => setSelected(frame.at)} title={`第 ${frame.turn} 回合 · 第 ${frame.step} 步 · 记录估算 ${fmt(tokens)} tokens`}>
      <span>{frame.turn}.{frame.step}</span><div className="tx-history-scale"><div style={{ width: `${width}%` }}><FrameBar nodes={frame.nodes}/></div><div className="tx-history-usage"><i style={{ width: `${inputWidth}%` }}/><b style={{ width: `${cacheWidth}%` }}/></div></div><span>≈{compactNumber(tokens)}</span>
    </button>)}</div><FrameLegend/>
    {selectedFrame && <div className="tx-selected-frame"><Badge>第 {selectedFrame.turn} 回合 · 第 {selectedFrame.step} 步</Badge><div className="tx-detail-grid"><span>记录估算 Token</span><strong>≈{fmt(frameTokens(selectedFrame.nodes))}</strong><span>实际输入 Token</span><strong>{selectedFrame.inputTokens === undefined ? '未记录' : fmt(selectedFrame.inputTokens)}</strong><span>缓存读取 Token</span><strong>{fmt(selectedFrame.cacheReadTokens)}</strong></div></div>}
  </div>;
}
function Timeline({ calls, onSelect }) {
  const ordered = calls.slice().reverse();
  if (!ordered.length) return <Empty icon="monitor" title="等待第一次执行">开始对话后，各组件的调用会出现在这里。</Empty>;
  return <section className="tx-section"><div className="tx-section-heading"><h3>调用轨迹</h3><span className="tx-muted">从左到右 · 点击查看</span></div><div className="tx-timeline">
    {componentEntries(ordered.map(call => call.kind)).map(([kind, label]) => <div key={kind} className="tx-timeline-row"><span>{label}</span><div>{ordered.map((call, i) => call.kind === kind ? <button key={i} type="button" className={call.error ? 'tx-call-error' : 'tx-call'} onClick={() => onSelect(call)} aria-label={`${label} · ${shortDate(call.at)} · ${duration(call.durationMs)}`} title={`${label} · ${call.turn ?? '—'}.${call.step ?? '—'} · ${duration(call.durationMs)}${call.error ? ' · ' + call.error : ''}`}/> : <i key={i}/>)}</div></div>)}
  </div><div className="tx-legend"><span><i style={{ background: 'var(--tx-blue)' }}/>完成调用</span><span><i style={{ background: 'var(--tx-danger)' }}/>调用失败</span></div></section>;
}
function Monitor({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), [range, setRange] = useState('session'), [page, setPage] = useState('overview'), [stage, setStage] = useState('all'), [failures, setFailures] = useState(false), [selected, setSelected] = useState(null);
  const { data, error } = useSnapshot(sessionId, tab.visible, range), actions = data?.actions || {}, live = data?.liveCalls || [], metrics = data?.metrics || {};
  const totals = Object.values(metrics).reduce((out, m) => ({ calls: out.calls + (m.calls || 0), errors: out.errors + (m.errors || 0), input: out.input + inputTokens(m), output: out.output + (m.outputTokens || 0), cache: out.cache + (m.cacheReadTokens || 0), ms: out.ms + (m.durationMs || 0) }), { calls: 0, errors: 0, input: 0, output: 0, cache: 0, ms: 0 });
  const components = componentEntries((data?.activity || []).map(call => call.kind));
  const effectiveStage = components.some(([kind]) => kind === stage) ? stage : 'all';
  useEffect(() => { setStage('all'); setSelected(null); }, [sessionId, range]);
  const activity = (data?.activity || []).filter(a => (effectiveStage === 'all' || a.kind === effectiveStage) && (!failures || a.error));
  const choose = call => { setPage('calls'); setStage('all'); setFailures(false); setSelected(callId(call)); };
  const running = data?.running && data.running !== 'idle';
  return <div className="tx-app"><Header icon="monitor" title="执行监控" subtitle="看清每次调用与上下文变化"/>
    <div className="tx-monitor-top"><Segments label="监控统计范围" value={range} onChange={setRange} items={[[ 'session', '当前会话' ], [ 'all', '全部会话' ]]}/><div className={cx('tx-running-label', (running || live.length > 0) && 'is-running')}><span className="tx-status-dot"/>{running ? '执行中' : live.length ? '后台运行中' : '空闲'}</div></div>
    <Tabs label="监控分类" value={page} onChange={setPage} items={[[ 'overview', '概览' ], [ 'calls', '调用记录' ], [ 'context', '上下文' ]]}/>
    <div className="tx-body"><Alert error>{error}</Alert>
      {page === 'overview' && <><div className="tx-stats-grid">{[['总用量', compactNumber(totals.input + totals.output), 'tokens'], ['缓存命中', totals.input ? (totals.cache / totals.input * 100).toFixed(1) + '%' : '—', '输入缓存'], ['模型调用', fmt(totals.calls), `${totals.errors} 次失败`], ['累计用时', duration(totals.ms), '各组件合计']].map(([label, value, hint]) => <div className="tx-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
        {live.length > 0 && <div className="tx-live-list">{live.map((call, i) => <div key={i}><span className="tx-pulse"/><div><strong>{kindName[call.kind] || call.kind}</strong><small>{call.model}</small></div><span>{duration(Date.now() - call.startedAt)}</span></div>)}</div>}
        <Timeline calls={data?.activity || []} onSelect={choose}/>
        {Object.keys(metrics).length > 0 && <section className="tx-section"><div className="tx-section-heading"><h3>组件用量</h3><span className="tx-muted">调用 / Token</span></div>{componentEntries(Object.keys(metrics)).filter(([kind]) => metrics[kind]?.calls).map(([kind, label]) => { const m = metrics[kind], last = data?.activity?.find(a => a.kind === kind), total = inputTokens(m) + (m.outputTokens || 0); return <details className="tx-component" key={kind}><summary><span><i className={cx('tx-component-dot', m.errors > 0 && 'has-error')}/>{label}</span><span><strong>{fmt(m.calls)}</strong><small>{compactNumber(total)} tok</small><Icon name="chevron" size={13}/></span></summary><div className="tx-component-details"><div className="tx-detail-grid"><span>输入 / 输出</span><strong>{fmt(inputTokens(m))} / {fmt(m.outputTokens)}</strong><span>缓存命中</span><strong>{inputTokens(m) ? ((m.cacheReadTokens || 0) / inputTokens(m) * 100).toFixed(1) + '%' : '—'}</strong><span>推理 Token</span><strong>{m.reasoningTokens == null ? '—' : fmt(m.reasoningTokens)}</strong><span>峰值输入 / 累计用时</span><strong>{compactNumber(m.peakContext)} / {duration(m.durationMs)}</strong><span>失败</span><strong>{fmt(m.errors)}</strong></div>{last && <p className="tx-help tx-path">{last.provider} / {last.model}</p>}{m.unmetered > 0 && <p className="tx-help">{m.unmetered} 次调用未返回用量</p>}</div></details>; })}</section>}
        <Fold title="后台处理统计" subtitle="后台流程的累计执行结果"><div className="tx-detail-grid">{[['上下文预处理 / 失败', `${fmt(actions.preparedSegments)} / ${fmt(actions.contextprepareErrors)}`], ['上下文替换决策 / 失败', `${fmt(actions.contextDecisions)} / ${fmt(actions.contextcoordinateErrors)}`], ['记忆消化 / 失败', `${fmt(actions.digests)} / ${fmt(actions.digestErrors)}`], ['记忆整理 / 失败', `${fmt(actions.curations)} / ${fmt(actions.curationErrors)}`], ['注入 / 文档更新', `${fmt(actions.injections)} / ${fmt(actions.workdocVersions)}`], ['状态提炼 / 失败', `${fmt(actions.states)} / ${fmt(actions.stateErrors)}`], ['召回 / 命中条数', `${fmt(actions.recalls)} / ${fmt(actions.recallHits)}`], ['检索回退', fmt(actions.retrievalFallbacks)], ['压缩 / 失败', `${fmt(actions.surgeries)} / ${fmt(actions.surgeryErrors)}`], ['替换 / 决策 / 文档回查', `${fmt(actions.contextReplacements)} / ${fmt(actions.contextDecisions)} / ${fmt(actions.documentRecalls)}`], ['检查调用失败', fmt(actions.probeErrors)], ['原文回捞 / 旧快照清理', `${fmt(actions.rawRecalls)} / ${fmt(actions.staleVersions)}`], ['压缩后字符占比', actions.compactInputChars ? (actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1) + '%' : '—']].filter(([label, value]) => ['上下文预处理 / 失败', '上下文替换决策 / 失败', '替换 / 决策 / 文档回查'].includes(label) || /[1-9]/.test(value)).map(([label, value]) => <React.Fragment key={label}><span>{label}</span><strong>{value}</strong></React.Fragment>)}</div></Fold>
      </>}
      {page === 'calls' && <><div className="tx-call-filters"><label className="tx-field"><select aria-label="调用组件" value={effectiveStage} onChange={e => setStage(e.target.value)}><option value="all">全部组件</option>{components.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="tx-check"><input type="checkbox" checked={failures} onChange={e => setFailures(e.target.checked)}/>仅失败</label></div>
        {activity.length ? activity.map(call => <details key={callId(call)} className={cx('tx-call-row', call.error && 'tx-failed-call')} open={selected === callId(call) || undefined}><summary><span className="tx-call-icon"><Icon name={call.error ? 'close' : 'check'} size={14}/></span><div><strong>{kindName[call.kind] || call.kind}</strong><small>{shortDate(call.at)}{call.step != null ? ` · 第 ${call.step} 步` : ''}</small></div><span>{duration(call.durationMs)}</span><Icon name="chevron" size={13}/></summary><div className="tx-call-detail"><p className="tx-help tx-path">{call.provider} / {call.model}</p><div className="tx-detail-grid"><span>输入 / 输出</span><strong>{fmt(inputTokens(call.usage))} / {fmt(call.usage?.outputTokens)}</strong><span>缓存读取</span><strong>{fmt(call.usage?.cacheReadTokens)}</strong>{call.effort && <><span>推理强度</span><strong>{call.effort}</strong></>}</div><p className="tx-help tx-path">会话 {call.sessionId}</p><Alert error>{call.error}</Alert></div></details>) : <Empty icon="clock" title="这里还没有调用记录">{failures ? '当前筛选范围内没有失败调用。' : '模型调用完成后，会按时间列在这里。'}</Empty>}
        <p className="tx-footnote">完整消息与工具往返可在 DSH「轨迹」中查看。</p>
      </>}
      {page === 'context' && <>{data?.meter ? <section className="tx-section"><div className="tx-section-heading"><h3>当前会话</h3><Badge>{fmt(data.frame?.length)} 条记录</Badge></div><div className="tx-context-number">{compactNumber(data.meter.totalTokens)}<span>tokens</span></div><FrameBar nodes={(data.frame || []).map(n => ({ ...n, kind: n.checkpoint ? 'checkpoint' : n.kind }))}/><FrameLegend/><details className="tx-subfold"><summary>查看各条记录</summary>{data.frame?.map(n => <div className="tx-frame-row" key={n.seq}><span>#{n.seq} · {frameKind(n.checkpoint ? 'checkpoint' : n.kind)}</span><span>{compactNumber(n.tokens)} tok</span></div>)}</details></section> : <Empty icon="layers" title="尚无上下文读数">继续一次对话后即可查看。</Empty>}{data && <ContextHistory data={data}/>}</>}
    </div>
  </div>;
}
function StatsLine({ sessionId, onOpen }) {
  const { data } = useSnapshot(sessionId, Boolean(sessionId), 'session', 'summary');
  if (!data?.metrics?.main?.calls) return null;
  const m = data.metrics.main, total = inputTokens(m);
  return <button type="button" className="tx-stats-line" aria-label="查看运行统计" title={`上下文 ${fmt(data.meter?.totalTokens)} tokens · 缓存命中 ${total ? Math.round((m.cacheReadTokens || 0) / total * 100) : 0}% · 已替换 ${fmt(data.actions?.contextReplacements)} 次`} onClick={onOpen}><Icon name="layers" size={12}/><span>{compactNumber(data.meter?.totalTokens)} 上下文</span>{data.liveCalls?.length > 0 && <i className="tx-stats-running" aria-label="后台运行中"/>}</button>;
}
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight'];
export function apply(ctx) {
  const openPanel = section => ctx.sidebarRight.openTab('trisoul-x-workbench', { params: { section } });
  const sections = [
    ['tasks', '任务', 'context', ContextPanel],
    ['computer', '电脑', 'computer', props => <ComputerPane {...props}/>],
    ['monitor', '监控', 'monitor', Monitor],
  ];
  function BaseWorkbench({ initialSection = 'tasks', ...props }) {
    const { tab } = props.useTabInfo();
    const section = sections.some(([id]) => id === tab.navigation?.params?.section) ? tab.navigation.params.section : initialSection;
    return <div className="tx-workbench">
      <nav className="tx-workbench-nav" aria-label="工作台导航">
        {sections.map(([id, label, icon]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => tab.actions.openTab('trisoul-x-workbench', { params: { section: id }, replaceTab: tab.kind !== 'trisoul-x-workbench' })}>{icon === 'computer' ? <ComputerIcon size={15}/> : <Icon name={icon} size={15}/>}<span>{label}</span></button>)}
      </nav>
      {sections.map(([id, , , Component]) => <section key={id} className="tx-workbench-page" hidden={section !== id} aria-label={sections.find(([key]) => key === id)[1]}>
        <Component {...props} useTabInfo={() => { const info = props.useTabInfo(); return { ...info, tab: { ...info.tab, visible: info.tab.visible && section === id } }; }} conversation={ctx.get('conversation')}/>
      </section>)}
    </div>;
  }
  // Compose the active panels directly; no registration proxy or patched bundle.
  const workbenches = Object.fromEntries(['tasks', 'memory', 'computer', 'monitor'].map(initial =>
    [initial, wrapWorkbench(BaseWorkbench, initial)]));
  function Workbench({ initialSection = 'tasks', ...props }) {
    const Component = workbenches[initialSection] || workbenches.tasks;
    return <Component {...props}/>;
  }
  const { ComputerEntry, ComputerPane } = applyComputerUseClient(ctx, { integrated: true, openPanel, renderPane: props => <Workbench {...props} initialSection="computer"/> });
  function ComposerDock(props) {
    const running = props.useSessionStatus(s => Boolean(s.get(props.sessionId)?.running));
    const [usageOpen, setUsageOpen] = useState(true);
    useEffect(() => { setUsageOpen(true); }, [props.sessionId]);
    return <div className="tx-composer-dock" data-session-id={props.sessionId} data-omd-running={running ? '' : undefined} data-omd-usage-expanded={usageOpen ? '' : undefined}><div className="tx-composer-tools"><button type="button" className="tx-workbench-entry" aria-label="打开工作台" onClick={() => openPanel('tasks')}><Icon name="context" size={15}/><span>工作台</span></button><ComputerEntry {...props}/></div><button type="button" className="tx-usage-toggle" aria-label="用量详情" aria-expanded={usageOpen} onClick={() => setUsageOpen(value => !value)}><Icon name="monitor" size={14}/><span>用量</span><Icon name="chevron" size={12}/></button><StatsLine {...props} onOpen={() => openPanel('monitor')}/></div>;
  }
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'trisoul_x'; tag.textContent = css + '\n' + shellCss + '\n' + whaleCss + '\n' + versionCss; document.head.appendChild(tag);
    document.documentElement.classList.add('trisoul-shell');
    // DSH owns the session title; only replace its fixed product suffix.
    let hostTitle = document.title, brandedTitle;
    const updateTitle = () => {
      const title = document.title;
      if (title === 'DeepSeek Harness' || title.endsWith(' — DeepSeek Harness')) {
        hostTitle = title;
        brandedTitle = title.replace(/DeepSeek Harness$/, 'Oh My DSH');
        document.title = brandedTitle;
      }
    };
    const titleObserver = new MutationObserver(updateTitle);
    titleObserver.observe(document.querySelector('title'), { childList: true, subtree: true, characterData: true });
    updateTitle();
    const icon = document.createElement('link'); icon.rel = 'icon'; icon.type = 'image/svg+xml';
    icon.href = 'data:image/svg+xml,' + encodeURIComponent(whaleSvg('omd-favicon'));
    document.head.append(icon);
    return () => { titleObserver.disconnect(); if (document.title === brandedTitle) document.title = hostTitle; icon.remove(); tag.remove(); document.documentElement.classList.remove('trisoul-shell'); };
  });
  for (const [seat, Component] of [['sidebar.brand.mark', BrandMark], ['sidebar.brand.name', BrandNameWithVersion], ['conversation.hero.brand.mark', () => <BrandMark size={64}/>]]) ctx.slots.inject(seat, () => ctx.slots.register({ name: seat }, Component));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'trisoul-x', order: 16, label: () => 'Oh My DSH' }, ContextSettings));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'trisoul-x-tools', order: 25 }, ComposerDock));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'trisoul-memory-scope', order: 50 }, ScopeChip));
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'trisoul-better-todo', order: 100 }, BetterTodoChip));
  const workbenchId = 'trisoul_x/trisoul-x-workbench';
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: workbenchId, kind: 'trisoul-x-workbench', title: () => '工作台', guide: [{ order: 5, title: () => '工作台', description: () => '任务、记忆、电脑与运行监控', icon: props => <Icon name="context" {...props}/> }] }));
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: workbenchId }, Workbench));
  // Keep restored tabs and old links working; new navigation uses one workbench.
  for (const [kind, title, initialSection] of [
    ['trisoul-x-context', '工作上下文', 'tasks'],
    ['trisoul-x-memory', '记忆', 'memory'],
    ['trisoul-x-monitor', '执行监控', 'monitor'],
  ]) {
    const id = `trisoul_x/${kind}`;
    ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, title: () => title, guide: [] }));
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, props => <Workbench {...props} initialSection={initialSection}/>));
  }
  applyStyle(ctx);
}
