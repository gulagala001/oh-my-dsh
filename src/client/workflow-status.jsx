import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';
import { liveWorkflowData, workflowJobs } from './workflow-status.mjs';

export function applyWorkflowStatus(ctx) {
  ctx.inject(['jobs'], scope => {
    const cache = new WeakMap();
    scope.slots.inject('conversation.chat.node', () => decorateSlot(scope.slots, 'conversation.chat.node', key => key === 'workflow-run', original => {
      const Original = original.component;
      function WorkflowStatus(props) {
        const { sessionId, node } = props;
        const source = scope.sessions.binding(sessionId).eventSource;
        const window = useSyncExternalStore(source.subscribe.bind(source), source.getSnapshot.bind(source));
        const jobs = useSyncExternalStore(scope.jobs.state.subscribe.bind(scope.jobs.state), scope.jobs.state.getSnapshot.bind(scope.jobs.state));
        useEffect(() => scope.jobs.watchRows(sessionId), [sessionId]);
        if (!cache.has(window)) cache.set(window, workflowJobs(window.entries));
        const runs = cache.get(window);
        const data = useMemo(() => liveWorkflowData(node, runs, jobs.rows[sessionId], sessionId), [node, runs, jobs, sessionId]);
        return <Original {...props} node={data === node.data ? node : { ...node, data }}/>;
      }
      return { options: { ...original.options, name: 'conversation.chat.node', key: 'workflow-run', locale: original.locale,
        inject: original.inject, store: original.store, children: original.children, priority: (original.options.priority ?? 0) - 1 }, component: WorkflowStatus };
    }));
  });
}
