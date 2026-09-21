import React, { useId, useState, useSyncExternalStore } from 'react';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';
import { compactionGroups, taskInjectionDefinition, supersededTaskInjections } from './conversation-records.mjs';
import css from './conversation-records.css';

function Record({ title, hint, kind, children }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div className="omd-context-record" data-omd-record={kind}>
    <button type="button" className="omd-record-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={kind === 'compaction' ? 'M4 5h16M4 12h16M4 19h16M8 2v6M16 9v6M8 16v6' : 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'}/></svg>
      <span className="omd-record-title">{title}</span><span className="omd-record-hint">{hint}</span>
      <svg className="omd-record-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
    </button>
    <div id={id} className="omd-record-body" hidden={!open}>{open && children}</div>
  </div>;
}

function CompactionRecord({ group }) {
  return <Record title="上下文压缩" hint={`${group.parts.length} 段${group.items ? ` · 替换 ${group.items} 条` : ''}`} kind="compaction">
    {group.parts.map((part, i) => <details className="omd-record-part" key={part.id}>
      <summary>第 {i + 1} 段<span>{part.error ? '失败' : part.tokens === null ? '查看摘要' : `原文约 ${part.tokens.toLocaleString()} tokens`}</span></summary>
      {part.error && <p role="alert">{part.error}</p>}
      <pre>{part.summary ?? '这段摘要不在已加载的历史中。'}</pre>
    </details>)}
  </Record>;
}

export function applyConversationRecords(ctx) {
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'omd-conversation-records'; tag.textContent = css; document.head.append(tag);
    return () => tag.remove();
  });
  ctx.inject(['uiConversation'], scope => scope.uiConversation.events.register(taskInjectionDefinition));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'omd-task-injection' }, TaskRecord));
  const cache = new WeakMap();
  const recordsFor = window => {
    if (!cache.has(window)) cache.set(window, { groups: compactionGroups(window.entries), hiddenInjections: supersededTaskInjections(window.entries) });
    return cache.get(window);
  };
  function useRecords(sessionId) {
    const source = ctx.sessions.binding(sessionId).eventSource;
    const window = useSyncExternalStore(source.subscribe.bind(source), source.getSnapshot.bind(source));
    return recordsFor(window);
  }
  function useGroups(sessionId) { return useRecords(sessionId).groups; }
  function TaskRecord({ node, sessionId }) {
    const { hiddenInjections } = useRecords(sessionId), data = node.data;
    if (hiddenInjections.has(data.seq)) return <span data-omd-record-hidden hidden/>;
    return <Record title={data.title} hint={'已注入' + (data.todo ? ` · ${data.done}/${data.total} 项完成` : '')} kind="injection"><pre>{data.text}</pre></Record>;
  }
  function CompressionCommand({ node, sessionId }) {
    const group = useGroups(sessionId).get('command:' + node.commandId);
    if (group && node.outcome?.kind === 'success') return <CompactionRecord key={group.id} group={group}/>;
    return <Record title={'/' + node.name} hint={node.outcome ? node.outcome.kind === 'error' ? '失败' : '已处理' : '处理中'} kind="command">
      {node.args && <pre>{node.args}</pre>}<p role={node.outcome?.kind === 'error' ? 'alert' : 'status'}>{node.outcome?.text || '等待压缩结果…'}</p>
    </Record>;
  }
  for (const key of ['compact-p', 'compact-f']) ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key }, CompressionCommand));
  ctx.slots.inject('conversation.chat.node', () => decorateSlot(ctx.slots, 'conversation.chat.node', key => ['context', 'compaction', 'manual-compaction'].includes(key), original => {
    const Original = original.component, key = original.options.key;
    function ContextRecord(props) {
      // The dedicated row also covers replacement messages; the process
      // adapter groups it alongside ordinary context and tool records.
      return props.node.data.source?.plugin === 'trisoul-x:tasks'
        ? <span data-omd-record-hidden hidden/> : <Original {...props}/>;
    }
    function GroupedCompaction(props) {
      const groups = useGroups(props.sessionId);
      const command = props.node.data.command;
      const marker = key === 'manual-compaction' ? props.node.data.compaction : props.node.data;
      const group = marker && groups.get(marker.seq);
      if (!group || command && command.outcome?.kind !== 'success') return <Original {...props}/>;
      if (key === 'compaction' && marker.seq !== group.firstSeq) return <span data-omd-record-hidden hidden/>;
      return <CompactionRecord key={group.id} group={group}/>;
    }
    return { options: { name: 'conversation.chat.node', key, locale: 'chat', priority: (original.options.priority ?? 0) - 1 }, component: key === 'context' ? ContextRecord : GroupedCompaction };
  }));
}
