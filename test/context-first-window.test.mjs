import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Session } from '@deepseek-ai/dsh-session';
import { ContextPipeline, contextConfig } from '../src/context/pipeline.mjs';
import { ContextStore } from '../src/context/store.mjs';
import { createHostAdapter } from '../src/context/host.mjs';
import { summaryMessageReader } from '../src/task-context.mjs';
import { preparationWorkload } from '../src/context/core.mjs';
import { user, system, plugin, exchange } from './context-fixture.mjs';

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'context-first-window-'));
  // This suite covers the ordinary preparation path, independently of the
  // product's now-enabled cached preparation default.
  const cfg = contextConfig({ memoryCacheEnabled: false, traceEnabled: true, keepTailEvents: 30, digestEvery: 48, digestWindow: 48,
    prepareContinueTokens: 1, coordinatorEvery: 999, flushIdleMs: 0, ...overrides });
  const session = Session.create('first-window'), agent = { session, status: 'running' }, calls = [];
  const hub = { store: { dir: directory }, config: () => cfg, scope: () => ({ mode: 'session', project: 'fixture' }),
    ctx: { sessions: { async flush() {} } }, action() {}, event() {},
    async call(_agent, kind, request) {
      assert.equal(kind, 'prepare'); calls.push(JSON.parse(request.messages[0].content[0].text));
      return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Observed task results.', documents: [] } }] };
    } };
  const p = new ContextPipeline(hub, createHostAdapter(hub)); p.agents.set(session.id, agent);
  const state = p.state(session); state.initialized = true; state.eventsSincePrepare = 48;
  system(session); user(session, 'Build and verify the fixture.');
  t.after(async () => { await p.dispose(); await rm(directory, { recursive: true, force: true }); });
  return { p, state, session, agent, cfg, calls, directory };
}
function controls(s) {
  plugin(s, 'Runtime only', 'tasks'); plugin(s, 'Keep the todo list current', 'task-reminder');
  plugin(s, 'Link missing evidence', 'task-verification'); plugin(s, 'Review text evidence', 'task-review');
  s.append('user/message', { id: 'catalog', role: 'user', source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: 'Available skills' }] }, { surfaceOp: 'append' });
  return tool(s, 'run_code', { code: 'const r = await tools.todo_write({op:"list"}); console.log(r);' }, 'Task state only');
}
function tool(s, name, args, result) {
  const id = randomUUID();
  return [s.append('assistant/message', { turn: 1, step: 1, message: { id: randomUUID(), role: 'assistant', source: { kind: 'model' },
    content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] } }, { surfaceOp: 'append' }),
  s.append('tool/result', { turn: 1, step: 1, message: { id: randomUUID(), role: 'tool', source: { kind: 'tool' }, toolCallId: id,
    content: [{ type: 'text', text: result }] } }, { surfaceOp: 'append' })];
}
const work = (s, pairs) => Array.from({ length: pairs }, () => exchange(s, 'Observed source and measured output. '.repeat(10))).flat();

test('first automatic preparation counts only eligible old work; later calls retain arrival cadence', async t => {
  const f = await fixture(t); controls(f.session); work(f.session, 24);
  await f.p.prepare(f.agent);
  assert.equal(f.calls.length, 0, '48 arrivals with a retained tail are not a full first summary');
  assert.equal(f.state.prepareDeferred.reason, 'first-window');
  assert.equal(f.state.prepareDeferred.events, 18);
  work(f.session, 14); f.state.eventsSincePrepare += 28;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 0, '46 eligible events still wait');
  work(f.session, 1); f.state.eventsSincePrepare += 2;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].summary_scope.event_seqs.length, 48);
  assert.equal(f.state.eventsSincePrepare, 0);
  assert.ok(!JSON.stringify(f.calls[0].segment).includes('Task state only'));
  work(f.session, 23); f.state.eventsSincePrepare = 46;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 1);
  work(f.session, 1); f.state.eventsSincePrepare = 48;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].summary_scope.event_seqs.length, 48);
});

