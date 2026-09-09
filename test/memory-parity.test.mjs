import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Session } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { Hub } from '../src/hub.mjs';
import { HubStore, projectOf } from '../src/hub-store.mjs';
import { Config } from '../src/config.mjs';
import { lexicalPick } from '../src/memory-context.mjs';

function setup(t, patch = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'trisoul-x-parity-')), store = new HubStore(dir), config = Config({ flushIdleMs: 0, digestEvery: 2, digestBatchMax: 2, ...patch });
  const makeHub = () => Object.assign(Object.create(Hub.prototype), { store, getConfig: () => config, jobs: new Map(), controllers: new Map(), pending: new Set(), resumed: new Set(), agents: new Map(), disposedAgents: new Set(), idleTimers: new Map(), curations: new Map(), curationTail: Promise.resolve(), curationClosed: false, ctx: { logger: { warn() {} } } });
  const hub = makeHub();
  const agent = id => ({ session: Session.create(id, undefined, { id, version: 3, cwd: dir, createdAt: 1, isSeeded: false, agentPreset: 'trisoul-x' }), options: {} });
  const add = (a, n, prefix = 'event') => Array.from({ length: n }, (_, i) => a.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: `${prefix} ${i}` }], source: { kind: 'user' } }), { surfaceOp: 'append' }));
  t.after(async () => { hub.curationClosed = true; for (const c of hub.controllers.values()) c.abort(); for (const timer of hub.idleTimers.values()) clearTimeout(timer); await hub.digestRun; rmSync(dir, { recursive: true, force: true }); });
  return { dir, store, config, hub, makeHub, agent, add };
}

test('legacy child-directory project memories belong to their git root without leaking into siblings or child repositories', t => {
  const { store, dir } = setup(t);
  const repo = join(dir, 'repo'), child = join(repo, 'src'), nested = join(repo, 'vendor/repo'), sibling = join(dir, 'repo-extra');
  for (const path of [repo, child, nested, sibling]) mkdirSync(path, { recursive: true });
  mkdirSync(join(repo, '.git')); writeFileSync(join(nested, '.git'), 'gitdir: ../somewhere');
  store.memoryOps(child, [{ op: 'add', key: 'legacy', text: 'Legacy child cwd fact.' }]);
  store.memoryOps(repo, [{ op: 'add', key: 'root', text: 'Root fact.' }]);
  store.memoryOps(sibling, [{ op: 'add', key: 'sibling', text: 'Sibling fact.' }]);
  assert.equal(projectOf(child), repo); assert.equal(projectOf(nested), nested);
  assert.deepEqual(store.memories(repo, 'project').map(m => m.key).sort(), ['legacy', 'root']);
  assert.equal(store.memories(nested, 'project').length, 0);
  assert.equal(store.shardEntries('project:' + repo).length, 2);
  store.memoryOps(repo, [{ op: 'add', key: 'legacy', text: 'Updated through root.' }]);
  assert.equal(store.memories(repo, 'project').filter(m => m.key === 'legacy').length, 1);
  assert.equal(store.memories(child, 'project')[0].text, 'Updated through root.');
  store.memoryOps(child, [{ op: 'add', key: 'same-key', text: 'Common tool fact.' }]);
  store.memoryOps(repo, [{ op: 'add', key: 'same-key', text: 'Common tool fact.' }]);
  assert.equal(store.crossCandidates().length, 0);
});

test('Korean recall fallback uses adjacent character pairs like the original retriever', () => {
  const pool = [{ id: 'ko', text: '데이터베이스는 서울에 배포합니다.' }, { id: 'other', text: '문서의 글꼴을 수정합니다.' }];
  assert.deepEqual(lexicalPick('데이터베이스배포', pool).map(m => m.id), ['ko']);
  assert.deepEqual(lexicalPick('，！', pool), []);
});

