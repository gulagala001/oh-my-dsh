import {ComputerIcon} from './computer-icons.jsx';
import React, { useSyncExternalStore } from 'react';
import { computerGroups } from './computer-groups.mjs';

export function computerGroupPresentation(ctx) {
  const cache = new WeakMap(), open = new Set(), listeners = new Set();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const groups = snapshot => {
    if (!cache.has(snapshot)) cache.set(snapshot, computerGroups(snapshot.order.map(key => snapshot.nodes.get(key)).filter(Boolean)));
    return cache.get(snapshot);
  };
  function Group({ sessionId, useChat, nodeKey, callId, children }) {
    const group = useChat(snapshot => groups(snapshot).get(nodeKey ?? `call:${callId}`));
    const identity = `${sessionId}:${group?.id}`;
    const expanded = useSyncExternalStore(subscribe, () => open.has(identity));
    if (!group || !group.calls.length) return children;
    const first = nodeKey ? nodeKey === group.id : group.headerCallId === callId;
    const toggle = () => { if (expanded) open.delete(identity); else open.add(identity); for (const notify of listeners) notify(); };
    if (!first && !expanded) return <span data-cu-group-hidden="true"/>;
    return <div className="tx-cu-group" data-cu-group={first ? group.id : undefined}>
      {first && <button type="button" className="tx-cu-group-toggle" aria-expanded={expanded} onClick={toggle}>
        <ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/><ComputerIcon name="screen" size={14}/><strong>Computer Use</strong><span>{group.calls.length} 次操作</span>
        <span className="tx-cu-group-title">{group.title}</span>
        <span className={group.failures ? 'tx-cu-error' : ''}>{group.running ? '执行中' : group.failures ? `${group.failures} 次失败` : group.stopped ? '已停止' : '已执行'}</span>
      </button>}
      {expanded && children}
    </div>;
  }
  ctx.slots.inject('conversation.chat.node', () => {
    let dispose, installed=false;
    const install = () => {
      if (installed) return;
      const original = ctx.slots.entriesOfSlot('conversation.chat.node').find(entry => entry.options.key === 'assistant-step');
      if (!original) return;
      installed=true;
      const Original = original.component;
      function GroupedAssistant(props) { return <Group {...props} nodeKey={props.node.key}><Original {...props}/></Group>; }
      dispose = ctx.slots.register({ name: 'conversation.chat.node', key: 'assistant-step', locale: 'chat', priority: (original.options.priority ?? 0) - 1 }, GroupedAssistant);
    };
    const unsubscribe = ctx.slots.subscribe('conversation.chat.node', install); install();
    return () => { unsubscribe(); dispose?.(); open.clear(); listeners.clear(); };
  });
  return Group;
}
