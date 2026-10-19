import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupportedJsonSchema, renderToolsSdk, renderToolsSdkPy, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
import { TASK_PARAMETERS, VERIFICATION_PARAMETERS, registerTasks } from '../src/tasks.mjs';

const schemas = [
  { name: 'todo_write', parameters: TASK_PARAMETERS, output: { type: 'string' } },
  { name: 'verify_link', parameters: VERIFICATION_PARAMETERS, output: { type: 'string' } },
];

test('real SDKs project supported operation schemas and preserve their parameter documentation', () => {
  for (const { parameters } of schemas) assert.doesNotThrow(() => assertSupportedJsonSchema(parameters));
  for (const format of ['function-body', 'repl']) {
    const sdk = renderToolsSdk(schemas, format);
    assert.doesNotMatch(sdk, /(?:todo_write|verify_link): unknown/);
    assert.match(sdk, /op: "view" \| "transcript"/);
    assert.match(sdk, /op: "run" \| "view"/);
    assert.match(sdk, /from: string/);
    assert.match(sdk, /anchor: \{/);
    assert.match(sdk, /title\?: string/);
    assert.match(sdk, /anchor\?: \{[\s\S]*?\} & Record<string, JsonValue> \| null/);
    assert.match(sdk, /updates: \{/);
    assert.ok(sdk.includes('opening words of the block, verbatim'));
    assert.ok(sdk.includes('Each link belongs to exactly one task.'));
  }
  const python = renderToolsSdkPy(schemas);
  assert.match(python, /class VerifyLinkArgs\d+\(TypedDict\)/);
  assert.match(python, /op: Literal\["run", "view"\]/);
  assert.match(python, /links: list\[/);
  assert.ok(python.includes('Each link belongs to exactly one task.'));
  // The unchanged public `from` key is a Python keyword. The host renderer
  // cannot express that TypedDict and still falls back to open dictionaries.
  assert.match(python, /async def todo_write\(self, args: dict\[str, Any\]/);
  assert.doesNotMatch(python, /async def (?:todo_write|verify_link)\(self, args: Any\)/);
});

test('real schema validator retains operation, required entry and nested anchor constraints', () => {
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
  for (const value of valid) assert.deepEqual(validateJsonSchemaValue(TASK_PARAMETERS, value), [], JSON.stringify(value));
  for (const value of invalid) assert.ok(validateJsonSchemaValue(TASK_PARAMETERS, value).length, JSON.stringify(value));
  for (const value of [{ op: 'view' }, { op: 'run' }, { op: 'run', tasks: ['T1'] },
    { op: 'link', links: [{ task: 'T1', kind: 'text', note: 'observed', reason: 'manual' }] }, { op: 'unlink', ids: ['L1'] }]) {
    assert.deepEqual(validateJsonSchemaValue(VERIFICATION_PARAMETERS, value), [], JSON.stringify(value));
  }
  for (const value of [{}, { view: true }, { op: 'link' }, { op: 'unlink' },
    { op: 'link', links: [{ kind: 'text' }] }, { op: 'link', links: [{ task: 'T1', kind: 'other' }] }]) {
    assert.ok(validateJsonSchemaValue(VERIFICATION_PARAMETERS, value).length, JSON.stringify(value));
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