test('restart and rewind evaluate the live first window, not a stale arrival count', async t => {
  const f = await fixture(t, { keepTailEvents: 0 }); const events = work(f.session, 24);
  f.session.append('developer/message', { message: { id: 'rewind', role: 'developer', content: [{ type: 'text', text: 'Rewound' }] } },
    { surfaceOp: { op: 'replace', startSeq: events[0].seq, endSeq: events[1].seq }, sourceEventSeqs: events.slice(0, 2).map(e => e.seq) });
  f.state.eventsSincePrepare = 500; f.p.store.save(f.state); f.p.store = new ContextStore(f.directory);
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 0);
  assert.equal(f.p.state(f.session).prepareDeferred.events, 46);
  work(f.session, 1); await f.p.prepare(f.agent);
  assert.equal(f.calls.length, 1);
});

test('manual preparation retains its explicit override and minimum text constraint', async t => {
  const f = await fixture(t, { keepTailEvents: 0 }); work(f.session, 1);
  await f.p.prepare(f.agent, true); assert.equal(f.calls.length, 1);
  work(f.session, 1); f.cfg.prepareContinueTokens = 100000;
  await f.p.prepare(f.agent, true); assert.equal(f.calls.length, 1);
  assert.equal(f.state.prepareDeferred.reason, 'below-minimum');
});

test('summary material filters startup and pure task programs but preserves independent mixed work', () => {
  const s = Session.create('material'); system(s); user(s, 'Reference request'); const control = controls(s);
  const direct = tool(s, 'todo_write', { op: 'list' }, 'Direct task state');
  const mixed = tool(s, 'run_code', { code: 'await tools.todo_write({op:"list"}); console.log(await tools.read({path:"a"}));' }, 'Independent file result');
  const local = tool(s, 'run_code', { code: 'await tools.todo_write({op:"list"}); console.log(1 + 1);' }, '2');
  const read = summaryMessageReader(s);
  for (const e of [...control, ...direct]) assert.equal(read(e), null, 'Control-only calls and results are omitted');
  for (const e of [...mixed, ...local]) assert.ok(read(e), 'Independent work remains');
  assert.equal(preparationWorkload(s, { records: [] }, s.snapshotEvents()).events, 4);
});

for (const preprocessBoundaries of [false, true]) test(`full first windows preserve tool pairs and custom thresholds (boundaries=${preprocessBoundaries})`, async t => {
  const f = await fixture(t, { preprocessBoundaries, keepTailEvents: 0, digestWindow: 3, digestEvery: 10 });
  work(f.session, 1); f.state.eventsSincePrepare = 2;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 0);
  work(f.session, 1); f.state.eventsSincePrepare = 4;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].summary_scope.event_seqs.length, 4, 'Complete the pair that crosses the target');
  work(f.session, 1); f.state.eventsSincePrepare = 2;
  await f.p.prepare(f.agent); assert.equal(f.calls.length, 1, 'Later cadence remains the configured arrival count');
});

test('an input-limited first window waits with a budget reason and resumes after the budget grows', async t => {
  const f = await fixture(t, { keepTailEvents: 0, digestWindow: 4, prepareInputTokens: 180 });
  work(f.session, 2);
  await f.p.prepare(f.agent);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.prepareDeferred.reason, 'input-budget');
  f.cfg.prepareInputTokens = 10000;
  f.p.reconfigure(); await f.p.jobs.get(f.session.id + ':prepare');
  assert.equal(f.calls.length, 1);
});

