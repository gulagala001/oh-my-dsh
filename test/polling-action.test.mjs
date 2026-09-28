import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { usePollingAction } from '../src/client/use-polling-action.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function requestQueue() {
  const calls = [];
  const request = (input, signal) => new Promise((resolve, reject) => calls.push({ input, signal, resolve, reject }));
  return { request, calls };
}
// Exercise the hook with its real poller and async requests. Only React's public
// hook storage/effect boundary is replaced; no browser or DSH fixture is started.
function mountHook(t, initialRequest) {
  const cells = [], effects = [];
  let cursor = 0, request = initialRequest, changes = 0, mounted = true;
  t.mock.method(React, 'useState', initial => {
    const index = cursor++, cell = cells[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [cell.value, update => { changes++; cell.value = typeof update === 'function' ? update(cell.value) : update; }];
  });
  t.mock.method(React, 'useRef', initial => cells[cursor++] ||= { current: initial });
  t.mock.method(React, 'useEffect', (effect, dependencies) => {
    const index = cursor++, previous = cells[index];
    if (previous?.dependencies.every((value, i) => Object.is(value, dependencies[i]))) return;
    const cell = cells[index] = { dependencies, cleanup: null };
    effects.push(() => { previous?.cleanup?.(); cell.cleanup = effect(); });
  });
  const render = () => {
    cursor = 0;
    const value = usePollingAction(request, 60000);
    for (const effect of effects.splice(0)) effect();
    return value;
  };
  const unmount = () => { if (mounted) { mounted = false; for (const cell of cells) cell.cleanup?.(); } };
  t.after(unmount);
  render();
  return { snapshot: render, act: input => render().act(input), replaceRequest: next => { request = next; render(); }, unmount, changes: () => changes };
}

test('polling action pauses reads, ignores their late result and prevents duplicate writes', async t => {
  const { request, calls } = requestQueue(), hook = mountHook(t, request);
  assert.equal(calls.length, 1);
  const write = hook.act({ action: 'install' });
  await hook.act({ action: 'install' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].signal, undefined, 'mutation stays outside the read cancellation lifecycle');
  calls[0].resolve({ obsolete: true }); await flush();
  assert.equal(hook.snapshot().state, null);
  assert.equal(hook.snapshot().pending, true);
  calls[1].resolve({ installed: true }); await write;
  assert.deepEqual(hook.snapshot().state, { installed: true });
  assert.equal(hook.snapshot().pending, false);
  assert.equal(calls.length, 3, 'reading resumes after the mutation');
  calls[2].resolve({ installed: true, refreshed: true }); await flush();
  assert.deepEqual(hook.snapshot().state, { installed: true, refreshed: true });
});

test('read recovery preserves a mutation failure until a later retry', async t => {
  const { request, calls } = requestQueue(), hook = mountHook(t, request);
  calls[0].reject(Error('读取失败')); await flush();
  assert.equal(hook.snapshot().error, '读取失败');
  const first = hook.act({ action: 'settings' });
  calls[1].reject(Error('保存失败')); await first;
  assert.equal(hook.snapshot().requestError, '保存失败');
  assert.equal(hook.snapshot().pending, false);
  calls[2].resolve({ recovered: true }); await flush();
  assert.equal(hook.snapshot().error, '');
  assert.equal(hook.snapshot().requestError, '保存失败');
  const retry = hook.act({ action: 'settings' });
  assert.equal(hook.snapshot().requestError, '');
  calls[3].resolve({ saved: true }); await retry;
  assert.deepEqual(hook.snapshot().state, { saved: true });
  assert.equal(hook.snapshot().pending, false);
});

test('unmount leaves an in-flight write running without publishing or restarting reads', async t => {
  const { request, calls } = requestQueue(), hook = mountHook(t, request);
  const write = hook.act({ action: 'install' });
  hook.unmount();
  const changes = hook.changes();
  calls[1].resolve({ installed: true }); await write; await flush();
  assert.equal(hook.changes(), changes);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].signal, undefined);
});

test('changing the request owner prevents an older write from replacing the new snapshot', async t => {
  const old = requestQueue(), next = requestQueue(), hook = mountHook(t, old.request);
  const write = hook.act({ action: 'old' });
  hook.replaceRequest(next.request);
  assert.equal(hook.snapshot().pending, false);
  next.calls[0].resolve({ owner: 'next' }); await flush();
  old.calls[1].resolve({ owner: 'old' }); await write;
  assert.deepEqual(hook.snapshot().state, { owner: 'next' });
  assert.equal(old.calls.length, 2);
  assert.equal(next.calls.length, 1);
});

