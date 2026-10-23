import { sourceName } from './message-source.mjs';
import { BC_REFERENCE_TOOLS } from './context/bc-policy.mjs';
import { readTaskSnapshot } from './task-ledger.mjs';
import { parse } from 'acorn';
// Shared, pure helpers for the task ledger and context-compaction layer.
export const TASK_SOURCE = 'oh-my-dsh:tasks';
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
// Remove only sampled runtime hints, retaining the Todo and original carrier.
// Both ordinary request maintenance and durable compaction use this transform.
export function withoutRuntime(message) {
  const meta = taskContextMeta(message), prefix = message?.[TODO_META];
  if (!meta?.runtime) return message;
  if (meta.todoText) {
    const content = [...message.content];
    content[prefix?.index ?? 0] = { type: 'text', text: meta.todoText };
    return { ...message, content,
      ...(prefix ? { [TODO_META]: { ...prefix, context: { ...meta, runtime: null } } }
        : { [TASK_CONTEXT_META]: { ...meta, runtime: null } }) };
  }
  if (!prefix) return null;
  const base = withoutTodo(message);
  return { ...base, source: base.source?.kind === 'user' ? message.source : base.source };
}

export function latestTodo(session) {
  const { event, record } = readTaskSnapshot(session);
  if (event) {
    return { snapshotSeq: event.seq, text: renderTodoInjection(record), count: record.tasks.length };
  }
  const old = session.snapshotEvents().findLast(e => isTaskInjection(e) && (!taskContextMeta(e.data) || taskContextMeta(e.data).todoText));
  return old ? { snapshotSeq: -1, text: taskContextMeta(old.data)?.todoText ?? old.data.content.filter(b => b.type === 'text').map(b => b.text).join('\n'), count: null } : null;
}

const referenceTools = new Set(['todo_write', 'task_map', 'runtime_status', 'recall', 'memory_search', ...BC_REFERENCE_TOOLS]);
const controlSources = new Set(['oh-my-dsh:tasks', 'oh-my-dsh:state', 'oh-my-dsh:task-reminder', 'skill-catalog',
  'oh-my-dsh:dream-memory', 'oh-my-dsh:project-catalog', 'oh-my-dsh:manual-global']);
const referencePrograms = new WeakMap();

// Only omit a PTC program when its syntax proves it does nothing except call
// reference/control tools and print their results. Unknown or mixed programs
// remain material; a task dispatch alone cannot prove the rest is harmless.
function referenceProgram(args) {
  try {
    const code = (typeof args === 'string' ? JSON.parse(args) : args)?.code;
    if (typeof code !== 'string') return false;
    const program = parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
    const bindings = new Map(); let calls = 0;
    const member = (node, object) => node?.type === 'MemberExpression' && !node.optional && !node.computed
      && node.object.type === 'Identifier' && node.object.name === object ? node.property.name : null;
    const data = node => node?.type === 'Literal' && !node.regex
      || node?.type === 'Identifier' && bindings.has(node.name)
      || node?.type === 'ArrayExpression' && node.elements.every(item => item === null || data(item))
      || node?.type === 'ObjectExpression' && node.properties.every(p => p.type === 'Property' && p.kind === 'init'
        && !p.method && !p.computed && data(p.value));
    const reference = node => node?.type === 'Identifier' && bindings.get(node.name) === 'reference'
      || node?.type === 'CallExpression' && !node.optional && member(node.callee, 'JSON') === 'stringify'
        && node.arguments.length === 1 && reference(node.arguments[0])
      || invoke(node);
    const invoke = node => {
      if (node?.type !== 'AwaitExpression') return false;
      const call = node.argument;
      if (call.type !== 'CallExpression' || call.optional || !referenceTools.has(member(call.callee, 'tools'))
        || !call.arguments.every(data)) return false;
      calls++; return true;
    };
    for (const statement of program.body) {
      if (statement.type === 'EmptyStatement') continue;
      if (statement.type === 'VariableDeclaration') {
        for (const decl of statement.declarations) {
          if (decl.id.type !== 'Identifier' || ['tools', 'console', 'JSON'].includes(decl.id.name) || bindings.has(decl.id.name)) return false;
          const kind = invoke(decl.init) || reference(decl.init) ? 'reference' : data(decl.init) ? 'data' : null;
          if (!kind) return false;
          bindings.set(decl.id.name, kind);
        }
      } else if (statement.type === 'ExpressionStatement') {
        const expr = statement.expression;
        if (invoke(expr)) continue;
        if (expr.type !== 'CallExpression' || expr.optional || !['log', 'info', 'warn', 'error'].includes(member(expr.callee, 'console'))
          || !expr.arguments.length || !expr.arguments.every(reference)) return false;
      } else return false;
    }
    return calls > 0;
  } catch { return false; }
}

// Task tool calls/results are also excluded, not just the rendered task snapshot.
// Other blocks in a mixed message, including independent tool results, survive.
export function summaryMessageReader(session) {
  const taskCalls = new Set();
  const register = blocks => { for (const b of blocks || []) {
    if (b.type === 'tool-call') {
      let referenceOnly = referenceTools.has(b.name);
      if (b.name === 'run_code') {
        // Native events are immutable. Reuse syntax classification only for
        // immutable calls; mutable fixtures/imports are evaluated afresh.
        if (Object.isFrozen(b) && typeof b.arguments === 'string') {
          if (!referencePrograms.has(b)) referencePrograms.set(b, referenceProgram(b.arguments));
          referenceOnly = referencePrograms.get(b);
        } else referenceOnly = referenceProgram(b.arguments);
      }
      if (referenceOnly) taskCalls.add(b.id);
    }
    if (b.type === 'tool-result') register(b.content);
  } };
  for (const e of session.snapshotEvents()) register(messageOf(e)?.content);
  const filter = blocks => (blocks || []).flatMap(b => {
    if (b.type === 'tool-call' && taskCalls.has(b.id)) return [];
    if (b.type === 'tool-result') {
      if (taskCalls.has(b.toolCallId)) return [];
      const content = filter(b.content);
      return b.content?.length && !content.length ? [] : [{ ...b, content }];
    }
    return [b];
  });
  return e => {
    if (controlSources.has(sourceName(messageOf(e)?.source))) return null;
    const m = withoutTodo(session.deriveEventMessage(e));
    if (!m) return null;
    if (m.role === 'tool' && taskCalls.has(m.toolCallId)) return null;
    const content = filter(m.content);
    // Keep standalone historical analysis for reference, but not analysis
    // attached exclusively to control calls that were just removed.
    return content.length && (content.length === m.content.length || content.some(b => b.type !== 'reasoning')) ? { ...m, content } : null;
  };
}
