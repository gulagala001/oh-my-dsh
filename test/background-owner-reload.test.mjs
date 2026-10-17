import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, symbols } from '@deepseek-ai/cordis';
import { installBackground } from '../src/background.mjs';
import { createModule as createJobs } from '../lib/host/jobs-local.factory.mjs';

async function component(factory, names) {
  const modules = new Map(await Promise.all(names.map(async name => [name, await import(name)])));
  return factory(name => name === '@deepseek-ai/schemastery' ? modules.get(name).default : { ...modules.get(name), __esModule: true });
}

test('background owner options follow a rebuilt jobs service without accumulating effects', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const jobsFiber = ctx.plugin((await component(createJobs, [
    'node:crypto', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-timeout', '@deepseek-ai/dsh-jobs',
  ])).default);
  await jobsFiber;

  // AgentLoop does not inject jobs: its owner and session survive a jobs reload.
  let agent, ownerStarts = 0;
  const ownerFiber = ctx.plugin(ownerCtx => {
    ownerStarts++;
    agent = { ctx: ownerCtx, session: { header: {} } };
  });
  await ownerFiber;
  const originalAgent = agent;
  let enabled = true;
  const hub = { config: () => ({ backgroundTasksEnabled: enabled }) };
  installBackground(ctx, hub, () => true);
  const expected = {
    softYieldMs: 10000, interruptibleWait: true,
    completionPreviewBytes: 2048, completionBatchBytes: 8192,
  };
  const effectsBefore = ownerFiber.getEffects().length;
  hub.prepareBackground(agent);
  assert.deepEqual(ctx.get('jobs').ownerOptions(agent), expected);
  assert.equal(ownerFiber.getEffects().length, effectsBefore + 1);

  const firstRead = ctx.get('jobs'), secondRead = ctx.get('jobs');
  assert.notEqual(firstRead, secondRead, 'the fixture must exercise Cordis traced proxies');
  assert.equal(firstRead[symbols.original], secondRead[symbols.original]);
  for (let request = 0; request < 10; request++) hub.prepareBackground(agent);
  assert.equal(ownerFiber.getEffects().length, effectsBefore + 1, 'ordinary requests reuse one owner registration');

  for (let reload = 0; reload < 2; reload++) {
    const previousJobs = ctx.get('jobs');
    // This is the same Cordis update path used by host-component on config reload.
    jobsFiber.update({ maxConcurrentJobsPerOwner: 11 + reload }, true);
    await jobsFiber.await();
    const currentJobs = ctx.get('jobs');
    assert.notEqual(currentJobs[symbols.original], previousJobs[symbols.original]);
    assert.equal(agent, originalAgent);
    assert.equal(ownerStarts, 1);
    assert.deepEqual(currentJobs.ownerOptions(agent), {}, 'a rebuilt registry starts without the old owner policy');

    hub.prepareBackground(agent);
    assert.deepEqual(currentJobs.ownerOptions(agent), expected, 'the first request after reload restores its execution policy');
    assert.deepEqual(previousJobs.ownerOptions(agent), {}, 'the replaced registration is released');
    for (let request = 0; request < 10; request++) hub.prepareBackground(agent);
    assert.equal(ownerFiber.getEffects().length, effectsBefore + 1, 'reload replaces the owner effect instead of retaining old registries');
  }

  enabled = false;
  hub.prepareBackground(agent);
  assert.deepEqual(ctx.get('jobs').ownerOptions(agent), {});
  enabled = true;
  hub.prepareBackground(agent);
  assert.deepEqual(ctx.get('jobs').ownerOptions(agent), expected);
  assert.equal(ownerFiber.getEffects().length, effectsBefore + 1);

  const jobs = ctx.get('jobs');
  await ownerFiber.dispose();
  assert.deepEqual(jobs.ownerOptions(agent), {}, 'disposing the owner releases its current registration');
});
