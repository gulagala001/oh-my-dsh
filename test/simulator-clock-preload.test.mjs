import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const preload = new URL('../scripts/simulator/clock-preload.mjs', import.meta.url).href;

// Preload modifies Node builtins, so each case runs in a clean process and never
// patches node:test's own deadlines, imports, or scheduling.
async function child(body, simulation = '1') {
  const source = `
    import assert from 'node:assert/strict';
    import timers, { setTimeout as timeout, clearTimeout as clear, setInterval as interval,
      clearInterval as clearInterval, setImmediate as immediate } from 'node:timers';
    import timerPromises, { setTimeout as sleep } from 'node:timers/promises';
    import { performance } from 'node:perf_hooks';
    const clock = globalThis[Symbol.for('omd.simulation.clock')];
    const realSleep = (ms) => new Promise(resolve => clock.realTimers.setTimeout(resolve, ms));
    const result = await (async () => { ${body}\n return true; })();
    console.log(JSON.stringify(result));
  `;
  const { stdout, stderr } = await execute(process.execPath, ['--import', preload, '--input-type=module', '--eval', source], {
    env: { ...process.env, NODE_OPTIONS: '', OMD_SIMULATION: simulation }, timeout: 5000, maxBuffer: 1024 * 1024,
  });
  assert.equal(stderr, '');
  return JSON.parse(stdout.trim());
}

test('preload is opt-in and leaves the parent process and disabled child native', async () => {
  assert.equal(globalThis[Symbol.for('omd.simulation.clock')], undefined);
  assert.equal(await child(`
    assert.equal(clock, undefined);
    assert.equal(timeout, globalThis.setTimeout);
    const before = Date.now();
    await sleep(10);
    assert.ok(Date.now() > before);
  `, '0'), true);
});

test('captured Date.now and builtin ESM timer imports switch together without changing Date arguments', async () => {
  await child(`
    const capturedNow = Date.now;
    const capturedDate = Date;
    const before = capturedNow();
    await sleep(10, 'real');
    assert.ok(capturedNow() > before);
    assert.equal(timeout, globalThis.setTimeout);
    assert.equal(interval, globalThis.setInterval);
    assert.equal(clear, globalThis.clearTimeout);
    assert.equal(clearInterval, globalThis.clearInterval);
    assert.equal(sleep, timerPromises.setTimeout);
    assert.equal(immediate, globalThis.setImmediate);
    const epoch = 1800000000123;
    await clock.enable(epoch);
    assert.equal(capturedNow(), epoch);
    assert.equal(capturedDate.now(), epoch);
    assert.equal(+new Date(), epoch);
    assert.equal(Date('ignored'), new Date(epoch).toString());
    assert.equal(+new Date('2026-10-08T12:00:00+08:00'), Date.parse('2026-10-08T04:00:00Z'));
    assert.equal(+new Date(1999, 2, 3, 4, 5, 6), +new capturedDate(1999, 2, 3, 4, 5, 6));
    assert.ok(Number.isNaN(+new Date('invalid date')));
    class ChildDate extends Date {}
    const derived = new ChildDate();
    assert.ok(derived instanceof ChildDate);
    assert.ok(derived instanceof Date);
    assert.equal(+derived, epoch);
    const events = [];
    timeout(() => events.push('import'), 2);
    globalThis.setTimeout(() => events.push('global'), 2);
    const promised = sleep(2, 'promise');
    await clock.advance(2);
    assert.deepEqual(events, ['import', 'global']);
    assert.equal(await promised, 'promise');
    assert.equal(capturedNow(), epoch + 2);
    assert.equal(clock.snapshot().timers, 0);
  `);
});