test('first-window retries cannot turn automatic work into a forced short preparation', async t => {
  const f = await fixture(t, { keepTailEvents: 0, digestWindow: 4 }); const events = work(f.session, 2);
  f.p.hub.call = async () => { throw Error('provider unavailable'); };
  await f.p.prepare(f.agent);
  assert.equal(f.state.failures.prepare.forced, false);
  f.session.append('developer/message', { message: { id: 'retry-rewind', role: 'developer', content: [{ type: 'text', text: 'Rewound' }] } },
    { surfaceOp: { op: 'replace', startSeq: events[0].seq, endSeq: events[1].seq }, sourceEventSeqs: events.slice(0, 2).map(e => e.seq) });
  f.state.prepareRetryAt = 0;
  f.p.hub.call = async () => { assert.fail('Insufficient live first-window content must not be sent'); };
  f.p.arm(f.agent, 1, 'prepare');
  await new Promise(resolve => setTimeout(resolve, 15)); await f.p.jobs.get(f.session.id + ':prepare');
  assert.equal(f.state.prepareDeferred.events, 2);
  assert.equal(f.state.prepareDeferred.reason, 'first-window');
});

test('pure control programs are recognized conservatively across native and legacy message sources', () => {
  const s = Session.create('programs');
  const pure = tool(s, 'run_code', { code: 'const args = {op:"list"}; const r = await tools.recall(args); console.log(JSON.stringify(r));' }, 'Historical reference');
  pure.push(...tool(s, 'run_code', { code: 'console.log(await tools.todo_write({op:"list"}));' }, 'Task list'));
  const kept = [
    'const tools = other; await tools.todo_write({});',
    'await tools.todo_write({}); await fetch("https://example.test");',
    'await tools.todo_write({}); console.log("New independent observation");',
    'await tools.todo_write({}); console.log(await import("node:fs"));',
    'const r = await tools.todo_write({}); r.text = "new"; console.log(r);',
    'const r = await tools.todo_write({get op(){ return writeFile(); }}); console.log(r);',
    'not valid JavaScript',
  ].flatMap(code => tool(s, 'run_code', { code }, 'Independent or unclassified result'));
  const read = summaryMessageReader(s);
  for (const event of pure) assert.equal(read(event), null);
  for (const event of kept) assert.ok(read(event));
});

test('events arriving during the first request remain counted toward the next preparation', async t => {
  const f = await fixture(t, { keepTailEvents: 0 }); work(f.session, 24);
  const started = Promise.withResolvers(), finish = Promise.withResolvers(), originalCall = f.p.hub.call;
  f.p.hub.call = async (...args) => { started.resolve(); await finish.promise; return originalCall(...args); };
  const pending = f.p.prepare(f.agent); await started.promise;
  for (const event of work(f.session, 1)) f.p.observe(f.session, event);
  finish.resolve(); await pending;
  assert.equal(f.state.records.length, 1);
  assert.equal(f.state.eventsSincePrepare, 2);
});

test('historical reasoning and user originals remain references without filling the first factual quota', () => {
  const s = Session.create('references'); user(s, 'Requirement. '.repeat(3000));
  const reasoning = s.append('assistant/message', { turn: 1, step: 1, message: { id: 'analysis', role: 'assistant', source: { kind: 'model' },
    content: [{ type: 'reasoning', text: 'Unverified plan. '.repeat(3000) }] } }, { surfaceOp: 'append' });
  assert.ok(summaryMessageReader(s)(reasoning), 'Standalone earlier analysis remains available as reference');
  assert.deepEqual(preparationWorkload(s, { records: [] }, s.snapshotEvents()), { events: 0, estimatedTokens: 0 });
});

test('first-window progress follows eligible events before the old arrival cadence is reached', async t => {
  const f = await fixture(t, { keepTailEvents: 0 }); f.state.eventsSincePrepare = 0;
  for (const event of work(f.session, 1)) {
    f.p.observe(f.session, event); await f.p.jobs.get(f.session.id + ':prepare');
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.prepareDeferred.events, 2);
  assert.equal(f.state.prepareDeferred.minimumEvents, 48);
});

