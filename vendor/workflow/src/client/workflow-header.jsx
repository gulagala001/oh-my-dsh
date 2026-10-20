import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { StateDot, IconChevronDownOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { headerWorkflows, workflowPhaseLabel, workflowChildLabels, subagentTabTitle, withWorkflowLabels } from './workflow-header.mjs';
import { liveWorkflowData, workflowJobs } from './workflow-status.mjs';
import css from './workflow-header.css';

const empty = { subscribe: () => () => {}, getSnapshot: () => undefined };
const useStore = store => useSyncExternalStore(useCallback(fn => store.subscribe(fn), [store]), useCallback(() => store.getSnapshot(), [store]));
const statuses = { running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' };
const dots = { running: 'ongoing', completed: 'done', failed: 'error', cancelled: 'warning', interrupted: 'warning' };

function WorkflowProgress({ ctx, ...props }) {
  const { sessionId, useChat, renderPanel } = props;
  const chat = useChat(value => value);
  const window = useStore(ctx.sessions.binding(sessionId)?.eventSource ?? empty);
  const jobState = useStore(ctx.jobs.state);
  const runs = useMemo(() => workflowJobs(window?.entries ?? []), [window]);
  const workflows = headerWorkflows(chat).map(node => ({ ...node, data: liveWorkflowData(node, runs, jobState?.rows?.[sessionId], sessionId) }));
  const current = workflows.find(node => node.data.status === 'running') ?? workflows[0];
  const [open, setOpen] = useState(false);
  const trigger = useRef(null), panel = useRef(null), id = useId();
  const position = useAnchoredPosition({ open, anchorRef: trigger, panelRef: panel, side: 'bottom', gap: 8, margin: 12 });
  useDismissOnOutsidePointer(trigger, open, setOpen, panel);
  useEffect(() => ctx.jobs.watchRows(sessionId), [ctx, sessionId]);
  useEffect(() => { setOpen(false); }, [sessionId]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  if (!current || !renderPanel) return null;
  const phase = workflowPhaseLabel(current.data);
  return <>
    <Button size="sm" variant="ghost" ref={trigger} type="button" className="omd-workflow-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`Workflow：${current.data.name} · ${phase} · ${statuses[current.data.status]}`} onClick={() => setOpen(value => !value)}>
      <StateDot state={dots[current.data.status] ?? 'idle'}/><span>Workflow</span><span className="omd-workflow-phase">{phase}</span><IconChevronDownOutlineRegular/>
    </Button>
    {open && createPortal(<div ref={panel} id={id} tabIndex={-1} role="dialog" aria-label="Workflow 阶段与子代理" className="omd-workflow-popover"
      style={position ?? { visibility: 'hidden', left: 0, top: 0 }}>
      {workflows.map(node => renderPanel({ ...props, node, key: node.id }))}
    </div>, document.body)}
  </>;
}

export function applyWorkflowHeader(ctx) {
  ctx.inject(['jobs', 'locale', 'uiWorkspace'], scope => {
    scope.effect(() => {
      const style = document.createElement('style'); style.dataset.plugin = 'dsh-workflow-plus'; style.textContent = css;
      document.head.append(style); return () => style.remove();
    });
    const slot = 'conversation.session.header.actions';
    scope.slots.inject(slot, () => {
      // Keep the native catalog and navigation, add its workflow stage view in
      // the same header entry. The panel itself is the installed DSH renderer.
      const slots = { ctx: scope.slots.ctx,
        entries: name => scope.slots.entries(name).filter(entry => entry.options.id === 'subagent-catalog'),
        entriesOfSlot: name => scope.slots.entriesOfSlot(name).filter(entry => entry.options.id === 'subagent-catalog'),
        subscribe: (name, fn) => scope.slots.subscribe(name, fn), register: (options, component) => scope.slots.register(options, component) };
      return decorateSlotComponent(slots, slot, () => true, original => {
        const Original = original.component;
        function Header(props) {
          const events = useStore(scope.sessions.binding(props.sessionId)?.eventSource ?? empty);
          const labels = useMemo(() => workflowChildLabels(events?.entries ?? []), [events]);
          const namedState = useMemo(() => {
            const cache = new WeakMap();
            return state => {
              if (!cache.has(state)) cache.set(state, withWorkflowLabels(state, props.sessionId, labels));
              return cache.get(state);
            };
          }, [props.sessionId, labels]);
          const useSessions = useCallback((select, equal) => props.useSessions(state => select(namedState(state)), equal), [props.useSessions, namedState]);
          const renderer = useSyncExternalStore(
            useCallback(fn => scope.slots.subscribe('conversation.chat.node', fn), []),
            () => scope.slots.entriesOfSlot('conversation.chat.node').find(entry => entry.options.key === 'workflow-run')?.component);
          const renderPanel = renderer && (panelProps => React.createElement(renderer, { ...panelProps,
            t: scope.locale.bind('workflowRun'), openSession: target => scope.uiWorkspace.openSession(target) }));
          return <div className="omd-workflow-header"><Original {...props} useSessions={useSessions}/>{props.useChat && <WorkflowProgress {...props} useSessions={useSessions} ctx={scope} renderPanel={renderPanel}/>}</div>;
        }
        return Header;
      });
    });
    scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({ name: 'sidebar.right.pane.tab.title', key: '@deepseek-ai/dsh-client-ui-subagent' }, function ChildTitle({ useTabInfo, useResource, useSessions }) {
      const { tab } = useTabInfo();
      const resource = useResource(tab.contentId);
      const identity = useStore(resource.value?.reference.binding.session.projections.faceOf('subagent') ?? empty);
      const parent = resource.value?.address.parentSessionId;
      const events = useStore(parent ? scope.sessions.binding(parent)?.eventSource ?? empty : empty);
      const labels = useMemo(() => workflowChildLabels(events?.entries ?? []), [events]);
      const state = useSessions(value => value);
      return subagentTabTitle(tab.contentId, state, identity, labels, tab.title);
    }));
  });
}
