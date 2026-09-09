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
const kindName = { main: '主执行', subagent: '子代理', background: '记忆消化', recall: '记忆检索', state: '状态提炼', curation: '记忆整理', surgeon: '上下文整理', probeAsk: '探针出题', probeAnswer: '探针作答' };
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
    <label>推理强度<select value={route.effort || 'off'} onChange={e => onChange({ ...route, effort: e.target.value })}><option value="off">关闭（模型支持时）</option><option value="inherit">提供方默认</option></select></label>
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
    <fieldset className="tx-fieldset"><legend>后台模型</legend><select aria-label="后台模型配置方式" value={config.backgroundMode} onChange={e => setConfig({ ...config, backgroundMode: e.target.value })}><option value="unified">统一配置</option><option value="separate">分别配置</option></select></fieldset>
    {(config.backgroundMode === 'unified' ? [['unifiedBackground', '全部后台作业']] : [['background', '记忆消化、检索与整理'], ['canvas', '状态提炼与探针'], ['surgeon', '上下文整理']]).map(([key, label]) => <RouteFields key={key} label={label} route={config[key]} directory={directory} onChange={route => setConfig({ ...config, [key]: route })}/>)}
    <fieldset className="tx-fieldset"><legend>新会话默认记忆范围</legend><p className="tx-muted">也可在对话输入区选择；开始对话后沿用已绑定的范围。</p><select aria-label="默认记忆范围" value={config.memoryScope} onChange={e => setConfig({ ...config, memoryScope: e.target.value })}>
      <option value="full">全局 + 跨项目 + 本项目</option><option value="project">仅本项目</option><option value="session">仅当前会话</option></select></fieldset>
    <fieldset className="tx-fieldset"><legend>压缩频率</legend><p className="tx-muted">控制整理间隔、最小区间和状态更新频率。保存后下一步生效。</p>
      <div className="tx-row">{Object.entries({ always: [3, 10000, 6], medium: [6, 20000, 10], slow: [10, 40000, 15] }).map(([name, values]) => <Button key={name} type="button" variant={['surgeryCooldownSteps', 'minRegionTokens', 'stateEvery'].every((k, i) => config[k] === values[i]) ? undefined : 'outline'} onClick={() => setConfig({ ...config, surgeryCooldownSteps: values[0], minRegionTokens: values[1], stateEvery: values[2] })}>{({ always: '频繁', medium: '适中', slow: '较少' })[name]}</Button>)}</div>
      <div className="tx-row">{[['surgeryCooldownSteps', '整理间隔步数', 0], ['minRegionTokens', '区间最小 Token 数', 1], ['stateEvery', '每批状态事件数', 1]].map(([key, label, min]) => <label key={key}>{label}<input type="number" min={min} step="1" value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}</div>
    </fieldset>
    {[
      ['记忆消化', [['digestEvery', '每批消化事件数', 1], ['flushIdleMs', '空闲消化与轮巡间隔（毫秒，0 关闭）'], ['curateMinGapMs', '同一分片整理最短间隔（毫秒）'], ['curateEvery', '每几批消化轮巡一次（0 关闭）']]],
      ['记忆补注', [['injectLimit', '开场条目数（0 不限）'], ['injectBatch', '每次补注条目数', 1], ['injectMaxPerSession', '每会话注入次数（0 停止补注）'], ['injectPickTimeoutMs', '首次检索等待毫秒（0 立即排队）'], ['supplementMinSteps', '文档换代最短步数']]],
      ['上下文', [['keepTailEvents', '保留最近事件数', 2], ['minRegionEvents', '区间最少事件数', 1], ['thresholdRatio', '窗口压力比例', 0.1, 0.05, 0.95], ['surgeryFailCooldownSteps', '整理失败冷却步数'], ['shadowStale', '积累多少旧版快照后清理（0 关闭）']]],
      ['状态与探针', [['stateFailCooldownSteps', '状态提炼失败冷却步数'], ['stateFailLimit', '连续失败后暂停压缩（0 关闭）']]],
    ].map(([title, fields]) => <details key={title} className="tx-fieldset"><summary>{title}</summary><div className="tx-row">{fields.map(([key, label, min = 0, step = 1, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step={step} value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}</div>
      {title === '记忆补注' && <label>补注方式<select value={config.supplementMode} onChange={e => setConfig({ ...config, supplementMode: e.target.value })}><option value="renew">任务文档按版本追加</option><option value="rewrite">原位更新补注</option><option value="append">逐批追加补注</option></select></label>}
      {title === '上下文' && [['requireShorter', '整理后需比原材料短'], ['semanticCompaction', '按记忆消化结果整理'], ['mergeCheckpoints', '合并较早工作纪要'], ['userRetirement', '允许压缩较早用户消息']].map(([key, label]) => <label key={key} className="tx-check"><input type="checkbox" checked={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.checked })}/>{label}</label>)}
      {title === '状态与探针' && <>{[['stateEnabled', '提炼工作状态'], ['probeEnabled', '压缩后运行事实探针']].map(([key, label]) => <label key={key} className="tx-check"><input type="checkbox" checked={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.checked })}/>{label}</label>)}<label>探针遗漏事实的补记方式<select value={config.probePatch} onChange={e => setConfig({ ...config, probePatch: e.target.value })}><option value="ride">随下一次整理写入</option><option value="qa">立即补入问答</option><option value="material">立即补入参考材料</option></select></label></>}
    </details>)}
    <details className="tx-fieldset"><summary>可选批次与长度上限</summary><p className="tx-muted">以下长度、条目和输出上限设为 0 时不限制；超时设为 0 时不计时。</p><div className="tx-row">{[
      ['jobTimeoutMs', '后台作业超时（毫秒）'], ['digestBatchMax', '消化批次事件上限'], ['digestEventChars', '消化单事件字符上限'], ['digestMaxTokens', '消化输出 Token 上限'], ['catchupMax', '恢复会话补消化事件上限'], ['contextMemories', '消化记忆表条目上限'], ['recallMaxTokens', '检索输出 Token 上限'], ['curateLimit', '整理分片每轮条目上限'], ['curateOpsMax', '整理操作数上限'], ['curateMaxTokens', '整理输出 Token 上限'], ['stateBatchMax', '状态批次事件上限'], ['statePinnedMax', '固定约束条目上限'], ['stateEventChars', '状态单事件字符上限'], ['stateMaxTokens', '状态输出 Token 上限'], ['surgeonMaxTokens', '压缩输出 Token 上限'], ['probeSourceChars', '探针材料字符上限'], ['probeMaxTokens', '探针输出 Token 上限'], ['probePatchChars', '材料补记字符上限'],
    ].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="1" value={config[key]} onChange={e => setConfig({ ...config, [key]: Number(e.target.value) })}/></label>)}</div>
    <label>固定字符压力阈值（0 使用窗口比例）<input type="number" min="0" value={config.thresholdChars} onChange={e => setConfig({ ...config, thresholdChars: Number(e.target.value) })}/></label><label>窗口未知时的字符阈值<input type="number" min="0" value={config.thresholdFallbackChars} onChange={e => setConfig({ ...config, thresholdFallbackChars: Number(e.target.value) })}/></label></details>
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
    {data?.taskRelease?.total > 0 && <p className="tx-muted">最近收尾：{data.taskRelease.done}/{data.taskRelease.total} 完成 · 测试型 {data.taskRelease.tested} · 文字型 {data.taskRelease.textOnly}</p>}
    <h3>约束与决定</h3>{context?.pins?.length ? <ul>{context.pins.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="tx-muted">随对话逐步积累。</p>}
    <h3>当前状态</h3><div className="tx-prose">{context?.status || '尚未形成状态记录。'}</div>
    {context?.stateFailures > 0 && <p className="tx-error">状态提炼连续失败 {context.stateFailures} 次</p>}
    <h3>任务记忆文档</h3><p className="tx-muted">版本 {context?.workdocVersion || 0} · 待补注 {context?.supplementPending || 0} 条</p><div className="tx-prose">{context?.workdoc || '任务相关记忆会在这里汇集与更新。'}</div>
    {context?.probe && <details><summary>最近压缩探针 · {context.probe.error ? '作业失败' : context.probe.ok ? '通过' : '待补记'}</summary><p>{context.probe.question}</p><p>参考：{context.probe.expected} · 回答：{context.probe.got}</p>{context.probe.error && <p className="tx-error">{context.probe.error}</p>}</details>}
    {context?.probeNotes?.length > 0 && <details><summary>待写入纪要的补记（{context.probeNotes.length}）</summary>{context.probeNotes.map((line, i) => <p key={i}>{line}</p>)}</details>}
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
    <div className="tx-row"><Button disabled={!data.scope} onClick={() => setEdit({ scope: 'project', project: data.scope.project, key: 'note.' + Date.now(), text: '' })}>新增记忆</Button><Button variant="outline" onClick={load}>刷新</Button><Button variant="outline" disabled={!sessionId || data.scope?.mode === 'session'} onClick={async () => { try { await api('/curate' + suffix(sessionId), {}); await load(); } catch (e) { setError(e.message); } }}>整理记忆</Button></div>
    <div className="tx-row"><label>查看范围<select value={view} onChange={e => { setView(e.target.value); setSelected([]); }}><option value="session">本会话可用</option><option value="all">整个记忆库</option></select></label><label>层级<select value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部层级</option>{Object.entries(scopeName).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>
    {view === 'all' && <label>项目<select value={project} onChange={e => setProject(e.target.value)}><option value="">全部项目</option>{data.projects.map(p => <option key={p} value={p}>{projectLabel(p)}</option>)}</select></label>}
    {data.health && <details className="tx-fieldset"><summary>记忆库状态</summary><p className="tx-muted">有效 {data.health.active} · 已退役 {data.health.retired} · 旧版本 {data.health.versions} · 当前可见 {fmt(data.health.chars)} 字符 · 尚未使用 {data.health.unused} 条 · 跨项目候选 {data.health.promotionGroups} 组</p>{Object.entries(data.health.shards.lastAt).map(([shard, at]) => <p key={shard} className="tx-meta tx-path">{shard} · {new Date(at).toLocaleString()} · 游标 {data.health.shards.cursors[shard] || 0}</p>)}</details>}
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
      <div className="tx-meta">来源 {m.source === 'user' ? '手动' : m.source === 'curate' ? '记忆整理' : '记忆中枢'} · {new Date(m.at).toLocaleString()} · 注入 {m.usage?.injected || 0} · 召回 {m.usage?.recalled || 0}</div>
      {m.project && <div className="tx-meta tx-path">{m.project === data.scope.project && m.project.startsWith('session:') ? '当前会话' : projectLabel(m.project)}</div>}
      {!m.retired && !m.supersededBy ? <div className="tx-row"><Button variant="ghost" size="sm" onClick={() => setEdit(m)}>编辑</Button><Button variant="ghost" size="sm" onClick={() => change('retire', [m.id])}>删除</Button></div> : <div className="tx-row"><Button variant="ghost" size="sm" onClick={() => change('restore', [m.id])}>恢复此版本</Button><Button variant="ghost" size="sm" onClick={() => change('delete', [m.id])}>永久删除此版本</Button></div>}
    </article>)}
    <details className="tx-footer"><summary>本会话的注入与召回记录</summary>{data.trace.slice().reverse().map((e, i) => <div className="tx-activity" key={i}>{new Date(e.at).toLocaleTimeString()} · {({ injections: '注入', recalls: '召回', rawRecalls: '回捞原文', digests: '消化', digestErrors: '消化失败', surgeries: '上下文整理', surgeryErrors: '整理失败' })[e.name] || e.name}{e.items !== undefined ? ' · ' + e.items + ' 条' : ''}{e.query && <p>{e.query}</p>}{e.error && <p className="tx-error">{e.error}</p>}</div>)}</details>
  </div>;
}

