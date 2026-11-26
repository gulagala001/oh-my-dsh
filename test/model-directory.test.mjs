import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createSettingsState } from '../src/client/settings-state.mjs';
import { createModelDirectoryState } from '../src/client/model-directory-state.mjs';
import { handleModelDirectoryApi, readProviderModels } from '../src/model-directory.mjs';

const providers = [{ id: 'slow', name: 'Slow' }, { id: 'ready', name: 'Ready' }];

test('a pending provider does not delay other providers or settings reads and writes', async t => {
  const slow = Promise.withResolvers(); let directory, settings;
  const resource = createModelDirectoryState({ readProviders: () => providers,
    readModels: id => id === 'slow' ? slow.promise : [{ id: 'working' }], onChange: next => { directory = next; } });
  const owner = createSettingsState({ read: () => ({ config: { enabled: false } }),
    write: patch => patch, onChange: next => { settings = next; } });
  t.after(() => { resource.dispose(); owner.dispose(); });
  resource.select(providers.map(item => item.id));
  assert.equal(await resource.load(), true); await setImmediate();
  assert.equal(directory.directory[0].loading, true);
  assert.deepEqual(directory.directory[1].models, [{ id: 'working' }]);
  await owner.load(); assert.equal(await owner.commit({ enabled: true }), true);
  assert.equal(settings.config.enabled, true);
  slow.reject(Error('provider offline')); await setImmediate();
  assert.equal(directory.directory[0].error, 'provider offline');
  assert.deepEqual(directory.directory[1].models, [{ id: 'working' }]);
});

test('a refresh ignores obsolete replies and removes providers only after discovery succeeds', async t => {
  const old = Promise.withResolvers(); let calls = 0, view;
  const resource = createModelDirectoryState({ readProviders: () => providers,
    readModels: id => id === 'slow' && ++calls === 1 ? old.promise : [{ id: 'current' }], onChange: next => { view = next; } });
  t.after(() => resource.dispose());
  resource.select(['slow', 'ready']);
  await resource.load(); await resource.load(); await setImmediate();
  old.resolve([{ id: 'obsolete' }]); await setImmediate();
  assert.deepEqual(view.directory[0].models, [{ id: 'current' }]);
  assert.equal(view.directory[0].error, '');
});

test('retry failures retain known models; a successful empty list is authoritative', async t => {
  let view, failure = false, empty = false;
  const resource = createModelDirectoryState({ readProviders: () => [providers[0]],
    readModels: () => { if (failure) throw Error('offline'); return empty ? [] : [{ id: 'saved' }]; },
    onChange: next => { view = next; } });
  t.after(() => resource.dispose());
  resource.select(['slow']);
  await resource.load(); await setImmediate(); failure = true;
  assert.equal(await resource.retry('slow'), false);
  assert.deepEqual(view.directory[0].models, [{ id: 'saved' }]);
  assert.equal(view.directory[0].error, 'offline');
  failure = false; empty = true; assert.equal(await resource.retry('slow'), true);
  assert.deepEqual(view.directory[0].models, []); assert.equal(view.directory[0].error, '');
});

test('failed provider discovery preserves the last directory and retry can recover', async t => {
  let view, failure = false, current = providers;
  const resource = createModelDirectoryState({ readProviders: () => { if (failure) throw Error('offline'); return current; },
    readModels: () => [], onChange: next => { view = next; } });
  t.after(() => resource.dispose());
  await resource.load(); await setImmediate(); failure = true;
  assert.equal(await resource.load(), false); assert.equal(view.error, 'offline');
  assert.deepEqual(view.directory.map(item => item.id), ['slow', 'ready']);
  failure = false; current = [providers[1]]; assert.equal(await resource.load(), true);
  assert.deepEqual(view.directory.map(item => item.id), ['ready']);
});

test('disposal cancels resource reads and prevents late UI delivery', async () => {
  const gate = Promise.withResolvers(); let signal, deliveries = 0;
  const resource = createModelDirectoryState({ readProviders: () => providers.slice(0, 1),
    readModels: (_, input) => { signal = input; return gate.promise; }, onChange: () => deliveries++ });
  resource.select(['slow']);
  await resource.load(); await setImmediate(); resource.dispose(); const before = deliveries;
  assert.equal(signal.aborted, true); gate.resolve([{ id: 'late' }]); await setImmediate();
  assert.equal(deliveries, before); assert.equal(await resource.load(), false);
});

