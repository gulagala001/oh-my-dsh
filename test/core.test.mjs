import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, textOf } from '../src/store.mjs';
import { Agent } from '../src/agent.mjs';
import { ContextHub, messagesFor, SCRIBE } from '../src/context.mjs';
import { executeTool, runCommand } from '../src/tools.mjs';
import { MAIN_PERSONA, MEMORY_CONSTITUTION, SURGEON_SYSTEM, OPS_DESC } from '../src/prompts.mjs';

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const answer = (content, stopReason = 'stop') => ({ role: 'assistant', content, api: 'openai-completions', provider: 'test', model: 'test', usage, stopReason, timestamp: Date.now() });
const toolCall = (name, args, id = name) => ({ type: 'toolCall', id, name, arguments: args });
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'trisoul-x-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new Store(join(root, 'data'));
  const session = store.create(root);
  return { root, store, session };
}

test('native loop writes and reads a real file, receives results, and resumes from durable history', async t => {
  const { root, store, session } = setup(t);
  const requests = [];
  const model = async (_route, context) => {
    requests.push(context);
    if (requests.length === 1) return answer([toolCall('write', { file_path: 'nested/result.txt', content: 'alpha\nbeta\n' })], 'toolUse');
    if (requests.length === 2) {
      assert.match(textOf(context.messages.at(-1)), /Written nested\/result.txt/);
      return answer([toolCall('read', { file_path: 'nested/result.txt', offset: 2, limit: 1 })], 'toolUse');
    }
    assert.equal(textOf(context.messages.at(-1)), '2: beta');
    return answer([{ type: 'text', text: '已经写入并读取确认。' }]);
  };
  const agent = new Agent(store, { model });
  await agent.start(session, '创建一个文件并读取第二行。');
  assert.equal(readFileSync(join(root, 'nested/result.txt'), 'utf8'), 'alpha\nbeta\n');
  assert.equal(requests.length, 3);
  assert.ok(requests[0].tools.some(t => t.name === 'write'));
  assert.ok(!requests[0].tools.some(t => /submit|vote|verify|lookup/.test(t.name)));
  const recovered = new Store(join(root, 'data')).get(session.id);
  assert.deepEqual(messagesFor(recovered), messagesFor(session));
  assert.equal(agent.running.size, 0);
});

test('truncated tool arguments never cause a partial file write', async t => {
  const { root, store, session } = setup(t);
  const agent = new Agent(store, { model: async () => answer([toolCall('write', { file_path: 'partial.txt', content: 'unfinished' })], 'length') });
  await agent.start(session, 'write');
  assert.equal(existsSync(join(root, 'partial.txt')), false);
  assert.match(session.events.at(-1).error, /输出上限/);
  assert.ok(!messagesFor(session).some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'toolCall')));
});

test('stop cancels a real process and pairs all pending tool calls without running later writes', async t => {
  const { root, store, session } = setup(t);
  const ac = new AbortController();
  const run = runCommand('printf started; sleep 30', root, ac.signal, () => ac.abort());
  const result = await run;
  assert.equal(result.aborted, true);
  let agent;
  agent = new Agent(store, {
    model: async () => answer([toolCall('bash', { command: 'sleep 30' }, 'one'), toolCall('write', { file_path: 'not-run.txt', content: 'bad' }, 'two')], 'toolUse'),
    notify: (_, e) => { if (e.type === 'tool_start') agent.stop(session.id); },
  });
  await agent.start(session, 'run');
  assert.equal(existsSync(join(root, 'not-run.txt')), false);
  assert.deepEqual(session.events.filter(e => e.message?.role === 'toolResult').map(e => e.message.toolCallId), ['one', 'two']);
  assert.equal(session.events.at(-1).state, 'stopped');
});

test('memory versions and project visibility survive reload; invalid batch commits nothing', t => {
  const { root, store } = setup(t);
  store.memoryOps(root, [{ op: 'add', scope: 'project', key: 'input', text: 'a.txt' }]);
  const first = store.memories(root)[0];
  store.memoryOps(root, [{ op: 'update', scope: 'project', key: 'input', target: first.id, text: 'b.txt' }]);
  store.memoryOps('/another', [{ op: 'add', scope: 'project', key: 'input', text: 'other.txt' }]);
  const reloaded = new Store(join(root, 'data'));
  assert.deepEqual(reloaded.memories(root).map(m => m.text), ['b.txt']);
  assert.equal(reloaded.memories(root)[0].previous, first.id);
  assert.throws(() => store.memoryOps(root, [{ op: 'add', key: 'new', text: 'not committed' }, { op: 'wrong' }]));
  assert.deepEqual(reloaded.memories(root).map(m => m.text), ['b.txt']);
});

