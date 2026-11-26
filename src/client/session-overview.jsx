import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button, Menu } from './native-controls.jsx';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { installOverviewPanel } from './session-overview-panel.jsx';
import { whalePath } from './brand.mjs';
import { collectAgents, childAddress, whaleColor, projection, AGENTS_KIND, JOBS_KIND, SOURCES_KIND, OUTPUTS_KIND } from './session-overview.mjs';
import { createTeamOverview, createJobsOverview, createWorkflowOverview } from '../../lib/host/overview-native.factory.mjs';
const useStore = store => useSyncExternalStore(useCallback(fn => store.subscribe(fn), [store]), useCallback(() => store.getSnapshot(), [store]));
const teamNative = createTeamOverview(require), jobsNative = createJobsOverview(require), workflowNative = createWorkflowOverview(require);
function Whale({ id }) { return <svg viewBox="0 0 24 18" width="20" height="20" style={{ flexShrink: 0, color: whaleColor(id) }} aria-hidden="true"><path d={whalePath} fill="currentColor"/></svg>; }
const entriesFor = (slots, name, accept) => ({ ctx: slots.ctx,
  entries: key => slots.entries(key).filter(accept), entriesOfSlot: key => slots.entriesOfSlot(key).filter(accept),
  subscribe: (key, listener) => slots.subscribe(key, listener), register: (options, component) => slots.register(options, component) });

const sections = { agents: '子智能体与任务', jobs: '后台进程', sources: '来源', outputs: '输出内容' };

function ResourceOverview({ variant = 'summary', overview, panels = [] }) {
  if (variant === 'summary') return <nav aria-label="会话资源">{Object.entries(sections).map(([section, label]) =>
    <Button key={section} size="sm" variant="ghost" onClick={() => overview.openPage(section)}>{label} · {
      section === 'agents' ? overview.rows.length : section === 'jobs' ? overview.allJobs.length : overview[section].length}</Button>)}</nav>;
  if (variant === 'detail') return <div><Button size="sm" onClick={() => overview.openPage('agents')}>返回子智能体</Button> {overview.detail.label}</div>;
  if (variant === 'agents') return <>{panels.map(panel => <section key={panel.id}><h3>{panel.title}</h3>{panel.content}</section>)}
    {overview.rows.map(row => <Button key={row.id} size="sm" variant="ghost" disabled={!row.available || !childAddress(row)} onClick={() => overview.openAgent(row)}>{row.label} · {row.status}</Button>)}
    {!panels.length && !overview.rows.length && <p>暂无子智能体或任务</p>}</>;
  const rows = overview[variant] ?? [];
  return <>{variant === 'sources' && <Button size="sm" onClick={overview.addSources}>添加来源</Button>}
    <ul>{rows.map(row => <li key={row.id}>{row.path || row.url
      ? <Button size="sm" variant="ghost" onClick={() => overview.openResource(row)}>{row.label}</Button> : row.label}</li>)}</ul>
    {!rows.length && <p>暂无{sections[variant]}</p>}</>;
}