const frameKind = kind => kind === 'checkpoint' ? '纪要' : kind.includes('state') ? '状态' : kind.includes('memory') ? '记忆' : kind.includes('task') || kind.includes('todo') ? '任务' : kind === 'model' ? '模型' : kind === 'user' ? '用户' : kind === 'tool' || kind.includes('tool') ? '工具' : '系统';
const frameColor = kind => ({ 纪要: '#6ba89c', 状态: '#8c9dcc', 记忆: '#bd9a75', 任务: '#b390ad', 模型: '#7393a6', 用户: '#b5a05a', 工具: '#9aa77a', 系统: '#94999f' })[frameKind(kind)];
function ContextHistory({ data }) {
  const frames = data.contextHistory || [], [selected, setSelected] = useState(null);
  const current = frames.find(f => f.at === selected) || frames.at(-1);
  const max = Math.max(1, ...frames.map(f => f.totalTokens));
  return <details className="tx-fieldset"><summary>上下文演变（{frames.length} 次请求）</summary>
    <p className="tx-muted">每行是一次模型请求；长度表示上下文大小，下方绿线表示提供方返回的缓存读取量。</p>
    <div className="tx-history-chart">{frames.map((frame, i) => <button key={frame.at + ':' + i} type="button" className={'tx-history-row' + (current === frame ? ' tx-selected' : '')} onClick={() => setSelected(frame.at)} title={`第 ${frame.turn} 回合 · 第 ${frame.step} 步 · ${fmt(frame.totalTokens)} tokens`}>
      <span>{frame.turn}.{frame.step}</span><div className="tx-history-scale"><div className="tx-history-bar" style={{ width: `${Math.max(0.2, frame.totalTokens / max * 100)}%` }}>{frame.nodes.map(n => <i key={n.seq} style={{ flex: n.tokens || 0.1, background: frameColor(n.kind) }} title={`#${n.seq} ${frameKind(n.kind)} · ${fmt(n.tokens)} tokens`}/>)}</div><div className="tx-cache-bar" style={{ width: `${Math.min(frame.totalTokens, frame.cacheReadTokens) / max * 100}%` }}/></div><span>{fmt(frame.totalTokens)}</span>
    </button>)}</div>
    <div className="tx-legend">{['checkpoint', 'state', 'memory', 'tasks', 'model', 'user', 'tool', 'system'].map(kind => <span key={kind}><i style={{ background: frameColor(kind) }}/>{frameKind(kind)}</span>)}</div>
    {current && <p className="tx-muted">已选第 {current.turn} 回合、第 {current.step} 步 · 上下文 {fmt(current.totalTokens)} tokens · 缓存读取 {fmt(current.cacheReadTokens)}</p>}
  </details>;
}
function Timeline({ data }) {
  const calls = (data.activity || []).slice().reverse();
  return <details className="tx-fieldset" open><summary>组件调用轨迹</summary><p className="tx-muted">从左到右按调用完成顺序排列；悬停可查看回合、步骤和耗时。</p><div className="tx-timeline">
    {Object.entries(kindName).filter(([kind]) => calls.some(c => c.kind === kind)).map(([kind, label]) => <div key={kind} className="tx-timeline-row"><span>{label}</span><div>{calls.map((call, i) => <i key={i} className={call.kind === kind ? call.error ? 'tx-call-error' : 'tx-call' : ''} title={call.kind === kind ? `${label} · ${call.turn ?? '—'}.${call.step ?? '—'} · ${new Date(call.at).toLocaleTimeString()} · ${(call.durationMs / 1000).toFixed(1)}s${call.error ? ' · ' + call.error : ''}` : undefined}/>)}</div></div>)}
  </div></details>;
}
function StatsLine({ sessionId }) {
  const { data } = useSnapshot(sessionId, Boolean(sessionId));
  if (!data?.metrics?.main?.calls) return null;
  const m = data.metrics.main, allInput = (m.inputTokens || 0) + (m.cacheReadTokens || 0) + (m.cacheWriteTokens || 0);
  return <div className="tx-stats-line" aria-label="trisoul_x 运行统计">上下文 {fmt(data.meter?.totalTokens)} tok · 主执行 {fmt(m.calls)} 次 · 缓存 {allInput ? Math.round((m.cacheReadTokens || 0) / allInput * 100) : 0}% · 整理 {fmt(data.actions?.surgeries)} 次{data.liveCalls?.length ? ' · 后台作业 ' + data.liveCalls.length : ''}</div>;
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
    {data && <Timeline data={data}/>}
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
      <dt>任务文档版本</dt><dd>{fmt(actions.workdocVersions)}</dd><dt>状态提炼 / 失败</dt><dd>{fmt(actions.states)} / {fmt(actions.stateErrors)}</dd><dt>检索降级</dt><dd>{fmt(actions.retrievalFallbacks)}</dd>
      <dt>探针通过 / 遗漏 / 作业失败</dt><dd>{fmt(actions.probePassed)} / {fmt(actions.probeFailed)} / {fmt(actions.probeErrors)}</dd><dt>旧快照清理</dt><dd>{fmt(actions.staleVersions)}</dd>
      <dt>记忆整理 / 失败</dt><dd>{fmt(actions.curations)} / {fmt(actions.curationErrors)}</dd>
      <dt>召回 / 命中条数</dt><dd>{fmt(actions.recalls)} / {fmt(actions.recallHits)}</dd><dt>原文回捞</dt><dd>{fmt(actions.rawRecalls)}</dd>
      <dt>上下文整理 / 失败</dt><dd>{fmt(actions.surgeries)} / {fmt(actions.surgeryErrors)}</dd>
      <dt>整理后字符占比</dt><dd>{actions.compactInputChars ? `${(actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1)}%` : '—'}</dd>
    </dl></div>
    <h3>当前会话的上下文</h3><p className="tx-muted">{data?.meter ? `约 ${fmt(data.meter.totalTokens)} tokens · ${fmt(data.frame.length)} 条可见记录` : '继续一次对话后可查看上下文读数'}</p>
    {data && <ContextHistory data={data}/>}
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
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'trisoul-x-stats', order: 30 }, StatsLine));
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
