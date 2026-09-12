import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { FREQUENCY_PRESETS as presets } from '../frequency.mjs';
import { frameTokens, contextHistoryLayout } from './context-history.mjs';
import css from './style.css';
import shellCss from './shell.css';
import { ComputerIcon } from './computer-icons.jsx';
import { applyComputerUseClient, ComputerPane } from './computer-use.jsx';

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
  const chip = <button type="button" className="tx-scope-chip" title={error || (locked ? '本会话已绑定记忆范围' : '选择新会话的记忆范围')} aria-label={'记忆范围：' + labels[state.scope]} aria-haspopup={locked ? undefined : 'menu'} aria-expanded={locked ? undefined : open} onClick={() => { if (!locked) { void load(); setOpen(!open); } }}><Icon name="memory" size={13}/><strong>{labels[state.scope]}</strong>{!locked && <span>▾</span>}</button>;
  return locked ? chip : <Menu open={open} anchor={chip} compact portal side="top" selectedId={state.scope} items={Object.entries(labels).map(([id, label]) => ({ id, label }))} onSelect={pick} onClose={() => setOpen(false)}/>;
}

function BetterTodoChip({ sessionId, useSessions }) {
  const [state, setState] = useState(null), [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const current = useSessions(s => s.byId[sessionId]), active = useRef(sessionId), revision = useRef(0), writing = useRef(null); active.current = sessionId;
  const load = useCallback(async () => {
    if (writing.current?.sessionId === sessionId) return;
    const ticket = ++revision.current;
    try { const next = await api('/better-todo' + suffix(sessionId)); if (active.current === sessionId && revision.current === ticket) { setState({ sessionId, ...next }); setError(''); } }
    catch (e) { if (active.current === sessionId && revision.current === ticket) setError(e.message); }
  }, [sessionId]);
  useEffect(() => { setOpen(false); setSaving(false); setError(''); }, [sessionId]);
  useEffect(() => { void load(); }, [load, current?.running]);
  const ready = state?.sessionId === sessionId;
  const toggle = async key => {
    if (!ready || saving) return;
    const write = { sessionId }; writing.current = write; ++revision.current;
    setSaving(true); setError('');
    try {
      const next = await api('/better-todo' + suffix(sessionId), { [key]: !state[key] });
      if (active.current === sessionId) setState({ sessionId, ...next });
    } catch (e) { if (active.current === sessionId) setError(e.message); }
    finally { if (writing.current === write) writing.current = null; if (active.current === sessionId) setSaving(false); }
  };
  const chip = <button type="button" className={cx('tx-scope-chip', 'tx-bt-chip', ready && !state.todo && !state.verification && 'tx-bt-off')} aria-label="BT · Better Todo" aria-haspopup="menu" aria-expanded={open} title="Better Todo · 收尾提醒" onClick={() => { void load(); setOpen(!open); }}><strong>BT</strong><span>▾</span></button>;
  const items = [{ type: 'label', id: 'title', text: 'Better Todo' }, ...[
    ['todo', '待办完成提醒', '仍有未完成待办时提醒继续'],
    ['verification', '验证完成提醒', '缺少验证证据时提醒，含文字证据复核'],
  ].map(([id, label, hint]) => ({ id, disabled: !ready || saving, label: <span className="tx-bt-option"><span><strong>{label}</strong><small>{hint}</small></span><span className="tx-bt-state"><small>{ready ? state[id] ? '开' : '关' : '…'}</small><i className={cx('tx-bt-toggle', ready && state[id] && 'tx-on')} aria-hidden="true"/></span></span> }))];
  return <Menu open={open} anchor={chip} items={items} footer={[{ type: 'label', id: 'status', text: error || '仅本会话 · 可随时更改' }]} onSelect={toggle} onClose={() => setOpen(false)} portal side="top" align="end" compact autoFocus/>;
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
function Toggle({ label, hint, checked, onChange }) {
  return <label className="tx-toggle-row"><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)}/></label>;
}
function Numbers({ fields, config, onChange }) {
  return <div className="tx-form-grid">{fields.map(([key, label, min = 0, step = 1, max]) => <label className="tx-field" key={key}><span>{label}</span><input type="number" min={min} step={step} max={max} value={config[key] ?? 0} onChange={e => onChange(key, Number(e.target.value))}/></label>)}</div>;
}
function RouteFields({ route, directory, onChange }) {
  const list = React.useId();
  return <div className="tx-form-grid"><label className="tx-field"><span>提供方</span><select value={route.provider} onChange={e => onChange({ ...route, provider: e.target.value, model: '' })}><option value="">跟随主模型</option>{directory.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}</select></label>
    <label className="tx-field"><span>模型</span><input list={list} value={route.model} placeholder="跟随主模型" onChange={e => onChange({ ...route, model: e.target.value })}/><datalist id={list}>{(directory.find(p => p.id === route.provider)?.models || []).map(m => <option key={m.id} value={m.id}/>)}</datalist></label>
    <label className="tx-field"><span>推理强度</span><select value={route.effort || 'off'} onChange={e => onChange({ ...route, effort: e.target.value })}><option value="off">关闭（模型支持时）</option><option value="inherit">提供方默认</option></select></label>
    <label className="tx-field"><span>温度</span><input type="number" min="0" max="2" step="0.1" value={route.temperature} onChange={e => onChange({ ...route, temperature: Number(e.target.value) })}/></label>
  </div>;
}
const routeModeOf = c => (c.backgroundMode === 'unified' ? [c.unifiedBackground] : [c.background, c.canvas, c.surgeon]).every(r => !r?.provider && !r?.model && (!r?.effort || r.effort === 'off') && (r?.temperature ?? 0.7) === 0.7) ? 'follow' : c.backgroundMode;
const advancedGroups = [
  ['记忆消化与整理', '何时提取记忆、整理重复内容', [['digestEvery', '每批消化事件数', 1], ['flushIdleMs', '空闲间隔 · 毫秒（0 关闭）'], ['curateMinGapMs', '整理最短间隔 · 毫秒'], ['curateEvery', '每几批整理一次（0 自动）']], [['digestBatchMax', '批次事件上限'], ['digestEventChars', '单事件字符上限'], ['digestMaxTokens', '消化输出 Token 上限'], ['catchupMax', '恢复时补消化事件上限'], ['contextMemories', '记忆表条目上限'], ['recallMaxTokens', '检索输出 Token 上限'], ['curateLimit', '整理每轮条目上限'], ['curateOpsMax', '每轮操作数上限'], ['curateMaxTokens', '整理输出 Token 上限']]],
  ['任务记忆', '补注数量、文档更新方式与频率', [['injectLimit', '开场条目数（0 不限）'], ['injectBatch', '每次补注条目数', 1], ['injectMaxPerSession', '每会话注入次数'], ['injectPickTimeoutMs', '首次检索等待 · 毫秒'], ['supplementMinSteps', '文档更新最短步数']]],
  ['工作状态', '状态提炼的重试与资源上限', [['stateFailCooldownSteps', '失败后间隔步数'], ['stateFailLimit', '连续失败暂停压缩（0 关闭）']], [['stateBatchMax', '批次事件上限'], ['statePinnedMax', '固定约束条目上限'], ['stateEventChars', '单事件字符上限'], ['stateMaxTokens', '输出 Token 上限']]],
  ['上下文整理', '保留范围、压缩条件与失败重试', [['keepTailEvents', '保留最近事件数', 2], ['minRegionEvents', '区间最少事件数', 1], ['surgeryFailCooldownSteps', '失败后间隔步数'], ['shadowStale', '旧快照清理数量（0 关闭）'], ['thresholdRatio', '窗口压力比例', 0.1, 0.05, 0.95]], [['thresholdChars', '固定字符阈值（0 使用比例）'], ['thresholdFallbackChars', '窗口未知时的字符阈值'], ['surgeonMaxTokens', '输出 Token 上限']]],
  ['压缩检查', '遗漏事实的检查与补记方式', [], [['probeSourceChars', '参考材料字符上限'], ['probeMaxTokens', '输出 Token 上限'], ['probePatchChars', '材料补记字符上限']]],
];
function Settings() {
  const [config, setConfig] = useState(null), [directory, setDirectory] = useState([]), [status, setStatus] = useState(''), [failed, setFailed] = useState(false);
  const [page, setPage] = useState('basic'), [routing, setRouting] = useState('follow'), [custom, setCustom] = useState(false), [saving, setSaving] = useState(false);
  const saved = useRef(null);
  useEffect(() => { api('/state').then(s => { saved.current = s.config; setConfig(s.config); setRouting(routeModeOf(s.config)); setDirectory(s.directory); }).catch(e => { setStatus(e.message); setFailed(true); }); }, []);
  const field = (key, value) => { setConfig(c => ({ ...c, [key]: value })); setStatus(''); };
  if (!config) return <div className="tx-app"><Header icon="settings" title="偏好设置"/><Empty title={failed ? '暂时无法读取设置' : '正在读取设置'}>{status}</Empty></div>;
  const dirty = JSON.stringify(config) !== JSON.stringify(saved.current);
  const selectedPreset = Object.entries(presets).find(([, values]) => Object.entries(values).every(([key, value]) => config[key] === value))?.[0];
  const save = async e => {
    e.preventDefault(); setSaving(true); setFailed(false);
    try { const patch = Object.fromEntries(Object.entries(config).filter(([key, value]) => key !== 'dataDir' && JSON.stringify(value) !== JSON.stringify(saved.current[key]))); const next = await api('/settings', patch); saved.current = next; setConfig(next); setStatus('设置已保存'); }
    catch (e) { setFailed(true); setStatus(e.message); } finally { setSaving(false); }
  };
  const selectRoute = mode => { setRouting(mode); if (mode === 'follow') { field('backgroundMode', 'unified'); field('unifiedBackground', { provider: '', model: '', temperature: 0.7, effort: 'off' }); } else field('backgroundMode', mode); };
  return <form className="tx-app tx-settings" onSubmit={save}>
    <Header icon="settings" title="偏好设置" subtitle="模型、记忆与上下文"/>
    <Tabs label="设置分类" value={page} onChange={setPage} items={[[ 'basic', '常用' ], [ 'advanced', '高级' ]]}/>
    <div className="tx-body">{page === 'basic' ? <>
      <section className="tx-section"><div className="tx-section-heading"><h3>后台模型</h3><span className="tx-muted">主模型在 DSH 中设置</span></div>
        <Segments label="后台模型配置方式" value={routing} onChange={selectRoute} items={[[ 'follow', '跟随主模型' ], [ 'unified', '统一配置' ], [ 'separate', '分别配置' ]]}/>
        {routing === 'follow' ? <div className="tx-inline-note"><Icon name="layers"/>记忆、状态与整理使用当前对话的模型。</div> : routing === 'unified' ? <div className="tx-route-fields"><RouteFields route={config.unifiedBackground} directory={directory} onChange={r => field('unifiedBackground', r)}/></div> : <div className="tx-route-list">{[['background', '记忆'], ['canvas', '状态与检查'], ['surgeon', '上下文整理']].map(([key, label]) => <Fold key={key} title={label} subtitle={config[key].model || '跟随主模型'}><RouteFields route={config[key]} directory={directory} onChange={r => field(key, r)}/></Fold>)}</div>}
      </section>
      <section className="tx-section"><div className="tx-section-heading"><h3>默认记忆范围</h3><Badge>新会话</Badge></div><div className="tx-choice-grid" role="group" aria-label="默认记忆范围">{[['full', '完全版', '全局与项目记忆'], ['project', '项目级', '仅使用本项目记忆'], ['session', '会话级', '仅在当前会话中使用']].map(([id, title, hint]) => <button type="button" key={id} aria-pressed={config.memoryScope === id} onClick={() => field('memoryScope', id)}><span className="tx-choice-mark">{config.memoryScope === id ? <Icon name="check" size={13}/> : null}</span><strong>{title}</strong><small>{hint}</small></button>)}</div><p className="tx-help">也可在输入区选择，开始对话后绑定到该会话。</p></section>
      <section className="tx-section"><div className="tx-section-heading"><h3>状态、记忆与整理频率</h3></div><Segments label="更新频率" value={custom || !selectedPreset ? 'custom' : selectedPreset} onChange={id => { setCustom(id === 'custom'); if (presets[id]) { setConfig(c => ({ ...c, ...presets[id] })); setStatus(''); } }} items={[[ 'always', '频繁' ], [ 'medium', '适中' ], [ 'slow', '较少' ], [ 'custom', '自定义' ]]}/>
        {custom || !selectedPreset ? <Numbers config={config} onChange={field} fields={[[ 'stateEvery', '状态提炼 · 事件数', 1 ], [ 'digestEvery', '记忆消化 · 事件数', 1 ], [ 'supplementMinSteps', '记忆文档 · 最短步数' ], [ 'surgeryCooldownSteps', '上下文整理 · 间隔步数' ], [ 'minRegionTokens', '最小整理区间 · Token', 1 ]]}/> : <p className="tx-help">状态每 {config.stateEvery} 条事件提炼，记忆文档至少间隔 {config.supplementMinSteps} 步更新。{({ always: '更及时地跟进进展。', medium: '积累一段进展后再更新。', slow: '减少后台调用与文档更新。' })[selectedPreset]}</p>}
        <p className="tx-help">一条用户消息、模型回复或工具结果各算一条事件；一步指一次主模型调用。档位同时调整记忆消化、状态提炼、文档更新和上下文整理。</p>
      </section>
      <section className="tx-section tx-switches"><Toggle label="持续更新工作状态" hint="记录用户约束与当前任务进展" checked={config.stateEnabled} onChange={v => field('stateEnabled', v)}/><Toggle label="检查压缩后的事实" hint="发现遗漏时保留补记，供后续整理使用" checked={config.probeEnabled} onChange={v => field('probeEnabled', v)}/></section>
    </> : <><p className="tx-help tx-advanced-intro">通常保留默认值即可。展开某一项，再调整对应参数。</p>{advancedGroups.map(([title, hint, fields, limits]) => <Fold key={title} title={title} subtitle={hint}>
      {title === '任务记忆' && <label className="tx-field"><span>文档更新方式</span><select value={config.supplementMode} onChange={e => field('supplementMode', e.target.value)}><option value="renew">按版本追加</option><option value="rewrite">原位更新</option><option value="append">逐批追加</option></select></label>}
      {title === '压缩检查' && <label className="tx-field"><span>遗漏事实如何补记</span><select value={config.probePatch} onChange={e => field('probePatch', e.target.value)}><option value="ride">随下次整理写入</option><option value="qa">立即补入问答</option><option value="material">立即补入参考材料</option></select></label>}
      <Numbers fields={fields} config={config} onChange={field}/>
      {title === '上下文整理' && <div className="tx-switches">{[['semanticCompaction', '按消化结果选择区间'], ['mergeCheckpoints', '合并较早工作纪要'], ['requireShorter', '整理后应短于原材料'], ['userRetirement', '允许压缩较早用户消息']].map(([key, label]) => <Toggle key={key} label={label} checked={config[key]} onChange={v => field(key, v)}/>)}</div>}
      {limits && <details className="tx-subfold"><summary>可选资源上限</summary><p className="tx-help">长度、条目和输出上限为 0 时不限制。</p><Numbers fields={limits} config={config} onChange={field}/></details>}
    </Fold>)}<Fold title="后台作业超时" subtitle="控制单次后台调用的最长等待时间"><Numbers fields={[[ 'jobTimeoutMs', '超时 · 毫秒（0 不限制）' ]]} config={config} onChange={field}/></Fold></>}
    </div><footer className="tx-savebar"><span className={failed ? 'tx-error' : 'tx-muted'} role="status">{status || (dirty ? '有未保存的更改' : '更改后保存即可生效')}</span><div className="tx-actions"><Action quiet disabled={!dirty || saving} onClick={() => { setConfig(saved.current); setRouting(routeModeOf(saved.current)); setStatus(''); }}>撤销</Action><Action type="submit" primary disabled={!dirty || saving} icon={saving ? 'clock' : 'check'}>{saving ? '保存中' : '保存设置'}</Action></div></footer>
  </form>;
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
  return <div className="tx-app"><Header icon="context" title="工作上下文" subtitle="任务、状态与正在使用的记忆" actions={<Action quiet icon={compacting ? 'clock' : 'layers'} disabled={data?.running !== 'idle' || compacting} onClick={compact}>{compacting ? '整理中' : '整理'}</Action>}/>
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

const actionNames = { injections: '记忆注入', recalls: '记忆召回', rawRecalls: '原文回捞', digests: '记忆消化', digestErrors: '消化失败', digestDeferred: '失败批次暂存', curations: '记忆整理', curationErrors: '整理失败', workdocVersions: '文档更新', states: '状态更新', stateErrors: '状态失败', surgeries: '上下文整理', surgeryErrors: '压缩失败', retrievalFallbacks: '检索回退', injectionErrors: '补注失败', probePassed: '事实检查通过', probeFailed: '事实待补记', probeErrors: '检查调用失败', staleVersions: '旧快照清理', digestFallbacks: '采用消化底稿' };
function MemoryPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [data, setData] = useState({ items: [], projects: [], trace: [] }), [edit, setEdit] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [view, setView] = useState('session'), [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [project, setProject] = useState('');
  const [filters, setFilters] = useState(false), [history, setHistory] = useState(false), [touched, setTouched] = useState(false), [selecting, setSelecting] = useState(false), [selected, setSelected] = useState([]), [expanded, setExpanded] = useState([]);
  const key = `${sessionId}:${view}`, current = useRef(key); current.current = key;
  const load = useCallback(async () => { try { const d = await api('/memories' + suffix(sessionId) + '&view=' + view); if (current.current === key) { setData(d); setError(''); } } catch (e) { if (current.current === key) setError(e.message); } }, [sessionId, view, key]);
  useEffect(() => { setEdit(null); setSelected([]); setSelecting(false); setProject(''); }, [sessionId]);
  useEffect(() => { if (!tab.visible) return; let active = true, timer; const tick = async () => { await load(); if (active) timer = setTimeout(tick, 2500); }; void tick(); return () => { active = false; clearTimeout(timer); }; }, [load, tab.visible]);
  const save = async e => { e.preventDefault(); setBusy(true); try { await api('/memories' + suffix(sessionId), { ...edit, key: edit.key.trim() || edit.text.trim().replace(/\s+/g, ' ').slice(0, 40), op: edit.id ? 'update' : 'add', target: edit.id || '', project: edit.project || data.scope.project }); setEdit(null); await load(); setNotice('记忆已保存'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const change = async (op, ids) => { setBusy(true); try { for (const id of ids) await api('/memories' + suffix(sessionId), { op, target: id, text: '用户在记忆面板移入历史' }); setSelected([]); await load(); setNotice(op === 'restore' ? '已恢复所选记忆' : op === 'delete' ? '已永久删除所选版本' : '已移入历史，可随时恢复'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const curate = async () => { setBusy(true); try { const r = await api('/curate' + suffix(sessionId), {}); setNotice(r.queued ? '整理已安排，结果会自动更新' : '当前没有待整理的记忆'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const visible = data.items.filter(m => (history || (!m.retired && !m.supersededBy)) && (!touched || m.touched) && (scope === 'all' || m.scope === scope) && (!project || m.project === project) && (!query || [m.text, m.key, m.project].join(' ').toLowerCase().includes(query.toLowerCase())));
  const active = data.items.filter(m => !m.retired && !m.supersededBy), filterCount = Number(history) + Number(touched) + Number(scope !== 'all') + Number(Boolean(project));
  return <div className="tx-app"><Header icon="memory" title="记忆" subtitle="保留值得带到下一次工作的内容" actions={<Action primary icon="plus" disabled={!data.scope} onClick={() => { setError(''); setEdit({ scope: 'project', project: data.scope.project, key: '', text: '' }); }}>新增</Action>}/>
    <div className="tx-memory-tools"><div className="tx-search"><Icon name="search"/><input aria-label="搜索记忆" placeholder="搜索记忆…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <Action quiet icon="close" aria-label="清除搜索" onClick={() => setQuery('')}/>}</div>
      <div className="tx-row-between"><Segments label="记忆查看范围" value={view} onChange={v => { setView(v); setSelected([]); setProject(''); }} items={[[ 'session', '当前范围' ], [ 'all', '整个记忆库' ]]}/><Action quiet icon="filter" aria-expanded={filters} onClick={() => setFilters(!filters)}>筛选{filterCount ? ` ${filterCount}` : ''}</Action></div>
      {filters && <div className="tx-filter-box"><div className="tx-form-grid"><label className="tx-field"><span>层级</span><select value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部层级</option>{Object.entries(scopeName).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>{view === 'all' && <label className="tx-field"><span>所属项目</span><select value={project} onChange={e => setProject(e.target.value)}><option value="">全部项目</option>{data.projects.map(p => <option key={p} value={p}>{projectLabel(p)}</option>)}</select></label>}</div><label className="tx-check"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)}/>包含历史版本</label><label className="tx-check"><input type="checkbox" checked={touched} onChange={e => setTouched(e.target.checked)}/>仅本会话使用过</label></div>}
      <div className="tx-list-toolbar"><span>{query || filterCount ? `${visible.length} 条匹配` : `${active.length} 条有效记忆`}</span><div className="tx-actions"><Action quiet onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? '取消选择' : '选择'}</Action><Action quiet icon="refresh" aria-label="刷新记忆" onClick={load}/><Action quiet disabled={!sessionId || data.scope?.mode === 'session' || busy} onClick={curate}>整理</Action></div></div>
    </div>
    <div className="tx-body tx-memory-body"><Alert error>{error}</Alert><Alert>{notice}</Alert>{!visible.length && <Empty icon="memory" title={query || filterCount ? '没有找到匹配的记忆' : '从一条值得记住的事开始'}>{query || filterCount ? '试试其他关键词，或调整筛选条件。' : '工作中形成的稳定事实会逐渐出现在这里，也可以手动添加。'}</Empty>}
      {visible.map(m => { const archived = m.retired || m.supersededBy, open = expanded.includes(m.id); return <article className={cx('tx-memory-item', archived && 'tx-archived', selected.includes(m.id) && 'tx-selected-item')} key={m.id}>
        <div className="tx-memory-meta"><div className="tx-actions">{selecting && <input type="checkbox" aria-label={'选择 ' + m.key} checked={selected.includes(m.id)} onChange={e => setSelected(e.target.checked ? [...selected, m.id] : selected.filter(id => id !== m.id))}/>}<Badge tone={archived ? undefined : 'soft'}>{m.project?.startsWith('session:') ? '会话' : scopeName[m.scope]}</Badge><span className="tx-memory-key" title={m.key}>{m.key}</span></div>{archived && <Badge>{m.retired ? '已退役' : '旧版本'}</Badge>}</div>
        <p className={cx('tx-memory-text', m.text.length > 240 && !open && 'tx-clamped')}>{m.text}</p>{m.text.length > 240 && <button type="button" className="tx-text-button" onClick={() => setExpanded(open ? expanded.filter(id => id !== m.id) : [...expanded, m.id])}>{open ? '收起' : '展开全文'}</button>}
        <div className="tx-memory-bottom"><span>{m.source === 'user' ? '手动记录' : m.source === 'curate' ? '整理更新' : '自动记忆'} · {shortDate(m.at)}</span><div className="tx-actions">{!archived ? <><Action quiet aria-label={'编辑 ' + m.key} icon="edit" onClick={() => { setError(''); setEdit(m); }}/><Action quiet disabled={busy} onClick={() => change('retire', [m.id])}>移入历史</Action></> : <Action quiet disabled={busy} onClick={() => change('restore', [m.id])}>恢复</Action>}</div></div>
        <details className="tx-memory-details"><summary>使用与版本</summary><div className="tx-detail-grid"><span>注入 / 召回</span><strong>{m.usage?.injected || 0} / {m.usage?.recalled || 0}</strong><span>当前范围可见</span><strong>{m.visible ? '是' : '否'}</strong></div>{m.project && <p className="tx-path tx-help">{projectLabel(m.project)}</p>}{m.previous && <p className="tx-help">包含上一版本记录，可在历史版本中查看。</p>}{archived && <Action quiet className="tx-danger" disabled={busy} onClick={() => change('delete', [m.id])}>永久删除此版本</Action>}</details>
      </article>; })}
      <div className="tx-memory-footer"><Fold title="记忆库详情" subtitle="使用情况与分片整理记录">{data.health && <><div className="tx-detail-grid"><span>有效 / 已退役</span><strong>{data.health.active} / {data.health.retired}</strong><span>历史版本</span><strong>{data.health.versions}</strong><span>尚未使用</span><strong>{data.health.unused}</strong><span>当前可见字符</span><strong>{fmt(data.health.chars)}</strong><span>跨项目候选组</span><strong>{data.health.promotionGroups}</strong></div>{Object.entries(data.health.shards.lastAt).map(([shard, at]) => <div className="tx-shard" key={shard}><strong>{shard.startsWith('project:') ? projectLabel(shard.slice(8)) : scopeName[shard]}</strong><span>{shortDate(at)} · 游标 {data.health.shards.cursors[shard] || 0}</span></div>)}</>}</Fold>
      <Fold title="本会话的记忆活动" count={data.trace.length}>{data.trace.slice().reverse().map((e, i) => <div className="tx-trace-row" key={i}><div><strong>{actionNames[e.name] || e.name}</strong><span>{shortDate(e.at)}{e.items != null ? ` · ${e.items} 条` : ''}</span></div>{e.query && <p>{e.query}</p>}{e.error && <p className="tx-error">{e.error}</p>}</div>)}</Fold></div>
    </div>
    {selecting && selected.length > 0 && <footer className="tx-batchbar"><strong>已选 {selected.length} 条</strong><div className="tx-actions"><Action quiet disabled={busy} onClick={() => change('restore', selected)}>恢复</Action><Action disabled={busy} onClick={() => change('retire', selected)}>移入历史</Action></div></footer>}
    {edit && <form className="tx-editor" onSubmit={save}><Header icon="memory" title={edit.id ? '编辑记忆' : '新增记忆'} subtitle="记录清楚、稳定、可复用的事实" actions={<Action quiet icon="close" aria-label="关闭记忆编辑" disabled={busy} onClick={() => setEdit(null)}/>}/><div className="tx-body"><Alert error>{error}</Alert><label className="tx-field"><span>记忆内容</span><textarea rows="8" required autoFocus placeholder="需要记住什么？" value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })}/></label><label className="tx-field"><span>记忆范围</span><select value={edit.scope} onChange={e => setEdit({ ...edit, scope: e.target.value })}>{Object.entries(scopeName).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><Fold title="更多属性" subtitle="名称与所属项目"><label className="tx-field"><span>名称（可选）</span><input value={edit.key} placeholder="默认使用内容开头" onChange={e => setEdit({ ...edit, key: e.target.value })}/></label>{edit.scope === 'project' && (edit.project?.startsWith('session:') ? <p className="tx-help">所属：{projectLabel(edit.project)}</p> : <label className="tx-field"><span>所属项目</span><input required value={edit.project || ''} onChange={e => setEdit({ ...edit, project: e.target.value })}/></label>)}</Fold></div><footer className="tx-savebar"><span className="tx-muted">保存后即可用于后续工作</span><div className="tx-actions"><Action quiet disabled={busy} onClick={() => setEdit(null)}>取消</Action><Action primary type="submit" disabled={busy} icon="check">{busy ? '保存中' : '保存记忆'}</Action></div></footer></form>}
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
    {Object.entries(kindName).filter(([kind]) => ordered.some(c => c.kind === kind)).map(([kind, label]) => <div key={kind} className="tx-timeline-row"><span>{label}</span><div>{ordered.map((call, i) => call.kind === kind ? <button key={i} type="button" className={call.error ? 'tx-call-error' : 'tx-call'} onClick={() => onSelect(call)} aria-label={`${label} · ${shortDate(call.at)} · ${duration(call.durationMs)}`} title={`${label} · ${call.turn ?? '—'}.${call.step ?? '—'} · ${duration(call.durationMs)}${call.error ? ' · ' + call.error : ''}`}/> : <i key={i}/>)}</div></div>)}
  </div><div className="tx-legend"><span><i style={{ background: 'var(--tx-blue)' }}/>完成调用</span><span><i style={{ background: 'var(--tx-danger)' }}/>调用失败</span></div></section>;
}
function Monitor({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), [range, setRange] = useState('session'), [page, setPage] = useState('overview'), [stage, setStage] = useState('all'), [failures, setFailures] = useState(false), [selected, setSelected] = useState(null);
  const { data, error } = useSnapshot(sessionId, tab.visible, range), actions = data?.actions || {}, live = data?.liveCalls || [], metrics = data?.metrics || {};
  const totals = Object.values(metrics).reduce((out, m) => ({ calls: out.calls + (m.calls || 0), errors: out.errors + (m.errors || 0), input: out.input + inputTokens(m), output: out.output + (m.outputTokens || 0), cache: out.cache + (m.cacheReadTokens || 0), ms: out.ms + (m.durationMs || 0) }), { calls: 0, errors: 0, input: 0, output: 0, cache: 0, ms: 0 });
  const activity = (data?.activity || []).filter(a => (stage === 'all' || a.kind === stage) && (!failures || a.error));
  const choose = call => { setPage('calls'); setStage('all'); setFailures(false); setSelected(callId(call)); };
  const running = data?.running && data.running !== 'idle';
  return <div className="tx-app"><Header icon="monitor" title="执行监控" subtitle="看清每次调用与上下文变化"/>
    <div className="tx-monitor-top"><Segments label="监控统计范围" value={range} onChange={setRange} items={[[ 'session', '当前会话' ], [ 'all', '全部会话' ]]}/><div className={cx('tx-running-label', (running || live.length > 0) && 'is-running')}><span className="tx-status-dot"/>{running ? '执行中' : live.length ? '后台运行中' : '空闲'}</div></div>
    <Tabs label="监控分类" value={page} onChange={setPage} items={[[ 'overview', '概览' ], [ 'calls', '调用记录' ], [ 'context', '上下文' ]]}/>
    <div className="tx-body"><Alert error>{error}</Alert>
      {page === 'overview' && <><div className="tx-stats-grid">{[['总用量', compactNumber(totals.input + totals.output), 'tokens'], ['缓存命中', totals.input ? (totals.cache / totals.input * 100).toFixed(1) + '%' : '—', '输入缓存'], ['模型调用', fmt(totals.calls), `${totals.errors} 次失败`], ['累计用时', duration(totals.ms), '各组件合计']].map(([label, value, hint]) => <div className="tx-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
        {live.length > 0 && <div className="tx-live-list">{live.map((call, i) => <div key={i}><span className="tx-pulse"/><div><strong>{kindName[call.kind] || call.kind}</strong><small>{call.model}</small></div><span>{duration(Date.now() - call.startedAt)}</span></div>)}</div>}
        <Timeline calls={data?.activity || []} onSelect={choose}/>
        {Object.keys(metrics).length > 0 && <section className="tx-section"><div className="tx-section-heading"><h3>组件用量</h3><span className="tx-muted">调用 / Token</span></div>{Object.entries(kindName).filter(([kind]) => metrics[kind]?.calls).map(([kind, label]) => { const m = metrics[kind], last = data?.activity?.find(a => a.kind === kind), total = inputTokens(m) + (m.outputTokens || 0); return <details className="tx-component" key={kind}><summary><span><i className={cx('tx-component-dot', m.errors > 0 && 'has-error')}/>{label}</span><span><strong>{fmt(m.calls)}</strong><small>{compactNumber(total)} tok</small><Icon name="chevron" size={13}/></span></summary><div className="tx-component-details"><div className="tx-detail-grid"><span>输入 / 输出</span><strong>{fmt(inputTokens(m))} / {fmt(m.outputTokens)}</strong><span>缓存命中</span><strong>{inputTokens(m) ? ((m.cacheReadTokens || 0) / inputTokens(m) * 100).toFixed(1) + '%' : '—'}</strong><span>推理 Token</span><strong>{m.reasoningTokens == null ? '—' : fmt(m.reasoningTokens)}</strong><span>峰值输入 / 累计用时</span><strong>{compactNumber(m.peakContext)} / {duration(m.durationMs)}</strong><span>失败</span><strong>{fmt(m.errors)}</strong></div>{last && <p className="tx-help tx-path">{last.provider} / {last.model}</p>}{m.unmetered > 0 && <p className="tx-help">{m.unmetered} 次调用未返回用量</p>}</div></details>; })}</section>}
        <Fold title="记忆与压缩统计" subtitle="后台流程的累计执行结果"><div className="tx-detail-grid">{[['记忆消化 / 失败', `${fmt(actions.digests)} / ${fmt(actions.digestErrors)}`], ['记忆整理 / 失败', `${fmt(actions.curations)} / ${fmt(actions.curationErrors)}`], ['注入 / 文档更新', `${fmt(actions.injections)} / ${fmt(actions.workdocVersions)}`], ['状态提炼 / 失败', `${fmt(actions.states)} / ${fmt(actions.stateErrors)}`], ['召回 / 命中条数', `${fmt(actions.recalls)} / ${fmt(actions.recallHits)}`], ['检索回退', fmt(actions.retrievalFallbacks)], ['压缩 / 失败', `${fmt(actions.surgeries)} / ${fmt(actions.surgeryErrors)}`], ['事实检查：通过 / 遗漏', `${fmt(actions.probePassed)} / ${fmt(actions.probeFailed)}`], ['检查调用失败', fmt(actions.probeErrors)], ['原文回捞 / 旧快照清理', `${fmt(actions.rawRecalls)} / ${fmt(actions.staleVersions)}`], ['压缩后字符占比', actions.compactInputChars ? (actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1) + '%' : '—']].map(([label, value]) => <React.Fragment key={label}><span>{label}</span><strong>{value}</strong></React.Fragment>)}</div></Fold>
      </>}
      {page === 'calls' && <><div className="tx-call-filters"><label className="tx-field"><select aria-label="调用组件" value={stage} onChange={e => setStage(e.target.value)}><option value="all">全部组件</option>{Object.entries(kindName).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="tx-check"><input type="checkbox" checked={failures} onChange={e => setFailures(e.target.checked)}/>仅失败</label></div>
        {activity.length ? activity.map(call => <details key={callId(call)} className={cx('tx-call-row', call.error && 'tx-failed-call')} open={selected === callId(call) || undefined}><summary><span className="tx-call-icon"><Icon name={call.error ? 'close' : 'check'} size={14}/></span><div><strong>{kindName[call.kind] || call.kind}</strong><small>{shortDate(call.at)}{call.step != null ? ` · 第 ${call.step} 步` : ''}</small></div><span>{duration(call.durationMs)}</span><Icon name="chevron" size={13}/></summary><div className="tx-call-detail"><p className="tx-help tx-path">{call.provider} / {call.model}</p><div className="tx-detail-grid"><span>输入 / 输出</span><strong>{fmt(inputTokens(call.usage))} / {fmt(call.usage?.outputTokens)}</strong><span>缓存读取</span><strong>{fmt(call.usage?.cacheReadTokens)}</strong>{call.effort && <><span>推理强度</span><strong>{call.effort}</strong></>}</div><p className="tx-help tx-path">会话 {call.sessionId}</p><Alert error>{call.error}</Alert></div></details>) : <Empty icon="clock" title="这里还没有调用记录">{failures ? '当前筛选范围内没有失败调用。' : '模型调用完成后，会按时间列在这里。'}</Empty>}
        <p className="tx-footnote">完整消息与工具往返可在 DSH「轨迹」中查看。</p>
      </>}
      {page === 'context' && <>{data?.meter ? <section className="tx-section"><div className="tx-section-heading"><h3>当前会话</h3><Badge>{fmt(data.frame?.length)} 条记录</Badge></div><div className="tx-context-number">{compactNumber(data.meter.totalTokens)}<span>tokens</span></div><FrameBar nodes={(data.frame || []).map(n => ({ ...n, kind: n.checkpoint ? 'checkpoint' : n.kind }))}/><FrameLegend/><details className="tx-subfold"><summary>查看各条记录</summary>{data.frame?.map(n => <div className="tx-frame-row" key={n.seq}><span>#{n.seq} · {frameKind(n.checkpoint ? 'checkpoint' : n.kind)}</span><span>{compactNumber(n.tokens)} tok</span></div>)}</details></section> : <Empty icon="layers" title="尚无上下文读数">继续一次对话后即可查看。</Empty>}{data && <ContextHistory data={data}/>}</>}
    </div>
  </div>;
}
function StatsLine({ sessionId, onOpen }) {
  const { data } = useSnapshot(sessionId, Boolean(sessionId));
  if (!data?.metrics?.main?.calls) return null;
  const m = data.metrics.main, total = inputTokens(m);
  return <button type="button" className="tx-stats-line" aria-label="查看运行统计" title={`上下文 ${fmt(data.meter?.totalTokens)} tokens · 缓存命中 ${total ? Math.round((m.cacheReadTokens || 0) / total * 100) : 0}% · 已整理 ${fmt(data.actions?.surgeries)} 次`} onClick={onOpen}><Icon name="layers" size={12}/><span>{compactNumber(data.meter?.totalTokens)} 上下文</span>{data.liveCalls?.length > 0 && <i className="tx-stats-running" aria-label="后台运行中"/>}</button>;
}
const Mark = ({ size = 28 }) => <span className="tx-brand-mark" style={{ width: size, height: size }} aria-hidden="true"><svg width="72%" height="72%" viewBox="0 0 32 32" fill="none"><path d="M7 8l8 8-8 8M18 24h8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight'];
export function apply(ctx) {
  const openPanel = section => ctx.sidebarRight.openTab('trisoul-x-workbench', { params: { section } });
  const sections = [
    ['tasks', '任务', 'context', ContextPanel],
    ['memory', '记忆', 'memory', MemoryPanel],
    ['computer', '电脑', 'computer', ComputerPane],
    ['monitor', '监控', 'monitor', Monitor],
  ];
  function Workbench({ initialSection = 'tasks', ...props }) {
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
  const { ComputerEntry } = applyComputerUseClient(ctx, { integrated: true, openPanel, renderPane: props => <Workbench {...props} initialSection="computer"/> });
  function ComposerDock(props) {
    return <div className="tx-composer-dock"><div className="tx-composer-tools"><button type="button" className="tx-workbench-entry" aria-label="打开工作台" onClick={() => openPanel('tasks')}><Icon name="context" size={14}/><span>工作台</span></button><ComputerEntry {...props}/></div><StatsLine {...props} onOpen={() => openPanel('monitor')}/></div>;
  }
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'trisoul_x'; tag.textContent = css + '\n' + shellCss; document.head.appendChild(tag);
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
    icon.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#3478F6"/><path d="M24 26l14 14-14 14M44 54h14" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    document.head.append(icon);
    return () => { titleObserver.disconnect(); if (document.title === brandedTitle) document.title = hostTitle; icon.remove(); tag.remove(); document.documentElement.classList.remove('trisoul-shell'); };
  });
  for (const [seat, Component] of [['sidebar.brand.mark', Mark], ['sidebar.brand.name', () => <strong className="tx-wordmark">Oh My <span>DSH</span></strong>], ['conversation.hero.brand.mark', () => <Mark size={52}/>]]) ctx.slots.inject(seat, () => ctx.slots.register({ name: seat }, Component));
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'trisoul-x', order: 16, label: () => 'Oh My DSH' }, Settings));
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'trisoul-x-tools', order: 25 }, ComposerDock));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'trisoul-memory-scope', order: 50 }, MemoryScopeChip));
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
}
