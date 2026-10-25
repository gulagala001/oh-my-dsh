import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { BillionContext, attachBcTransport, bcTraffic, protectBcContext } from '../src/context/bc.mjs';
import { ContextPipeline } from '../src/context/pipeline.mjs';
import { createHostAdapter } from '../src/context/host.mjs';

test('combined optimization budget preserves the BC transmission estimate', () => {
  let active = true;
  const session = { requestContext: () => ({ contextWindow: 10000 }) };
  const hub = { ctx: { tokenMeter: { measure: () => ({ totalTokens: 2000 }) } },
    optimization: { state: () => ({ lastRequest: { used: 12000 } }) },
    bc: { active: () => active, effectiveTokens: (_session, native) => active ? 100 : native } };
  const adapter = createHostAdapter(hub);
  assert.equal(adapter.pressure(session), 100 / 9000);
  active = false;
  assert.equal(adapter.pressure(session), 12000 / 9000);
});
import { user, system, exchange, plugin } from './context-fixture.mjs';

test('BC transport decisions remain isolated across concurrent requests and auxiliary work', async () => {
  const state = { headersFor: () => ({ original: 'kept' }), takeoverGate: () => 'native', beforeSend: async () => {}, prepareDirectSend: () => ({ outcome: 'as-is' }) };
  assert.equal(attachBcTransport(state), true);
  const gate = Promise.withResolvers(), results = [];
  const run = async request => {
    for await (const result of bcTraffic(request, async function* () { await gate.promise; yield { headers: state.headersFor('x'), takeover: state.takeoverGate('x') }; })) results.push(result);
  };
  const requests = [run({ bypass: true }), run({ bypass: false, conversationId: 'bc-A' }), run({ bypass: false, conversationId: 'bc-B' })];
  gate.resolve(); await Promise.all(requests);
  assert.deepEqual(results.map(x => x.takeover), [false, true, true]);
  assert.deepEqual(results.map(x => x.headers['x-bili-plugin-conversation']), [undefined, 'bc-A', 'bc-B']);
  assert.equal(state.takeoverGate('outside'), 'native');
  for await (const _ of bcTraffic({ bypass: false }, async function* () { assert.throws(() => state.prepareDirectSend(), /未绕过压缩直发/); yield true; })) {}
  assert.deepEqual(state.prepareDirectSend(), { outcome: 'as-is' });
});

