import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { Session } from '@deepseek-ai/dsh-session';
import { createModule } from '../lib/host/jobs-local.factory.mjs';
const requireJobs = createRequire(import.meta.resolve('@deepseek-ai/dsh-jobs'));
const names = ['@deepseek-ai/cordis', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-jobs', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-timeout', 'node:crypto'];
const imports = new Map(await Promise.all(names.map(async n => [n, await import(n)])));
const LocalJobRegistry = createModule(n => n === '@deepseek-ai/schemastery' ? imports.get(n).default : ({ ...imports.get(n), __esModule: true })).default;
const { default: AgentRegistry } = await import(pathToFileURL(requireJobs.resolve('@deepseek-ai/dsh-agent')).href);
async function setup(t, maximum = 10) {
  const ctx = new Context(); await ctx.plugin(AgentRegistry); await ctx.plugin(LocalJobRegistry, { maxConcurrentJobsPerOwner: maximum });
  ctx.jobs.attachController('test'); t.after(() => ctx.fiber.dispose());
  const fiber = ctx.plugin(() => {}), owner = { id: 'owner', session: Session.create('owner'), ctx: fiber.ctx, options: {}, status: 'idle', inbox: { nextStep: [], nextTurn: [] }, send() {}, followup() {}, inject() {}, cancel() {}, whenIdle: () => Promise.resolve() };
  await ctx.agents.register(owner); ctx.jobs.setOwnerOptions(owner, () => ({ interruptibleWait: true }));
  return { ctx, owner, fiber };
}
function work(owner) {
  let finish, starts = 0;
  const done = new Promise(resolve => { finish = resolve; });
  const spec = { kind: 'bash', label: 'fixture', owner: owner.id, run(handle) {
    starts++; handle.append('汉字 stdout');
    return { done, cancel: () => finish({ status: 'killed' }) };
  } };
  return { spec, finish, starts: () => starts };
}
test('native admission exposes one job, enforces quotas before execution and preserves model output during previews', async t => {
  const { ctx, owner } = await setup(t, 1), a = work(owner);
  const id = ctx.jobs.start(a.spec);
  assert.equal(ctx.jobs.list(owner.id).length, 1);
  const rejected = work(owner); assert.throws(() => ctx.jobs.start(rejected.spec), /limit/); assert.equal(rejected.starts(), 0);
  a.finish({ status: 'completed', detail: 'exit code: 7', result: 'final 汉字' });
  await ctx.jobs.wait(id, 1000, owner.id);
  assert.deepEqual(ctx.jobs.peekOutput(id, 4, owner.id), { text: '字', available: true, truncated: true });
  assert.match(ctx.jobs.readAt(id, 0, owner.id).chunks.map(c => c.text).join(''), /汉字 stdout/);
  const output = ctx.jobs.read(id, owner.id);
  assert.match(output.chunks.map(chunk => chunk.text).join(''), /汉字 stdout/); assert.equal(output.result, 'final 汉字');
  assert.equal(ctx.jobs.get(id, owner.id).resultDelivery, 'none');
  ctx.jobs.markDelivered(id, 'preview', owner.id); ctx.jobs.markDelivered(id, 'notice', owner.id);
  assert.equal(ctx.jobs.get(id, owner.id).resultDelivery, 'preview');
  assert.throws(() => ctx.jobs.peekOutput(id, 4, 'other'), /another session/);
  ctx.jobs.remove(id, owner.id); assert.throws(() => ctx.jobs.get(id, owner.id), /unknown/);
});
test('settlement events arrive once and owner teardown joins running work', async t => {
  const { ctx, owner, fiber } = await setup(t), notices = [];
  ctx.jobs.events.subscribe({ owner: owner.id }, event => { if (event.type === 'settled') notices.push(event); });
  const a = work(owner), id = ctx.jobs.start(a.spec);
  a.finish({ status: 'completed' }); await ctx.jobs.wait(id, 1000, owner.id);
  assert.equal(notices.length, 1);
  const b = work(owner); ctx.jobs.start(b.spec);
  await fiber.dispose(); assert.equal(ctx.jobs.list(owner.id).length, 0);
  assert.equal(notices.length, 2); assert.equal(b.starts(), 1);
});
test('enhanced job ids cannot resolve to a different run after registry restart', async t => {
  const first = await setup(t), second = await setup(t);
  const oldId = first.ctx.jobs.start(work(first.owner).spec), newId = second.ctx.jobs.start(work(second.owner).spec);
  assert.notEqual(oldId, newId); assert.throws(() => second.ctx.jobs.get(oldId, second.owner.id), /unknown/);
});