test('scribe commits through a native tool, keeps failed batch pending, and appends state versions', async t => {
  const { store, session } = setup(t);
  store.saveSettings({ main: { model: 'test', baseUrl: 'http://test' } });
  store.append(session, 'message', { message: { role: 'user', content: '记住输出文件是 result.txt。', timestamp: Date.now() } });
  let succeed = false;
  const hub = new ContextHub(store, async (_, context) => {
    assert.equal(context.tools[0].name, 'save_context');
    assert.ok(context.systemPrompt.includes(MEMORY_CONSTITUTION));
    if (!succeed) return answer([{ type: 'text', text: 'Not submitted yet.' }]);
    return answer([toolCall('save_context', { digest: 'The output file is result.txt.', pin: ['输出文件是 result.txt'], status: 'Awaiting work.', compactable: true, nowCompactable: [], ops: [{ op: 'add', scope: 'project', key: 'output', text: '输出文件是 result.txt', target: '' }] })], 'toolUse');
  });
  await hub.schedule(session, true);
  assert.equal(session.events.filter(e => e.type === 'digest').length, 0);
  succeed = true;
  await hub.schedule(session, true);
  assert.equal(session.events.filter(e => e.type === 'digest').length, 1);
  assert.equal(store.info(session).context.pins[0], '输出文件是 result.txt');
  assert.equal(store.memories(session.events[0].project).length, 1);
});

test('compaction preserves user instructions and tool pairing; originals remain retrievable after reload', async t => {
  const { root, store, session } = setup(t);
  store.saveSettings({ main: { contextWindow: 100 } });
  for (let i = 0; i < 8; i++) {
    store.append(session, 'message', { message: { role: 'user', content: `Constraint ${i}`, timestamp: i } });
    store.append(session, 'message', { message: answer([toolCall('read', { file_path: `f${i}` }, `c${i}`)], 'toolUse') });
    store.append(session, 'message', { message: { role: 'toolResult', toolCallId: `c${i}`, toolName: 'read', content: [{ type: 'text', text: `ORIGINAL_${i}: ${'material '.repeat(90)}` }], timestamp: i } });
  }
  const hub = new ContextHub(store, async () => answer([{ type: 'text', text: 'Done: inspected f0 through f4. Not yet done: finish the remaining work.' }]));
  assert.equal(await hub.compact(session, true), true);
  const reloaded = new Store(join(root, 'data')).get(session.id);
  const messages = messagesFor(reloaded);
  for (let i = 0; i < 8; i++) assert.ok(messages.some(m => m.content === `Constraint ${i}`));
  const pending = new Set();
  for (const m of messages) {
    for (const b of Array.isArray(m.content) ? m.content : []) if (b.type === 'toolCall') pending.add(b.id);
    if (m.role === 'toolResult') { assert.ok(pending.has(m.toolCallId)); pending.delete(m.toolCallId); }
  }
  assert.equal(pending.size, 0);
  const cp = store.info(session).checkpoint;
  const result = await executeTool(toolCall('recall', { query: 'first original', from: cp.from, to: cp.to }), { store, session: reloaded });
  assert.match(result.text, /ORIGINAL_0/);
  assert.ok(JSON.stringify(messages).length < JSON.stringify(session.events).length);
});

test('curated persona passages and memory/condenser wording are preserved from the original snapshot', () => {
  const original = JSON.parse(readFileSync(new URL('./fixtures/prompt-origin.json', import.meta.url), 'utf8'));
  const a = original.personas.align.split('\n\n'), b = original.personas.erudite.split('\n\n'), c = original.personas.empiric.split('\n\n');
  for (const passage of [a[0], a[3], a[4], b[0], b[1], b[2], b[5], c[5]]) assert.ok(MAIN_PERSONA.includes(passage));
  assert.ok(MAIN_PERSONA.includes('confidence and correctness are unrelated'));
  assert.ok(MAIN_PERSONA.includes('"Complete" means verified: decide beforehand what result would count'));
  assert.equal(MEMORY_CONSTITUTION, original.constitution);
  assert.equal(SURGEON_SYSTEM, original.surgeon);
  assert.deepEqual(OPS_DESC, original.ops);
  assert.ok(!SCRIBE.includes('Output JSON (JSON only)'));
});

test('semantic compaction waits for a held span to be released without needing window pressure', async t => {
  const { store, session } = setup(t);
  store.saveSettings({ main: { contextWindow: 1000000 } });
  for (let i = 0; i < 8; i++) {
    store.append(session, 'message', { message: { role: 'user', content: `Inspect ${i}`, timestamp: i } });
    store.append(session, 'message', { message: answer([toolCall('read', { file_path: `f${i}` }, `c${i}`)], 'toolUse') });
    store.append(session, 'message', { message: { role: 'toolResult', toolCallId: `c${i}`, toolName: 'read', content: [{ type: 'text', text: `File ${i}: ${'x'.repeat(8000)}` }], timestamp: i } });
  }
  const held = store.append(session, 'digest', { from: 1, to: 12, summary: 'Read files.', compactable: false, release: [] });
  let calls = 0;
  const hub = new ContextHub(store, async () => { calls++; return answer([{ type: 'text', text: 'Done: read the first four files.' }]); });
  assert.equal(await hub.compact(session), false);
  store.append(session, 'digest', { from: 13, to: 21, summary: 'Earlier files are no longer in use.', compactable: true, release: [held.seq] });
  assert.equal(await hub.compact(session), true);
  assert.equal(calls, 1);
  assert.equal(store.info(session).checkpoint.to, 12);
});
