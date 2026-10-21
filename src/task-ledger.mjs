import { isDeepStrictEqual } from 'node:util';
import { deepFreeze } from '@deepseek-ai/dsh-util-values';

export const TODOLIST_EVENT = 'todo/write';
export const passedTest = task => (task.links ?? []).some(link => link.kind === 'test' && link.lastRun?.pass === true);
export const textOnly = task => !passedTest(task) && (task.links ?? []).some(link => link.kind === 'text');
export const todosOf = tasks => tasks.map(task => ({
  content: textOnly(task) ? `${task.title} ⚠ text-only` : task.title,
  status: task.done ? 'completed' : 'pending',
}));

const invalid = () => { throw Error('任务清单格式无效；原始会话记录已保留，未创建空清单'); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const uniqueIds = items => {
  const ids = new Set();
  for (const item of items) {
    if (!object(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) invalid();
    ids.add(item.id);
  }
};
function nextId(saved, items, prefix) {
  if (saved !== undefined && (!Number.isSafeInteger(saved) || saved < 0)) invalid();
  let next = Math.max(1, saved ?? 1);
  for (const { id } of items) if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) next = Math.max(next, Number(id.slice(prefix.length)) + 1);
  if (!Number.isSafeInteger(next)) invalid();
  return next;
}

// Historical formats are decoded here once. Extra task/evidence fields remain
// intact; missing execution provenance stays unknown, never an invented run.
export function normalizeTaskSnapshot(value) {
  if (value == null) value = { tasks: [] };
  if (Array.isArray(value)) value = { todos: value };
  if (!object(value) || value.tasks !== undefined && !Array.isArray(value.tasks)) invalid();
  const excerpts = structuredClone(value.excerpts ?? []);
  if (!Array.isArray(excerpts)) invalid();
  let tasks;
  if (value.tasks) tasks = structuredClone(value.tasks);
  else {
    if (!Array.isArray(value.todos) || value.todos.some(task => !object(task) || typeof task.content !== 'string'
      || !['pending', 'in_progress', 'completed'].includes(task.status))) invalid();
    tasks = value.todos.map((task, index) => ({ id: `T${index + 1}`, title: task.content,
      done: task.status === 'completed', anchor: null, links: [], legacySource: task.source ?? '',
      ...(task.verification ? { legacyVerification: structuredClone(task.verification) } : {}) }));
  }
  uniqueIds(excerpts); uniqueIds(tasks);
  for (const excerpt of excerpts) if (typeof excerpt.text !== 'string') invalid();
  for (const task of tasks) {
    if (typeof task.title !== 'string' || typeof task.done !== 'boolean') invalid();
    task.links ??= [];
    if (!Array.isArray(task.links)) invalid();
    for (const link of task.links) {
      if (!object(link) || !['text', 'test'].includes(link.kind) || link.lastRun != null && !object(link.lastRun)) invalid();
      if (link.lastRun && !Object.hasOwn(link.lastRun, 'execution')) link.lastRun.execution = null;
    }
  }
  const links = tasks.flatMap(task => task.links); uniqueIds(links);
  return deepFreeze({ excerpts, tasks, nextE: nextId(value.nextE, excerpts, 'E'), nextT: nextId(value.nextT, tasks, 'T'), nextL: nextId(value.nextL, links, 'L') });
}

const fromEvent = event => {
  if (event && !object(event.data)) invalid();
  return { event, record: normalizeTaskSnapshot(event?.data) };
};
export const taskSnapshotFromEvents = events => fromEvent(events.findLast(event => event.type === TODOLIST_EVENT));
const snapshots = new WeakMap();

// This is a derived cache for one Session object, never a session-ID authority.
// Native logs are immutable append-only snapshots; inspect only the new suffix
// and reuse the decoded ledger when unrelated events or quiet copies arrive.
export function readTaskSnapshot(session) {
  const events = session.snapshotEvents(), cached = snapshots.get(session);
  const samePrefix = cached && events.length >= cached.length && (!cached.length || events[cached.length - 1] === cached.tail);
  let event = samePrefix ? cached.event : undefined;
  for (let i = events.length - 1; i >= (samePrefix ? cached.length : 0); i--) {
    if (events[i].type === TODOLIST_EVENT) { event = events[i]; break; }
  }
  const snapshot = cached && cached.event === event ? cached : fromEvent(event);
  if (cached && snapshot !== cached && isDeepStrictEqual(cached.record, snapshot.record)) snapshot.record = cached.record;
  snapshots.set(session, { ...snapshot, length: events.length, tail: events.at(-1) });
  return snapshot;
}
