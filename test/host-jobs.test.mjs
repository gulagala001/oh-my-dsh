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
