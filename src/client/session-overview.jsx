import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { whalePath } from './brand.mjs';
import { headerWorkflows, workflowChildLabels } from './workflow-header.mjs';
import { collectAgents, collectOutputs, collectSources, childAddress, whaleColor, projection, AGENTS_KIND, JOBS_KIND, SOURCES_KIND, OUTPUTS_KIND } from './session-overview.mjs';
import { createTeamOverview, createJobsOverview, createWorkflowOverview } from '../../lib/host/overview-native.factory.mjs';
import { liveWorkflowData, workflowJobs } from './workflow-status.mjs';

const empty = { subscribe: () => () => {}, getSnapshot: () => undefined };
const useStore = store => useSyncExternalStore(useCallback(fn => store.subscribe(fn), [store]), useCallback(() => store.getSnapshot(), [store]));
const teamNative = createTeamOverview(require), jobsNative = createJobsOverview(require), workflowNative = createWorkflowOverview(require);
function Whale({ id }) { return <svg viewBox="0 0 24 18" width="20" height="20" style={{ flexShrink: 0, color: whaleColor(id) }} aria-hidden="true"><path d={whalePath} fill="currentColor"/></svg>; }
const entriesFor = (slots, name, accept) => ({ ctx: slots.ctx,
  entries: key => slots.entries(key).filter(accept), entriesOfSlot: key => slots.entriesOfSlot(key).filter(accept),
  subscribe: (key, listener) => slots.subscribe(key, listener), register: (options, component) => slots.register(options, component) });

