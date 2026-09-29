import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffortResolver } from '../src/effort.mjs';

test('effort choices share one model-capability cache and invalidation listener', async () => {
  let calls = 0, invalidations = 0, invalidate;
  const ctx = { on(name, run) { assert.equal(name, 'llm/adapters-updated'); invalidations++; invalidate = run; },
    llm: { async resolveModelInfo() { calls++; return { reasoning: { efforts: [{ id: 'off' }, { id: 'high' }] } }; } } };
  const resolver = createEffortResolver(ctx);
  assert.deepEqual(await Promise.all(['off', 'high', 'low', 'inherit'].map(level => resolver.resolve('p', 'm', level))), ['off', 'high', undefined, undefined]);
  assert.equal(calls, 1); assert.equal(invalidations, 1);
  assert.equal(await resolver.resolve('p', 'm'), 'off');
  invalidate(); assert.equal(await resolver.resolve('p', 'm', 'high'), 'high'); assert.equal(calls, 2);
});

test('legacy configured defaults and model-list fallback retain their behavior', async () => {
  const ctx = { llm: { resolveModelInfo() { throw Error('adapter starting'); },
    async listModels() { return [{ id: 'm', reasoning: { efforts: [{ id: 'low' }] } }]; } } };
  const resolver = createEffortResolver(ctx, { effort: 'low' });
  assert.equal(resolver.effort, 'low'); assert.equal(await resolver.resolve('p', 'm'), 'low');
  assert.equal(await resolver.resolve('p', 'm', 'off'), undefined);
});

test('failed capability lookup remains retryable without losing the requested level', async () => {
  let failed = true, warnings = 0;
  const resolver = createEffortResolver({ logger: { warn() { warnings++; } }, llm: { async resolveModelInfo() {
    if (failed) throw Error('network unavailable');
    return { reasoning: { efforts: [{ id: 'high' }] } };
  } } });
  assert.equal(await resolver.resolve('p', 'm', 'high'), 'high'); assert.equal(warnings, 1);
  failed = false; assert.equal(await resolver.resolve('p', 'm'), undefined);
  assert.equal(await resolver.resolve('p', 'm', 'high'), 'high'); assert.equal(warnings, 1);
});

test('an invalidated failed lookup cannot erase the newer cache entry', async () => {
  let rejectOld, calls = 0;
  const resolver = createEffortResolver({ llm: { resolveModelInfo() {
    return ++calls === 1 ? new Promise((_, reject) => { rejectOld = reject; })
      : Promise.resolve({ reasoning: { efforts: [{ id: 'off' }] } });
  } } });
  const old = resolver.supported('p', 'm');
  resolver.invalidate(); const current = resolver.supported('p', 'm');
  assert.deepEqual([...await current], ['off']); rejectOld(Error('stale failure')); await assert.rejects(old);
  assert.equal(resolver.supported('p', 'm'), current); assert.equal(calls, 2);
});
