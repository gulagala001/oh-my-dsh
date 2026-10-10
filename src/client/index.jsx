import { applyAppearanceBrand } from './appearance-brand.jsx';
import { createPoller } from './polling.mjs';
import { createConversation } from '../../lib/host/ui-conversation.factory.mjs';
import { installDesktopLifecycle } from './desktop-lifecycle.mjs';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { createMonitor, monitorCss } from './monitor.jsx';
import css from './style.css';
import workbenchCss from './workbench.css';
import shellCss from './shell.css';
import { ComputerIcon } from '#opencu/src/client/computer-icons.jsx';
import { applyComputerUseClient } from '#opencu/client-source';
import versionCss from './version-info.css';
import { whaleCss } from './brand.mjs';
import { createContextUI } from './context-client.mjs';
import { applyHistorySize } from './history-settings.jsx';
import { applySkins } from './skins/settings.jsx';
import { applyConversationRecords } from './conversation-records.jsx';
import { applyRecommendedPlugins } from './recommended-plugins.jsx';
import { applyPromptOptimizer } from './prompt-optimizer.jsx';
import { applyModelPanel } from './model-panel.jsx';
import { applySubscriptionFast } from './subscription-fast.jsx';
import { applyWorkflowStatus } from './workflow-status.jsx';
import { applyProjectlessWorkspaces } from './projectless-workspaces.jsx';

export { CONTEXT_UI_VERSION as contextUIVersion } from './context-client.mjs';
const { ContextSettings, ScopeChip, PipelinePanel, SummaryPanel, applyStyle } = createContextUI(React);