test('enable migrates boot timers with remaining delay and intervals retain their original period', async () => {
  await child(`
    const ticks = [];
    const repeated = interval(function(value) {
      assert.equal(this, repeated);
      ticks.push([value, Date.now()]);
    }, 1000, 'tick').unref();
    let oneShot = 0;
    const once = timeout(() => oneShot++, 800);
    await realSleep(20);
    assert.deepEqual(ticks, []);
    const oldRemaining = clock.snapshot().pending.find(item => item.id === +repeated).remaining;
    assert.ok(oldRemaining > 0 && oldRemaining < 1000);
    await clock.enable(1000);
    const pending = clock.snapshot().pending;
    const first = pending.find(item => item.id === +repeated);
    assert.equal(first.delay, 1000);
    assert.equal(first.refed, false);
    assert.ok(first.remaining <= oldRemaining && first.remaining > 0);
    clear(once);
    await realSleep(20);
    assert.equal(oneShot, 0);
    assert.deepEqual(ticks, []);
    await clock.advance(first.remaining - 0.5);
    assert.deepEqual(ticks, []);
    await clock.advance(1);
    assert.equal(ticks.length, 1);
    await clock.advance(999);
    assert.equal(ticks.length, 1);
    await clock.advance(1);
    assert.equal(ticks.length, 2);
    assert.equal(ticks[1][1] - ticks[0][1], 1000);
    clear(repeated);
    await clock.advance(3000);
    assert.equal(ticks.length, 2);
    assert.equal(clock.snapshot().timers, 0);
  `);
});

test('activation includes timers registered or canceled during its real checkpoint', async () => {
  await child(`
    let fired = false;
    const obsolete = timeout(() => assert.fail('obsolete boot timer'), 1000);
    let boot;
    const promised = sleep(100, 'boot promise');
    immediate(() => {
      clear(obsolete);
      boot = timeout(() => { fired = true; }, 100);
    });
    await clock.enable(0);
    assert.equal(clock.snapshot().timers, 2);
    assert.ok(clock.snapshot().pending.some(item => item.id === +boot));
    await clock.advance(100);
    assert.equal(fired, true);
    assert.equal(await promised, 'boot promise');
    assert.equal(clock.snapshot().timers, 0);
  `);
});

test('timeout handles preserve ref, cancellation, refresh, callback this and numeric pairing', async () => {
  await child(`
    const events = [];
    const boot = timeout(() => events.push('boot'), 1000).unref();
    assert.equal(boot.hasRef(), false);
    assert.equal(boot.ref(), boot);
    assert.equal(boot.hasRef(), true);
    boot.unref();
    await clock.enable(0);
    assert.equal(boot.hasRef(), false);
    assert.equal(clock.snapshot().pending[0].refed, false);
    clear(String(+boot));
    assert.equal(boot.refresh(), boot);
    assert.equal(clock.snapshot().timers, 0);
    const handle = timeout(function(a, b) {
      assert.equal(this, handle);
      events.push(a + b);
    }, 10, 2, 3);
    assert.ok(+handle < 0);
    await clock.advance(4);
    assert.equal(handle.refresh(), handle);
    await clock.advance(9);
    assert.deepEqual(events, []);
    await clock.advance(1);
    assert.deepEqual(events, [5]);
    assert.equal(clock.snapshot().timers, 0);
    handle.refresh().unref();
    assert.equal(clock.snapshot().pending[0].refed, false);
    await clock.advance(10);
    assert.deepEqual(events, [5, 5]);
    handle.refresh();
    clearInterval(+handle);
    await clock.advance(10);
    assert.deepEqual(events, [5, 5]);
    const disposed = timeout(() => assert.fail('disposed timer'), 1);
    disposed[Symbol.dispose]();
    const native = clock.realTimers.setTimeout(() => assert.fail('native cleared through patched API'), 1);
    clear(native);
    const foreign = { id: +timeout(() => events.push('survived foreign handle'), 1) };
    clear(foreign);
    await clock.advance(1);
    assert.equal(events.at(-1), 'survived foreign handle');
    assert.equal(clock.snapshot().timers, 0);
  `);
});

test('interval refresh restarts a full original period and cross-clear cancels its next tick', async () => {
  await child(`
    await clock.enable(0);
    const ticks = [];
    const handle = interval(() => {
      ticks.push(Date.now());
      if (ticks.length === 2) clear(handle);
    }, 10);
    await clock.advance(4);
    handle.refresh();
    await clock.advance(10);
    assert.deepEqual(ticks, [14]);
    await clock.advance(30);
    assert.deepEqual(ticks, [14, 24]);
    assert.equal(clock.snapshot().timers, 0);
    handle.refresh();
    await clock.advance(30);
    assert.deepEqual(ticks, [14, 24]);
  `);
});