test('one protected current-state message contains latest task, memory and user request without changing source history', () => {
  const session = Session.create('bc-state'); system(session); user(session, 'Keep exact current requirement.');
  session.append('todo/write', { version: 2, tasks: [{ id: 'T1', title: 'Current unfinished work', done: false }] });
  plugin(session, 'Historical memory OLD', 'dream-memory'); plugin(session, 'Historical memory CURRENT', 'dream-memory');
  const before = structuredClone(session.snapshotEvents());
  const options = markAgentLoopRequest({ messages: session.deriveMessages(), tools: [], provider: 'test', model: 'test' });
  const projected = protectBcContext(options, session), content = projected.messages.at(-1).content;
  assert.equal(isAgentLoopRequest(projected), true); assert.equal(content.length, 1);
  assert.match(content[0].text, /Current runtime context/); assert.match(content[0].text, /Current unfinished work/);
  assert.match(content[0].text, /Historical memory CURRENT/); assert.doesNotMatch(content[0].text, /Historical memory OLD/);
  assert.match(content[0].text, /Keep exact current requirement\./);
  assert.deepEqual(session.snapshotEvents(), before); assert.equal(options.messages.length + 1, projected.messages.length);
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'bc-archive-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const session = Session.create('bc-archive'); system(session); user(session, 'Keep all sources.'); exchange(session, 'Measured source material. '.repeat(400));
  const calls = [], config = { memoryCacheEnabled: false, contextEnabled: true, automaticReplace: true, autoCompactEnabled: true, autoCompactThreshold: 1, traceEnabled: false, keepTailEvents: 0, prepareContinueTokens: 1, coordinatorEvery: 1, coordinatorMinGapMs: 0 };
  const hub = { store: { dir }, scope: () => ({ mode: 'session', project: 'bc-test' }), config: () => config, action() {}, event() {}, agents: new Map(),
    ctx: { sessions: { async flush() {} }, tokenMeter: { measure: s => ({ totalTokens: s.deriveMessages().reduce((n, m) => n + JSON.stringify(m.content).length, 0) }) }, logger: { warn() {} } },
    async call(_agent, kind) { calls.push(kind); return { blocks: [{ type: 'tool-call', name: 'prepare_segment', arguments: { summary: 'Measured the source material.', documents: [{ title: 'Measurement', text: 'Source material kept for exact reference.' }] } }] }; } };
  const p = hub.context = new ContextPipeline(hub, createHostAdapter(hub)); hub.bc = new BillionContext(hub);
  const agent = { session, status: 'idle' }; p.agents.set(session.id, agent); hub.agents.set(session.id, agent);
  p.state(session).contextBackend = 'bc'; p.store.save(p.state(session));
  t.after(() => p.dispose()); return { session, hub, p, agent, calls };
}

test('BC replaces automatic surgery while OMD continues source-backed archive preparation and explicit material operations', async t => {
  const { session, hub, p, agent, calls } = await fixture(t), before = structuredClone(session.snapshotEvents());
  await p.prepare(agent, true); await p.coordinate(agent, true); await p.applyReady(agent); await p.autoCompact.check(agent);
  assert.deepEqual(calls, ['prepare']); assert.deepEqual(session.snapshotEvents(), before);
  const record = p.state(session).records[0]; assert.ok(record); assert.ok(record.documents.some(document => document.title === 'Measurement')); assert.equal(record.mode, 'raw');
  const result = await p.applyReady(agent, { manual: true, ids: [record.id], mode: 'brief' });
  assert.ok(result); assert.equal(p.state(session).records[0].mode, 'brief');
  assert.equal(p.state(session).bc.needsBoundary, true); assert.ok(session.snapshotEvents().length > before.length);
  assert.match(p.recall(session, { id: record.id }), /Source material kept/);
});

test('history rebase preserves native session identity, archives and previous configuration', async t => {
  const { session, hub, p } = await fixture(t);
  const initial = hub.bc.reconcile(session); const id = initial.conversationId;
  const firstRevision = initial.revision;
  session.surface.nodes.splice(-2);
  hub.bc.reconcile(session);
  assert.equal(hub.bc.identity(session).conversationId, id);
  assert.equal(hub.bc.identity(session).needsBoundary, true);
  assert.ok(hub.bc.identity(session).revision > firstRevision);
  assert.equal(p.config().automaticReplace, true); assert.equal(p.config().autoCompactEnabled, true);
});

test('failed oversized handoff retains BC, archives and a usable next request instead of retrying the switch forever', async t => {
  const { hub, p, session, agent } = await fixture(t);
  p.adapter.contextCapacity = () => 100;
  p.prepare = async () => {};
  const before = structuredClone(session.snapshotEvents());
  await assert.rejects(hub.bc.choose(session, 'omd', agent), /尚不能安全交给 OMD/);
  assert.equal(hub.bc.backend(session), 'bc');
  assert.equal(p.state(session).pendingBackend, undefined);
  assert.match(hub.bc.view(session).switchError, /尚不能安全/);
  await hub.bc.applyChoice(session);
  assert.deepEqual(session.snapshotEvents(), before);
});

test('a late BC connection cannot overwrite a newer OMD choice', async t => {
  const { hub, p, session, agent } = await fixture(t);
  p.state(session).contextBackend = 'omd';
  const gate = Promise.withResolvers(); hub.bc.connect = () => gate.promise;
  const earlier = hub.bc.choose(session, 'bc', agent);
  await hub.bc.choose(session, 'omd', agent);
  gate.resolve();
  assert.equal((await earlier).superseded, true);
  assert.equal(hub.bc.backend(session), 'omd');
  assert.equal(p.state(session).pendingBackend, undefined);
});

test('BC current-state protection never duplicates image payloads and its meter counts the new response', async t => {
  const { hub, session } = await fixture(t);
  const picture = { type: 'image', attachment: { name: 'source.png', id: 'source-image' } };
  const options = markAgentLoopRequest({ messages: [{ id: 'picture', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Inspect this source.' }, picture] }] });
  const projected = protectBcContext(options, session);
  assert.equal(projected.messages[0], options.messages[0]);
  assert.ok(projected.messages.at(-1).content.every(block => block.type === 'text'));
  hub.bc.meters.set(session.id, { conversationId: session.id, sentTokens: 200, hostTokens: 1000 });
  assert.equal(hub.bc.effectiveTokens(session, 1150), 350);
});
