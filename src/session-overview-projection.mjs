import { z } from 'zod';

const pathValue = value => typeof value === 'string' && value.trim() ? value : null;
const absolute = value => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value);
// Same successful first-party mutations as DSH's native deliverables view.
function mutationPath(name, raw) {
  let args;
  try { args = JSON.parse(raw); } catch { return null; }
  if (!args || typeof args !== 'object') return null;
  if (name === 'write' && typeof args.content === 'string') return pathValue(args.file_path);
  if (name === 'edit' && typeof args.old_string === 'string' && args.old_string.length && typeof args.new_string === 'string' && args.old_string !== args.new_string) return pathValue(args.file_path);
  if (name === 'str_replace_editor' && (args.command === 'create' && typeof args.file_text === 'string'
    || args.command === 'str_replace' && typeof args.old_str === 'string' && args.old_str.length && (args.new_str === undefined || typeof args.new_str === 'string')
    || args.command === 'insert' && Number.isInteger(args.insert_line) && args.insert_line >= 0 && typeof args.new_str === 'string')) return pathValue(args.path);
  return null;
}
const merge = (items, added) => [...new Map([...items, ...added].map(item => [item.id, item])).values()];
export function foldOverview(state, event) {
  const data = event.data;
  if (event.type === 'turn/start') return { ...state, turn: data.turn, outcome: null };
  if (event.type === 'user/message' && event.surfaceOp === 'append') {
    const sources = [];
    for (const block of data.message?.content ?? data.content ?? []) {
      const attachment = block.attachment;
      if (!attachment?.attachmentId) continue;
      if (block.type === 'image') sources.push({ id: `image:${attachment.attachmentId}`, kind: 'image', label: attachment.name || '图片', attachment });
      if (block.type === 'file') sources.push({ id: `file:${attachment.attachmentId}`, kind: 'file', label: attachment.name, file: attachment });
    }
    return sources.length ? { ...state, sources: merge(state.sources, sources) } : state;
  }
  if (event.seq < state.inheritedEventCount) return state;
  if (event.type === 'assistant/message' && event.surfaceOp === 'append') {
    const text = (data.message?.content ?? data.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(' ').trim();
    return text ? { ...state, activity: text.slice(0, 240) } : state;
  }
  if (event.type === 'step/start') return { ...state, activity: '正在处理' };
  if (event.type === 'tool/call') {
    const labels = { read: '读取文件', write: '写入文件', edit: '编辑文件', bash: '运行命令', workflow: '执行工作流', send_message: '发送消息', team_send_message: '发送消息' };
    state = { ...state, activity: labels[data.name] || `使用 ${data.name}` };
    const path = mutationPath(data.name, data.arguments);
    return path ? { ...state, calls: { ...state.calls, [data.callId]: path } } : state;
  }
  if (event.type === 'tool/result' && event.surfaceOp === 'append') {
    const id = data.message?.source?.callId, argumentPath = Object.hasOwn(state.calls, id) ? state.calls[id] : undefined;
    if (!argumentPath) return state;
    const calls = { ...state.calls }; delete calls[id];
    if (data.message.isError) return { ...state, calls };
    const path = data.meta && Object.hasOwn(data.meta, 'path') ? typeof data.meta.path === 'string' && absolute(data.meta.path) ? data.meta.path : absolute(argumentPath) ? argumentPath : null : argumentPath;
    return { ...state, calls, outputs: path ? merge(state.outputs, [{ id: path, path, label: path.split(/[\\/]/).at(-1) }]) : state.outputs };
  }
  if (event.type === 'deliverables/presented') {
    const files = (data.files ?? []).filter(file => pathValue(file.path)).map(file => ({ ...file, id: file.path, label: file.title || file.path.split(/[\\/]/).at(-1) }));
    return files.length ? { ...state, outputs: merge(state.outputs, files) } : state;
  }
  if (event.type === 'turn/end') {
    state = { ...state, outcome: data.reason?.kind ?? null };
    if (Object.keys(state.calls).length) state = { ...state, calls: {} };
    if (['interrupted', 'forked'].includes(data.reason?.kind)) state = { ...state, workflows: state.workflows.map(run => run.turn === data.turn && run.data.status === 'running'
      ? { ...run, data: { ...run.data, status: 'interrupted', phases: run.data.phases.map(phase => ({ ...phase, members: phase.members.map(member => member.status === 'running' ? { ...member, status: 'interrupted' } : member) })) } } : run) };
  }
  if (event.type === 'tool-workflow/run-start') return { ...state, workflows: [...state.workflows, { id: data.runId, anchorSeq: event.seq, turn: state.turn, data: { name: data.name, status: 'running', phases: [] } }] };
  if (event.type.startsWith('tool-workflow/')) {
    const index = state.workflows.findIndex(run => run.id === data.runId);
    if (index < 0) return state;
    const workflows = [...state.workflows], old = workflows[index], value = { ...old.data };
    if (event.type === 'tool-workflow/agent-start') {
      const key = data.phase ?? '';
      const phase = old.data.phases.find(phase => phase.key === key) ?? { key, phase: data.phase ?? null, members: [] };
      const next = { ...phase, members: [...phase.members, { seq: data.seq, childId: data.childId, label: data.label, status: 'running' }] };
      value.phases = old.data.phases.some(phase => phase.key === key) ? old.data.phases.map(phase => phase.key === key ? next : phase) : [...old.data.phases, next];
    } else if (event.type === 'tool-workflow/agent-end') {
      value.phases = old.data.phases.map(phase => ({ ...phase, members: phase.members.map(member => member.seq === data.seq ? { ...member, status: data.outcome } : member) }));
    } else if (event.type === 'tool-workflow/run-end') {
      value.status = data.stopReason === 'error' || data.failures?.length ? 'failed' : data.stopReason;
      if (data.failures?.length) value.failures = data.failures;
    } else return state;
    workflows[index] = { ...old, data: value };
    return { ...state, workflows };
  }
  return state;
}
export function installOverviewProjection(ctx) {
  const view = z.object({ sources: z.array(z.any()), outputs: z.array(z.any()), workflows: z.array(z.any()), activity: z.string().optional(), outcome: z.string().nullable().optional() });
  const schema = view.extend({ inheritedEventCount: z.number(), turn: z.number().optional(), calls: z.record(z.string(), z.string()) });
  ctx.sessionProjections.register({ key: 'omdOverview', stateVersion: 1, stateSchema: schema,
    init: (_header, inheritedEventCount) => ({ inheritedEventCount, sources: [], outputs: [], workflows: [], calls: {} }), apply: foldOverview,
    wire: { viewSchema: view, view: ({ sources, outputs, workflows, activity, outcome }) => ({ sources, outputs, workflows, ...(activity ? { activity } : {}), ...(outcome !== undefined ? { outcome } : {}) }) },
  });
}