test('job_output user abort retains a readable reason and ABORTED identity without stopping or retrying the job', async t => {
  const { verificationFixture } = await import('./fixtures/verification.mjs');
  const { loadWorkflowFactory } = await import('./fixtures/workflow.mjs');
  const fx = verificationFixture(t), ctx = fx.ctx;
  await ctx.plugin(AgentRegistry); await ctx.plugin(LocalJobRegistry);
  const toolJobs = await loadWorkflowFactory('tool-jobs');
  toolJobs.apply(ctx, { completionDelivery: 'quiet' });
  Object.assign(fx.agent, { options: {}, status: 'idle', inbox: { nextStep: [], nextTurn: [] }, inject() {}, whenIdle: () => Promise.resolve() });
  await ctx.agents.register(fx.agent); ctx.jobs.setOwnerOptions(fx.agent, () => ({ interruptibleWait: true }));
  const a = work(fx.agent), id = ctx.jobs.start(a.spec), controller = new AbortController();
  const pending = fx.invoke('job_output', {job_id:id, wait:true}, controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort({kind:'user'});
  const result = await pending;
  assert.equal(result.isError, true); assert.equal(result.error.info.code, 'ABORTED');
  assert.match(result.error.message, /cancelled by user/); assert.doesNotMatch(result.error.message, /\[object Object\]/);
  assert.equal(ctx.jobs.get(id, fx.agent.id).status, 'running'); assert.equal(a.starts(), 1);
  for (const [cause, expected] of [[{kind:'parent'}, /cancelled by parent/], [{kind:'disposed'}, /owner was disposed/], [{kind:'hook',reason:'session archived'}, /cancelled by hook: session archived/], [{kind:'aborted'}, /\{"kind":"aborted"\}/]]) {
    const next = new AbortController(), waiting = fx.invoke('job_output', {job_id:id, wait:true}, next.signal);
    await new Promise(resolve => setImmediate(resolve)); next.abort(cause);
    const cancelled = await waiting;
    assert.equal(cancelled.error.info.code, 'ABORTED'); assert.match(cancelled.error.message, expected);
    assert.doesNotMatch(cancelled.error.message, /cancelled by user/);
  }
  a.finish({status:'completed'}); await ctx.jobs.wait(id, 1000, fx.agent.id);
});

test('foreground and background workflow receipts preserve partial results, failures, durable state, and safe resume guidance', async t => {
  const { verificationFixture } = await import('./fixtures/verification.mjs');
  const { loadWorkflowFactory } = await import('./fixtures/workflow.mjs');
  const fx = verificationFixture(t), ctx = fx.ctx;
  await ctx.plugin(AgentRegistry); await ctx.plugin(LocalJobRegistry); ctx.jobs.attachController('fixture');
  Object.assign(fx.agent, { options:{}, status:'idle', inbox:{nextStep:[],nextTurn:[]}, inject() {}, whenIdle:()=>Promise.resolve() });
  await ctx.agents.register(fx.agent);
  const failures = [{seq:1, childId:'quota-child', stopReason:'error', cause:'failed', reason:'RATE_LIMIT: quota exhausted'}];
  let serial = 0;
  ctx.provide('workflowEngine', { async prepare(input) {return input;}, start(input) {
    return {id:'partial-' + (++serial), meta:input.meta, childFailures:failures, worktrees:[], scriptPath:'/fixture/script.js', transcriptDir:'/fixture/run',
      ready:Promise.resolve(), result:Promise.resolve({stopReason:'completed', agentsStarted:2, value:['good']}), cancel() {}, async dispose() {}};
  } });
  const toolWorkflow = await loadWorkflowFactory('tool-workflow');
  toolWorkflow.apply(ctx, {toolName:'workflow', maxResultChars:50000, enableRunInBackground:true});
  const input = {meta:{name:'partial', description:'fixture'}, script:'return []'};
  const foreground = await fx.invoke('workflow', input);
  assert.equal(foreground.isError, false); assert.deepEqual(foreground.value.result, ['good']); assert.deepEqual(foreground.value.failures, failures);
  assert.match(foreground.content[0].text, /partial failure/); assert.match(foreground.content[0].text, /quota-child/);
  const background = await fx.invoke('workflow', {...input, run_in_background:true});
  assert.equal(background.isError, false);
  await ctx.jobs.wait(background.value.jobId, 1000, fx.agent.id);
  const read = ctx.jobs.read(background.value.jobId, fx.agent.id);
  assert.equal(ctx.jobs.get(background.value.jobId, fx.agent.id).status, 'failed');
  assert.match(read.result, /good/); assert.match(read.result, /quota-child/); assert.match(read.result, /later calls may run again/);
  assert.match(read.result, /Run ID: partial-2/); assert.match(read.result, /Script: \/fixture\/script.js/); assert.match(read.result, /journal.jsonl/);
  const endings = fx.session.snapshotEvents().filter(event => event.type === 'tool-workflow/run-end');
  assert.equal(endings.length, 2); assert.deepEqual(endings[1].data.failures, failures);
  failures.push(...Array.from({length:20}, (_, i) => ({seq:i + 2, childId:'long-' + i, stopReason:'error', cause:'failed', reason:'x'.repeat(20000)})));
  const capped = await fx.invoke('workflow', input);
  assert.match(capped.content[0].text, /reason truncated/); assert.match(capped.content[0].text, /additional failed child task/);
  assert.match(capped.content[0].text, /Full failure details are saved in journal.jsonl/);
  assert.ok(capped.content[0].text.length < 14000);
  assert.equal(capped.value.failures.at(-1).reason.length, 20000, 'structured values retain the full failure reason');

});