export function applySessionOverview(ctx) {
  const usePanel = installOverviewPanel(ctx);
  // Filter the host guide only: standalone OpenCU and existing resource tabs
  // keep their registrations and behavior.
  const hiddenGuideKinds = new Set([AGENTS_KIND, JOBS_KIND, SOURCES_KIND, OUTPUTS_KIND]);
  const filteredGuides = new WeakMap();
  const guideEntries = entries => {
    if (!filteredGuides.has(entries)) filteredGuides.set(entries, entries.filter(entry => !hiddenGuideKinds.has(entry.kind)));
    return filteredGuides.get(entries);
  };
  ctx.slots.inject('sidebar.right.pane.tab', () => decorateSlotComponent(ctx.slots, 'sidebar.right.pane.tab',
    key => key === '@deepseek-ai/dsh-client-ui-sidebar-right/guide', original => {
      const Original = original.component;
      return function Guide(props) {
        const useGuideEntries = selector => props.useGuideEntries(entries => selector(guideEntries(entries)));
        return <Original {...props} useGuideEntries={useGuideEntries}/>;
      };
    }));
  // Provider lifetime only changes the renderer. OMD owns the resource index,
  // navigation and button even when the computer client did not initialize.
  let presenter = ResourceOverview;
  const usePresenter = () => useSyncExternalStore(subscribe, () => presenter);
  function Overview(props) {
    const Component = usePresenter();
    return <Component {...props}/>;
  }
  const states = new Map(), listeners = new Set(), composers = new Map(), chatActions = new Map();
  const activeComputers = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const useOverview = sessionId => useSyncExternalStore(subscribe, () => states.get(sessionId));
  const pageKinds = { agents: AGENTS_KIND, jobs: JOBS_KIND, sources: SOURCES_KIND, outputs: OUTPUTS_KIND };
  const pageKind = section => section === 'sources' && presenter !== ResourceOverview && ctx.sidebarRightTabs.get('opencu-sources') ? 'opencu-sources' : pageKinds[section];
  const openPage = (sessionId, section, params = {}) => ctx.sidebarRight.openTabIn(sessionId, pageKind(section), { revealIfOpened: true, params: { ...params, nonce: Date.now() } });
  function openAgent(row) {
    const address = childAddress(row);
    if (!address || !row.available) return;
    ctx.sidebarRight.openResourceIn(row.rootId, address, { kind: 'subagentchat', preferNewPane: false });
  }
  function openFile(sessionId, path) {
    if (chatActions.get(sessionId)?.openFile) return chatActions.get(sessionId).openFile(path);
    if (!path) throw Error('此来源没有可打开的文件地址');
    const encode = value => encodeURIComponent(value).replace(/%3A/gi, ':');
    return ctx.sidebarRight.openResourceIn(sessionId, `dsh-resource://file/session/${encode(sessionId)}/${path.replace(/\\/g, '/').split('/').map(encode).join('/')}`);
  }
  ctx.slots.inject('conversation.view', () => {
    const slots = entriesFor(ctx.slots, 'conversation.view', entry => entry.options.id === 'chat');
    return decorateSlotComponent(slots, 'conversation.view', () => true, original => {
      const Original = original.component;
      return function Chat(props) {
        useLayoutEffect(() => {
          const actions = { openFile: props.openFile, loadImage: props.loadImage, openExternalLink: props.openExternalLink };
          chatActions.set(props.sessionId, actions);
          return () => { if (chatActions.get(props.sessionId) === actions) chatActions.delete(props.sessionId); };
        }, [props.sessionId, props.openFile, props.loadImage, props.openExternalLink]);
        return <Original {...props}/>;
      };
    });
  });
  function addSources(sessionId) {
    const addFiles = composers.get(sessionId);
    if (!addFiles) throw Error('当前会话暂时不能添加附件');
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
    input.addEventListener('change', () => {
      const error = addFiles([...input.files]);
      if (error) ctx.conversation.input.for(ctx.sessions.scope(sessionId)).notify('error', error);
    }, { once: true });
    input.click();
  }
  // Capture the real composer's attachment admission, never manufacture upload receipts.
  ctx.slots.inject('conversation.composer.bar', () => decorateSlotComponent(ctx.slots, 'conversation.composer.bar', () => true, original => {
    const Original = original.component;
    return function Composer(props) {
      useLayoutEffect(() => {
        if (!props.sessionId || !props.addFiles) return;
        composers.set(props.sessionId, props.addFiles);
        return () => { if (composers.get(props.sessionId) === props.addFiles) composers.delete(props.sessionId); };
      }, [props.sessionId, props.addFiles]);
      return <Original {...props}/>;
    };
  }));
  ctx.inject(['jobs', 'locale'], scope => {
    scope.effect(() => scope.locale.register('omdOverviewTeam', teamNative.locale));
    scope.effect(() => scope.locale.register('omdOverviewJobs', jobsNative.locale));
    function Header(props) {
      const { sessionId } = props;
      const summaryPanel = usePanel(sessionId);
      const sessions = props.useSessions(value => value), statuses = props.useSessionStatus(value => value);
      const jobsState = useStore(scope.jobs.state);
      const durable = projection(sessions, sessionId).omdOverview;
      const agents = useMemo(() => collectAgents(sessionId, sessions, statuses), [sessionId, sessions, statuses]);
      const refreshProjection = useCallback(id => {
        void scope.sessions.refreshProjections(id).catch(error => scope.conversation.input.for(scope.sessions.scope(sessionId)).notify('error', error.message));
      }, [sessionId]);
      useEffect(() => scope.jobs.watchRows(sessionId), [sessionId]);
      useEffect(() => {
        // The native reader owns in-flight deduplication, failure state and
        // reconnect repair. Failed reads need an explicit retry, not a shadow
        // revision marker or an unbounded render-driven retry loop.
        for (const issue of agents.projectionIssues) if (issue.state === 'idle') refreshProjection(issue.id);
      }, [agents.projectionIssues, refreshProjection]);
      const data = useMemo(() => {
        const rows = agents.rows.map(row => ({ ...row, rootId: sessionId }));
        const allJobs = jobsState?.rows?.[sessionId] ?? [];
        return { ...agents, rows, active: rows.filter(row => ['running', 'provisioning'].includes(row.status)),
          context: props, ready: Boolean(durable), refreshProjection,
          outputs: durable?.outputs ?? [], sources: durable?.sources ?? [],
          allJobs, jobs: allJobs.filter(job => ['bash', 'pwsh'].includes(job.kind)), whalePath,
          openAgent, openPage: section => openPage(sessionId, section), openJob: id => openPage(sessionId, 'jobs', { jobId: id }),
          openMainAgent: row => scope.uiWorkspace.openSession({ parentSessionId: row.parentId, childSessionId: row.id, mode: row.mode }),
          addSources: () => addSources(sessionId),
          loadImage: attachment => chatActions.get(sessionId)?.loadImage?.(attachment),
          openResource: row => {
            if (!row.url) return openFile(sessionId, row.path);
            const open = chatActions.get(sessionId)?.openExternalLink;
            return open ? open(row.url) : window.open(row.url, '_blank', 'noopener,noreferrer');
          },
        };
      }, [agents, jobsState, sessionId, durable, refreshProjection]);
      const computerActive = useSyncExternalStore(subscribe, () => activeComputers.has(sessionId));
      const hasContent = Boolean(data.outputs.length || data.sources.length || data.rows.length || data.teams.length || data.workflows.length || data.allJobs.length || computerActive);
      const blank = sessions.byId?.[sessionId]?.blank === true;
      useLayoutEffect(() => {
        if (summaryPanel.container) summaryPanel.observeContent(blank, data.ready, hasContent, durable?.createdAt);
      }, [summaryPanel.container, summaryPanel.observeContent, blank, data.ready, hasContent, durable?.createdAt]);
      useLayoutEffect(() => { states.set(sessionId, data); notify(); }, [sessionId, data]);
      useEffect(() => () => { states.delete(sessionId); notify(); }, [sessionId]);
      const [popover, setPopover] = useState(false);
      const docked = Boolean(summaryPanel.container);
      const open = docked ? summaryPanel.open : popover;
      useEffect(() => { setPopover(false); }, [sessionId, docked]);
      const content = <div className="omd-overview-content"><Overview sessionId={sessionId} overview={data}/></div>;
      const button = <Button size="sm" variant="ghost" aria-label="会话总览" aria-expanded={open}
        aria-haspopup={docked ? undefined : 'menu'} onClick={() => docked ? summaryPanel.toggle() : setPopover(value => !value)}>会话总览</Button>;
      return docked ? <>{button}{createPortal(content, summaryPanel.container)}</> : <Menu anchor={button} open={open}
        items={Object.entries(sections).map(([id, label]) => ({ id, label }))} onSelect={section => { setPopover(false); openPage(sessionId, section); }}
        onClose={() => setPopover(false)} align="end" portal/>;
    }
    scope.slots.inject('conversation.session.header.utilities', () => scope.slots.register({
      name: 'conversation.session.header.utilities', id: 'omd-session-overview', order: 29,
    }, Header));
    scope.slots.inject('conversation.session.header.utilities', () => {
      const slots = entriesFor(scope.slots, 'conversation.session.header.utilities', entry => entry.options.id === 'opencu.monitoring');
      return decorateSlotComponent(slots, 'conversation.session.header.utilities', () => true, original => {
        const Original = original.component;
        // Keep OpenCU's native monitor and controls, including its standalone
        // fallback. Only active computer work contributes to auto-opening OMD.
        return function ComputerMonitor(props) {
          const active = props.usePresentation(value => value.activeTaskIds.includes(props.sessionId));
          useLayoutEffect(() => {
            if (!active) return;
            activeComputers.add(props.sessionId); notify();
            return () => { activeComputers.delete(props.sessionId); notify(); };
          }, [active, props.sessionId]);
          return <Original {...props}/>;
        };
      });
    });
    // Reversible replacement: only hide duplicate native entries while the
    // actual summary mount for this exact Session is alive.
    scope.slots.inject('conversation.session.header.actions', () => {
      const slots = entriesFor(scope.slots, 'conversation.session.header.actions', entry => ['subagent-catalog', 'agent-team', 'job-list'].includes(entry.options.id));
      return decorateSlotComponent(slots, 'conversation.session.header.actions', () => true, original => {
        const Original = original.component;
        return function NativeEntry(props) {
          const overview = useOverview(props.sessionId);
          return overview?.ready && !overview.projectionIssues.length ? null : <Original {...props}/>;
        };
      });
    });
    function JobsPage({ sessionId, useTabInfo }) {
      const state = useStore(scope.jobs.state), { tab } = useTabInfo();
      const rows = useMemo(() => jobsNative.ordered(state?.rows?.[sessionId] ?? []), [state?.rows?.[sessionId]]);
      const [expanded, setExpanded] = useState(tab.navigation?.params?.jobId), [armed, setArmed] = useState(null), [error, setError] = useState(null), [now, setNow] = useState(Date.now);
      const [settledOpen, setSettledOpen] = useState(undefined), [clearedKeys, setClearedKeys] = useState(() => new Set());
      const liveRows = rows.filter(jobsNative.isLive), settledRows = rows.filter(job => !jobsNative.isLive(job) && !clearedKeys.has(String(job.id)));
      const settledExpanded = settledOpen ?? liveRows.length === 0;
      useEffect(() => scope.jobs.watchRows(sessionId), [sessionId]);
      useEffect(() => {
        const id = tab.navigation?.params?.jobId;
        setExpanded(id);
        if (id != null) { setSettledOpen(true); setClearedKeys(keys => { const next = new Set(keys); next.delete(String(id)); return next; }); }
      }, [tab.navigation?.params?.nonce]);
      const observable = [...liveRows, ...(settledExpanded ? settledRows : [])].find(row => row.id === expanded && jobsNative.isObservable(row))?.id;
      useEffect(() => { if (!observable || !tab.visible) return; return scope.jobs.observe(sessionId, observable); }, [sessionId, observable, tab.visible]);
      useEffect(() => { if (!tab.visible || !rows.some(row => row.status === 'running')) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [tab.visible, rows]);
      useEffect(() => { if (!armed) return; const timer = setTimeout(() => setArmed(null), 4000); return () => clearTimeout(timer); }, [armed]);
      const t = scope.locale.bind('omdOverviewJobs');
      const clearSettled = () => {
        setClearedKeys(keys => new Set([...keys, ...settledRows.map(job => String(job.id))]));
        if (settledRows.some(job => job.id === expanded)) setExpanded(undefined);
      };
      const item = job => <jobsNative.JobItem key={job.id} job={job} view={state?.observed?.[String(job.id)]} expanded={expanded === job.id} now={now} t={t}
          onToggle={() => setExpanded(value => value === job.id ? undefined : job.id)}
          kill={job.status === 'running' ? { state: armed === job.id ? 'armed' : 'idle', onPress: async () => {
            if (armed !== job.id) { setArmed(job.id); return; }
            setArmed(null); try { const result = await scope.jobs.kill(sessionId, job.id); if (!result.ok) throw Error(result.error?.message || '停止失败'); } catch (reason) { setError(reason.message); }
          } } : undefined}/>;
      return <div style={{ display: 'flex', flexDirection: 'column', padding: 8, boxSizing: 'border-box', minHeight: 0, height: '100%' }}>
        {error && <p className={jobsNative.styles.notice} role="alert">{error}</p>}
        <jobsNative.JobsBody {...{ liveRows, settledRows, item, settledExpanded, setSettledOpen, clearSettled, t }}/>
        {!liveRows.length && !settledRows.length && <p className={jobsNative.styles.notice}>暂无后台任务</p>}
      </div>;
    }
    function OverviewPage(props) {
      const data = useOverview(props.sessionId);
      if (!data) return <div role="status" style={{ padding: 20 }}>正在加载会话总览…</div>;
      const panels = [];
      if (props.variant === 'agents') {
        for (const { id, team } of data.teams) panels.push({ id: `team-${id}`, groupId: id, memberIds: [], title: `Agent Team${id === props.sessionId ? '' : ' · ' + (data.rows.find(row => row.id === id)?.label || id)}`, content: <teamNative.TeamPanel sessionId={id}
          useProjection={() => team} useSessions={props.useSessions} t={scope.locale.bind('omdOverviewTeam')}/> });
        for (const node of data.workflows) panels.push({ id: `workflow-${node.id}`, groupId: node.id, memberIds: node.data.phases.flatMap(phase => phase.members.map(member => member.childId)), title: `Workflow · ${node.data.name}`, content: React.createElement(workflowNative.WorkflowPanel, {
          ...data.context, sessionId: node.ownerId ?? props.sessionId, node, renderAvatar: id => <Whale id={id}/>, t: scope.locale.bind('workflowRun'), openSession: target => {
            const id = typeof target === 'string' ? target : target.childSessionId;
            const row = data.rows.find(row => row.id === id); return row ? openAgent(row) : scope.uiWorkspace.openSession(target);
          },
        }) });
      }
      const issues = data.projectionIssues.filter(issue => props.variant === 'agents' || issue.id === props.sessionId);
      return <div style={{ height: '100%', overflow: 'auto', paddingBlock: 12 }}>
        {issues.map(issue => <div key={issue.id} className={jobsNative.styles.notice} role={issue.state === 'error' ? 'alert' : 'status'}>
          {data.rows.find(row => row.id === issue.id)?.label || '会话总览'}：{issue.state === 'error' ? issue.error || '读取失败'
            : issue.state === 'migration-required' ? '请先打开此会话完成历史迁移。'
              : issue.state === 'ready' ? '当前宿主未提供总览，请重新启用插件后刷新。' : '正在读取…'}
          {['error', 'migration-required'].includes(issue.state) && <Button size="sm" onClick={() => data.refreshProjection(issue.id)}>重试读取</Button>}
        </div>)}
        {data.ready && <Overview sessionId={props.sessionId} variant={props.variant} overview={data} panels={panels}/>}
      </div>;
    }
    for (const [kind, title, variant] of [[AGENTS_KIND, '子智能体', 'agents'], [JOBS_KIND, '后台进程', 'jobs'], [SOURCES_KIND, '来源', 'sources'], [OUTPUTS_KIND, '输出内容', 'outputs']]) {
      const id = `oh-my-dsh/${kind}`;
      scope.effect(() => scope.sidebarRightTabs.register({ id, kind, multiple: false, title: () => title,
        // Pages remain available from the overview and existing saved tabs.
        guide: [] }));
      scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: id }, variant === 'jobs' ? JobsPage : props => <OverviewPage {...props} variant={variant}/>));
    }
    scope.slots.inject('sidebar.right.pane.tab', () => decorateSlotComponent(scope.slots, 'sidebar.right.pane.tab', key => key === 'opencu.sources', original => {
      const Original = original.component;
      return function SourcesPage(props) {
        const data = useOverview(props.sessionId);
        // The overview includes native attachments as well as OpenCU's saved
        // pages, delivered files and WebMCP calls. Preserve standalone fallback.
        const renderer = usePresenter();
        return data && renderer !== ResourceOverview ? <OverviewPage {...props} variant="sources"/> : <Original {...props}/>;
      };
    }));
    // Keep native Conversation and its real composer. Only add the common
    // detail header above it; the native resource still owns retention.
    scope.slots.inject('sidebar.right.pane.tab', () => decorateSlotComponent(scope.slots, 'sidebar.right.pane.tab', key => key === '@deepseek-ai/dsh-client-ui-subagent', original => {
      const Original = original.component;
      return function ChildDetail(props) {
        const { tab } = props.useTabInfo();
        let parentId, childId;
        try { const url = new URL(tab.contentId); parentId = url.searchParams.get('parent'); childId = decodeURIComponent(url.pathname.split('/').at(-1)); } catch {}
        const all = useSyncExternalStore(subscribe, () => [...states.values()].find(data => data.rows.some(row => row.id === childId)));
        const data = all, row = data?.rows.find(row => row.id === childId);
        // Return through this native tab's placement, reusing its pane's overview.
        const returnToOverview = section => tab.actions.openTab(pageKind(section), { replaceTab: true });
        return <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {data && row && <Overview sessionId={parentId} variant="detail" overview={{ ...data, detail: row, openPage: returnToOverview }}/>}<div style={{ flex: 1, minHeight: 0 }}><Original {...props}/></div>
        </div>;
      };
    }));
  });
  ctx.effect(() => () => { states.clear(); composers.clear(); chatActions.clear(); activeComputers.clear(); notify(); listeners.clear(); });
  return function providePresenter(Component) {
    if (!Component) return;
    presenter = Component; notify();
    return () => { if (presenter === Component) { presenter = ResourceOverview; notify(); } };
  };
}
