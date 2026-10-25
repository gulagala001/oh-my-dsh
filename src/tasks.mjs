import { promptText } from './cc-adaptation/texts.mjs';
import { z } from 'zod';
import { validateJsonSchemaValue, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tools';
import { randomUUID } from 'node:crypto';
import { createTodoStore } from './todolist.mjs';
import { normalizeTaskSnapshot, readTaskSnapshot, taskSnapshotFromEvents, todosOf } from './task-ledger.mjs';
import { isDeepStrictEqual } from 'node:util';
import { currentDirectory } from './working-directory.mjs';
import { scopeOf } from '@deepseek-ai/dsh-scope';
import { taskVerificationEnabled, withoutTaskVerification } from './task-verification.mjs';

const TASK_ENTRY_SCHEMA = { type: 'object', properties: {
  id: { type: 'string', description: 'Required for edit: the existing task ID. Omit for excerpt/add.' },
  title: { type: 'string', description: 'Required for excerpt/add. For edit, omit to preserve the existing title.' },
  anchor: { oneOf: [{ type: 'object', properties: {
    excerpt: { type: 'string', description: 'Existing excerpt ID for add/edit when needed to disambiguate.' },
    from: { type: 'string', description: 'Opening words copied from inside the excerpt.' },
    to: { type: 'string', description: 'Closing words copied from inside the same excerpt.' },
  }, required: ['from', 'to'] }, { type: 'null' }], description: 'Required for every excerpt/add entry: both quotes must lie inside the selected excerpt. For a title-only edit, omit or pass null.' },
} };
const VERIFICATION_LINK_SCHEMA = { type: 'object', required: ['task', 'kind'], properties: {
  task: { type: 'string', description: 'Existing task ID returned by todo_write, for example T1. Each link belongs to exactly one task.' },
  kind: { type: 'string', enum: ['test', 'text'] },
  path: { type: 'string', description: 'Required for test; optional existing supporting file for text.' },
  note: { type: 'string', description: 'Required for text: the observation and its concrete source.' },
  reason: { type: 'string', description: 'Required for text: why no stronger verification can run here.' },
  cmd: { type: 'string', description: 'Optional test command. Used only by op:run.' },
} };

// Original task_map and todo wording, merged as recorded in PROMPT_CHANGES.md.
export const TASK_DESCRIPTION = promptText('tools/todo-write.md');
const TASK_PROPERTIES = {
  op: {"type":"string","enum":["excerpt","add","edit","remove","check","view","transcript","pause_turn"],"description":"Operation kind"},
  reason: { type: 'string', description: 'Required for pause_turn: the concrete blocker or user stop request, and what is needed to continue. Tasks remain unchanged.' },
  from: {"type":"string","description":"Required for excerpt: opening words of the block, verbatim, unique within its message"},
  to: {"type":"string","description":"Required for excerpt: closing words of the block, verbatim, unique within its message"},
  msg: {"type":"integer","description":"Only for excerpt when the quote appears in more than one user message: which message, using the [n] numbering from op:transcript"},
  tasks: {"type":"array","items":TASK_ENTRY_SCHEMA,"description":"Required for excerpt/add/edit: each entry is {\"id\": edit only — the task to change, \"title\": one line stating what the task requires, \"anchor\": {\"excerpt\": excerpt id — only needed when the quote appears in more than one excerpt, \"from\": opening words of the sub-range, verbatim, \"to\": closing words, verbatim}}."},
  ids: {"type":"array","items":{"type":"string"},"description":"Required for remove: ids of the tasks to delete"},
  updates: {"type":"array","description":"Required for check: each entry is {\"id\": task id, \"done\": true or false}","items":{"type":"object","properties":{"id":{"type":"string"},"done":{"type":"boolean"}},"required":["id","done"],"additionalProperties":false}},
};

// Native function APIs require an object at the root. Publish that portable
// shape to both native tools and SDKs; enforce the complete operation-specific
// branches locally before the ledger can change.
function operationParameters(properties, variants) {
  return { oneOf: variants.map(({ op, required = [], properties: overrides = {} }) => ({
    type: 'object', properties: { ...properties, ...overrides,
      op: { ...properties.op, enum: Array.isArray(op) ? op : [op] },
    }, required: ['op', ...required],
  })) };
}

function taskEntries(required, anchored = false) {
  return { ...TASK_PROPERTIES.tasks, items: { ...TASK_ENTRY_SCHEMA, required,
    properties: { ...TASK_ENTRY_SCHEMA.properties,
      ...(anchored ? { anchor: { ...TASK_ENTRY_SCHEMA.properties.anchor.oneOf[0],
        description: TASK_ENTRY_SCHEMA.properties.anchor.description } } : {}),
    },
  } };
}

export const TASK_PARAMETERS = { type: 'object', properties: TASK_PROPERTIES, required: ['op'] };
const TASK_OPERATIONS = operationParameters(TASK_PROPERTIES, [
  { op: 'excerpt', required: ['from', 'to', 'tasks'], properties: { tasks: taskEntries(['title', 'anchor'], true) } },
  { op: 'add', required: ['tasks'], properties: { tasks: taskEntries(['title', 'anchor'], true) } },
  { op: 'edit', required: ['tasks'], properties: { tasks: taskEntries(['id']) } },
  { op: 'remove', required: ['ids'] },
  { op: 'check', required: ['updates'] },
  { op: 'pause_turn', required: ['reason'] },
  { op: ['view', 'transcript'] },
]);

export const VERIFICATION_DESCRIPTION = promptText('tools/verify-link.md');
const VERIFICATION_PROPERTIES = {
  op: {"type":"string","enum":["link","run","unlink","view"],"description":"Operation kind"},
  links: {"type":"array","description":"Required for link: each entry is {\"task\": task id, \"kind\": \"test\" or \"text\", \"path\": for test — the test file path (relative to the session working directory); for text — optional supporting file, \"note\": for text — one line naming what was observed (command, output, or file and place), \"reason\": for text — one line on why no higher rung of the evidence ladder is runnable here, \"cmd\": for test — optional; the exact command that runs this test the way the repository runs it (e.g. \"npx vitest run tests/x.test.ts\", \"go test ./pkg/...\", \"cargo test alias\"); without cmd the file is run bare by its extension (node / pytest / bash / pwsh)}. Custom cmd runs in PowerShell on Windows and bash elsewhere.","items":VERIFICATION_LINK_SCHEMA},
  tasks: {"type":"array","items":{"type":"string"},"description":"Optional for run: which tasks' linked tests to execute (default: every task with test links)"},
  ids: {"type":"array","items":{"type":"string"},"description":"Required for unlink: link ids to withdraw"},
};
export const VERIFICATION_PARAMETERS = { type: 'object', properties: VERIFICATION_PROPERTIES, required: ['op'] };
const VERIFICATION_OPERATIONS = operationParameters(VERIFICATION_PROPERTIES, [
  { op: 'link', required: ['links'] },
  { op: 'unlink', required: ['ids'] },
  { op: ['run', 'view'] },
]);

export function currentTaskSnapshot(session, cached, events) {
  // Native history is authoritative even when empty. Only an archive without
  // a readable native Session may use the retired OMD sidecar snapshot.
  return session ? readTaskSnapshot(session).record : events ? taskSnapshotFromEvents(events).record : normalizeTaskSnapshot(cached);
}
export function currentTasks(session, cached, events) {
  const record = currentTaskSnapshot(session, cached, events);
  return record.tasks.map(t => {
    const excerpt = record.excerpts.find(e => e.id === t.anchor?.excerpt);
    return { ...t, content: t.title, status: t.done ? 'completed' : 'pending',
      source: excerpt ? excerpt.text.slice(t.anchor.start, t.anchor.end) : t.legacySource || '',
      sourceMessage: excerpt?.msg, sourceExcerpt: excerpt?.id,
      verification: t.legacyVerification,
    };
  });
}

export function createVerificationRunner(ctx, exec, workdir = currentDirectory(ctx, exec.agent.session)) {
  const invoke = async (name, args, signal = exec.signal, callId = randomUUID()) => {
    const result = await ctx.tools.execute({ name, arguments: args, agent: exec.agent, signal,
      callId, rootCallId: exec.rootCallId ?? exec.callId, parent: exec.token });
    for (const context of result.additionalContexts || []) exec.deferContext?.(context);
    return result;
  };
  return async (command, timeoutMs) => {
    if (exec.signal?.aborted) return { ok: false, aborted: true, timedOut: false, out: '' };
    const windows = process.platform === 'win32';
    const tool = windows ? 'pwsh' : 'bash', callId = randomUUID();
    const args = {
      command: windows ? `$ErrorActionPreference = 'Stop'\n& {\n${command}\n}\nif ($LASTEXITCODE -ne $null) { exit $LASTEXITCODE }` : command,
      description: 'Run the linked task verification command', workdir,
      timeoutMs, run_in_background: false,
    };
    const result = await invoke(tool, args, exec.signal, callId);
    const aborted = exec.signal?.aborted || ['ABORTED', 'ABORTED_BEFORE_DISPATCH'].includes(result.error?.info?.code);
    if (result.isError) {
      if (aborted) return { ok: false, aborted: true, timedOut: false, out: '' };
      throw new Error(result.error.message);
    }
    const value = result.value;
    if (value?.kind !== 'foreground') {
      // OMD configures foreground execution. A changed host configuration must
      // not leave an unexpected job running or mistake its launch for a pass.
      if (value?.jobId) {
        const stopped = await invoke('job_kill', { job_id: value.jobId, reason: 'Verification requires a completed foreground result.' }, AbortSignal.timeout(10000));
        if (stopped.isError) throw new Error(`Verification job ${value.jobId} could not be stopped: ${stopped.error.message}`);
      }
      if (aborted) return { ok: false, aborted: true, timedOut: false, out: '' };
      throw new Error('Native shell returned no completed foreground result; previous verification results are unchanged.');
    }
    if (aborted) return { ok: false, aborted: true, timedOut: false, out: '' };
    if (value.sandbox?.denied || value.sandbox?.runnerFailed)
      throw new Error('Native sandbox blocked verification or could not start; previous verification results are unchanged.');
    return { ok: value.exitCode === 0 && !value.signal && !value.timedOut && !value.aborted,
      code: value.exitCode, aborted: value.aborted, timedOut: value.timedOut, timeoutMs: value.timeoutMs,
      execution: { tool, callId, rootCallId: exec.rootCallId ?? exec.callId,
        command: args.command, workdir: value.cwd ?? workdir, exitCode: value.exitCode ?? null,
        signal: value.signal ?? null, timeoutMs: value.timeoutMs ?? timeoutMs },
      out: `${value.stdout?.text ?? ''}${value.stderr?.text ?? ''}`.trim() };
  };
}

export function registerTasks(ctx, store) {
  const hub = ctx.omd, verificationEnabled = session => taskVerificationEnabled(hub, session);
  store ??= createTodoStore({ verificationEnabled });
  // Shared root-realm key: match DSH's todos@2 fold, including its turn reset.
  // The full X ledger remains in todo/write data and is restored independently.
  const schema = z.array(z.object({ content: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) })).nullable();
  ctx.sessionProjections.register({
    key: 'todos', stateSchema: schema, init: () => null,
    apply: (state, event) => event.type === 'todo/write' ? event.data.todos : event.type === 'turn/start' ? null : state,
    wire: { viewSchema: schema, view: state => state }, stateVersion: 2,
  });
  const pending = new Map();
  const definitions = [
    {
      name: 'todo_write', description: TASK_DESCRIPTION, parameters: TASK_PARAMETERS, operations: TASK_OPERATIONS, title: '任务',
      run: (args, session) => args.op === 'check' ? store.execCheck(session, args.updates) : store.execTaskMap(session, args),
    },
    {
      name: 'verify_link', description: VERIFICATION_DESCRIPTION, parameters: VERIFICATION_PARAMETERS, operations: VERIFICATION_OPERATIONS, title: '验证',
      run: (args, session, exec) => {
        const workdir = currentDirectory(ctx, session);
        return store.execVerifyLink(session, args, workdir, exec.signal, createVerificationRunner(ctx, exec, workdir));
      },
    },
  ];
  const tools = definitions.map(({ name, description, parameters, operations, title, run }) => ({
    name, description, parameters,
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute(args, exec) {
      const { agent, signal } = exec, session = agent.session;
      const job = (pending.get(session.id) || Promise.resolve()).catch(() => {}).then(async () => {
        signal?.throwIfAborted();
        if (name === 'verify_link' && !verificationEnabled(session)) throw Error('Task verification is disabled for this conversation.');
        const schema = operations.oneOf.find(branch => branch.properties.op.enum.includes(args?.op)) ?? parameters;
        const errors = validateJsonSchemaValue(schema, args);
        if (errors.length) throw new Error('Rejected: ' + errors.join('; '));
        const result = await run(args, session, exec);
        if (result.isError) throw new Error(result.text);
        return result.text;
      });
      pending.set(session.id, job);
      return job.finally(() => { if (pending.get(session.id) === job) pending.delete(session.id); });
    },
    presentCall: args => ({ card: 'generic', title: title + ' · ' + args.op, kind: 'other', rawInput: args }),
  }));
  const releases = new Map(tools.map(tool => [tool.name, ctx.tools.register(tool)]));
  if (hub) installTaskVerification(ctx, store, tools, releases);
  return store;
}