test('nested control results cannot leave empty wrappers that count as factual work', () => {
  const s = Session.create('nested'); const [call] = tool(s, 'recall', {}, 'Old memory');
  const result = s.append('assistant/message', { turn: 1, step: 2, message: { id: 'nested-result', role: 'assistant', source: { kind: 'model' }, content: [
    { type: 'tool-result', toolCallId: 'wrapper', content: [{ type: 'tool-result', toolCallId: call.data.message.content[0].id, content: [{ type: 'text', text: 'Historical reference' }] }] },
  ] } }, { surfaceOp: 'append' });
  assert.equal(summaryMessageReader(s)(result), null);
  assert.equal(preparationWorkload(s, { records: [] }, [result]).events, 0);
});

test('summary reads classify only requested immutable programs, including results read before calls', () => {
  const s = Session.create('lazy-programs');
  const old = tool(s, 'run_code', { code: 'console.log(await tools.recall({id:"old"}));' }, 'Old reference');
  const current = tool(s, 'run_code', { code: 'console.log(await tools.read({path:"current"}));' }, 'Current file');
  const args = new Set([old, current].map(([e]) => e.data.message.content[0].arguments));
  const parse = JSON.parse, parsed = [];
  JSON.parse = (text, ...rest) => { if (args.has(text)) parsed.push(text); return parse(text, ...rest); };
  try {
    const read = summaryMessageReader(s);
    assert.equal(parsed.length, 0, 'Constructing a reader does not parse unread historical programs');
    assert.ok(read(current[1])); assert.ok(read(current[0]));
    assert.deepEqual(parsed, [current[0].data.message.content[0].arguments]);
    assert.equal(read(old[1]), null); assert.equal(read(old[0]), null);
    assert.equal(parsed.length, 2);
    const second = summaryMessageReader(s);
    assert.equal(second(old[1]), null); assert.ok(second(current[1]));
    assert.equal(parsed.length, 2, 'Known immutable syntax remains shared across readers');
  } finally { JSON.parse = parse; }
});

test('lazy lookup preserves nested and duplicate-id reference exclusion without dropping independent blocks', () => {
  const call = (id, code) => Object.freeze({ type: 'tool-call', id, name: 'run_code', arguments: JSON.stringify({ code }) });
  const events = [
    { data: { message: { role: 'assistant', content: [call('same', 'console.log(await tools.read({}));')] } } },
    { data: { message: { role: 'assistant', content: [{ type: 'tool-result', toolCallId: 'wrapper', content: [call('same', 'console.log(await tools.recall({}));')] }] } } },
    { data: { message: { role: 'assistant', content: [{ type: 'tool-result', toolCallId: 'same', content: [{ type: 'text', text: 'Reference' }] }, { type: 'text', text: 'Independent fact' }] } } },
  ];
  const read = summaryMessageReader({ snapshotEvents: () => events, deriveEventMessage: e => e.data.message });
  assert.deepEqual(read(events[2]).content, [{ type: 'text', text: 'Independent fact' }]);
  assert.equal(read(events[0]), null); assert.equal(read(events[1]), null);
});

test('mutable programs and frozen accessors retain eager classification at reader creation', () => {
  for (const accessor of [false, true]) {
    let args = JSON.stringify({ code: 'console.log(await tools.recall({}));' });
    const block = accessor ? Object.freeze({ type: 'tool-call', id: 'legacy', name: 'run_code', get arguments() { return args; } })
      : { type: 'tool-call', id: 'legacy', name: 'run_code', arguments: args };
    const event = { data: { message: { role: 'assistant', content: [block] } } };
    const s = { snapshotEvents: () => [event], deriveEventMessage: e => e.data.message };
    const read = summaryMessageReader(s);
    args = JSON.stringify({ code: 'console.log(await tools.read({}));' });
    if (!accessor) block.arguments = args;
    assert.equal(read(event), null, 'Existing reader retains its original classification');
    assert.ok(summaryMessageReader(s)(event), 'A fresh reader sees changed legacy arguments');
  }
});
