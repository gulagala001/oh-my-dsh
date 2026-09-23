import { sourceName } from './message-source.mjs';
// Shared, pure helpers for the task ledger and context-compaction layer.
export const TASK_SOURCE = 'trisoul-x:tasks';
export const TODO_META = 'omdTodo';
export const TASK_CONTEXT_META = 'omdTaskContext';
const runtimeProviders = new WeakMap();
export function setRuntimeContext(session, provider) { runtimeProviders.set(session, provider); }
export function taskContextMeta(message) { return message?.[TASK_CONTEXT_META] ?? message?.[TODO_META]?.context; }
export function renderTaskContext({ todo, runtime }) {
  return [todo?.text, runtime?.text].filter(Boolean).join('\n\n');
}
export function latestTaskContext(session, runtime = runtimeProviders.get(session)?.() ?? null) {
  const todo = latestTodo(session);
  const text = renderTaskContext({ todo, runtime });
  return text ? { text, snapshotSeq: todo?.snapshotSeq ?? -1, count: todo?.count ?? 0,
    meta: { todoText: todo?.text ?? null, runtime: runtime ? { ...runtime } : null } } : null;
}
const messageOf = e => e?.type === 'user/message' ? e.data : e?.data?.message;
export const isTaskInjection = e => e?.type === 'user/message' && sourceName(e.data?.source) === TASK_SOURCE;
export function renderTodoInjection(rec) {
  if (!rec.tasks.length) return '[todo list]\n(empty — all tasks were removed)';
  return ['[todo list]', ...rec.tasks.map(t => `${t.done ? '[x]' : '[ ]'} ${t.id} ${t.title}`)].join('\n');
}
export function withoutTodo(message) {
  const meta = message?.[TODO_META];
  if (!meta) return message;
  const { [TODO_META]: _, ...base } = message;
  return { ...base, id: meta.baseId, source: structuredClone(meta.baseSource),
    content: message.content.filter((_, i) => i !== meta.index) };
}
export function latestTodo(session) {
  const events = session.snapshotEvents(), snapshot = events.findLast(e => e.type === 'todo/write' && (Array.isArray(e.data?.tasks) || Array.isArray(e.data?.todos)));
  if (snapshot) {
    const tasks = snapshot.data.tasks || snapshot.data.todos.map((t, i) => ({ id: `T${i + 1}`, title: t.content, done: t.status === 'completed' }));
    return { snapshotSeq: snapshot.seq, text: renderTodoInjection({ tasks }), count: tasks.length };
  }
  const old = events.findLast(e => isTaskInjection(e) && (!taskContextMeta(e.data) || taskContextMeta(e.data).todoText));
  return old ? { snapshotSeq: -1, text: taskContextMeta(old.data)?.todoText ?? old.data.content.filter(b => b.type === 'text').map(b => b.text).join('\n'), count: null } : null;
}

// Task tool calls/results are also excluded, not just the rendered task snapshot.
// Other blocks in a mixed message, including independent tool results, survive.
export function summaryMessageReader(session) {
  const taskCalls = new Set();
  for (const e of session.snapshotEvents()) for (const b of messageOf(e)?.content || []) {
    if (b.type === 'tool-call' && ['todo_write', 'task_map', 'runtime_status'].includes(b.name)) taskCalls.add(b.id);
  }
  const filter = blocks => (blocks || []).flatMap(b => {
    if (b.type === 'tool-call' && taskCalls.has(b.id)) return [];
    if (b.type === 'tool-result') {
      if (taskCalls.has(b.toolCallId)) return [];
      return [{ ...b, content: filter(b.content) }];
    }
    return [b];
  });
  return e => {
    if (isTaskInjection(e)) return null;
    const m = withoutTodo(session.deriveEventMessage(e));
    if (!m) return null;
    if (m.role === 'tool' && taskCalls.has(m.toolCallId)) return null;
    const content = filter(m.content);
    return content.length ? { ...m, content } : null;
  };
}
