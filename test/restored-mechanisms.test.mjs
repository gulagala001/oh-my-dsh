import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage, createMessage } from '@deepseek-ai/dsh-llm';
import { Hub, SAVE_CONTEXT, SCRIBE, message, eventText, substantive } from '../src/hub.mjs';
import { HubStore } from '../src/hub-store.mjs';
import { Config } from '../src/config.mjs';
import { MemoryContext, lexicalPick } from '../src/memory-context.mjs';
import { StateZone, STATE_SCRIBE } from '../src/state-zone.mjs';
import { Canvas, selectRegion, sweepStale } from '../src/canvas.mjs';
import { Prober, judgeProbe } from '../src/probe.mjs';
import { STATE_SYSTEM, PICK_SYSTEM, PROBE_ASK_SYSTEM, PROBE_ANSWER_SYSTEM, DIGEST_DESC } from '../src/prompts.mjs';

const answer = (name, args) => ({ blocks: [{ type: 'tool-call', name, arguments: JSON.stringify(args) }], provider: 'test', model: 'test' });
const text = text => ({ blocks: [{ type: 'text', text }], provider: 'test', model: 'test' });
const signal = () => new AbortController().signal;
function setup(t, patch = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-restore-')), cfg = Config({ flushIdleMs: 0, curateMinGapMs: 0, stateEvery: 2, minRegionTokens: 10, minRegionEvents: 2, keepTailEvents: 2, ...patch });
  const store = new HubStore(dir), hub = Object.assign(Object.create(Hub.prototype), { store, getConfig: () => cfg, jobs: new Map(), controllers: new Map(), pending: new Set(), live: new Map(), requestStarts: new Map(), taskReviews: new Map(), curations: new Map(), curationTail: Promise.resolve(), curationClosed: false, idleTimers: new Map(), agents: new Map(), resumed: new Set(), disposedAgents: new Set(), ctx: { logger: { warn() {} } } });
  hub.memoryContext = new MemoryContext(hub); hub.stateZone = new StateZone(hub);
  const session = Session.create('restore', undefined, { id: 'restore', version: 3, createdAt: 1, cwd: dir, isSeeded: false, agentPreset: 'trisoul-x' });
  const agent = { session, options: { provider: 'main', model: 'main-model' } };
  const ctx = { tokenMeter: { measure(s) { const nodes = s.surface.nodes.map(seq => ({ seq, heuristicTokens: Math.ceil(eventText(s, s.eventAt(seq)).length / 4) })); return { nodes, totalTokens: nodes.reduce((n, x) => n + x.heuristicTokens, 0) }; } }, sessions: { async flush() {} } };
  const canvas = Object.assign(Object.create(Canvas.prototype), { ctx, hub, busy: new Set() }); canvas.prober = new Prober(hub, canvas); hub.canvas = canvas;
  const user = content => session.append('user/message', createUserMessage({ content: [{ type: 'text', text: content }], source: { kind: 'user' } }), { surfaceOp: 'append' });
  const assistant = content => session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({ role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' }, content: [{ type: 'text', text: content }] }) }, { surfaceOp: 'append' });
  t.after(async () => { hub.disposeCuration(); hub.memoryContext.dispose(); hub.stateZone.dispose(); canvas.prober.dispose(); for (const timer of hub.idleTimers.values()) clearTimeout(timer); await Promise.allSettled([...hub.jobs.values(), ...hub.stateZone.jobs.values(), ...canvas.prober.jobs, hub.curationTail]); rmSync(dir, { recursive: true, force: true }); });
  return { dir, cfg, store, hub, session, agent, canvas, user, assistant };
}

test('restored prompt text stays original; state, digest, picker and probe use distinct native contracts', () => {
  const origin = JSON.parse(readFileSync(new URL('./fixtures/prompt-origin.json', import.meta.url), 'utf8'));
  assert.equal(STATE_SYSTEM, origin.stateSystem);
  assert.equal(DIGEST_DESC.workdoc, origin.workdoc); assert.equal(DIGEST_DESC.phaseClosed, origin.phaseClosed);
  assert.ok(origin.picker.startsWith(PICK_SYSTEM)); assert.equal(PROBE_ASK_SYSTEM, origin.probeAsk); assert.equal(PROBE_ANSWER_SYSTEM, origin.probeAnswer);
  assert.ok(!SCRIBE.includes('canvas scribe')); assert.ok(STATE_SCRIBE.includes(STATE_SYSTEM));
  assert.ok(!Object.hasOwn(SAVE_CONTEXT.parameters.properties, 'pin'));
  assert.ok(SAVE_CONTEXT.parameters.required.includes('workdoc')); assert.ok(SAVE_CONTEXT.parameters.required.includes('phaseClosed'));
  for (const system of [SCRIBE, STATE_SCRIBE, PICK_SYSTEM, PROBE_ASK_SYSTEM, PROBE_ANSWER_SYSTEM]) assert.ok(!system.includes('JSON only'));
});

test('task memory picks semantically, rewrites by version, throttles and survives restart without duplicate opening', async t => {
  const { cfg, store, hub, session, agent, dir } = setup(t, { injectLimit: 1, injectBatch: 1, supplementMinSteps: 2, injectMaxPerSession: 5 });
  store.memoryOps(dir, [{ op: 'add', scope: 'global', key: 'user', text: 'Use Chinese.' }, { op: 'add', key: 'a', text: 'The deployment uses the blue cluster.' }, { op: 'add', key: 'b', text: 'The database uses port 6543.' }, { op: 'add', key: 'c', text: 'The documentation lives in docs/.' }]);
  const mc = hub.memoryContext;
  hub.call = async (_a, kind, req) => { assert.equal(kind, 'recall'); assert.match(JSON.stringify(req.messages), /blue cluster/); return answer('select_memories', { indexes: [0] }); };
  const userMessage = createUserMessage({ content: [{ type: 'text', text: '部署怎么配置？' }], source: { kind: 'user' } });
  await mc.preStep(agent, [userMessage], signal());
  const r = mc.record(session); assert.equal(r.injections, 2); assert.equal(r.version, 1); assert.match(r.doc, /blue cluster/);
  const doc = r.doc; mc.applyWorkdoc(session, doc, 'Deployment: use the blue cluster.');
  assert.equal(r.dirty, true);
  await mc.preStep(agent, [], signal()); assert.equal(r.version, 1);
  await mc.preStep(agent, [], signal()); assert.equal(r.version, 2); assert.equal(r.injections, 2);
  const b = hub.memories(session).find(m => m.key === 'b'); mc.enqueue(session, [b]);
  await mc.preStep(agent, [], signal()); assert.equal(r.version, 2);
  await mc.preStep(agent, [], signal()); assert.equal(r.version, 3); assert.match(r.doc, /— new items \(to fold in\) —/);
  const latest = r.doc; mc.applyWorkdoc(session, doc, 'Outdated rewrite'); assert.equal(r.doc, latest);
  const memoryContext = structuredClone(new HubStore(dir).state(session.id).memoryContext);
  assert.equal(memoryContext.doc, latest);
  const seq = session.seq; await mc.preStep(agent, [], signal()); assert.equal(session.seq, seq);
  cfg.injectMaxPerSession = 0; assert.equal(mc.canSupplement(session), false);
});

test('rewrite and append supplementation preserve their original delivery modes in V3 replay', t => {
  const { cfg, store, hub, session, dir } = setup(t, { supplementMode: 'rewrite' });
  store.memoryOps(dir, [{ op: 'add', key: 'a', text: 'Alpha fact.' }, { op: 'add', key: 'b', text: 'Beta fact.' }]);
  const [a, b] = hub.memories(session); hub.memoryContext.deliver(session, [a], 'task'); const first = hub.memoryContext.record(session).seq;
  hub.memoryContext.deliver(session, [b], 'proactive'); assert.ok(!session.surface.nodes.includes(first));
  assert.match(session.deriveMessages().map(m => JSON.stringify(m)).join('\n'), /Alpha fact.*Beta fact/s);
  cfg.supplementMode = 'append'; const before = session.surface.nodes.length; hub.memoryContext.deliver(session, [a], 'proactive'); assert.equal(session.surface.nodes.length, before + 1);
  Session.create(session.id, session.snapshotEvents(), session.header);
});

test('retrieval uses state background and falls back to CJK word matching if the model fails', async t => {
  const { hub, store, session, agent, dir } = setup(t);
  store.state(session.id).status = 'Deploy the database.';
  const pool = Array.from({ length: 10 }, (_, i) => ({ id: '' + i, scope: 'project', key: '' + i, text: i === 7 ? '数据库部署使用蓝色集群' : '前端样式保持简洁' }));
  hub.call = async (_a, kind, req) => { assert.equal(kind, 'recall'); assert.match(JSON.stringify(req.messages), /Deploy the database/); throw new Error('offline'); };
  const result = await hub.memoryContext.pick(agent, '数据库部署', pool, { signal: signal() });
  assert.equal(result.mode, 'lexical'); assert.deepEqual(result.hits.map(m => m.id), ['7']);
  assert.equal(store.state(session.id).actions.retrievalFallbacks, 1);
  assert.deepEqual(lexicalPick('数据库部署', pool).map(m => m.id), ['7']);
});

test('state pipeline skips injected memory, retains constraints and pauses compression after repeated failure', async t => {
  const { hub, store, session, agent, canvas, cfg, user, assistant } = setup(t, { stateFailCooldownSteps: 1, stateFailLimit: 2 });
  session.append('user/message', message('INJECTED_MEMORY_SECRET', 'memory'), { surfaceOp: 'append' });
  user('不能改端口'); assistant('The port will stay 6543.');
  hub.call = async (_a, kind, req) => { assert.equal(kind, 'state'); assert.ok(!JSON.stringify(req.messages).includes('INJECTED_MEMORY_SECRET')); return answer('save_state', { pin: ['User: “不能改端口”'], status: 'Keep port 6543.' }); };
  await hub.stateZone.preStep(agent, signal()); hub.stateZone.publish(agent);
  const state = store.state(session.id), oldState = session.surface.nodes.at(-1);
  assert.deepEqual(state.pins, ['User: “不能改端口”']); assert.match(eventText(session, session.eventAt(oldState)), /snapshot v1/);
  user('继续做'); assistant('Plan updated.');
  hub.call = async () => { throw Error('provider unavailable'); };
  await hub.stateZone.preStep(agent, signal()); await hub.stateZone.preStep(agent, signal()); await hub.stateZone.preStep(agent, signal());
  assert.equal(hub.stateZone.degraded(session), true); assert.equal(await canvas.compactIfNeeded(agent, 'context-overflow', signal()), null);
  await hub.stateZone.preStep(agent, signal());
  hub.call = async () => answer('save_state', { pin: [], status: 'The plan is now complete.' });
  await hub.stateZone.preStep(agent, signal()); hub.stateZone.publish(agent);
  assert.equal(hub.stateZone.degraded(session), false); assert.deepEqual(state.pins, ['User: “不能改端口”']); assert.equal(state.status, 'The plan is now complete.');
  assert.ok(session.surface.nodes.includes(oldState)); cfg.shadowStale = 1;
  assert.equal(sweepStale(session, cfg)[0].versions, 1); assert.ok(!session.surface.nodes.includes(oldState));
  const replay = Session.create(session.id, session.snapshotEvents(), session.header);
  assert.ok(replay.deriveMessages().every(m => m.source?.plugin !== 'trisoul-x:shadow'));
});

test('phase close releases earlier gaps; latest state and task snapshots stay while task memory remains condensable', t => {
  const { session, store, cfg, user, assistant } = setup(t);
  user('A task'); const start = assistant('Earlier process '.repeat(100)).seq;
  session.append('user/message', message('Relevant task fact '.repeat(100), 'task-memory'), { surfaceOp: 'append' });
  const end = assistant('Completed phase '.repeat(100)).seq;
  session.append('user/message', message('Current state', 'state'), { surfaceOp: 'append' });
  session.append('user/message', message('Current task', 'tasks'), { surfaceOp: 'append' });
  assistant('Recent'); assistant('Tail');
  const state = store.state(session.id); state.digests.push({ id: end, from: end, to: end, summary: 'Completed', compactable: true, phaseClosed: true, release: [] });
  assert.deepEqual(selectRegion(session, state, cfg), { start, end });
  cfg.semanticCompaction = false; assert.equal(selectRegion(session, state, cfg), null);
  assert.deepEqual(selectRegion(session, state, cfg, false, true), { start, end });
});

test('sharded curation resumes windows and promotes cross-project candidates without private session material', async t => {
  const { hub, store, session, agent, dir, cfg } = setup(t, { curateLimit: 2, injectMaxPerSession: 0 });
  store.memoryOps(dir, [1, 2, 3].map(i => ({ op: 'add', key: 'local.' + i, text: 'Local fact ' + i })));
  const window = store.curateWindow('project:' + dir, 2); assert.equal(window.entries.length, 2); store.markCurated('project:' + dir, window.next);
  assert.equal(new HubStore(dir).curateWindow('project:' + dir, 2).entries.length, 1);
  store.memoryOps('/project-a', [{ op: 'add', key: 'tool', text: 'The tool accepts utf8.' }]);
  store.memoryOps('/project-b', [{ op: 'add', key: 'tool', text: 'The tool accepts utf8 encoding.' }]);
  store.memoryOps('session:private', [{ op: 'add', key: 'tool', text: 'PRIVATE_SESSION_MATERIAL' }], 'scribe', 'session');
  assert.equal(store.crossCandidates().length, 1);
  const candidates = store.crossCandidates()[0].entries;
  hub.call = async (_a, kind, req) => { assert.equal(kind, 'curation'); assert.ok(!JSON.stringify(req.messages).includes('PRIVATE_SESSION_MATERIAL')); return answer('memory_curate', { ops: [{ op: 'update', scope: 'cross', key: 'tool', text: 'The tool accepts utf8.', target: candidates[0].id }, { op: 'retire', scope: 'project', key: 'tool', text: 'Duplicate.', target: candidates[1].id }] }); };
  await hub.curate(agent, signal(), 'cross');
  assert.equal(store.memories('/anywhere').find(m => m.key === 'tool').scope, 'cross'); assert.equal(store.crossCandidates().length, 0);
  assert.equal(store.memories('session:private', 'session').length, 1);
  const shards = store.curationState(); assert.ok(shards.lastAt.cross);
  assert.equal(store.pickShard('cross', { mode: 'project', project: dir }), 'project:' + dir);
  cfg.curateLimit = 0; assert.equal(store.curateWindow('project:' + dir, cfg.curateLimit).entries.length, 1);
});

test('probe failure queues a fact, successful later condensation consumes only facts actually retained', async t => {
  const { hub, store, session, agent, canvas, assistant, user } = setup(t, { probeEnabled: true });
  user('Inspect'); const a = assistant('The service port is 6543. '.repeat(120)); const b = assistant('The region is cn-beijing. '.repeat(120));
  hub.call = async (_a, kind) => kind === 'surgeon' ? text('Done: inspected the service.') : kind === 'probeAsk' ? answer('record_probe', { question: 'What is the service port?', expected: '6543' }) : text('UNKNOWN');
  const first = await canvas.compactRegion(a.seq, b.seq, agent, signal()); await Promise.all([...canvas.prober.jobs]);
  assert.equal(store.state(session.id).probe.ok, false); assert.deepEqual(canvas.prober.notes(session), ['What is the service port? → 6543']);
  const c = assistant('More process '.repeat(300));
  store.state(session.id).probeNotes.push('What is the directory? → /unretained');
  hub.call = async (_a, kind, req) => {
    if (kind === 'surgeon') { assert.match(JSON.stringify(req.messages), /6543/); return text('Done: retained service port 6543 and continued.'); }
    if (kind === 'probeAsk') return answer('record_probe', { question: 'What is the service port?', expected: '6543' });
    return text('6543');
  };
  const cp = session.surface.nodes.find(seq => session.eventAt(seq).data.source?.compactionId === first.compactionId);
  await canvas.compactRegion(cp, c.seq, agent, signal()); await Promise.all([...canvas.prober.jobs]);
  assert.deepEqual(canvas.prober.notes(session), ['What is the directory? → /unretained']);
  assert.equal(store.state(session.id).probe.ok, true);
  Session.create(session.id, session.snapshotEvents(), session.header);
  assert.equal(judgeProbe('3', '13'), false); assert.equal(judgeProbe('2.5', '25'), false); assert.equal(judgeProbe('900x600', '９００×６００ 像素'), true);
});

test('immediate QA patch uses a complete V3 lifecycle and preserves recoverable originals', async t => {
  const { hub, store, session, agent, canvas, assistant, user } = setup(t, { probePatch: 'qa' });
  user('Inspect'); const a = assistant('Exact original PORT_8080 '.repeat(100)), b = assistant('Progress '.repeat(100));
  hub.call = async (_a, kind) => kind === 'surgeon' ? text('Done: inspected.') : kind === 'probeAsk' ? answer('record_probe', { question: 'What is the port?', expected: '8080' }) : text('UNKNOWN');
  await canvas.compactRegion(a.seq, b.seq, agent, signal()); await Promise.all([...canvas.prober.jobs]);
  const replay = Session.create(session.id, session.snapshotEvents(), session.header);
  assert.match(replay.deriveMessages().map(m => JSON.stringify(m)).join('\n'), /What is the port.*8080/s);
  assert.match(eventText(replay, replay.eventAt(a.seq)), /PORT_8080/);
  assert.equal(store.state(session.id).probe.patched, true); assert.deepEqual(canvas.prober.notes(session), []);
  assert.equal(session.snapshotEvents().filter(e => e.type === 'compaction/start').length, 2);
  assert.equal(session.snapshotEvents().filter(e => e.type === 'compaction/end').length, 2);
});

test('oversized surgeon output falls back to the stored digest and honors live route settings', async t => {
  const { hub, cfg, store, session, agent, canvas, assistant, user } = setup(t, { probeEnabled: false });
  user('Inspect'); const a = assistant('Material '.repeat(200)), b = assistant('More '.repeat(300));
  store.state(session.id).digests.push({ id: b.seq, from: a.seq, to: b.seq, summary: 'Done: source inspected; continue from result 42.', compactable: true, release: [] });
  hub.call = async () => text('Oversized '.repeat(1000));
  const result = await canvas.compactRegion(a.seq, b.seq, agent, signal()); assert.match(result.summary[0].text, /result 42/); assert.equal(store.state(session.id).actions.digestFallbacks, 1);
  cfg.background = { provider: 'memory', model: 'm' }; cfg.canvas = { provider: 'canvas', model: 'c' }; cfg.surgeon = { provider: 'surgeon', model: 's' };
  assert.equal(hub.route(agent, 'recall').model, 'm'); assert.equal(hub.route(agent, 'state').model, 'c'); assert.equal(hub.route(agent, 'probeAnswer').model, 'c');
  cfg.backgroundMode = 'unified'; cfg.unifiedBackground = { provider: 'shared', model: 'shared-model' };
  assert.equal(hub.route(agent, 'surgeon').model, 'shared-model');
});

test('idle flush digests a short tail then rotates a dirty shard without another user message', async t => {
  const { cfg, hub, store, session, agent, dir, user } = setup(t, { flushIdleMs: 15, digestEvery: 8, injectMaxPerSession: 0 });
  store.memoryOps(dir, [1, 2].map(i => ({ op: 'add', key: 'idle.' + i, text: 'Idle fact ' + i })));
  user('One short event.');
  hub.call = async (_a, kind) => kind === 'background' ? answer('save_context', { digest: 'Short tail saved.', workdoc: '', phaseClosed: false, compactable: true, nowCompactable: [], ops: [], signals: { overlap: false, conflict: false } }) : answer('memory_curate', { ops: [] });
  hub.armIdle(agent);
  const end = Date.now() + 1000;
  while (!store.state(session.id).actions.curations && Date.now() < end) await new Promise(r => setTimeout(r, 10));
  assert.equal(store.state(session.id).digests.length, 1); assert.equal(store.state(session.id).actions.curations, 1);
  cfg.flushIdleMs = 0; hub.armIdle(agent); assert.ok(!store.pickShard(undefined, hub.scope(session)));
});

test('background timeout exits even if an adapter ignores AbortSignal and never yields', async t => {
  const { hub, cfg, agent, session, store } = setup(t, { jobTimeoutMs: 15 });
  let returned = false;
  hub.efforts = new Map();
  hub.ctx.llm = { async resolveModelInfo() { return {}; }, stream() { return { [Symbol.asyncIterator]() { return this; }, next() { return new Promise(() => {}); }, return() { returned = true; return Promise.resolve({ done: true }); } }; } };
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(hub.call(agent, 'state', { system: 'fixture', messages: [] }, signal()), /超时/); }
  finally { clearTimeout(keepAlive); }
  assert.equal(returned, true); assert.equal(hub.live.size, 0); assert.equal(store.state(session.id).metrics.state.errors, 1);
});

test('manual compaction waits for its QA probe without nesting maintenance operations', async t => {
  const { hub, store, session, agent, canvas, assistant, user } = setup(t, { probePatch: 'qa' });
  user('Inspect'); assistant('Port 8080. '.repeat(100)); assistant('Progress '.repeat(100)); assistant('Keep tail one.'); assistant('Keep tail two.');
  let maintaining = false;
  agent.runMaintenance = async callback => {
    assert.equal(maintaining, false, 'nested maintenance would deadlock'); maintaining = true;
    const controller = new AbortController();
    try { return await callback(controller.signal); } finally { maintaining = false; controller.abort(); }
  };
  hub.call = async (_a, kind) => kind === 'surgeon' ? text('Done: inspected.') : kind === 'probeAsk' ? answer('record_probe', { question: 'What is the port?', expected: '8080' }) : text('UNKNOWN');
  assert.ok(await canvas.compactNow(agent, signal()));
  assert.equal(store.state(session.id).probe.patched, true); assert.deepEqual(canvas.prober.notes(session), []);
  Session.create(session.id, session.snapshotEvents(), session.header);
});
