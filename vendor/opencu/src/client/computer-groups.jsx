import React, { useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { CodexCuWorkedForLabel } from './codex-cu-activity-group.jsx';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

const computerTools = new Set(['computer_use', 'computer_use_reset']);

function isComputerCallTree(root) {
  const pending = [root], seen = new Set();
  while (pending.length) {
    const block = pending.pop();
    if (!block || seen.has(block)) return false;
    seen.add(block);
    if (block.kind !== 'tool-result' || !computerTools.has(block.call?.name ?? block.name)
      || block.isError !== false || block.error || block.meta?.computerUseError) return false;
    if (!Array.isArray(block.subCalls)) return false;
    pending.push(...block.subCalls);
  }
  return true;
}

function isCompleteComputerProcess(data, spec) {
  if (!Array.isArray(data) || data.length === 0 || data.length !== spec.toolCallCount
    || spec.messageCount !== 0 || spec.subagentCount !== 0 || spec.inlineReasoning !== false
    || spec.answerAnchorSeq == null) return false;
  const rootIds = new Set();
  for (const item of data) {
    if (!isComputerCallTree(item?.root) || typeof item.root.callId !== 'string'
      || rootIds.has(item.root.callId)) return false;
    rootIds.add(item.root.callId);
  }
  return true;
}

// Native Chat still owns every row, its order, process visibility and the
// disclosure state. Only a proven, successfully settled CU-only title changes.
// Native read_image/view_image and all attachment gallery owners are untouched.
export function computerGroupPresentation(ctx) {
  ctx.slots.inject('conversation.chat.node', () => decorateSlotComponent(ctx.slots, 'conversation.chat.node', key => key === 'turn-process', original => {
    const Original = original.component;
    const originalName = Original?.type?.name ?? Original?.name;
    // Other plugins may occupy this key. A different view keeps its own
    // renderer, even if its props happen to resemble the shipped owner.
    if (original.locale !== 'chat' || originalName !== 'TurnProcessNodeView') return Original;
    const localeSource = ctx.locale;
    const subscribeLocale = listener => localeSource.subscribe(listener);
    const readLocale = () => localeSource.getSnapshot()?.active;

    function ComputerProcessTitle(props) {
      const { node, turnProcess, source } = props;
      const spec = turnProcess.spec;
      const data = useSyncExternalStore(source.subscribe, source.getSnapshot);
      const hasOtherProcessRows = props.useChat(state => {
        if (typeof state.locations?.getTurn !== 'function' || typeof state.nodes?.get !== 'function') return true;
        const keys = state.locations.getTurn(spec.turn);
        if (!Array.isArray(keys)) return true;
        for (const key of keys) {
          const row = state.nodes.get(key);
          if (!row || !['visible', 'hidden'].includes(row.visibility) || !Number.isFinite(row.anchorSeq)) return true;
          if (row.visibility !== 'visible' || row.kind === 'turn-process' || row.anchorSeq < spec.processStartSeq
            || spec.answerAnchorSeq != null && row.anchorSeq >= spec.answerAnchorSeq) continue;
          if (row.kind !== 'tool-call' || !isComputerCallTree(row.data?.root)) return true;
        }
        return false;
      });
      const activeLocale = useSyncExternalStore(subscribeLocale, readLocale);
      const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
      const reason = turn?.end?.data?.reason?.kind;
      if (turn?.status !== 'closed' || turn.turn !== spec.turn || reason !== 'completed' || !turnProcess.foldable
        || !turnProcess.hasContent || hasOtherProcessRows || node.data.turn !== spec.turn
        || !isCompleteComputerProcess(data, spec) || !Number.isFinite(turn.start?.time)
        || !Number.isFinite(turn.end?.time) || !['zh', 'en'].includes(activeLocale)) return <Original {...props}/>;

      const locale = activeLocale === 'zh' ? 'zh-CN' : 'en';
      // Exact Codex source: LW and zh-CN localConversation.workedFor.v2.
      const formatMessage = (descriptor, values) => descriptor.id === 'localConversation.workedFor.v2'
        ? (activeLocale === 'zh' ? '用时 {time}' : descriptor.defaultMessage).replace('{time}', values.time)
        : descriptor.defaultMessage;
      const open = turnProcess.open;
      return <CodexCuScope>
        <span role="status" aria-live="polite" aria-atomic="true" style={{ clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', width: 1, height: 1, position: 'absolute', overflow: 'hidden' }}>{props.t('message.turnProcess.worked')}</span>
        <div className="cua-text-size-chat cua-text-secondary">
          <CodexCuButton color="ghostTertiary" radius="small" size="inline" className="cua-inline-flex cua-max-w-full cua-flex-wrap cua-text-size-chat"
            data-open={open || undefined} data-turn-process={node.data.turn} data-turn-process-messages={node.data.messageCount}
            data-turn-process-tool-calls={node.data.toolCallCount} data-turn-process-subagents={node.data.subagentCount}
            aria-expanded={open} onClick={event => { event.currentTarget.focus(); turnProcess.setOpen(!open); }}>
            <span><CodexCuWorkedForLabel status="worked" startedAtMs={turn.start.time} completedAtMs={turn.end.time}
              locale={locale} formatMessage={formatMessage} className="cua-text-inherit"/></span>
            <CodexCuIcon name="shared:wE" className={'cua-icon-2xs cua-transition-transform cua-duration-basic ' + (open ? 'cua-rotate-90' : 'cua-rotate-0')}/>
          </CodexCuButton>
        </div>
        <div className="cua-pt-1 cua-text-size-chat cua-text-secondary"><div className="cua-w-full cua-border-t cua-border-default"/></div>
      </CodexCuScope>;
    }

    function ComputerProcessOwner(props) {
      const nodes = props.useChat(state => state.nodes);
      if (typeof nodes?.turnDataSource !== 'function') return <Original {...props}/>;
      const source = nodes.turnDataSource(props.turnProcess.spec.turn, 'tool-call');
      if (typeof source?.subscribe !== 'function' || typeof source?.getSnapshot !== 'function') return <Original {...props}/>;
      return <ComputerProcessTitle {...props} source={source}/>;
    }

    function ProcessPresentation(props) {
      const owner = props.turnProcess, spec = owner?.spec;
      if (typeof props.useChat !== 'function' || !spec || !Number.isFinite(spec.turn)
        || !Number.isFinite(spec.processStartSeq) || !Number.isFinite(spec.answerAnchorSeq)
        || typeof owner.open !== 'boolean' || typeof owner.setOpen !== 'function' || !props.node?.location
        || !props.node?.data || typeof props.t !== 'function' || typeof localeSource?.subscribe !== 'function'
        || typeof localeSource?.getSnapshot !== 'function') return <Original {...props}/>;
      return <ComputerProcessOwner {...props}/>;
    }
    return ProcessPresentation;
  }));
}
