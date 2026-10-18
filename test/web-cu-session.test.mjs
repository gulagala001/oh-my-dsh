import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createSimulationProvider } from '../scripts/simulator/provider.mjs';
import { createWebCuScenario } from './fixtures/web-cu/scenario.mjs';
import { createWebCuTarget } from './fixtures/web-cu/target.mjs';
import { runWebCuSession } from './fixtures/web-cu/journey.mjs';
import { withJourneyControl } from './fixtures/web-cu/control.mjs';
import { operationScope,settleOperations } from './fixtures/web-cu/owned-browser.mjs';
import { publicFailure,CheckFailure } from './fixtures/web-cu/failure.mjs';

// Explicit integration entry: never skip missing Host/package/lifecycle inputs.
// The reviewed parent harness owns ecosystemFixture, installWebCuPackage,
// original extension pairing, both profiles and all failure cleanup.
test('actual DSH Web composer executes original extension CU and cancels a held-input wait', { timeout: 180000 }, async t => {
  try {
  const file = process.env.OMD_WEB_CU_REVIEWED_HARNESS;
  if(!file)throw new CheckFailure('missing-harness');
  const { withWebCuHarness, abortAndSettle } = await import(pathToFileURL(resolve(file)).href);
  assert.equal(typeof withWebCuHarness, 'function');
  await withJourneyControl({ signal: t.signal, deadline: Date.now() + 150000, abortAndSettle }, async control => {
  const { signal, deadline } = control;
  const target = await control.step(() => createWebCuTarget());
  let provider, failure;
  try {
    const scenario = createWebCuScenario({ nonce: target.nonce, fixtureURL: target.url });
    provider = await createSimulationProvider({ respond: scenario.respond });
    let executions = 0, completed;
    await control.step(() => withWebCuHarness({ target, provider, scenario, signal, deadline }, async input => {
      assert.equal(++executions, 1, 'Run exactly one real journey');
      const report = await runWebCuSession({ ...input, target, provider, scenario, signal, deadline });
      assert.equal(report.passed, true);
      completed = report; return report;
    }));
    assert.equal(executions, 1, 'Lifecycle harness must not bypass the journey');
    assert.equal(completed?.passed, true);
    provider.assertHealthy();
  } catch (error) { failure = error; }
  try { await settleOperations(operationScope(),[['provider',()=>provider?.close()],['target',()=>target.close()],['provider-health',()=>provider?.assertHealthy()]],Date.now()+10000); }
  catch (error) { failure = failure ? new AggregateError([failure, error], 'Web CU journey and local server cleanup failed') : error; }
  if (failure) throw failure;
  });
  } catch(error) { throw publicFailure(error,'entry'); }
});
