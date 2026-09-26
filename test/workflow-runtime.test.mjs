import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { workflow } from './fixtures/workflow.mjs';

const { WorkflowExecution, WorkflowJournal, readJournal, parseWorkflowSource } = workflow;
const meta = { name: 'test', description: 'Fixture workflow' };
const limits = { maxConcurrentAgents: 2, maxTotalAgents: 12, maxItemsPerCall: 20, syncTimeoutMs: 500 };
const success = value => ({ stopReason: 'completed', output: [{ type: 'text', text: value }] });
const quiet = { phase() {}, log() {}, agentStart() {}, agentEnd() {} };
async function temp(t) { const dir = await mkdtemp(join(tmpdir(), 'omd-workflow-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }
const execute = (body, port, options = {}) => new WorkflowExecution(meta, body, options.args, { ...limits, ...options.limits }, options.observer ?? quiet, port,
  { started: 0, activeSlots: 0, slotWaiters: [], budget: options.budget ?? { total: null, spent: 0 } }).drive();

test('workflow preserves effort, type and worktree options and bounds concurrent children', async () => {
  const requests = []; let active = 0, peak = 0;
  const result = await execute(`return await parallel(Array.from({length: 5}, (_, i) => () => agent('item ' + i, {effort:'xhigh', agentType:'reviewer', isolation:'worktree'})))`, {
    async startAgent(request) {
      requests.push(request); active++; peak = Math.max(peak, active);
      return { id: String(request.seq), result: new Promise(resolve => setTimeout(() => resolve(success(request.prompt)), 3)), dispose: async () => { active--; } };
    },
  });
  assert.equal(result.stopReason, 'completed'); assert.equal(peak, 2); assert.equal(active, 0);
  assert.deepEqual(requests.map(r => r.seq), [1,2,3,4,5]);
  assert.ok(requests.every(r => r.effort === 'xhigh' && r.agentType === 'reviewer' && r.isolation === 'worktree'));
  assert.deepEqual(result.value, ['item 0','item 1','item 2','item 3','item 4']);
});

test('nested workflows share concurrency and total-agent limits without holding a parent slot', async () => {
  let active = 0, peak = 0; const phases = [];
  const port = {
    async loadWorkflow(name) { assert.equal(name, 'child'); return { meta: { ...meta, name: 'child' }, body: `return await parallel([() => agent('one'), () => agent('two')])` }; },
    async startAgent(request) { active++; peak = Math.max(peak, active); return { id: String(request.seq), result: Promise.resolve(success(request.prompt)), dispose: async () => { active--; } }; },
  };
  const result = await execute(`return await parallel([() => workflow('child'), () => workflow('child')])`, port, { limits: { maxConcurrentAgents: 1 }, observer: { ...quiet, agentStart(info) { phases.push(info.phase); } } });
  assert.equal(result.stopReason, 'completed'); assert.equal(peak, 1); assert.equal(result.agentsStarted, 4);
  assert.deepEqual(result.value, [['one','two'],['one','two']]); assert.ok(phases.every(p => p === '▸ child'));
  const capped = await execute(`return await parallel([() => workflow('child'), () => workflow('child')])`, port, { limits: { maxTotalAgents: 3 } });
  assert.equal(capped.stopReason, 'error'); assert.match(capped.error, /agent cap/);
  const nested = await execute(`return await workflow('child')`, { ...port, async loadWorkflow() { return { meta, body: `return await workflow('child')` }; } });
  assert.equal(nested.stopReason, 'error'); assert.match(nested.error, /one level/);
});

test('pipeline has no cross-item barrier and preserves ordinary null failures', async () => {
  const events = [], delayed = Promise.withResolvers();
  const port = { async startAgent(request) {
    if (request.prompt === 'slow') return { id: 'slow', result: delayed.promise, dispose: async () => {} };
    events.push(request.prompt); if (request.prompt === 'fast-done') delayed.resolve(success('slow-done'));
    return { id: request.prompt, result: Promise.resolve(success(request.prompt)), dispose: async () => {} };
  } };
  const result = await execute(`return await pipeline(['slow','fast','bad'], item => item === 'bad' ? (() => {throw Error('bad')})() : agent(item), value => agent(value + '-done'))`, port);
  assert.equal(result.stopReason, 'completed'); assert.ok(events.indexOf('fast-done') < events.indexOf('slow-done-done')); assert.equal(result.value[2], null);
});

test('workflow guards nondeterminism, rejects option typos, and exposes updated budget usage', async () => {
  let starts = 0;
  const port = { async startAgent() { starts++; return { id: 'child', result: Promise.resolve({ ...success('ok'), budgetSpent: 10 }), dispose: async () => {} }; } };
  for (const body of ['return Date.now()', 'return Math.random()', 'return new Date()', 'return Date()', 'return new (new Date(0).constructor)()']) {
    const result = await execute(body, port); assert.equal(result.stopReason, 'error'); assert.match(result.error, /deterministic/);
  }
  assert.equal((await execute('return new Date(0).toISOString()', port)).value, '1970-01-01T00:00:00.000Z');
  const invalid = await execute(`return await agent('x', {isolation:'branch'})`, port); assert.equal(invalid.stopReason, 'error');
  const limited = await execute(`await agent('first'); return {total:budget.total,spent:budget.spent(),remaining:budget.remaining()}`, port, { budget: { total: 10, spent: 0 } });
  assert.equal(limited.stopReason, 'completed'); assert.deepEqual(limited.value, {total:10,spent:10,remaining:0}); assert.equal(starts, 1);
});

test('inline workflow metadata is a pure literal, never evaluated', () => {
  const parsed = parseWorkflowSource(`// comment\nexport const meta = {name:'fixture', description:'test', phases:[{title:'Read'}]};\nreturn await agent('x')`);
  assert.equal(parsed.meta.name, 'fixture'); assert.match(parsed.body, /return await agent/); assert.doesNotMatch(parsed.body, /export/);
  for (const value of [`{name:'x', description:process.exit()}`, `{name:'x', description:('a'+'b')}`, `{...args}`, "{name:'x', description:`hi ${args}`}", `{get name(){ return 'x' }}`, `{name:'x',name:'y',description:'z'}`]) {
    assert.throws(() => parseWorkflowSource(`export const meta = ${value}; return null`), /literal|unique/);
  }
  assert.throws(() => parseWorkflowSource('return null'), /begin/);
  assert.deepEqual(parseWorkflowSource('return null', meta), { meta, body: 'return null' });
});

test('durable workflow cache uses only the longest unchanged successful prefix in start order', async t => {
  const root = await temp(t), original = randomUUID();
  const journal = await WorkflowJournal.create(root, 'session', original, { script: 'return 1', meta });
  await journal.start(1, { prompt: 'first', options: { effort: 'high', model: 'm' } });
  await journal.start(2, { prompt: 'second' }); await journal.start(3, { prompt: 'third' });
  await journal.complete(3, success('third value')); await journal.complete(1, success('')); await journal.complete(2, success('second value'));
  await journal.close('completed');
  const resumed = await WorkflowJournal.create(root, 'session', randomUUID(), { script: 'edited', meta, resumeFromRunId: original });
  const cached = await resumed.start(1, { options: { model: 'm', effort: 'high' }, prompt: 'first' }); assert.deepEqual(cached, success(''));
  assert.equal(await resumed.start(2, { prompt: 'changed' }), undefined);
  assert.equal(await resumed.start(3, { prompt: 'third' }), undefined);
  await resumed.close('cancelled');
  const rows = readJournal(await readFile(join(resumed.directory, 'journal.jsonl'), 'utf8'));
  assert.deepEqual(rows.get(1).result, success('')); assert.equal(rows.get(2).result, undefined);
});

test('failed or unfinished calls break all later workflow cache hits; malformed committed data rejects', async t => {
  const root = await temp(t), original = randomUUID();
  const journal = await WorkflowJournal.create(root, 'session', original, { script: '', meta });
  await journal.start(1, 'one'); await journal.start(2, 'two');
  await journal.complete(1, { stopReason: 'error', output: [] }); await journal.complete(2, success('two')); await journal.close('error');
  const resumed = await WorkflowJournal.create(root, 'session', randomUUID(), { script: '', meta, resumeFromRunId: original });
  assert.equal(await resumed.start(1, 'one'), undefined); assert.equal(await resumed.start(2, 'two'), undefined); await resumed.close('completed');
  assert.equal(readJournal('{"type":"start","seq":1,"key":"a"}\n{"torn":').size, 1);
  assert.throws(() => readJournal('{broken}\n'));
  await assert.rejects(WorkflowJournal.create(root, 'other-session', randomUUID(), { script: '', meta, resumeFromRunId: original }), /ENOENT/);
  await assert.rejects(WorkflowJournal.create(root, 'session', randomUUID(), { script: '', meta, resumeFromRunId: '../../elsewhere' }), /Invalid/);
});

test('kernel lease prevents concurrent resume, including active source runs', async t => {
  const root = await temp(t), original = randomUUID(), input = { script: '', meta, resumeFromRunId: original };
  const journal = await WorkflowJournal.create(root, 'session', original, { script: '', meta });
  await assert.rejects(WorkflowJournal.create(root, 'session', randomUUID(), input), /owned/i);
  await journal.close('completed');
  const resumed = await WorkflowJournal.create(root, 'session', randomUUID(), input);
  await assert.rejects(WorkflowJournal.create(root, 'session', randomUUID(), input), /owned/i);
  await resumed.close('completed');
  const later = await WorkflowJournal.create(root, 'session', randomUUID(), input); await later.close('completed');
});

test('crashed process releases the workflow lease and retains completed prefix', { timeout: 20000 }, async t => {
  const root = await temp(t), id = randomUUID(), fixture = new URL('./fixtures/workflow.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { workflow } from ${JSON.stringify(fixture)};
    const journal = await workflow.WorkflowJournal.create(process.argv[1], 'session', process.argv[2], {script:'',meta:{name:'crash',description:'fixture'}});
    await journal.start(1, 'done'); await journal.complete(1, {stopReason:'completed',output:[]});
    await journal.start(2, 'pending'); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);
  `, root, id], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  const ready = await Promise.race([once(child.stdout, 'data').then(([data]) => data.toString()), once(child, 'exit').then(() => { throw Error(stderr); })]);
  assert.match(ready, /ready/); const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
  const resumed = await WorkflowJournal.create(root, 'session', randomUUID(), { script: '', meta, resumeFromRunId: id });
  assert.deepEqual(await resumed.start(1, 'done'), { stopReason: 'completed', output: [] });
  assert.equal(await resumed.start(2, 'pending'), undefined); await resumed.close('completed');
});
