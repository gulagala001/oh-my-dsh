import { WorkflowRuntime } from './runtime.mjs';
import { acquireShared } from './shared.mjs';

export const name = 'dsh-workflow-plus';
export const inject = ['agents', 'sessions'];
export const apply = ctx => acquireShared(ctx, 'runtime', WorkflowRuntime);
