import { z } from 'zod';
import { TASK_GUIDE, TASK_VERIFY_GUIDE } from './prompts.mjs';

const statuses = ['pending', 'in_progress', 'completed'];
export const TASK_PARAMETERS = {
  type: 'object', required: ['todos'], properties: {
    todos: { type: 'array', description: 'The COMPLETE task list, replacing the previous list. Carry forward still-valid task details and verification records.', items: {
      type: 'object', required: ['content', 'status'], properties: {
        content: { type: 'string', description: 'What the task requires — keep the scope of the user’s request.' },
        status: { type: 'string', enum: statuses, description: 'pending (not started) / in_progress (being worked) / completed (finished)' },
        source: { type: 'string', description: 'The user’s relevant original wording, quoted verbatim when useful to anchor the task.' },
        verification: { type: 'object', required: ['method'], properties: {
          method: { type: 'string', description: 'How to verify this task and what observable result would establish it: a command, test, or real operation.' },
          result: { type: 'string', description: 'What actually happened: the command or action, observed output, and supporting file or location. Record failures or anything still unverified plainly. Omit while not yet run.' },
        } },
      },
    } },
  },
};
export const TASK_DESCRIPTION = [
  "Creates and edits the todo list anchored to the user's own wording.", TASK_GUIDE,
  'Send the complete list in todos. Each task carries its own status, source wording, and verification method/result. Run checks with the available execution tools and record their observed results on the same task. When a task changes, update its status and verification to match the revised task.',
  TASK_VERIFY_GUIDE,
].join('\n\n');

export const taskText = todos => todos.map(t => `[${t.status}] ${t.content}${t.source ? '\nSource: ' + t.source : ''}${t.verification ? '\nVerification: ' + t.verification.method + '\nResult: ' + (t.verification.result || 'Not yet recorded.') : ''}`).join('\n\n') || '(empty)';
export const currentTasks = (session, cached = []) => session?.snapshotEvents().findLast(e => e.type === 'todo/write')?.data.todos ?? cached;

export function registerTasks(ctx) {
  // One durable DSH todo/write snapshot; the native checklist and plugin panel read the same tasks.
  const schema = z.array(z.object({ content: z.string(), status: z.enum(statuses), source: z.string().optional(), verification: z.object({ method: z.string(), result: z.string().optional() }).optional() })).nullable();
  ctx.sessionProjections.register({
    key: 'todos', stateSchema: schema, init: () => null,
    apply: (state, event) => event.type === 'todo/write' ? event.data.todos : state,
    wire: { viewSchema: schema, view: state => state }, stateVersion: 3,
  });
  ctx.tools.register({
    name: 'todo_write', description: TASK_DESCRIPTION, parameters: TASK_PARAMETERS,
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    async execute({ todos }, { agent }) {
      const tasks = todos.map(t => ({ ...t, content: t.content.trim() }));
      agent.session.append('todo/write', { todos: tasks });
      return taskText(tasks);
    },
    presentCall: args => ({ card: 'generic', title: '更新任务与验证', kind: 'other', rawInput: args.todos }),
  });
}