test('digest batches run serially across sessions and automatically drain already queued full batches', async t => {
  const { hub, store, agent, add } = setup(t), a = agent('a'), b = agent('b'); add(a, 4); add(b, 2);
  let release; const gate = new Promise(r => { release = r; }); let active = 0, peak = 0; const batches = [];
  hub.digest = async (a, events) => {
    peak = Math.max(peak, ++active); batches.push([a.session.id, events.map(e => e.seq)]);
    if (batches.length === 1) await gate;
    store.state(a.session.id).cursor = events.at(-1).seq; active--;
  };
  const first = hub.schedule(a), second = hub.schedule(b); const simultaneous = active; release(); await Promise.all([first, second]);
  assert.equal(simultaneous, 1); assert.equal(peak, 1);
  assert.deepEqual(batches, [['a', [0, 1]], ['a', [2, 3]], ['b', [0, 1]]]);
});

test('a failed full batch is retried once, then held out of this process without advancing the durable cursor', async t => {
  const { hub, store, makeHub, agent, add } = setup(t), a = agent('retry'); add(a, 2);
  let attempts = 0; hub.digest = async () => { attempts++; throw Error('offline'); };
  await hub.schedule(a); assert.equal(attempts, 2); assert.equal(store.state(a.session.id).cursor, -1);
  await hub.schedule(a, true); assert.equal(attempts, 2);
  const restarted = makeHub(); restarted.digest = async (_a, events) => { assert.deepEqual(events.map(e => e.seq), [0, 1]); store.state(a.session.id).cursor = events.at(-1).seq; };
  await restarted.schedule(a, true); assert.equal(store.state(a.session.id).cursor, 1);
});

test('digest updates resolve earlier version ids and move scope without leaving a second active copy', t => {
  const { store, dir } = setup(t);
  store.memoryOps(dir, [{ op: 'add', key: 'behavior', text: 'Version one.' }]);
  const original = store.memories(dir)[0];
  store.memoryOps(dir, [{ op: 'update', target: original.id, key: 'behavior', text: 'Version two.' }]);
  store.memoryOps(dir, [{ op: 'update', target: original.id, key: 'behavior', scope: 'cross', text: 'Portable tool behavior.' }]);
  const active = store.memories(dir); assert.equal(active.length, 1); assert.equal(active[0].scope, 'cross');
  assert.equal(store.allMemories().length, 3);
  store.memoryOps(dir, [{ op: 'update', target: active[0].id, key: 'behavior', scope: 'project', text: 'Still portable.' }]);
  assert.equal(store.memories(dir)[0].scope, 'cross');
});

test('all automated memory jobs retain user ownership, and duplicate text is not stored twice', t => {
  const { store, dir } = setup(t);
  store.memoryOps(dir, [{ op: 'add', key: 'manual', text: 'User rule.' }], 'user');
  const manual = store.memories(dir)[0];
  store.memoryOps(dir, [{ op: 'retire', target: manual.id, text: 'Drop.' }]);
  assert.equal(store.memories(dir).length, 1);
  store.memoryOps(dir, [{ op: 'add', key: 'other-key', text: 'User rule.' }]);
  assert.equal(store.memories(dir).length, 1);
});

test('new sessions skip seeded history while known sessions resume only their configured backlog', async t => {
  const { hub, store, agent, add, config } = setup(t), fresh = agent('new'), resumed = agent('known'), seen = [];
  hub.digest = async (a, events) => { seen.push([a.session.id, events.map(e => e.seq)]); store.state(a.session.id).cursor = events.at(-1).seq; };
  add(fresh, 4, 'seeded'); hub.startDigestSession(fresh); add(fresh, 2, 'new'); await hub.schedule(fresh);
  assert.deepEqual(seen, [['new', [4, 5]]]);
  const state = store.state(resumed.session.id); state.digestInitialized = true; state.started = true; config.catchupMax = 2;
  add(resumed, 4, 'backlog'); hub.startDigestSession(resumed); await hub.digestRun;
  assert.deepEqual(seen.at(-1), ['known', [2, 3]]);
});

test('one global idle pass flushes short tails from every queued session', async t => {
  const { hub, store, agent, add, config } = setup(t, { digestEvery: 8 }), a = agent('tail-a'), b = agent('tail-b'), seen = [];
  hub.digest = async (a, events) => { seen.push(a.session.id); store.state(a.session.id).cursor = events.at(-1).seq; };
  add(a, 1); add(b, 1); await hub.schedule(a); await hub.schedule(b); assert.deepEqual(seen, []);
  await hub.onIdle(b); assert.deepEqual(seen, ['tail-a', 'tail-b']);
});