// Use the host's scope restrictions, so native calls, SDK discovery, and nested
// dispatch agree. Each conversation owns its own restriction and Todo wording.
function installTaskVerification(ctx, store, [todo, verify], releases) {
  const hub = ctx.omd, agents = new Map(), owner = scopeOf(ctx);
  const plainTodo = { ...todo, description: withoutTaskVerification(todo.description) };
  const refresh = agent => {
    if (!agent?.session || !agent.ctx?.tools) return;
    let state = agents.get(agent);
    if (!state) {
      if (ctx.tools.get('verify_link', agent) !== verify) return;
      state = { mode: undefined, dispose: [] }; agents.set(agent, state);
      agent.ctx.effect(() => () => { state.dispose.splice(0).forEach(dispose => dispose()); agents.delete(agent); });
    }
    const mode = hub.taskReminders(agent.session).verificationMode;
    if (state.mode === mode) return;
    state.dispose.splice(0).forEach(dispose => dispose());
    if (owner === agent) {
      for (const release of releases.values()) release();
      releases.clear();
      releases.set('todo_write', ctx.tools.register(mode === 'off' ? plainTodo : todo));
      if (mode !== 'off') releases.set('verify_link', ctx.tools.register(verify));
    } else if (mode === 'off') {
      state.dispose.push(agent.ctx.tools.restrict({ deny: ['verify_link'] }));
      if (ctx.tools.get('todo_write', agent) === todo) state.dispose.push(agent.ctx.tools.register(plainTodo));
    }
    state.mode = mode;
    store.resetTurnControl(agent.session);
    if (mode !== 'on') {
      hub.taskReviews.delete(agent.session.id);
      store.retireVerificationReminders(agent.session);
    }
    restoreTaskProjection(ctx, agent.session);
  };
  const refreshAll = () => { for (const agent of agents.keys()) refresh(agent); };
  hub.taskVerificationControllers ??= new Set();
  ctx.effect(() => {
    hub.taskVerificationControllers.add(refreshAll);
    return () => { hub.taskVerificationControllers.delete(refreshAll); for (const state of agents.values()) state.dispose.splice(0).forEach(dispose => dispose()); agents.clear(); };
  });
  ctx.on('app-boot/config-reload', refreshAll, { global: true });
  ctx.on('agent/pre-step', ({ agent }, next) => { refresh(agent); return next(); }, { prepend: true });
  ctx.on('system-prompt/assemble', async (_initial, context, next) => {
    const agent = context?.agent ?? context?.scope;
    refresh(agent);
    const assembly = await next();
    if (!agent?.session || taskVerificationEnabled(hub, agent.session)) return assembly;
    // Public prompt probes collect providers before their waterfall. Retire
    // their pre-refresh catalog too, including SDKs of non-OMD prompt styles.
    const sections = assembly.sections.flatMap(section => {
      if (section.name === 'tool:verify_link') return [];
      if (section.name === 'tool:todo_write') return [{ ...section, text: withoutTaskVerification(section.text) }];
      if (section.name !== 'tools:sdk' || !/\bverify_link\b/.test(section.text)) return [section];
      const runtime = ctx.get('ptcRuntime');
      const sdk = ctx.tools.schemas(agent).filter(tool => tool.name !== 'run_code').map(tool => ({ ...tool, output: ctx.tools.get(tool.name, agent).output.schema }));
      const text = runtime?.language === 'typescript' ? renderToolsSdk(sdk, runtime.programFormat)
        : runtime?.language === 'python' ? renderToolsSdkPy(sdk) : null;
      if (text === null) throw Error('Cannot update task verification in an unsupported PTC runtime.');
      return [{ ...section, text }];
    });
    return { ...assembly, sections, tools: assembly.tools.filter(tool => tool.name !== 'verify_link').map(tool => tool.name === 'todo_write'
      ? { ...tool, description: withoutTaskVerification(tool.description) } : tool) };
  }, { prepend: true });
  const denied = exec => exec.name === 'verify_link' && !taskVerificationEnabled(hub, exec.agent?.session)
    ? 'Task verification is disabled for this conversation.' : undefined;
  ctx.on('tools/pre-execute', (exec, next) => {
    const reason = denied(exec);
    return reason ? { kind: 'deny', reason, info: { code: 'UNKNOWN_TOOL' } } : next();
  }, { prepend: true });
  ctx.tools.guard(denied);
}

export function restoreTaskProjection(ctx, session) {
  const { event, record } = readTaskSnapshot(session);
  if (!Array.isArray(event?.data.tasks)) return;
  const todos = todosOf(record.tasks, taskVerificationEnabled(ctx.omd, session));
  const current = ctx.sessionProjections.stateOf(session, 'todos');
  if (!todos.length && current === null || isDeepStrictEqual(current, todos)) return;
  // Restore X's persistent task dock after the shared projection's turn reset.
  // A quiet snapshot changes neither the ledger revision nor model context.
  session.append('todo/write', { ...record, todos, quiet: true });
}