const api = async (path, value, signal) => {
  const response = await fetch(`trisoul-x/api${path}`, value === undefined ? { signal } : { signal, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const Monitor = createMonitor({ api });
const suffix = id => `?${id ? `session=${encodeURIComponent(id)}` : ''}`;
const fmt = n => Number(n || 0).toLocaleString();
function BetterTodoChip(props) {
  const preset = props.useSessions(s => s.byId[props.sessionId]?.projectionValues?.agentPreset);
  return ['trisoul-x', 'omd-ptc'].includes(preset) ? <BetterTodoSessionChip {...props}/> : null;
}
function BetterTodoSessionChip({ sessionId, useSessionStatus }) {
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
  const [snapshot, setSnapshot] = useState(null);
  const key = `${id}:${range}:${view}`;
  useEffect(() => {
    if (!visible) return;
    const observer = createPoller({
      read: signal => api(`/state${suffix(id)}&range=${range}&view=${view}`, undefined, signal),
      onData: data => setSnapshot({ key, data, error: data.unreadableArchives ? `有 ${data.unreadableArchives} 份统计档案无法读取，结果不完整；原文件已保留。` : '' }),
      onError: error => setSnapshot(old => ({ key, data: old?.key === key ? old.data : null, error: error.message })),
    });
    observer.start();
    return () => observer.stop();
  }, [id, visible, range, view, key]);
  return { data: snapshot?.key === key ? snapshot.data : null, error: snapshot?.key === key ? snapshot.error : '' };
}


const compactNumber = n => Number(n || 0) >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : Number(n || 0) >= 1000 ? (n / 1000).toFixed(1) + 'k' : fmt(n);
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
function Tabs({ value, onChange, items, label, idPrefix }) {
  const buttons = useRef([]);
  const navigate = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index + items.length - 1) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next][0]);
    buttons.current[next]?.focus();
  };
  return <div className="tx-tabs" role="tablist" aria-label={label} aria-orientation="horizontal">{items.map(([id, title, count], index) => <button ref={element => { buttons.current[index] = element; }} type="button" role="tab" id={`${idPrefix}-tab-${id}`} aria-controls={`${idPrefix}-panel-${id}`} aria-selected={value === id} tabIndex={value === id ? 0 : -1} key={id} onClick={() => onChange(id)} onKeyDown={event => navigate(event, index)}>{title}{count != null && <span>{count}</span>}</button>)}</div>;
}
function Segments({ value, onChange, items, label }) {
  return <div className="tx-segments" role="group" aria-label={label}>{items.map(([id, title]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{title}</button>)}</div>;
}
function Header({ title, subtitle, action }) {
  return <header className="tx-page-head"><div className="tx-title-line"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>;
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
function TaskPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), { data, error } = useSnapshot(sessionId, tab.visible);
  const tasks = data?.tasks || [], done = tasks.filter(t => t.status === 'completed').length, history = data?.legacyContext;
  const status = data?.running !== 'idle' && data?.running ? '正在执行' : tasks.length && done === tasks.length ? '任务已完成' : tasks.length ? '任务待继续' : '等待新任务';
  return <div className="tx-app"><Header title="任务与验证" subtitle={status} action={tasks.length > 0 && <span className="tx-task-count"><strong>{done}</strong><span>/ {tasks.length} 完成</span></span>}/>
    {tasks.length > 0 && <div className="tx-progress" role="progressbar" aria-label="任务完成进度" aria-valuenow={done} aria-valuemin={0} aria-valuemax={tasks.length}><i style={{ width: `${done / tasks.length * 100}%` }}/></div>}
    <div className="tx-body"><Alert error>{error}</Alert>
      <>{tasks.length ? <div className="tx-task-list">{tasks.map((task, i) => <article className="tx-task" key={task.id || i}>
        <div className="tx-task-title"><span className={cx('tx-task-check', task.status === 'completed' && 'is-done')}>{task.status === 'completed' ? <Icon name="check" size={13}/> : <span/>}</span><strong>{task.content}</strong><span className="tx-task-id">{task.id}</span></div>
        <div className="tx-task-badges"><Badge tone={task.status === 'completed' ? 'good' : undefined}>{task.status === 'completed' ? '已完成' : '待完成'}</Badge>{task.links?.some(l => l.lastRun?.pass) ? <Badge tone="good">测试通过</Badge> : <Badge>{task.links?.length ? '已有证据' : '待验证'}</Badge>}</div>
        <details className="tx-task-detail"><summary>需求原文与验证 <Icon name="chevron" size={13}/></summary><div className="tx-quote">{task.source || '尚未绑定原文锚点'}{task.anchor && <small>消息 {task.sourceMessage} · 摘录 {task.sourceExcerpt}</small>}</div>
          {task.links?.length ? task.links.map(link => <Evidence key={link.id} link={link}/>) : <p className="tx-help">完成任务后，关联实际验证证据。</p>}
          {task.verification && <p className="tx-prose">{task.verification.method}<br/>{task.verification.result}</p>}
        </details>
      </article>)}</div> : <Empty icon="check" title="任务会在这里展开">多步骤工作开始后，可以查看需求、进展与验证结果。</Empty>}
      {data?.taskRelease?.total > 0 && <div className="tx-footnote">最近收尾 · {data.taskRelease.done}/{data.taskRelease.total} 完成 · 测试型 {data.taskRelease.tested} · 文字型 {data.taskRelease.textOnly}</div>}</>

      {data?.notes?.length > 0 && <Fold title="工作笔记" count={data.notes.length}>{data.notes.map((note, i) => <div className="tx-note-line" key={i}><p className="tx-prose">{note.text}</p><small>{shortDate(note.at)}</small></div>)}</Fold>}
      {history && <Fold title="历史上下文" subtitle="旧版本保存的只读资料">
        {history.status && <section className="tx-section"><h3>状态记录</h3><p className="tx-prose">{history.status}</p></section>}
        {history.pins?.map((pin, i) => <p className="tx-prose" key={i}>{pin}</p>)}
        {history.workdoc && <section className="tx-section"><h3>记忆文档</h3><p className="tx-prose">{history.workdoc}</p></section>}
        {history.checkpoint && <section className="tx-section"><h3>工作纪要</h3><p className="tx-prose">{history.checkpoint.text}</p></section>}
        {history.digests?.map((entry, i) => <p className="tx-prose" key={i}>{entry.summary}</p>)}
        {history.probe && <section className="tx-section"><h3>检查记录</h3><p className="tx-prose">{history.probe.question}</p><p className="tx-prose">{history.probe.expected}</p><p className="tx-prose">{history.probe.got}</p><Alert error>{history.probe.error}</Alert></section>}
        {history.probeNotes?.map((note, i) => <p className="tx-prose" key={i}>{note}</p>)}
      </Fold>}
    </div>
  </div>;
}

