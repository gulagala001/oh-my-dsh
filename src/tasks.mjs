import { z } from 'zod';
import { createTodoStore } from './todolist.mjs';

// Original task_map and todo wording, merged as recorded in PROMPT_CHANGES.md.
export const TASK_DESCRIPTION = `Creates and edits the todo list anchored to the user's own wording — a clear, complete todo list greatly raises the completion rate in medium-to-large tasks. Use it when the task takes three or more distinct steps, when the user lists several things at once, or when new instructions arrive mid-task — capture them right away. Skip it for single-step work and plain conversation — a list there is overhead, not help.

op:excerpt copies a block of the user's own words in as the raw material the todo list is parsed from — quote its opening and closing words verbatim ({from, to}) — together with the tasks that cover it (\`tasks:[...]\` in the same call). Tasks are added, edited and removed through op:add/edit/remove. Each task selects a sub-range within an excerpt as its \`anchor\` ({from, to}). Editing a task itself clears its checkmark and verification links.

Keep the list honest as work progresses: rewrite a task overtaken by newer instructions into what can actually be done (op:edit), and remove a task from the list entirely (op:remove) only when it no longer belongs on the list — irrelevant, impossible, or overtaken by newer instructions — never because it is hard; say why in your reply.

op:check updates completion. Decide how a task will be verified before building it, and check it off the moment it is fully done — one at a time, as you go, not all of them at the end. Never check off a task while its tests are failing, the implementation is partial, or an error on it is unresolved; when several are checked together, that must hold for every one of them. Uncheck a task that turns out not to be done.

op:view returns the full todo list including excerpts. op:transcript returns the verbatim list of user messages in this session, numbered [1], [2], … — you only need it when a quote appears in more than one message: check the numbering and add msg to the excerpt.`;
export const TASK_PARAMETERS = {
  type: 'object', required: ['op'], properties: {
    op: {"type":"string","enum":["excerpt","add","edit","remove","check","view","transcript"],"description":"Operation kind"},
    from: {"type":"string","description":"Required for excerpt: opening words of the block, verbatim, unique within its message"},
    to: {"type":"string","description":"Required for excerpt: closing words of the block, verbatim, unique within its message"},
    msg: {"type":"integer","description":"Only for excerpt when the quote appears in more than one user message: which message, using the [n] numbering from op:transcript"},
    tasks: {"type":"array","items":{"type":"object"},"description":"Required for excerpt/add/edit: each entry is {\"id\": edit only — the task to change, \"title\": one line stating what the task requires, \"anchor\": {\"excerpt\": excerpt id — only needed when the quote appears in more than one excerpt, \"from\": opening words of the sub-range, verbatim, \"to\": closing words, verbatim}}."},
    ids: {"type":"array","items":{"type":"string"},"description":"Required for remove: ids of the tasks to delete"},
    updates: {"type":"array","description":"Required for check: each entry is {\"id\": task id, \"done\": true or false}","items":{"type":"object","properties":{"id":{"type":"string"},"done":{"type":"boolean"}},"required":["id","done"],"additionalProperties":false}},
  },
};

export const VERIFICATION_DESCRIPTION = `The tasks' verification-link tool, used to raise the real completion rate of the todo list. A task counts as verified only through what is linked here.

When to link: link the evidence the moment a task is done — not in one sweep after everything is built.

How a test earns its place: start from the task's own words — if that sentence is true, what must be observable? The test asserts exactly that, in the same scope as the sentence — no narrower, and no premises the user never stated. It must exercise the changed code path against real behavior — the repository's own test runner, real dependencies, not mocks of the thing under test. A test the implementation cannot fail proves nothing. Prefer the repository's own test command (cmd) over a hand-made script.

What does not count: a test written from the implementation instead of from the task's words; a green run whose test never reaches the changed path; a scenario narrower or easier than the one the user described; a text note that restates the task title.

Evidence ranks, strongest first: (1) a real-environment run doing what the user would do; (2) an automated end-to-end test; (3) a targeted probe of the exact code path; (4) a smoke check that it starts and responds; (5) a text record. Link the highest rung you can actually run here; a lower rung only when every higher one is genuinely impossible — and reason must say why. A "text" note must name its evidence — the command run, the output seen, or the file and place inspected.

Ops: op:link attaches evidence to a task — a test file (kind "test") or a text record (kind "text"). op:run runs the linked tests — with cmd, the command as given; without it, the file bare by extension — and reports PASS / FAIL / TIMEOUT with the output tail. op:unlink withdraws links that no longer hold (the files themselves are untouched). op:view returns every task with its completion state and evidence.`;
export const VERIFICATION_PARAMETERS = {
  type: 'object', required: ['op'], properties: {
    op: {"type":"string","enum":["link","run","unlink","view"],"description":"Operation kind"},
    links: {"type":"array","description":"Required for link: each entry is {\"task\": task id, \"kind\": \"test\" or \"text\", \"path\": for test — the test file path (relative to the session working directory); for text — optional supporting file, \"note\": for text — one line naming what was observed (command, output, or file and place), \"reason\": for text — one line on why no higher rung of the evidence ladder is runnable here, \"cmd\": for test — optional; the exact command that runs this test the way the repository runs it (e.g. \"npx vitest run tests/x.test.ts\", \"go test ./pkg/...\", \"cargo test alias\"); without cmd the file is run bare by its extension (node / pytest / bash / pwsh)}. Custom cmd runs in PowerShell on Windows and bash elsewhere.","items":{"type":"object"}},
    tasks: {"type":"array","items":{"type":"string"},"description":"Optional for run: which tasks' linked tests to execute (default: every task with test links)"},
    ids: {"type":"array","items":{"type":"string"},"description":"Required for unlink: link ids to withdraw"},
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

export function registerTasks(ctx, store = createTodoStore()) {
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
      name: 'todo_write', description: TASK_DESCRIPTION, parameters: TASK_PARAMETERS, title: '任务',
      run: (args, session) => args.op === 'check' ? store.execCheck(session, args.updates) : store.execTaskMap(session, args),
    },
    {
      name: 'verify_link', description: VERIFICATION_DESCRIPTION, parameters: VERIFICATION_PARAMETERS, title: '验证',
      run: (args, session, signal) => store.execVerifyLink(session, args, session.header.cwd, signal),
    },
  ];
  for (const { name, description, parameters, title, run } of definitions) ctx.tools.register({
    name, description, parameters,
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute(args, { agent, signal }) {
      const session = agent.session;
      const job = (pending.get(session.id) || Promise.resolve()).catch(() => {}).then(async () => {
        signal?.throwIfAborted();
        const result = await run(args, session, signal);
        if (result.isError) throw new Error(result.text);
        return result.text;
      });
      pending.set(session.id, job);
      return job.finally(() => { if (pending.get(session.id) === job) pending.delete(session.id); });
    },
    presentCall: args => ({ card: 'generic', title: title + ' · ' + args.op, kind: 'other', rawInput: args }),
  });
  return store;
}

export function restoreTaskProjection(ctx, session) {
  if (ctx.sessionProjections.stateOf(session, 'todos') !== null) return;
  const last = session.snapshotEvents().findLast(e => e.type === 'todo/write');
  if (!last?.data.tasks?.length) return;
  // Restore X's persistent task dock after the shared projection's turn reset.
  // A quiet snapshot changes neither the ledger revision nor model context.
  session.append('todo/write', { ...last.data, quiet: true });
}
