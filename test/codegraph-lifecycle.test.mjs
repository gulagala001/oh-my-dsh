import test from 'node:test';
import assert from 'node:assert/strict';
import { CodegraphRuntime } from '../src/codegraph.mjs';

const cwd = new URL('../', import.meta.url).pathname;
const deferred = () => Promise.withResolvers();

test('explicit project retry refreshes an already ready index', async () => {
  const runtime = new CodegraphRuntime();
  runtime.prepare = async () => ({});
  let builds = 0;
  runtime.buildIndex = async () => { builds++; return 'indexed'; };
  try {
    await runtime.ensureProject(cwd);
    await runtime.ensureProject(cwd);
    assert.equal(builds, 1);
    await runtime.ensureProject(cwd, { retry: true });
    assert.equal(builds, 2);
  } finally { await runtime.dispose(); }
});

test('stop retires accepted indexing before re-enable starts a new generation', async () => {
  const runtime = new CodegraphRuntime();
  runtime.prepare = async () => ({});
  const entered = deferred(), finish = deferred();
  runtime.buildIndex = async () => { entered.resolve(); return finish.promise; };
  const first = runtime.ensureProject(cwd);
  const result = first.catch(error => error);
  await entered.promise;
  let stopped = false;
  const stopping = runtime.setEnabled(false).then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(stopped, false); }
  finally { finish.resolve('old generation finished'); await stopping; await result; }
  await runtime.setEnabled(true);
  assert.equal(runtime.projects.size, 0);
  runtime.buildIndex = async () => 'new generation';
  await runtime.ensureProject(cwd);
  assert.equal(runtime.status().projects[0].status, 'ready');
  await runtime.dispose();
});

test('dispose waits for catalog cleanup and refuses later probes', async () => {
  const runtime = new CodegraphRuntime();
  const entered = deferred(), finish = deferred();
  runtime.connect = async () => { entered.resolve(); return finish.promise; };
  const catalog = runtime.catalog().catch(error => error);
  await entered.promise;
  let disposed = false;
  const disposing = runtime.dispose().then(() => { disposed = true; });
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(disposed, false); }
  finally { finish.reject(new Error('catalog stopped')); await disposing; await catalog; }
  let opened = false;
  runtime.connect = async () => { opened = true; throw Error('unexpected probe'); };
  await assert.rejects(runtime.catalog(), /已停止|已关闭/);
  assert.equal(opened, false);
});

test('catalog retries share ownership until the old probe has retired', async () => {
  const runtime = new CodegraphRuntime();
  const started = deferred(), finish = deferred();
  let connections = 0;
  runtime.connect = async () => {
    connections++;
    if (connections === 1) { started.resolve(); return finish.promise; }
    return { client: { listTools: async () => ({ tools: [{ name: 'current' }] }), getInstructions: () => '', close: async () => {} } };
  };
  const first = runtime.catalog().catch(error => error);
  await started.promise;
  runtime.retryCatalog();
  const second = runtime.catalog();
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(connections, 1); }
  finally { finish.reject(new Error('retired probe failed')); await first; }
  assert.equal((await second).tools[0].name, 'current');
  assert.equal(runtime.catalogError, null);
  assert.equal(runtime.catalog(), second);
  await runtime.dispose();
});

test('work still resolving its project path cannot populate a stopped generation', async () => {
  const runtime = new CodegraphRuntime();
  let builds = 0;
  runtime.buildIndex = async () => { builds++; };
  const work = runtime.ensureProject(cwd).catch(error => error);
  await runtime.setEnabled(false);
  await runtime.setEnabled(true);
  assert.match((await work).message, /已停止/);
  assert.equal(builds, 0);
  assert.equal(runtime.projects.size, 0);
  await runtime.dispose();
});
