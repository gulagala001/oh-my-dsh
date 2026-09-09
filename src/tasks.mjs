import { z } from 'zod';
import { createTodoStore, taskMapSchema, verifyLinkSchema, todoToolDefinition } from './todolist.mjs';

const structure = taskMapSchema(), verification = verifyLinkSchema(), completion = todoToolDefinition();
export const TASK_DESCRIPTION = [
  structure.description.replace('use the todo tool', 'use op:check').replaceAll('your draft', 'your reply'),
  'op:check updates completion. ' + completion.description.replaceAll('your draft', 'your reply'),
  verification.description,
].join('\n\n');
export const TASK_PARAMETERS = {
  type: 'object', required: ['op'], properties: {
    ...structure.parameters.properties, ...verification.parameters.properties, ...completion.parameters.properties,
    op: { type: 'string', enum: ['excerpt', 'add', 'edit', 'remove', 'check', 'link', 'run', 'unlink', 'view', 'transcript'], description: 'Operation kind' },
    tasks: { type: 'array', items: { anyOf: [{ type: 'object' }, { type: 'string' }] }, description: structure.parameters.properties.tasks.description + ' ' + verification.parameters.properties.tasks.description },
    ids: { type: 'array', items: { type: 'string' }, description: 'Required for remove: ids of the tasks to delete. Required for unlink: link ids to withdraw.' },
  },
};

const legacyTasks = todos => todos.map((t, i) => ({ id: `T${i + 1}`, title: t.content, done: t.status === 'completed', anchor: null, links: [], legacySource: t.source || '', legacyVerification: t.verification }));
export function currentTaskSnapshot(session, cached) {
  const value = session?.snapshotEvents().findLast(e => e.type === 'todo/write')?.data ?? cached;
  if (Array.isArray(value?.tasks)) return value;
  return { excerpts: [], tasks: legacyTasks(Array.isArray(value) ? value : value?.todos || []) };
}
export function currentTasks(session, cached) {
  const record = currentTaskSnapshot(session, cached);
  return record.tasks.map(t => {
    const excerpt = record.excerpts.find(e => e.id === t.anchor?.excerpt);
    return { ...t, content: t.title, status: t.done ? 'completed' : 'pending',
      source: excerpt ? excerpt.text.slice(t.anchor.start, t.anchor.end) : t.legacySource || '',
      sourceMessage: excerpt?.msg, sourceExcerpt: excerpt?.id,
      verification: t.legacyVerification,
    };
  });
}

export function registerTasks(ctx) {
  const store = createTodoStore();
  const schema = z.array(z.object({ content: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) })).nullable();
  ctx.sessionProjections.register({
    key: 'todos', stateSchema: schema, init: () => null,
    apply: (state, event) => event.type === 'todo/write' ? event.data.todos : state,
    wire: { viewSchema: schema, view: state => state }, stateVersion: 4,
  });
  const pending = new Map();
  ctx.tools.register({
    name: 'todo_write', description: TASK_DESCRIPTION, parameters: TASK_PARAMETERS,
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute(args, { agent, signal }) {
      const session = agent.session;
      const job = (pending.get(session.id) || Promise.resolve()).catch(() => {}).then(async () => {
        signal?.throwIfAborted();
        let result;
        if (args.op === 'check') result = store.execTodo(session, args.updates, args.remove);
        else if (['link', 'run', 'unlink'].includes(args.op)) result = await store.execVerifyLink(session, args, session.header.cwd, signal);
        else {
          result = store.execTaskMap(session, args);
          if (args.op === 'view' && !result.isError) result.text += '\n\n' + (await store.execVerifyLink(session, { op: 'view' })).text;
        }
        if (result.isError) throw new Error(result.text);
        return result.text;
      });
      pending.set(session.id, job);
      return job.finally(() => { if (pending.get(session.id) === job) pending.delete(session.id); });
    },
    presentCall: args => ({ card: 'generic', title: '任务与验证 · ' + args.op, kind: 'other', rawInput: args }),
  });
  return store;
}
