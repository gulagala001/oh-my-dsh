import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupportedJsonSchema, renderToolsSdk, renderToolsSdkPy, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { TASK_PARAMETERS, VERIFICATION_PARAMETERS, registerTasks } from '../src/tasks.mjs';

const schemas = [
  { name: 'todo_write', parameters: TASK_PARAMETERS, output: { type: 'string' } },
  { name: 'verify_link', parameters: VERIFICATION_PARAMETERS, output: { type: 'string' } },
];

test('real SDKs project supported operation schemas and preserve their parameter documentation', () => {
  for (const { parameters } of schemas) {
    assert.equal(parameters.type, 'object', 'Native function APIs require an object root');
    assert.equal(Object.hasOwn(parameters, 'oneOf'), false, 'Do not send a root union to native function APIs');
    assert.doesNotThrow(() => assertSupportedJsonSchema(parameters));
  }
  for (const format of ['function-body', 'repl']) {
    const sdk = renderToolsSdk(schemas, format);
    assert.doesNotMatch(sdk, /(?:todo_write|verify_link): unknown/);
    assert.match(sdk, /op: "excerpt" \| "add" \| "edit" \| "remove" \| "check" \| "view" \| "transcript" \| "pause_turn"/);
    assert.match(sdk, /op: "link" \| "run" \| "unlink" \| "view"/);
    assert.match(sdk, /from: string/);
    assert.match(sdk, /anchor\?: \{/);
    assert.match(sdk, /title\?: string/);
    assert.match(sdk, /anchor\?: \{[\s\S]*?\} & Record<string, JsonValue> \| null/);
    assert.match(sdk, /updates\?: \{/);
    assert.ok(sdk.includes('opening words of the block, verbatim'));
    assert.ok(sdk.includes('Each link belongs to exactly one task.'));
  }
  const python = renderToolsSdkPy(schemas);
  assert.match(python, /class VerifyLinkArgs\(TypedDict\)/);
  assert.match(python, /op: Literal\["link", "run", "unlink", "view"\]/);
  assert.match(python, /links: NotRequired\[list\[/);
  assert.ok(python.includes('Each link belongs to exactly one task.'));
  // The unchanged public `from` key is a Python keyword. The host renderer
  // cannot express that TypedDict and still falls back to open dictionaries.
  assert.match(python, /async def todo_write\(self, args: dict\[str, Any\]/);
  assert.doesNotMatch(python, /async def (?:todo_write|verify_link)\(self, args: Any\)/);
});

test('published object schemas and local validation retain operation, required entry and nested anchor constraints', async () => {
  const tools = new Map();
  let calls = 0;
  const run = () => { calls++; return { text: 'valid' }; };
  registerTasks({ tools: { register: tool => tools.set(tool.name, tool) }, sessionProjections: { register() {} } },
    { execTaskMap: run, execCheck: run, execVerifyLink: run });
  const exec = { agent: { session: { id: 'task-arguments', header: { cwd: '/synthetic/project' } } } };
  const validCall = async (name, args) => {
    assert.deepEqual(validateJsonSchemaValue(tools.get(name).parameters, args), [], JSON.stringify(args));
    assert.equal(await tools.get(name).execute(args, exec), 'valid');
  };
  const invalidCall = async (name, args) => {
    const before = calls;
    await assert.rejects(tools.get(name).execute(args, exec), /Rejected/, JSON.stringify(args));
    assert.equal(calls, before, 'Invalid arguments never reach or change the ledger');
  };
  const anchor = { from: 'alpha', to: 'omega' };
  const valid = [
    { op: 'view' }, { op: 'transcript' }, { op: 'pause_turn', reason: 'user stop' },
    { op: 'excerpt', from: 'alpha', to: 'omega', tasks: [{ title: 'Implement', anchor }] },
    { op: 'add', tasks: [{ title: 'Implement', anchor }] },
    { op: 'edit', tasks: [{ id: 'T1' }] }, { op: 'edit', tasks: [{ id: 'T1', anchor: null }] },
    { op: 'remove', ids: ['T1'] }, { op: 'check', updates: [{ id: 'T1', done: false }] },
  ];
  const invalid = [
    {}, { view: true }, { op: 'unknown' }, { op: 'pause_turn' }, { op: 'excerpt', tasks: [] },
    { op: 'add' }, { op: 'add', tasks: [{ title: 'Implement' }] },
    { op: 'add', tasks: [{ title: 'Implement', anchor: null }] },
    { op: 'add', tasks: [{ anchor }] }, { op: 'add', tasks: [{ title: 'Implement', anchor: { from: 'alpha' } }] },
    { op: 'edit', tasks: [{ title: 'Implement' }] }, { op: 'edit', tasks: [{ id: 'T1', anchor: { to: 'omega' } }] },
    { op: 'remove' }, { op: 'check' }, { op: 'check', updates: [{ id: 'T1', done: 'yes' }] },
    { op: 'check', updates: [{ id: 'T1', done: true, extra: 1 }] }, { op: 'view', msg: 1.5 },
  ];
  for (const value of valid) await validCall('todo_write', value);
  for (const value of invalid) await invalidCall('todo_write', value);
  for (const value of [{ op: 'view' }, { op: 'run' }, { op: 'run', tasks: ['T1'] },
    { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'observed', reason: 'manual' }] }, { op: 'unlink', ids: ['L1'] }]) {
    await validCall('verify_link', value);
  }
  for (const value of [{}, { view: true }, { op: 'link' }, { op: 'unlink' },
    { op: 'link', links: [{ kind: 'text' }] }, { op: 'link', links: [{ task: 'T1', kind: 'other' }] }]) {
    await invalidCall('verify_link', value);
  }
});

test('registered tools still execute original op calls and reject unanchored tasks atomically', async () => {
  const tools = new Map(), events = [{ seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'alpha implement omega' }] } }];
  const session = { id: 'task-sdk', header: { cwd: '/synthetic/project' }, snapshotEvents: () => events,
    append: (type, data) => events.push({ seq: events.length + 1, type, data }) };
  const ctx = { tools: { register: tool => tools.set(tool.name, tool) }, sessionProjections: { register() {} } };
  const store = registerTasks(ctx), exec = { agent: { session } };
  const invoke = (name, args) => tools.get(name).execute(args, exec);
  assert.equal(tools.get('todo_write').parameters, TASK_PARAMETERS);
  assert.equal(tools.get('verify_link').parameters, VERIFICATION_PARAMETERS);
  assert.equal(typeof await invoke('todo_write', { op: 'view' }), 'string');
  await assert.rejects(invoke('todo_write', { view: true }), /Rejected/);
  await assert.rejects(invoke('todo_write', { op: 'excerpt', from: 'alpha', to: 'omega', tasks: [{ title: 'Implement' }] }), /anchor/);
  assert.equal(store.snapshot(session).tasks.length, 0);
  await invoke('todo_write', { op: 'excerpt', from: 'alpha', to: 'omega', tasks: [{ title: 'Implement', anchor: { from: 'alpha', to: 'omega' } }] });
  await invoke('todo_write', { op: 'edit', tasks: [{ id: 'T1', title: 'Updated', anchor: null }] });
  assert.equal(store.snapshot(session).tasks[0].title, 'Updated');
  assert.equal(typeof await invoke('verify_link', { op: 'view' }), 'string');
  await assert.rejects(invoke('verify_link', { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'observed' }] }), /requires reason/);
  assert.deepEqual(store.snapshot(session).tasks[0].links, []);
});
