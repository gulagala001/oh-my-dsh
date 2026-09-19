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
function work(owner, publication = 'deferred') {
  let finish, starts = 0, reads = 0;
  const done = new Promise(r => { finish = r; });
  const spec = { kind: 'bash', label: 'fixture', owner, publication, run() { starts++; return { done, cancel: () => finish({ status: 'killed' }), readOutput: () => { reads++; return '汉字 stdout'; }, peekOutput: () => '汉字 stdout' }; } };
  return { spec, finish, stats: () => ({ starts, reads }) };
}
test('deferred admission counts toward quotas, publishes once across settlement races, and previews do not consume', async t => {
  const { ctx, owner } = await setup(t, 1); const notices = []; ctx.jobs.onJobDone(s => notices.push(s));
  const a = work(owner), id = ctx.jobs.start(a.spec);
  assert.equal(ctx.jobs.list(owner).length, 0);
  const rejected = work(owner); assert.throws(() => ctx.jobs.start(rejected.spec), /limit/); assert.equal(rejected.stats().starts, 0);
  assert.throws(() => ctx.jobs.releaseCompleted(id, owner), /settled unpublished/);
  a.finish({ status: 'completed', detail: 'exit code: 7' }); await Promise.resolve();
  assert.equal(notices.length, 0);
  ctx.jobs.publish(id, owner); ctx.jobs.publish(id, owner); assert.equal(notices.length, 1);
  const preview = ctx.jobs.peekOutput(id, 4, owner); assert.equal(preview.text, '汉'); assert.equal(preview.truncated, true);
  assert.equal(Buffer.byteLength(preview.text), 3); assert.equal(ctx.jobs.get(id, owner).reported, false); assert.equal(a.stats().reads, 0);
  assert.equal(ctx.jobs.read(id, owner).text, '汉字 stdout'); assert.equal(a.stats().reads, 1);
  assert.equal(ctx.jobs.get(id, owner).resultDelivery, 'unknown', 'read bookkeeping is not provider admission');
  ctx.jobs.markDelivered(id, 'preview', owner); ctx.jobs.markDelivered(id, 'notice', owner); assert.equal(ctx.jobs.get(id, owner).resultDelivery, 'preview');
  assert.throws(() => ctx.jobs.peekOutput(id, 3, { id: 'other' }), /another session/);
});
test('quick results release silently, publication-before-completion notifies once, and owner teardown awaits work', async t => {
  const { ctx, owner, fiber } = await setup(t); const notices = []; ctx.jobs.onJobDone(s => notices.push(s));
  const a = work(owner), id = ctx.jobs.start(a.spec); a.finish({ status: 'completed' }); await Promise.resolve();
  ctx.jobs.releaseCompleted(id, owner); assert.throws(() => ctx.jobs.get(id, owner), /unknown/); assert.equal(notices.length, 0);
  const b = work(owner), later = ctx.jobs.start(b.spec); ctx.jobs.publish(later, owner); b.finish({ status: 'completed' }); await Promise.resolve();
  assert.equal(notices.length, 1);
  const c = work(owner), active = ctx.jobs.start(c.spec); ctx.jobs.publish(active, owner);
  await fiber.dispose(); assert.equal(ctx.jobs.list(owner).length, 0); assert.equal(notices.length, 2); assert.equal(notices[1].reported, true);
});
test('enhanced job ids cannot resolve to a different run after registry restart', async t => {
  const first = await setup(t), second = await setup(t);
  const a = work(first.owner), b = work(second.owner);
  const oldId = first.ctx.jobs.start(a.spec), newId = second.ctx.jobs.start(b.spec);
  assert.notEqual(oldId, newId); assert.throws(() => second.ctx.jobs.get(oldId, second.owner), /unknown/);
});

const { foregroundOrJob } = await import('../vendor/dsh/tool-bash/src/background.ts');
test('automatic handoff preserves short results and detaches only after publication', async t => {
  const { ctx, owner } = await setup(t); const signal = new AbortController(); let starts = 0, stopped = false, finish;
  const quick = await foregroundOrJob(ctx.jobs, owner, 'bash', 'quick', signal.signal, 100,
    async () => { starts++; return { output: 'quick' }; }, value => ({ status: 'completed', output: value.output }));
  assert.deepEqual(quick, { kind: 'foreground', value: { output: 'quick' } }); assert.equal(ctx.jobs.list(owner).length, 0);
  const slow = await foregroundOrJob(ctx.jobs, owner, 'bash', 'slow', signal.signal, 5,
    jobSignal => { starts++; return new Promise(r => { finish = r; jobSignal.addEventListener('abort', () => { stopped = true; r({ output: 'stopped' }); }, { once: true }); }); }, value => ({ status: stopped ? 'killed' : 'completed', output: value.output }));
  assert.equal(slow.kind, 'background'); signal.abort(); await Promise.resolve(); assert.equal(stopped, false);
  assert.equal(ctx.jobs.list(owner).length, 1); ctx.jobs.kill(slow.jobId, owner); await ctx.jobs.wait(slow.jobId, 1000, owner);
  assert.equal(stopped, true); assert.equal(ctx.jobs.get(slow.jobId, owner).status, 'killed'); assert.equal(starts, 2);
});
test('pre-publication cancellation joins the producer and releases admission without a notice', async t => {
  const { ctx, owner } = await setup(t), call = new AbortController(), notices = []; ctx.jobs.onJobDone(j => notices.push(j));
  let released = false;
  const pending = foregroundOrJob(ctx.jobs, owner, 'bash', 'cancel before yield', call.signal, 1000,
    signal => new Promise(resolve => signal.addEventListener('abort', () => { released = true; resolve('stopped'); }, { once: true })), value => ({ status: 'killed', output: value }));
  await Promise.resolve(); call.abort(new Error('user stopped'));
  await assert.rejects(pending, /user stopped/); assert.equal(released, true); assert.equal(ctx.jobs.list(owner).length, 0); assert.equal(notices.length, 0);
});