function StatsLine({ sessionId, onOpen }) {
  const { data } = useSnapshot(sessionId, Boolean(sessionId), 'session', 'summary');
  if (!data?.metrics?.main?.calls) return null;
  const m = data.metrics.main, total = inputTokens(m);
  return <button type="button" className="tx-stats-line" aria-label="查看运行统计" title={`上下文 ${fmt(data.meter?.totalTokens)} tokens · 缓存命中 ${total ? Math.round((m.cacheReadTokens || 0) / total * 100) : 0}% · 已替换 ${fmt(data.actions?.contextReplacements)} 次`} onClick={onOpen}><Icon name="layers" size={12}/><span>{compactNumber(data.meter?.totalTokens)} 上下文</span>{data.liveCalls?.length > 0 && <i className="tx-stats-running" aria-label="后台运行中"/>}</button>;
}
const hostConversation = createConversation(require);
export const inject = [...new Set(['slots', 'sidebarRightTabs', 'sidebarRight', 'theme', 'configForms', 'layout', 'modules', 'remote.session', 'remote.agentPresets', ...hostConversation.inject])];
export async function apply(ctx) {
  applyHistorySize(ctx);
  installDesktopLifecycle(ctx);
  const projectlessDrafts = applyProjectlessWorkspaces(ctx);
  await ctx.plugin(hostConversation, { settingsNamespace: 'omd-ui-conversation' });
  projectlessDrafts.transferOptimizer = applyPromptOptimizer(ctx, { draftLock: projectlessDrafts }).transferDraft;
  applyModelPanel(ctx);
  applySubscriptionFast(ctx);
  applyWorkflowStatus(ctx);
  const openPanel = section => ctx.sidebarRight.openTab('trisoul-x-workbench', { params: { section } });
  const sections = [
    ['tasks', '任务', 'context', TaskPanel],
    ['context', '上下文', 'layers', PipelinePanel],
    ['memory', '记忆', 'memory', SummaryPanel],
    ['computer', '电脑', 'computer', props => <ComputerPane {...props}/>],
    ['monitor', '监控', 'monitor', Monitor],
  ];
  function Workbench({ initialSection = 'tasks', ...props }) {
    const { tab } = props.useTabInfo();
    const section = sections.some(([id]) => id === tab.navigation?.params?.section) ? tab.navigation.params.section : initialSection;
    return <div className="tx-workbench cx-integrated">
      <nav className="cx-navigation" aria-label="工作台导航">
        {sections.map(([id, label, icon]) => <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => tab.actions.openTab('trisoul-x-workbench', { params: { section: id }, replaceTab: tab.kind !== 'trisoul-x-workbench' })}>{icon === 'computer' ? <ComputerIcon size={15}/> : <Icon name={icon} size={15}/>}<span>{label}</span></button>)}
      </nav>
      {sections.map(([id, label, , Component]) => <section key={id} className="tx-workbench-page" data-section={id} hidden={section !== id} aria-label={label}>
        <Component {...props} useTabInfo={() => { const info = props.useTabInfo(); return { ...info, tab: { ...info.tab, visible: info.tab.visible && section === id } }; }} conversation={ctx.get('conversation')}/>
      </section>)}
    </div>;
  }
  const { ComputerEntry, ComputerPane } = applyComputerUseClient(ctx, { integrated: true, openPanel, renderPane: props => <Workbench {...props} initialSection="computer"/> });
  function ComposerDock(props) {
    const running = props.useSessionStatus(s => Boolean(s.get(props.sessionId)?.running));
    const [usageOpen, setUsageOpen] = useState(true);
    useEffect(() => { setUsageOpen(true); }, [props.sessionId]);
    return <div className="tx-composer-dock" data-session-id={props.sessionId} data-omd-running={running ? '' : undefined} data-omd-usage-expanded={usageOpen ? '' : undefined}><div className="tx-composer-tools"><button type="button" className="tx-workbench-entry" aria-label="打开工作台" title="打开工作台" onClick={() => openPanel('tasks')}><Icon name="context" size={15}/><span>工作台</span></button><ComputerEntry {...props}/></div><button type="button" className="tx-usage-toggle" aria-label="用量详情" aria-expanded={usageOpen} onClick={() => setUsageOpen(value => !value)}><Icon name="monitor" size={14}/><span>用量</span><Icon name="chevron" size={12}/></button><StatsLine {...props} onOpen={() => openPanel('monitor')}/></div>;
  }
  const getAppearanceRuntime = applySkins(ctx);
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'trisoul_x'; tag.textContent = css + '\n' + shellCss + '\n' + whaleCss + '\n' + versionCss + '\n' + workbenchCss + '\n' + monitorCss; document.head.appendChild(tag);
    const runtime = getAppearanceRuntime();
    const sync = () => document.documentElement.classList.toggle('trisoul-shell', runtime.getSnapshot().active !== false);
    const off = runtime.subscribe(sync); sync();
    return () => { off(); tag.remove(); document.documentElement.classList.remove('trisoul-shell'); };
  });
  applyAppearanceBrand(ctx, getAppearanceRuntime);
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'trisoul-x', order: 16, label: () => 'Oh My DSH' }, ContextSettings));
  applyRecommendedPlugins(ctx);
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
  applyConversationRecords(ctx);
}
