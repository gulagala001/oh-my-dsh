import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mountHostComponent } from '../src/host-component.mjs';

test('inherited host configuration waits for native activation and retries a failed value', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  const starts = [], row = { options: { name: '@deepseek-ai/dsh-jobs-local', config: { limit: 1 } }, parent: {
    tree: { import: async () => ({ interpolate: (_ctx, config) => config }) },
  } };
  ctx.provide('loader', { entries: () => [row] });
  let fail = true;
  const component = { name: 'inherited-test', async apply(_ctx, config) {
    starts.push(config.limit);
    if (config.limit === 2) { entered.resolve(); await release.promise; }
    if (config.limit === 3 && fail) throw new Error('native activation failed');
  } };
  await ctx.plugin(owner => mountHostComponent(owner, 'jobs-local', () => component, [], {}));
  row.options.config = { limit: 2 };
  let finished = false;
  const reload = ctx.parallel('app-boot/config-reload').then(() => { finished = true; });
  await entered.promise;
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(finished, false); }
  finally { release.resolve(); await reload; }
  row.options.config = { limit: 3 };
  await assert.rejects(ctx.parallel('app-boot/config-reload'), error => error.errors?.[0]?.message === 'native activation failed');
  fail = false;
  await ctx.parallel('app-boot/config-reload');
  assert.deepEqual(starts, [1, 2, 3, 3]);
});
