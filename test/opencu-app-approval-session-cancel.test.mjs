// Synced from OpenCU 654d6a55e87c8a909a7f2f587fffdbd54797cc77; exercise the bundled consumer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { controllers } from './fixtures/approval-session-boundaries.mjs';

// Load untransformed production shared -> runtime -> app-approvals modules.
// Only SDK/UI, ancillary stores and the physical backend are synthetic.
const fixtureURL = new URL('./fixtures/approval-session-boundaries.mjs', import.meta.url).href;
const mocked = new Set([
  '../vendor/opencu/src/dsh/tools.mjs', '../vendor/opencu/src/dsh/computer.mjs', '../vendor/opencu/src/dsh/activity.mjs',
  '../vendor/opencu/src/dsh/browser-host.mjs', '../vendor/opencu/src/dsh/presentation.mjs', '../vendor/opencu/src/dsh/preferences.mjs',
  '../vendor/opencu/src/dsh/browser-history.mjs', '../vendor/opencu/src/runtime.mjs', '../vendor/opencu/src/dsh/model-output.mjs',
  '../vendor/opencu/src/dsh/downloads.mjs', '../vendor/opencu/src/browser/resources.mjs', '../vendor/opencu/src/dsh/delivery-files.mjs',
  '../vendor/opencu/src/dsh/image-registry.mjs', '../vendor/opencu/src/extension/pairing.mjs', '../vendor/opencu/src/extension/listen.mjs',
].map(path => new URL(path, import.meta.url).href));
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (['@deepseek-ai/cordis', '@deepseek-ai/dsh-scope', '@deepseek-ai/schemastery'].includes(specifier) ||
      specifier.startsWith('.') && mocked.has(new URL(specifier, context.parentURL).href)) {
    return { url: fixtureURL, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { acquireOpenCU } = await import('../vendor/opencu/src/dsh/shared.mjs');
hooks.deregister();

const target = suffix => ({ id: `native:synthetic:${suffix}`, backend: 'native', name: `Synthetic ${suffix}`,
  identity: { executable: `/synthetic/${suffix}.exe` } });
const targets = [target('A'), target('B')];
const capture = promise => {
  const state = { settled: false };
  state.done = promise.then(value => { Object.assign(state, { settled: true, value }); return state; },
    error => { Object.assign(state, { settled: true, error }); return state; });
  return state;
};
const tick = () => new Promise(resolve => setImmediate(resolve));
async function waitFor(read, predicate, description) {
  const deadline = Date.now() + 1500;
  do { const value = await read(); if (predicate(value)) return value; await tick(); } while (Date.now() < deadline);
  assert.fail(`Timed out waiting for ${description}`);
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-session-cancel-'));
  const calls = { stop: 0, close: 0, selected: [] };
  const controller = {
    runtimeInfo: { backends: { native: true, extension: false } },
    listTargets: async () => ({ ok: true, targets }),
    applicationMetadata: async target => ({ displayName: target.name }),
    selectTarget: async reference => {
      const selected = targets.find(value => value.id === (typeof reference === 'string' ? reference : reference.id));
      calls.selected.push(selected.id); return { ok: true, target: selected };
    },
    stop: async () => { calls.stop++; return { ok: true }; },
    close: async () => { calls.close++; return { ok: true }; },
  };
  controllers.set(directory, controller);
  const root = {
    on: () => () => {}, get: () => undefined, provide: () => () => {},
    inject: () => ({ dispose: async () => {} }),
  };
  root.root = root;
  const ctx = { root, effect: callback => callback() };
  const lease = acquireOpenCU(ctx, { config: { dataDir: directory, nativeEnabled: true, browserEnabled: false, extensionEnabled: false } });
  const pending = session => lease.request('appApprovals/pending', { conversationId: session }).then(value => value.requests);
  const waitPending = (session, count = 1) => waitFor(() => pending(session), value => value.length === count, `${count} pending request(s) for ${session}`);
  const select = (session, which = 0, signal) => capture(lease.request('select', { reference: { id: targets[which].id } }, { sessionKey: session, signal }));
  const accept = async session => {
    const requests = await pending(session); assert.equal(requests.length, 1);
    await lease.request('appApprovals/respond', { conversationId: session, requestId: requests[0].id, action: 'accept', persist: 'session' });
  };
  t.after(async () => {
    try { await lease.release(); } finally { controllers.delete(directory); await rm(directory, { recursive: true, force: true }); }
  });
  return { lease, controller, calls, pending, waitPending, select, accept };
}

test('aborting one session keeps another approval pending until its own explicit response', async t => {
  const f = await fixture(t), aborter = new AbortController();
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await f.waitPending('A'); const [requestB] = await f.waitPending('B');
  const reason = new Error('Synthetic A cancelled'); aborter.abort(reason);
  await a.done; await tick();
  assert.equal(a.error?.code, 'APP_APPROVAL_CANCELLED'); assert.equal(f.calls.stop, 1, 'Global input release still happens');
  assert.equal(b.settled, false, 'Another conversation must not be cancelled');
  assert.deepEqual((await f.pending('B')).map(value => value.id), [requestB.id]);
  assert.deepEqual(f.calls.selected, []);
  await f.accept('B'); await b.done;
  assert.equal(b.error, undefined); assert.deepEqual(f.calls.selected, [targets[1].id]);
  assert.deepEqual(await f.lease.request('appApprovals/read'), { ok: true, approvals: { approvedApps: [] } });
});

test('aborting one waiter cancels same-session siblings but preserves another session', async t => {
  const f = await fixture(t), aborter = new AbortController();
  const a = f.select('A', 0, aborter.signal), sibling = f.select('A', 0), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B');
  aborter.abort(new Error('Synthetic A stopped'));
  await a.done; await sibling.done; await tick();
  assert.equal(sibling.error?.code, 'APP_APPROVAL_CANCELLED');
  assert.deepEqual(await f.pending('A'), []);
  assert.equal(b.settled, false); assert.equal((await f.pending('B')).length, 1);
  await f.accept('B'); await b.done; assert.equal(b.error, undefined);
});

test('already-aborted admission neither stops input nor cancels existing approvals', async t => {
  const f = await fixture(t), b = f.select('B', 1);
  await f.waitPending('B');
  const reason = new Error('Already cancelled');
  const a = f.select('A', 0, AbortSignal.abort(reason)); await a.done;
  assert.equal(a.error, reason); assert.equal(f.calls.stop, 0);
  assert.equal(b.settled, false); await f.accept('B'); await b.done;
});

for (const sessionKey of [undefined, null]) test(`anonymous abort (${sessionKey}) releases input without cancelling named approvals`, async t => {
  const f = await fixture(t), aborter = new AbortController(), focus = Promise.withResolvers(), entered = Promise.withResolvers();
  f.controller.focus = async () => { entered.resolve(); return focus.promise; };
  t.after(() => focus.resolve({ ok: true }));
  const b = f.select('B', 1); await f.waitPending('B');
  const anonymous = capture(f.lease.request('focus', { targetId: 'synthetic-browser' }, { signal: aborter.signal, sessionKey }));
  await entered.promise;
  const reason = new Error('Synthetic anonymous HTTP action cancelled'); aborter.abort(reason);
  focus.resolve({ ok: true }); await anonymous.done; await tick();
  assert.equal(anonymous.error, reason); assert.equal(f.calls.stop, 1);
  assert.equal(b.settled, false, 'Anonymous input cancellation must not cancel a named approval');
  assert.equal((await f.pending('B')).length, 1); await f.accept('B'); await b.done;
});

test('explicit scoped stop cancels only that session and still releases global input', async t => {
  const f = await fixture(t), a = f.select('A'), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B');
  assert.deepEqual(await f.lease.request('stop', {}, { sessionKey: 'A' }), { ok: true });
  await a.done; await tick();
  assert.equal(a.error?.code, 'APP_APPROVAL_CANCELLED'); assert.equal(f.calls.stop, 1);
  assert.equal(b.settled, false); await f.accept('B'); await b.done;
});

test('explicit unscoped stop retains global cancellation semantics', async t => {
  const f = await fixture(t), a = f.select('A'), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B');
  assert.deepEqual(await f.lease.request('stop'), { ok: true });
  await a.done; await b.done;
  assert.equal(a.error?.code, 'APP_APPROVAL_CANCELLED'); assert.equal(b.error?.code, 'APP_APPROVAL_CANCELLED');
  assert.equal(f.calls.stop, 1); assert.deepEqual(await f.pending('A'), []); assert.deepEqual(await f.pending('B'), []);
});

test('abort still awaits the global input-release acknowledgement', async t => {
  const f = await fixture(t), aborter = new AbortController(), release = Promise.withResolvers();
  f.controller.stop = async () => { f.calls.stop++; return release.promise; };
  t.after(() => release.resolve({ ok: true }));
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B');
  const reason = new Error('Wait for input release'); aborter.abort(reason);
  try {
    await waitFor(() => f.calls.stop, value => value === 1, 'global release call'); await tick();
    assert.equal(a.settled, false, 'Caller must wait for input release');
    assert.equal(b.settled, false, 'Unrelated approval must remain pending');
  } finally { release.resolve({ ok: true }); }
  await a.done; assert.equal(a.error?.code, 'APP_APPROVAL_CANCELLED');
  await f.accept('B'); await b.done;
});

test('failed input release remains an error and can be explicitly retried without cancelling peers', async t => {
  const f = await fixture(t), aborter = new AbortController();
  f.controller.stop = async () => { f.calls.stop++; return f.calls.stop === 1 ? { ok: false, error: { code: 'RELEASE_FAILED', message: 'Synthetic held input release failed' } } : { ok: true }; };
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B');
  aborter.abort(new Error('Synthetic cancellation')); await a.done; await tick();
  assert.equal(a.error?.code, 'RELEASE_FAILED'); assert.match(a.error.message, /held input release failed/);
  assert.equal(b.settled, false); assert.equal(f.calls.stop, 1);
  assert.deepEqual(await f.lease.request('stop', {}, { sessionKey: 'A' }), { ok: true });
  assert.equal(f.calls.stop, 2); assert.equal(b.settled, false);
  await f.accept('B'); await b.done;
});

test('late metadata after abort cannot publish A or cancel B', async t => {
  const f = await fixture(t), aborter = new AbortController(), metadata = Promise.withResolvers(), entered = Promise.withResolvers();
  f.controller.applicationMetadata = async value => { if (value.id === targets[0].id) { entered.resolve(); return metadata.promise; } return { displayName: value.name }; };
  t.after(() => metadata.resolve({ displayName: 'Late synthetic A' }));
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await entered.promise; await f.waitPending('B'); aborter.abort(new Error('Cancel before metadata'));
  metadata.resolve({ displayName: 'Late synthetic A' }); await a.done; await tick();
  assert.deepEqual(await f.pending('A'), []); assert.equal(b.settled, false);
  assert.equal((await f.pending('B')).length, 1); await f.accept('B'); await b.done;
});

test('another session still publishes its approval when its metadata arrives after A aborts', async t => {
  const f = await fixture(t), aborter = new AbortController(), metadata = Promise.withResolvers(), entered = Promise.withResolvers();
  f.controller.applicationMetadata = async value => { if (value.id === targets[1].id) { entered.resolve(); return metadata.promise; } return { displayName: value.name }; };
  t.after(() => metadata.resolve({ displayName: 'Delayed synthetic B' }));
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await f.waitPending('A'); await entered.promise; aborter.abort(new Error('A cancelled during B metadata')); await a.done;
  metadata.resolve({ displayName: 'Delayed synthetic B' });
  await waitFor(async () => ({ settled: b.settled, requests: await f.pending('B') }), value => value.settled || value.requests.length === 1, 'B metadata to settle');
  assert.equal(b.settled, false, 'B metadata must not be marked cancelled by A');
  assert.equal((await f.pending('B'))[0].request.appDisplayName, 'Delayed synthetic B');
  await f.accept('B'); await b.done;
});

test('rejected input release preserves its error without cancelling another approval', async t => {
  const f = await fixture(t), aborter = new AbortController(), failure = new Error('Synthetic transport rejection');
  f.controller.stop = async () => { f.calls.stop++; throw failure; };
  const a = f.select('A', 0, aborter.signal), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B'); aborter.abort(new Error('Synthetic cancellation')); await a.done; await tick();
  assert.equal(a.error, failure); assert.equal(f.calls.stop, 1);
  assert.equal(b.settled, false); await f.accept('B'); await b.done;
});

test('last lease close still cancels all approvals and closes the controller', async t => {
  const f = await fixture(t), a = f.select('A'), b = f.select('B', 1);
  await f.waitPending('A'); await f.waitPending('B'); await f.lease.release(); await a.done; await b.done;
  assert.equal(a.error?.code, 'APP_APPROVAL_CANCELLED'); assert.equal(b.error?.code, 'APP_APPROVAL_CANCELLED');
  assert.equal(f.calls.close, 1); assert.deepEqual(f.calls.selected, []);
});