test('promise timers clean abort listeners and handles on abort, success and invalid options', async () => {
  await child(`
    await clock.enable(10);
    const controller = new AbortController();
    const signal = controller.signal;
    let added = 0, removed = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (...args) => { added++; return add(...args); };
    signal.removeEventListener = (...args) => { removed++; return remove(...args); };
    const canceled = sleep(100, 'canceled', { signal, ref: false });
    const rejection = assert.rejects(canceled, error => error.name === 'AbortError' && error.code === 'ABORT_ERR' && error.cause === 'cancel reason');
    assert.equal(clock.snapshot().pending[0].refed, false);
    controller.abort('cancel reason');
    await rejection;
    assert.equal(added, 1);
    assert.equal(removed, 1);
    assert.equal(clock.snapshot().timers, 0);
    await assert.rejects(sleep(100, undefined, { signal }), { name: 'AbortError' });
    assert.equal(added, 1);
    const success = new AbortController();
    let successRemoved = 0;
    const successRemove = success.signal.removeEventListener.bind(success.signal);
    success.signal.removeEventListener = (...args) => { successRemoved++; return successRemove(...args); };
    const resolved = sleep(5, 'value', { signal: success.signal });
    await clock.advance(5);
    assert.equal(await resolved, 'value');
    assert.equal(successRemoved, 1);
    success.abort();
    for (const options of [null, [], 'bad', { ref: 1 }, { signal: {} }]) {
      await assert.rejects(sleep(1, undefined, options), TypeError);
    }
    for (const delay of ['1', {}, true]) await assert.rejects(sleep(delay), TypeError);
    const propagation = new AbortController();
    propagation.signal.addEventListener('abort', event => event.stopImmediatePropagation());
    const protectedAbort = sleep(100, undefined, { signal: propagation.signal });
    const protectedRejection = assert.rejects(protectedAbort, { name: 'AbortError' });
    propagation.abort();
    await protectedRejection;
    assert.equal(clock.snapshot().timers, 0);
    await clock.advance(1000);
    assert.equal(clock.snapshot().timers, 0);
  `);
});

test('invalid epochs and advances leave the real or virtual state and timers intact', async () => {
  await child(`
    let realFired = false;
    timeout(() => { realFired = true; }, 15);
    for (const epoch of [NaN, Infinity, '1', 1.5, 8640000000000001, -8640000000000001]) {
      await assert.rejects(clock.enable(epoch), /Invalid simulation clock epoch/);
      assert.equal(clock.snapshot().mode, 'real');
      assert.equal(clock.snapshot().operation, null);
      assert.equal(clock.snapshot().timers, 1);
    }
    await realSleep(25);
    assert.equal(realFired, true);
    assert.equal(clock.snapshot().timers, 0);
    await clock.enable(-1234);
    assert.equal(Date.now(), -1234);
    const handle = timeout(() => {}, 10);
    for (const delta of [-1, NaN, Infinity, '1', 8640000000005000]) {
      await assert.rejects(clock.advance(delta), /finite nonnegative/);
      assert.equal(Date.now(), -1234);
      assert.equal(clock.snapshot().timers, 1);
      assert.equal(clock.snapshot().operation, null);
    }
    clear(handle);
    await clock.advance(1234);
    assert.equal(Date.now(), 0);
  `);
});

test('a failed activation preparation leaves all boot timers real and permits a later valid activation', async () => {
  await child(`
    let fired = false;
    const boot = timeout(() => { fired = true; }, 1000);
    await assert.rejects(clock.enable(8640000000000000), /Timer deadline is outside/);
    assert.equal(clock.snapshot().mode, 'real');
    assert.equal(clock.snapshot().operation, null);
    assert.equal(clock.snapshot().timers, 1);
    assert.ok(clock.snapshot().pending[0].remaining > 0);
    await clock.enable(0);
    await clock.advance(1000);
    assert.equal(fired, true);
    assert.equal(clock.snapshot().timers, 0);
    clear(boot);
  `);
});

