import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './style.css';

const api = async (path, value) => {
  const response = await fetch(`/trisoul-x/api${path}`, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const suffix = id => `?${id ? `session=${encodeURIComponent(id)}` : ''}`;
const fmt = n => Number(n || 0).toLocaleString();
const kindName = { main: '主执行', subagent: '子代理', background: '记忆与状态', surgeon: '上下文整理' };
const scopeName = { global: '全局', cross: '跨项目', project: '本项目' };
const projectLabel = p => p?.startsWith('session:') ? `会话 ${p.slice(-8)}` : p;

function MemoryScopeChip({ sessionId, useSessions }) {
  const [state, setState] = useState(null), [open, setOpen] = useState(false), [error, setError] = useState('');
  const current = useSessions(s => s.byId[sessionId]);
  const load = useCallback(async () => { try { setState(await api('/scope' + suffix(sessionId))); setError(''); } catch (e) { setError(e.message); } }, [sessionId]);
  useEffect(() => { void load(); setOpen(false); }, [load, current?.blank, current?.running]);
  const labels = { full: '完全版', project: '项目级', session: '会话级' };
  const pick = async scope => { setOpen(false); try { setState(await api('/scope' + suffix(sessionId), { scope })); setError(''); } catch (e) { setError(e.message); await load(); } };
  if (!state) return null;
  const locked = state.locked || current?.blank === false;
  const chip = <button type="button" className="tx-scope-chip" title={error || (locked ? '本会话已绑定记忆范围' : '选择新会话的记忆范围')} aria-label={'记忆范围：' + labels[state.scope]} aria-haspopup={locked ? undefined : 'menu'} aria-expanded={locked ? undefined : open} onClick={() => { if (!locked) { void load(); setOpen(!open); } }}><span>记忆</span><strong>{labels[state.scope]}</strong>{!locked && <span>▾</span>}</button>;
  return locked ? chip : <Menu open={open} anchor={chip} compact portal side="top" selectedId={state.scope} items={Object.entries(labels).map(([id, label]) => ({ id, label }))} onSelect={pick} onClose={() => setOpen(false)}/>;
}

function useSnapshot(id, visible = true, range = 'session') {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const key = `${id}:${range}`, current = useRef(key); current.current = key;
  const reload = useCallback(async () => {
    try { const next = await api(`/state${suffix(id)}&range=${range}`); if (current.current === key) { setData(next); setError(''); } }
    catch (e) { if (current.current === key) setError(e.message); }
  }, [id, range, key]);
  useEffect(() => {
    if (!visible) return;
    let active = true, timer;
    const tick = async () => { await reload(); if (active) timer = setTimeout(tick, 2500); };
    void tick(); return () => { active = false; clearTimeout(timer); };
  }, [reload, visible]);
  return { data, error, reload };
}

function RouteFields({ label, route, directory, onChange }) {
  return <fieldset className="tx-fieldset"><legend>{label}</legend><p className="tx-muted">留空时跟随当前对话的主模型。</p>
    <div className="tx-row"><label>提供方<select value={route.provider} onChange={e => onChange({ ...route, provider: e.target.value, model: '' })}><option value="">跟随主模型</option>{directory.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}</select></label>
      <label>模型<input list={`tx-models-${label}`} value={route.model} placeholder="跟随主模型" onChange={e => onChange({ ...route, model: e.target.value })}/><datalist id={`tx-models-${label}`}>{(directory.find(p => p.id === route.provider)?.models || []).map(m => <option key={m.id} value={m.id}/>)}</datalist></label></div>
    <label>温度<input type="number" min="0" max="2" step="0.1" value={route.temperature} onChange={e => onChange({ ...route, temperature: Number(e.target.value) })}/></label>
  </fieldset>;
}

function Settings() {
  const [config, setConfig] = useState(null), [directory, setDirectory] = useState([]), [status, setStatus] = useState('');
  const saved = useRef(null);
  useEffect(() => { api('/state').then(s => { saved.current = s.config; setConfig(s.config); setDirectory(s.directory); }).catch(e => setStatus(e.message)); }, []);
  if (!config) return <div className="tx-panel">{status || '正在读取设置…'}</div>;
  const save = async e => { e.preventDefault(); setStatus('正在保存…'); try { const patch = Object.fromEntries(Object.entries(config).filter(([key, value]) => key !== 'dataDir' && JSON.stringify(value) !== JSON.stringify(saved.current[key]))); const next = await api('/settings', patch); saved.current = next; setConfig(next); setStatus('已保存'); } catch (error) { setStatus(error.message); } };
  return <form className="tx-panel tx-settings" onSubmit={save}>
    <div className="tx-heading"><span className="tx-mark">x</span><div><h2>trisoul_x</h2><p className="tx-muted">主模型在 DSH 模型设置与对话选项中配置。</p></div></div>
    <RouteFields label="记忆与状态" route={config.background} directory={directory} onChange={background => setConfig({ ...config, background })}/>
    <RouteFields label="上下文整理" route={config.surgeon} directory={directory} onChange={surgeon => setConfig({ ...config, surgeon })}/>
    <fieldset className="tx-fieldset"><legend>新会话默认记忆范围</legend><p className="tx-muted">也可在对话输入区选择；开始对话后沿用已绑定的范围。</p><select aria-label="默认记忆范围" value={config.memoryScope} onChange={e => setConfig({ ...config, memoryScope: e.target.value })}>
      <option value="full">全局 + 跨项目 + 本项目</option><option value="project">仅本项目</option><option value="session">仅当前会话</option></select></fieldset>
    <fieldset className="tx-fieldset"><legend>画布与上下文</legend><div className="tx-row">{[
      ['stateEvery', '每批整理的消息数', 1, 1], ['minRegionTokens', '区间最小 Token 数', 1, 500],
      ['keepTailEvents', '保留最近消息数', 2, 1], ['surgeryCooldownSteps', '整理间隔步数', 0, 1],
      ['thresholdRatio', '窗口压力比例', 0.1, 0.05],
    ].map(([key, label, min, step]) => <label key={key}>{label}<input type="number" min={min} step={step} max={key === 'thresholdRatio' ? 0.95 : undefined} value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}</div></fieldset>
    <div className="tx-row"><Button type="submit">保存设置</Button><span role="status" className="tx-muted">{status}</span></div>
  </form>;
}

function ContextPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(); const { data, error, reload } = useSnapshot(sessionId, tab.visible);
  const [status, setStatus] = useState('');
  const context = data?.context;
  const compact = async () => { setStatus('正在整理…'); try { const r = await api(`/compact${suffix(sessionId)}`, {}); setStatus(r.changed ? '已整理，原文仍可回捞' : '目前没有适合整理的较早区间'); await reload(); } catch (e) { setStatus(e.message); } };
  return <div className="tx-panel"><h2>工作上下文</h2><p className="tx-muted">{data?.live ? `${kindName[data.live.kind]}正在更新…` : `已消化 ${fmt(context?.digestCount)} 个区间`}</p>
    {error && <p role="alert" className="tx-error">{error}</p>}
    <h3>任务与验证</h3>{data?.tasks?.length ? data.tasks.map((task, i) => <article className="tx-note" key={task.id || i}>
      <div className="tx-meta">{task.id} · {task.status === 'completed' ? '已完成' : '未完成'}</div><strong>{task.content}</strong>
      {task.anchor ? <p className="tx-muted">需求原文 [{task.sourceMessage}] · {task.sourceExcerpt}：{task.source}</p> : <p className="tx-muted">旧版任务尚未绑定原文锚点。{task.source && '原备注：' + task.source}</p>}
      {task.links?.length ? task.links.map(link => <div className="tx-evidence" key={link.id}>
        <div className="tx-meta">{link.id} · {link.kind === 'test' ? '测试' : '文字证据'}{link.kind === 'test' && ' · ' + (link.lastRun ? link.lastRun.timedOut ? 'TIMEOUT' : link.lastRun.pass ? 'PASS' : 'FAIL' : '尚未运行')}</div>
        {link.path && <div className="tx-path">{link.path}</div>}{link.cmd && <pre>{link.cmd}</pre>}
        {link.note && <p>{link.note}</p>}{link.reason && <p className="tx-muted">原因：{link.reason}</p>}
        {link.lastRun?.tail && <details><summary>实际运行输出</summary><pre>{link.lastRun.tail}</pre></details>}
      </div>) : <p className="tx-muted">尚未关联验证证据。</p>}
      {task.verification && <details><summary>旧版验证文字记录</summary><p>{task.verification.method}</p><p>{task.verification.result}</p></details>}
    </article>) : <p className="tx-muted">多步骤任务会在这里列出需求原文、进展与验证证据。</p>}
    <h3>约束与决定</h3>{context?.pins?.length ? <ul>{context.pins.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="tx-muted">随对话逐步积累。</p>}
    <h3>当前状态</h3><div className="tx-prose">{context?.status || '尚未形成状态记录。'}</div>
    {context?.notes?.length > 0 && <><h3>工作笔记</h3>{context.notes.map((note, i) => <div className="tx-note" key={i}>{note.text}</div>)}</>}
    {context?.checkpoint && <><h3>工作纪要</h3><div className="tx-prose">{context.checkpoint.text}</div></>}
    <div className="tx-footer"><Button onClick={compact} disabled={data?.running !== 'idle' || status === '正在整理…'}>整理较早上下文</Button><p role="status" className="tx-muted">{status}</p></div>
  </div>;
}

function MemoryPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [data, setData] = useState({ items: [], projects: [], trace: [] }), [edit, setEdit] = useState(null), [error, setError] = useState('');
  const [view, setView] = useState('session'), [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [project, setProject] = useState('');
  const [history, setHistory] = useState(false), [touched, setTouched] = useState(false), [selected, setSelected] = useState([]);
  const load = useCallback(async () => { try { setData(await api('/memories' + suffix(sessionId) + '&view=' + view)); setError(''); } catch (e) { setError(e.message); } }, [sessionId, view]);
  useEffect(() => {
    if (!tab.visible) return;
    let active = true, timer;
    const tick = async () => { await load(); if (active) timer = setTimeout(tick, 2500); };
    void tick(); return () => { active = false; clearTimeout(timer); };
  }, [load, tab.visible]);
  const save = async e => { e.preventDefault(); try { await api('/memories' + suffix(sessionId), { ...edit, op: edit.id ? 'update' : 'add', target: edit.id || '', project: edit.project || data.scope.project }); setEdit(null); await load(); } catch (e) { setError(e.message); } };
  const change = async (op, ids) => { try { for (const id of ids) await api('/memories' + suffix(sessionId), { op, target: id, text: '用户在记忆面板删除' }); setSelected([]); await load(); } catch (e) { setError(e.message); await load(); } };
  const visible = data.items.filter(m => (history || (!m.retired && !m.supersededBy)) && (!touched || m.touched) && (scope === 'all' || m.scope === scope) && (!project || m.project === project) && (!query || [m.text, m.key, m.project].join(' ').toLowerCase().includes(query.toLowerCase())));
  const active = data.items.filter(m => !m.retired && !m.supersededBy);
  return <div className="tx-panel"><h2>记忆</h2><p className="tx-muted">有效 {active.length} · 当前可见 {active.filter(m => m.visible).length} · 本会话使用 {data.items.filter(m => m.touched).length}</p>
    <div className="tx-row"><Button disabled={!data.scope} onClick={() => setEdit({ scope: 'project', project: data.scope.project, key: 'note.' + Date.now(), text: '' })}>新增记忆</Button><Button variant="outline" onClick={load}>刷新</Button></div>
    <div className="tx-row"><label>查看范围<select value={view} onChange={e => { setView(e.target.value); setSelected([]); }}><option value="session">本会话可用</option><option value="all">整个记忆库</option></select></label><label>层级<select value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部层级</option>{Object.entries(scopeName).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>
    {view === 'all' && <label>项目<select value={project} onChange={e => setProject(e.target.value)}><option value="">全部项目</option>{data.projects.map(p => <option key={p} value={p}>{projectLabel(p)}</option>)}</select></label>}
    <input aria-label="搜索记忆" placeholder="搜索内容、名称或项目…" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="tx-row"><label className="tx-check"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)}/>含已删除和旧版本</label><label className="tx-check"><input type="checkbox" checked={touched} onChange={e => setTouched(e.target.checked)}/>仅本会话使用过</label></div>
    {selected.length > 0 && <div className="tx-row"><span>已选 {selected.length} 条</span><Button size="sm" onClick={() => change('retire', selected)}>批量删除</Button><Button size="sm" variant="outline" onClick={() => change('restore', selected)}>批量恢复</Button></div>}
    {error && <p className="tx-error" role="alert">{error}</p>}
    {edit && <form className="tx-fieldset" onSubmit={save}><label>层级<select value={edit.scope} onChange={e => setEdit({ ...edit, scope: e.target.value })}>{Object.entries(scopeName).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>
      {edit.scope === 'project' && (edit.project?.startsWith('session:') ? <p className="tx-muted">所属：{edit.project === data.scope.project ? '当前会话' : projectLabel(edit.project)}</p> : <label>所属项目<input value={edit.project || ''} required onChange={e => setEdit({ ...edit, project: e.target.value })}/></label>)}
      <label>名称<input value={edit.key} required onChange={e => setEdit({ ...edit, key: e.target.value })}/></label><label>内容<textarea value={edit.text} required rows="5" onChange={e => setEdit({ ...edit, text: e.target.value })}/></label>
      <div className="tx-row"><Button type="submit">保存</Button><Button type="button" variant="outline" onClick={() => setEdit(null)}>取消</Button></div></form>}
    {!visible.length && <p className="tx-muted">没有符合当前条件的记忆。</p>}
    {visible.map(m => <article key={m.id} className={'tx-note' + (m.retired || m.supersededBy ? ' tx-history' : '')}>
      <div className="tx-row"><input className="tx-select" type="checkbox" aria-label={'选择 ' + m.key} checked={selected.includes(m.id)} onChange={e => setSelected(e.target.checked ? [...selected, m.id] : selected.filter(id => id !== m.id))}/><div className="tx-meta">{m.project?.startsWith('session:') ? '会话' : scopeName[m.scope]} · {m.key}{m.retired ? ' · 已删除' : m.supersededBy ? ' · 旧版本' : ''}</div></div><p>{m.text}</p>
      <div className="tx-meta">来源 {m.source === 'user' ? '手动' : '记忆中枢'} · {new Date(m.at).toLocaleString()} · 注入 {m.usage?.injected || 0} · 召回 {m.usage?.recalled || 0}</div>
      {m.project && <div className="tx-meta tx-path">{m.project === data.scope.project && m.project.startsWith('session:') ? '当前会话' : projectLabel(m.project)}</div>}
      {!m.retired && !m.supersededBy ? <div className="tx-row"><Button variant="ghost" size="sm" onClick={() => setEdit(m)}>编辑</Button><Button variant="ghost" size="sm" onClick={() => change('retire', [m.id])}>删除</Button></div> : <Button variant="ghost" size="sm" onClick={() => change('restore', [m.id])}>恢复此版本</Button>}
    </article>)}
    <details className="tx-footer"><summary>本会话的注入与召回记录</summary>{data.trace.slice().reverse().map((e, i) => <div className="tx-activity" key={i}>{new Date(e.at).toLocaleTimeString()} · {({ injections: '注入', recalls: '召回', rawRecalls: '回捞原文', digests: '消化', digestErrors: '消化失败', surgeries: '上下文整理', surgeryErrors: '整理失败' })[e.name] || e.name}{e.items !== undefined ? ' · ' + e.items + ' 条' : ''}{e.query && <p>{e.query}</p>}{e.error && <p className="tx-error">{e.error}</p>}</div>)}</details>
  </div>;
}

function Monitor({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [range, setRange] = useState('session'), [stage, setStage] = useState('all'), [failures, setFailures] = useState(false);
  const { data, error } = useSnapshot(sessionId, tab.visible, range);
  const activity = (data?.activity || []).filter(a => (stage === 'all' || a.kind === stage) && (!failures || a.error));
  const actions = data?.actions || {};
  const input = usage => (usage?.inputTokens || 0) + (usage?.cacheReadTokens || 0) + (usage?.cacheWriteTokens || 0);
  const live = data?.liveCalls || [];
  return <div className="tx-panel"><h2>执行监控</h2>
    <label>统计范围<select value={range} onChange={e => setRange(e.target.value)}><option value="session">当前会话与子代理</option><option value="all">全部会话</option></select></label>
    <p className="tx-muted">{fmt(data?.sessionCount)} 个会话 · 当前对话 {({ idle: '空闲', running: '执行中', busy: '执行中' })[data?.running] || data?.running || '空闲'}</p>
    {error && <p className="tx-error" role="alert">{error}</p>}
    <div className="tx-metrics">{Object.entries(kindName).map(([kind, label]) => {
      const m = data?.metrics?.[kind] || {}, last = data?.activity?.find(a => a.kind === kind), active = live.find(a => a.kind === kind);
      return <section className="tx-metric" key={kind}><h3>{label}{active && <span className="tx-live"> · 运行中</span>}</h3>
        <strong>{fmt(m.calls)} <small>次调用</small></strong><dl>
          <dt>输入 / 输出</dt><dd>{fmt(input(m))} / {fmt(m.outputTokens)}</dd><dt>缓存命中</dt><dd>{input(m) ? `${((m.cacheReadTokens || 0) / input(m) * 100).toFixed(1)}%` : '—'}</dd>
          <dt>推理 Token</dt><dd>{m.reasoningTokens == null ? '—' : fmt(m.reasoningTokens)}</dd><dt>峰值输入</dt><dd>{fmt(m.peakContext)}</dd>
          <dt>累计耗时</dt><dd>{m.durationMs ? `${(m.durationMs / 1000).toFixed(1)} s` : '—'}</dd><dt>失败</dt><dd>{fmt(m.errors)}</dd>
        </dl><p className="tx-meta tx-path">{active ? `${active.provider} / ${active.model}` : last ? `${last.provider} / ${last.model}` : '尚无调用'}</p>
        {m.unmetered > 0 && <p className="tx-meta">{m.unmetered} 次调用未返回用量</p>}{last?.error && <p className="tx-error">{last.error}</p>}
      </section>;
    })}</div>
    <h3>记忆与画布</h3><div className="tx-metric"><dl>
      <dt>记忆消化 / 失败</dt><dd>{fmt(actions.digests)} / {fmt(actions.digestErrors)}</dd><dt>记忆注入</dt><dd>{fmt(actions.injections)}</dd>
      <dt>召回 / 命中条数</dt><dd>{fmt(actions.recalls)} / {fmt(actions.recallHits)}</dd><dt>原文回捞</dt><dd>{fmt(actions.rawRecalls)}</dd>
      <dt>上下文整理 / 失败</dt><dd>{fmt(actions.surgeries)} / {fmt(actions.surgeryErrors)}</dd>
      <dt>整理后字符占比</dt><dd>{actions.compactInputChars ? `${(actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1)}%` : '—'}</dd>
    </dl></div>
    <h3>当前会话的上下文</h3><p className="tx-muted">{data?.meter ? `约 ${fmt(data.meter.totalTokens)} tokens · ${fmt(data.frame.length)} 条可见记录` : '继续一次对话后可查看上下文读数'}</p>
    <details><summary>上下文组成</summary>{data?.frame?.map(n => <div className="tx-frame" key={n.seq}><span>#{n.seq} {n.checkpoint ? '工作纪要' : n.kind}</span><span>{fmt(n.tokens)} tok</span></div>)}</details>
    <h3>最近调用</h3><div className="tx-row"><label>组件<select value={stage} onChange={e => setStage(e.target.value)}><option value="all">全部组件</option>{Object.entries(kindName).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="tx-check"><input type="checkbox" checked={failures} onChange={e => setFailures(e.target.checked)}/>仅失败</label></div>
    {activity.map((a, i) => <details className={`tx-activity${a.error ? ' tx-error' : ''}`} key={i}><summary>{kindName[a.kind]} · {new Date(a.at).toLocaleTimeString()}{a.durationMs ? ` · ${(a.durationMs / 1000).toFixed(1)} s` : ''}{a.error ? ' · 失败' : ''}</summary>
      <p className="tx-meta tx-path">{a.provider} / {a.model}<br/>{a.sessionId}</p>
      <p className="tx-meta">输入 {fmt(input(a.usage))} · 输出 {fmt(a.usage?.outputTokens)} · 缓存读取 {fmt(a.usage?.cacheReadTokens)}{a.effort ? ` · 推理强度 ${a.effort}` : ''}</p>{a.error && <p>{a.error}</p>}
    </details>)}
    {!activity.length && <p className="tx-muted">没有符合条件的调用记录。</p>}
    <p className="tx-muted tx-footer">详细消息与工具往返可在 DSH 的“轨迹”中查看。Token 按提供方返回的用量统计。</p>
  </div>;
}

const Mark = ({ size = 26 }) => <span className="tx-mark" style={{ fontSize: size }}>x</span>;
export const inject = ['slots', 'sidebarRightTabs'];
export function apply(ctx) {
  ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.plugin = 'trisoul_x'; tag.textContent = css; document.head.appendChild(tag); return () => tag.remove(); });
  for (const [seat, Component] of [['sidebar.brand.mark', Mark], ['sidebar.brand.name', () => <strong>trisoul_x</strong>], ['conversation.hero.brand.mark', () => <Mark size={64}/>]]) ctx.slots.inject(seat, () => ctx.slots.register({ name: seat }, Component));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'trisoul-x', order: 16, label: () => 'trisoul_x' }, Settings));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'trisoul-memory-scope', order: 50 }, MemoryScopeChip));
  for (const [kind, title, description, Component] of [
    ['trisoul-x-context', '工作上下文', '任务与验证、约束和工作纪要', ContextPanel],
    ['trisoul-x-memory', '记忆', '查看与编辑分层记忆', MemoryPanel],
    ['trisoul-x-monitor', '执行监控', '调用、用量与后台作业', Monitor],
  ]) {
    const id = `trisoul_x/${kind}`;
    ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, title: () => title, guide: [{ order: 5, title: () => title, description: () => description, icon: Mark }] }));
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Component));
  }
}
