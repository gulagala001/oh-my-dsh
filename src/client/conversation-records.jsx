import { DisclosureRow } from '@deepseek-ai/dsh-client-ui-primitives';
import { Icon } from './native-icons.jsx';
import { sourceName } from '../message-source.mjs';
import React, { useState, useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { compactionGroups, taskInjectionDefinition, supersededTaskInjections } from './conversation-records.mjs';
import { btwRecordDefinition } from './btw-record.mjs';
import css from './conversation-records.css';

function Record({ title, hint, kind, children }) {
  const [open, setOpen] = useState(false);
  return <div className="omd-context-record" data-omd-record={kind}>
    <DisclosureRow icon={<Icon name={kind === 'compaction' ? 'compress' : 'context'} size={15}/>}
      title={title} open={open} expandable expandOnRowClick keepContentWhenOpen
      onToggle={() => setOpen(value => !value)} collapsedContent={<span className="omd-record-hint">{hint}</span>}>
      <div className="omd-record-body">{children}</div>
    </DisclosureRow>
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
  ctx.inject(['uiConversation'], scope => {
    scope.uiConversation.events.register(taskInjectionDefinition);
    scope.uiConversation.events.register(btwRecordDefinition);
  });
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'omd-task-injection' }, TaskRecord));
  function BtwRecord({ node }) {
    const { question, outcome } = node.data;
    return <article className="omd-btw-record" data-omd-record="btw" aria-label="侧问">
      <div className="omd-btw-question"><span>/btw</span> {question}</div>
      <div className="omd-btw-answer" role={outcome?.kind === 'error' ? 'alert' : 'status'}>{outcome?.text || (outcome ? '侧问已结束。' : '侧问处理中…')}</div>
    </article>;
  }
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'omd-btw' }, BtwRecord));
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'btw' }, () => <span data-omd-record-hidden hidden/>));
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
  ctx.slots.inject('conversation.chat.node', () => decorateSlotComponent(ctx.slots, 'conversation.chat.node', key => ['context', 'compaction', 'manual-compaction'].includes(key), original => {
    const Original = original.component, key = original.options.key;
    function ContextRecord(props) {
      // The dedicated row also covers replacement messages; the process
      // adapter groups it alongside ordinary context and tool records.
      return sourceName(props.node.data.source) === 'trisoul-x:tasks'
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
    return key === 'context' ? ContextRecord : GroupedCompaction;
  }));
}