export function applySessionOverview(ctx, openCU) {
  if (!openCU.OverviewSlot) return;
  function Overview(props) {
    const Component = openCU.getOverviewSlot?.(ctx) ?? openCU.OverviewSlot;
    return <Component {...props}/>;
  }
  const states = new Map(), listeners = new Set(), composers = new Map(), chatActions = new Map();
  const notify = () => { for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const useOverview = sessionId => useSyncExternalStore(subscribe, () => states.get(sessionId));
  const pageKinds = { agents: AGENTS_KIND, jobs: JOBS_KIND, sources: SOURCES_KIND, outputs: OUTPUTS_KIND };
  const openPage = (sessionId, section, params = {}) => ctx.sidebarRight.openTabIn(sessionId, pageKinds[section], { revealIfOpened: true, params: { ...params, nonce: Date.now() } });
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
    function Header({ Original, ...props }) {
      const { sessionId } = props;
      const sessions = props.useSessions(value => value), statuses = props.useSessionStatus(value => value);
      const chat = props.useChat?.(value => value);
      const events = useStore(scope.sessions.binding(sessionId)?.eventSource ?? empty);
      const jobsState = useStore(scope.jobs.state);
      const durable = projection(sessions, sessionId).omdOverview;
      const workflows = useMemo(() => [...new Map([...(durable?.workflows ?? []), ...headerWorkflows(chat)].map(node => [node.id, node])).values()].sort((a, b) => b.anchorSeq - a.anchorSeq), [chat, durable]);
      const labels = useMemo(() => workflowChildLabels(events?.entries ?? []), [events]);
      const agents = useMemo(() => collectAgents(sessionId, sessions, statuses, workflows, labels), [sessionId, sessions, statuses, workflows, labels]);
      const seen = useRef(new Map());
      useEffect(() => scope.jobs.watchRows(sessionId), [sessionId]);
      useEffect(() => {
        const keys = new Set(agents.parents);
        for (const id of keys) {
          const summary = sessions.byId?.[id];
          const revision = `${summary?.updatedAt ?? ''}:${summary?.running ?? ''}`;
          if (seen.current.get(id) === revision) continue;
          seen.current.set(id, revision);
          void scope.sessions.refreshProjections(id).catch(() => {});
        }
        for (const id of seen.current.keys()) if (!keys.has(id)) seen.current.delete(id);
      }, [agents.parents, sessions.byId]);
      const data = useMemo(() => {
        const rows = agents.rows.map(row => ({ ...row, rootId: sessionId }));
        const allJobs = jobsState?.rows?.[sessionId] ?? [];
        const runs = workflowJobs(events?.entries ?? []);
        return { ...agents, rows, active: rows.filter(row => ['running', 'provisioning'].includes(row.status)),
          context: props, workflows: agents.workflows.map(node => node.ownerId === sessionId ? { ...node, data: liveWorkflowData(node, runs, allJobs, sessionId) } : node),
          outputs: [...new Map([...(durable?.outputs ?? []), ...collectOutputs(chat)].map(item => [item.id, item])).values()],
          sources: [...new Map([...(durable?.sources ?? []), ...collectSources(events?.entries ?? [])].map(item => [item.id, item])).values()],
          allJobs, jobs: allJobs.filter(job => ['bash', 'pwsh'].includes(job.kind) && ['running', 'stopping'].includes(job.status)), whalePath,
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
      }, [agents, jobsState, sessionId, chat, events, workflows, durable]);
      useLayoutEffect(() => { states.set(sessionId, data); notify(); }, [sessionId, data]);
      useEffect(() => () => { states.delete(sessionId); seen.current.clear(); notify(); }, [sessionId]);
      return <Original {...props} overview={data}/>;
    }
    scope.slots.inject('conversation.session.header.utilities', () => {
      const slots = entriesFor(scope.slots, 'conversation.session.header.utilities', entry => entry.options.id === 'opencu.monitoring');
      return decorateSlotComponent(slots, 'conversation.session.header.utilities', () => true, original => {
        const Original = original.component;
        return props => <Header {...props} Original={Original}/>;
      });
    });
    // Reversible replacement: only hide duplicate native entries while the
    // actual summary mount for this exact Session is alive.
    scope.slots.inject('conversation.session.header.actions', () => {
      const slots = entriesFor(scope.slots, 'conversation.session.header.actions', entry => ['subagent-catalog', 'agent-team', 'job-list'].includes(entry.options.id));
      return decorateSlotComponent(slots, 'conversation.session.header.actions', () => true, original => {
        const Original = original.component;
        return function NativeEntry(props) { const overview = useOverview(props.sessionId); return overview ? null : <Original {...props}/>; };
      });
    });
    function JobsPage({ sessionId, useTabInfo }) {
      const state = useStore(scope.jobs.state), { tab } = useTabInfo();
      const rows = state?.rows?.[sessionId] ?? [];
      const [expanded, setExpanded] = useState(tab.navigation?.params?.jobId), [armed, setArmed] = useState(null), [error, setError] = useState(null), [now, setNow] = useState(Date.now);
      useEffect(() => scope.jobs.watchRows(sessionId), [sessionId]);
      useEffect(() => { setExpanded(tab.navigation?.params?.jobId); }, [tab.navigation?.params?.nonce]);
      const observable = rows.find(row => row.id === expanded && jobsNative.isObservable(row))?.id;
      useEffect(() => { if (!observable || !tab.visible) return; return scope.jobs.observe(sessionId, observable); }, [sessionId, observable, tab.visible]);
      useEffect(() => { if (!tab.visible || !rows.some(row => row.status === 'running')) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [tab.visible, rows]);
      useEffect(() => { if (!armed) return; const timer = setTimeout(() => setArmed(null), 4000); return () => clearTimeout(timer); }, [armed]);
      const t = scope.locale.bind('omdOverviewJobs');
      return <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
        {error && <p role="alert">{error}</p>}
        {['running', 'settled'].map(group => <section key={group}><h3>{group === 'running' ? '正在运行' : '已结束'}</h3>{rows.filter(row => ['running', 'stopping'].includes(row.status) === (group === 'running')).map(job => <jobsNative.JobItem key={job.id} job={job} view={state?.observed?.[String(job.id)]} expanded={expanded === job.id} now={now} t={t}
          onToggle={() => setExpanded(value => value === job.id ? undefined : job.id)}
          kill={job.status === 'running' ? { state: armed === job.id ? 'armed' : 'idle', onPress: async () => {
            if (armed !== job.id) { setArmed(job.id); return; }
            setArmed(null); try { const result = await scope.jobs.kill(sessionId, job.id); if (!result.ok) throw Error(result.error?.message || '停止失败'); } catch (reason) { setError(reason.message); }
          } } : undefined}/>)}</section>)}
        {!rows.length && <p>暂无后台任务</p>}
      </div>;
    }
    function OverviewPage(props) {
      const data = useOverview(props.sessionId);
      if (!data) return <div role="status" style={{ padding: 20 }}>正在加载会话总览…</div>;
      const panels = [];
      if (props.variant === 'agents') {
        for (const { id, team } of data.teams) panels.push({ id: `team-${id}`, groupId: id, memberIds: team.members.map(member => member.id), title: `Agent Team${id === props.sessionId ? '' : ' · ' + (data.rows.find(row => row.id === id)?.label || id)}`, content: <teamNative.TeamPanel sessionId={id} team={team}
          useSessions={props.useSessions} useSessionStatus={props.useSessionStatus} t={scope.locale.bind('omdOverviewTeam')} renderAvatar={id => <Whale id={id}/>}
          openTeammate={(_, childId) => { const row = data.rows.find(row => row.id === childId); if (row) openAgent(row); else scope.uiWorkspace.openSession(childId); }}/> });
        for (const node of data.workflows) panels.push({ id: `workflow-${node.id}`, groupId: node.id, memberIds: node.data.phases.flatMap(phase => phase.members.map(member => member.childId)), title: `Workflow · ${node.data.name}`, content: React.createElement(workflowNative.WorkflowPanel, {
          ...data.context, sessionId: node.ownerId ?? props.sessionId, node, renderAvatar: id => <Whale id={id}/>, t: scope.locale.bind('workflowRun'), openSession: target => {
            const id = typeof target === 'string' ? target : target.childSessionId;
            const row = data.rows.find(row => row.id === id); return row ? openAgent(row) : scope.uiWorkspace.openSession(target);
          },
        }) });
      }
      return <div style={{ height: '100%', overflow: 'auto', paddingBlock: 12 }}><Overview sessionId={props.sessionId} variant={props.variant} overview={data} panels={panels}/></div>;
    }
    for (const [kind, title, variant] of [[AGENTS_KIND, '子智能体', 'agents'], [JOBS_KIND, '后台进程', 'jobs'], [SOURCES_KIND, '来源', 'sources'], [OUTPUTS_KIND, '输出内容', 'outputs']]) {
      const id = `trisoul_x/${kind}`;
      scope.effect(() => scope.sidebarRightTabs.register({ id, kind, multiple: false, title: () => title,
        guide: [{ id: kind, order: 32, title: () => title }] }));
      scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: id }, variant === 'jobs' ? JobsPage : props => <OverviewPage {...props} variant={variant}/>));
    }
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
        return <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {data && row && <Overview sessionId={parentId} variant="detail" overview={{ ...data, detail: row }}/>}<div style={{ flex: 1, minHeight: 0 }}><Original {...props}/></div>
        </div>;
      };
    }));
  });
  ctx.effect(() => () => { states.clear(); composers.clear(); chatActions.clear(); notify(); listeners.clear(); });
}