test('only selected provider lists run, with two slots and immediate cancellation when selection changes', async t => {
  const ids = ['first', 'second', 'third', 'fourth', 'unused'];
  const reads = new Map(); let view, active = 0, peak = 0;
  const resource = createModelDirectoryState({ readProviders: () => ids.map(id => ({ id })),
    readModels(id, signal) {
      active++; peak = Math.max(active, peak);
      const gate = Promise.withResolvers(); reads.set(id, { gate, signal });
      signal.addEventListener('abort', () => { active--; }, { once: true });
      return gate.promise.finally(() => { if (!signal.aborted) active--; });
    }, onChange: next => { view = next; } });
  t.after(() => resource.dispose());
  await resource.load(); await setImmediate();
  assert.deepEqual([...reads.keys()], []);
  resource.select(['first', 'second', 'third', 'first']); await setImmediate();
  assert.deepEqual([...reads.keys()], ['first', 'second']);
  resource.select(['third', 'fourth']); await setImmediate();
  assert.equal(reads.get('first').signal.aborted, true);
  assert.equal(reads.get('second').signal.aborted, true);
  assert.deepEqual([...reads.keys()], ['first', 'second', 'third', 'fourth']);
  for (const [id, { gate }] of reads) gate.resolve([{ id: id + '-model' }]);
  await setImmediate();
  assert.deepEqual(view.directory.map(row => row.models), [[], [], [{ id: 'third-model' }], [{ id: 'fourth-model' }], []]);
  resource.select([]); resource.select(['third']); await setImmediate();
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(await resource.retry('unused'), false);
});

test('provider discovery never calls model enumeration and rejects unsupported methods', async () => {
  const ctx = { llm: { listProviders: () => providers, listModels: () => assert.fail('unexpected model enumeration') } };
  const req = { method: 'GET' }, res = {}; let response;
  const options = { ctx, req, res, url: new URL('http://localhost/oh-my-dsh/api/model-directory'),
    send: (_, status, body) => { response = { status, body }; } };
  assert.equal(await handleModelDirectoryApi(options), true);
  assert.deepEqual(response, { status: 200, body: { providers } });
  req.method = 'POST'; await handleModelDirectoryApi(options); assert.equal(response.status, 405);
  options.url.pathname = '/oh-my-dsh/api/settings'; assert.equal(await handleModelDirectoryApi(options), false);
});

test('model reads validate providers, expose failures and bound a hung provider', async t => {
  const llm = { listProviders: () => providers, listModels: () => { throw Error('network unavailable'); } };
  await assert.rejects(readProviderModels(llm, 'missing'), { statusCode: 404 });
  await assert.rejects(readProviderModels(llm, 'slow'), { statusCode: 502, message: 'network unavailable' });
  llm.listModels = () => new Promise(() => {});
  // Keep the test event loop alive while the server's unreferenced deadline fires.
  const hold = setInterval(() => {}, 100); t.after(() => clearInterval(hold));
  await assert.rejects(readProviderModels(llm, 'slow', { timeoutMs: 5 }), { statusCode: 504 });
});

test('cancellation before native dispatch never starts a provider request', async () => {
  const controller = new AbortController(), reason = Error('closed');
  let calls = 0;
  const reading = readProviderModels({ listProviders: () => providers, listModels: () => { calls++; return []; } },
    'slow', { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(reading, error => error === reason);
  assert.equal(calls, 0);
});

test('disconnect stops waiting, removes listeners and cannot send a late provider result', async () => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const req = Object.assign(new EventEmitter(), { method: 'GET' }), res = new EventEmitter();
  const ctx = { llm: { listProviders: () => providers, listModels: () => { started.resolve(); return gate.promise; } } };
  let sent = 0;
  const reading = handleModelDirectoryApi({ ctx, req, res,
    url: new URL('http://localhost/oh-my-dsh/api/model-directory?provider=slow'), send: () => sent++ });
  await started.promise; res.emit('close');
  await assert.rejects(reading, /已取消/); assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
  gate.resolve([{ id: 'late' }]); await setImmediate(); assert.equal(sent, 0);
});