test('enable, advance and reentrant operations are mutually exclusive and recover after rejection', async () => {
  await child(`
    await assert.rejects(clock.advance(1), /not enabled/);
    const enabling = clock.enable(0);
    assert.equal(clock.snapshot().mode, 'real');
    assert.equal(clock.snapshot().operation, 'enable');
    await assert.rejects(clock.enable(1), /Concurrent/);
    await assert.rejects(clock.advance(1), /Concurrent/);
    await enabling;
    await assert.rejects(clock.enable(1), /already enabled/);
    const advancing = clock.advance(1);
    await assert.rejects(clock.advance(1), /Concurrent/);
    await assert.rejects(clock.enable(1), /Concurrent/);
    await advancing;
    timeout(() => clock.advance(1), 1);
    await assert.rejects(clock.advance(1), /Concurrent/);
    assert.equal(clock.snapshot().operation, null);
    await clock.advance(1);
    assert.equal(Date.now(), 3);
  `);
});

test('async timer callbacks can await later timers, real I/O, or never settle without deadlocking advance', async () => {
  await child(`
    await clock.enable(0);
    const events = [];
    timeout(async () => {
      for (let index = 0; index < 20; index++) await Promise.resolve();
      await sleep(2);
      events.push(['later', Date.now()]);
    }, 1);
    timeout(async () => { await new Promise(() => {}); }, 1);
    timeout(async () => {
      await realSleep(20);
      events.push(['real', Date.now()]);
    }, 1);
    await clock.advance(3);
    assert.deepEqual(events, [['later', 3]]);
    assert.equal(clock.snapshot().inflightVirtualCallbacks, 2);
    await realSleep(30);
    assert.deepEqual(events, [['later', 3], ['real', 3]]);
    assert.equal(clock.snapshot().inflightVirtualCallbacks, 1);
    timeout(async () => {
      await realSleep(5);
      throw new Error('late async failure');
    }, 1);
    await clock.advance(1);
    await realSleep(10);
    await assert.rejects(clock.advance(0), /late async failure/);
    assert.equal(clock.snapshot().operation, null);
  `);
});

test('setImmediate, real watchdogs, AbortSignal.timeout and performance stay on real time', async () => {
  await child(`
    await clock.enable(0);
    assert.ok(Object.isFrozen(clock));
    assert.ok(Object.isFrozen(clock.realTimers));
    assert.equal(Object.getOwnPropertyDescriptor(clock, 'realTimers').writable, false);
    assert.equal(immediate, globalThis.setImmediate);
    let immediateFired = false;
    await new Promise(resolve => immediate(() => { immediateFired = true; resolve(); }));
    assert.equal(immediateFired, true);
    const realStart = clock.realTimers.now();
    const perfStart = performance.now();
    let virtualFired = false;
    const virtual = timeout(() => { virtualFired = true; }, 1);
    const signal = AbortSignal.timeout(5);
    await realSleep(15);
    assert.equal(signal.aborted, true);
    assert.ok(clock.realTimers.now() > realStart);
    assert.ok(performance.now() > perfStart);
    assert.equal(Date.now(), 0);
    assert.equal(virtualFired, false);
    clear(virtual);
    const snapshot = clock.snapshot();
    for (const boundary of ['native I/O', 'setImmediate', 'AbortSignal.timeout', 'OS process scheduling', 'browser clock', 'realTimers watchdogs']) {
      assert.ok(snapshot.real.includes(boundary));
    }
    assert.ok(snapshot.callbackPolicy.includes('not awaited'));
    assert.equal(snapshot.timers, 0);
  `);
});

test('fresh process restart at the same epoch reproduces virtual registration and deadlines', async () => {
  const body = `
    await clock.enable(1800000000000);
    const captured = Date.now;
    const events = [];
    const repeat = interval(() => events.push(['interval', captured()]), 4);
    timeout(() => events.push(['timeout', +new Date()]), 3);
    const promised = sleep(5, 'resolved');
    await clock.advance(9);
    clear(repeat);
    return { events, result: await promised, snapshot: clock.snapshot() };
  `;
  assert.deepEqual(await child(body), await child(body));
});
