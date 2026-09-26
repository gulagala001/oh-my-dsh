import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '@deepseek-ai/dsh-session';
import { workflow } from './fixtures/workflow.mjs';

const { PtcWorkflowRun, WorkflowJournal } = workflow;
const meta = { name: 'host-test', description: 'Workflow host integration' };
const limits = { maxConcurrentAgents: 2, maxTotalAgents: 20, maxItemsPerCall: 40, syncTimeoutMs: 500 };
const quiet = { phase() {}, log() {}, agentStart() {}, agentEnd() {} };
const success = text => ({ output: [{ type: 'text', text }], stopReason: 'completed' });

async function fixture(t, start) {
  const root = await mkdtemp(join(tmpdir(), 'omd-workflow-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const parent = { options: { provider: 'fixture', model: 'main', reasoningEffort: 'high' }, session: Session.create(randomUUID()) };
  const requests = [], warnings = [], signals = [];
  const subagents = { async start(provider, request) { requests.push({ provider, request }); return start?.(request) ?? { id: randomUUID(), result: Promise.resolve(success(request.prompt[0].text)), dispose: async () => {} }; } };
  const runtime = {
    resolve: value => value,
    async run(spec) {
      signals.push(spec.signal);
      try {
        // Run the same self-contained ESM data module the real PTC process receives.
        const value = await new Function('workflowHost', `return (async () => { ${spec.program} })()`)(spec.bindings[0].functions);
        return { value };
      } catch (error) { return { error: { kind: 'fixture', message: String(error) } }; }
    },
  };
  const run = (body, extras = {}) => new PtcWorkflowRun({ logger: { warn: message => warnings.push(message) } }, subagents, runtime,
    randomUUID(), meta, parent, { meta, body, limits, ...extras.args === undefined ? {} : { args: extras.args } }, 'spawn', { mode: 'danger-full-access', workspaceRoot: root }, quiet, extras.signal,
    { root, loadWorkflow: async () => { throw Error('not found'); }, ...extras });
  return { root, parent, requests, warnings, signals, run };
}

test('guest schema errors retain actionable locations without dumping the encoded runtime source', async t => {
  const fx = await fixture(t);
  const run = fx.run(`return await agent('review', {schema:{type:'object',properties:{status:{enum:['pass','fail']}}}})`);
  const result = await run.result;
  assert.equal(result.stopReason,'error');
  assert.match(result.error,/schema\.properties\.status\.enum requires type or oneOf/);
  assert.match(result.error,/workflow-guest:\d+:\d+/);
  assert.doesNotMatch(result.error,/data:text\/javascript|%2F%2F%20vendor/);
  assert.ok(result.error.length<4000,`error has ${result.error.length} characters`);
  assert.equal(fx.requests.length,0);
});

test('bundled guest and host forward effort, persist results after disposal, and resume without spawning', async t => {
  let disposals = 0;
  const fx = await fixture(t, request => ({ id: randomUUID(), result: Promise.resolve(success(request.prompt[0].text)), dispose: async () => { disposals++; } }));
  const body = `return await parallel([() => agent('one', {effort:'xhigh'}), () => agent('two')])`;
  const first = fx.run(body); t.after(() => first.dispose());
  const outcome = await first.result; assert.equal(outcome.stopReason, 'completed', outcome.error);
  assert.deepEqual(outcome.value, ['one','two']); assert.equal(disposals, 2);
  assert.equal(fx.requests[0].request.agentOptions.reasoningEffort, 'xhigh');
  assert.match(await readFile(first.scriptPath, 'utf8'), /^export const meta =/);
  const resumed = fx.run(body, { resumeFromRunId: first.id }); t.after(() => resumed.dispose());
  assert.deepEqual((await resumed.result).value, ['one','two']); assert.equal(fx.requests.length, 2); assert.equal(disposals, 2);
  const edited = fx.run(`return await parallel([() => agent('changed', {effort:'xhigh'}), () => agent('two')])`, { resumeFromRunId: first.id });
  assert.deepEqual((await edited.result).value, ['changed','two']); assert.equal(fx.requests.length, 4);
});

test('host cancels a late child publication and does not release resume lease before disposal', async t => {
  const entered = Promise.withResolvers(), publish = Promise.withResolvers(), cleanup = Promise.withResolvers(); let disposed = false;
  const fx = await fixture(t, async () => { entered.resolve(); await publish.promise; return { id: randomUUID(), result: Promise.resolve(success('late')), async dispose() { disposed = true; await cleanup.promise; } }; });
  const first = fx.run(`return await agent('pending')`); t.after(async () => { publish.resolve(); cleanup.resolve(); await first.dispose(); });
  await Promise.race([entered.promise, first.result.then(result => { throw Error(result.error ?? 'Run ended before child startup'); })]); first.cancel('stop'); publish.resolve();
  let settled = false; void first.result.then(() => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(disposed, true); assert.equal(settled, false);
  await assert.rejects(WorkflowJournal.create(fx.root, fx.parent.session.id, randomUUID(), { script: '', meta, resumeFromRunId: first.id }), /owned/i);
  cleanup.resolve(); const outcome = await first.result; assert.equal(outcome.stopReason, 'cancelled');
  const resumed = await WorkflowJournal.create(fx.root, fx.parent.session.id, randomUUID(), { script: '', meta, resumeFromRunId: first.id });
  assert.equal(await resumed.start(1, 'pending'), undefined); await resumed.close('completed');
});

test('host rechecks shared budget at dispatch, even if another workflow spent the target', async t => {
  let spent = 0;
  const fx = await fixture(t, request => { spent = 10; return { id: randomUUID(), result: Promise.resolve(success(request.prompt[0].text)), dispose: async () => {} }; });
  const run = fx.run(`return await parallel([() => agent('one'), () => agent('two')])`, { budget: () => ({ total: 10, spent }) });
  const result = await run.result;
  assert.equal(result.stopReason, 'error'); assert.match(result.error, /token target/); assert.equal(fx.requests.length, 1);
});

test('a set output target cannot silently launch children after unreported model usage', async t => {
  const fx = await fixture(t);
  const run = fx.run(`return await agent('one')`, { budget: () => ({ total: 10, spent: 0, unmetered: 1 }) });
  const result = await run.result; assert.equal(result.stopReason, 'error'); assert.match(result.error, /did not report output usage/); assert.equal(fx.requests.length, 0);
});

test('completed cached calls remain readable after the live-dispatch budget is exhausted', async t => {
  const fx = await fixture(t), body = `return await agent('cached')`;
  const first = fx.run(body); assert.equal((await first.result).value, 'cached');
  const resumed = fx.run(body, { resumeFromRunId: first.id, budget: () => ({ total: 10, spent: 10 }) });
  const result = await resumed.result; assert.equal(result.stopReason, 'completed', result.error); assert.equal(result.value, 'cached'); assert.equal(fx.requests.length, 1);
});

test('failed child result ends the cache prefix and does not poison successful later calls', async t => {
  const fx = await fixture(t, request => ({ id: randomUUID(), result: Promise.resolve(request.prompt[0].text === 'bad' ? { output: [], stopReason: 'error' } : success('good')), dispose: async () => {} }));
  const body = `return await parallel([() => agent('bad'), () => agent('good')])`;
  const first = fx.run(body); assert.deepEqual((await first.result).value, [null, 'good']);
  const resumed = fx.run(body, { resumeFromRunId: first.id }); assert.deepEqual((await resumed.result).value, [null, 'good']); assert.equal(fx.requests.length, 4);
});
