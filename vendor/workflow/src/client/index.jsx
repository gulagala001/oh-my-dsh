import { applyWorkflowStatus } from './workflow-status.jsx';
import { applyWorkflowHeader } from './workflow-header.jsx';
import { acquireShared } from '../shared.mjs';

export const inject = ['slots', 'sessions', 'jobs', 'locale', 'uiWorkspace'];
export const name = 'dsh-workflow-client';
export const apply = ctx => acquireShared(ctx, 'client', {
  name, inject,
  apply(scope) { applyWorkflowStatus(scope); applyWorkflowHeader(scope); },
});
