import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { CodegraphRuntime } from '../src/codegraph.mjs';
import { apply as installAgent } from '../src/codegraph-agent.mjs';

const cwd = new URL('../', import.meta.url).pathname;
const deferred = () => Promise.withResolvers();
const connection = () => ({ closed: false, diagnostics: () => ({}), client: {
  listTools: async () => ({ tools: [{ name: 'codegraph_search', inputSchema: { type: 'object', properties: {} } }] }),
  getInstructions: () => '', callTool: async () => ({ content: [{ type: 'text', text: 'fresh result' }] }), close: async () => {},
} });

test('a failed catalog belongs to its revision until an explicit retry', async t => {
  const runtime = new CodegraphRuntime(), failure = Error('catalog unavailable');
  t.after(() => runtime.dispose());
  let probes = 0;
  runtime.connect = async () => { probes++; throw failure; };
  const first = runtime.catalog();
  await assert.rejects(first, error => error === failure);
  for (let i = 0; i < 3; i++) await assert.rejects(runtime.catalog(), error => error === failure);
  assert.equal(probes, 1, 'opening more sessions cannot repeatedly restart the same failed probe');
  assert.equal(runtime.catalog(), first);
  assert.equal(runtime.status().error, failure.message);
  runtime.connect = async () => { probes++; return connection(); };
  runtime.retryCatalog();
  assert.equal((await runtime.catalog()).tools.length, 1);
  assert.equal(probes, 2); assert.equal(runtime.status().error, null);
});

test('the shared catalog owns adapter import failures and retries without masking the cause', async t => {
  const runtime = new CodegraphRuntime({ resolveCommand: () => ({}) }), warnings = [];
  t.after(() => runtime.dispose());
  let probes = 0;
  runtime.connect = async () => { probes++; return connection(); };
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/dsh-mcp-client' && /\/src\/codegraph(?:-agent)?\.mjs$/.test(context.parentURL))
      throw Error('adapter unavailable');
    return next(specifier, context);
  } });
  t.after(() => hook.deregister());
  const ctx = { omd: { codegraph: runtime }, tools: { register() {} }, systemPrompt: { section() {} },
    logger: { warn: text => warnings.push(text) }, on() {}, effect() {} };
  await installAgent(ctx);
  assert.match(warnings.join('\n'), /adapter unavailable/);
  assert.equal(runtime.status().error, 'adapter unavailable');
  await installAgent(ctx);
  assert.ok(probes <= 1, 'an unusable adapter must not cause repeated subprocess probes');
  hook.deregister(); runtime.retryCatalog();
  const tools = [];
  await installAgent({ ...ctx, tools: { register: tool => tools.push(tool) } });
  assert.deepEqual(tools.map(tool => tool.name), ['codegraph_index', 'mcp__codegraph__codegraph_search']);
  assert.equal(runtime.status().error, null);
});

test('a handshake failing after its only waiter cancels cannot poison the next call', async t => {
  const runtime = new CodegraphRuntime({ autoIndex: false }), entered = deferred(), finish = deferred();
  t.after(() => runtime.dispose());
  let attempts = 0;
  runtime.connect = async () => {
    if (++attempts === 1) { entered.resolve(); return finish.promise; }
    return connection();
  };
  const abort = new AbortController();
  const first = runtime.call('codegraph_search', {}, { cwd, signal: abort.signal });
  await entered.promise;
  abort.abort(Error('cancel first waiter'));
  await assert.rejects(first, /cancel first waiter/);
  finish.reject(Error('late handshake failure'));
  await new Promise(setImmediate);
  const result = await runtime.call('codegraph_search', {}, { cwd });
  assert.equal(result.content[0].text, 'fresh result'); assert.equal(attempts, 2);
});

test('an observed idle disconnect is retired once before concurrent new queries', async t => {
  const runtime = new CodegraphRuntime({ autoIndex: false }), old = connection();
  t.after(() => runtime.dispose());
  let attempts = 0, closed = 0, queries = 0;
  old.client.close = async () => { closed++; };
  old.client.callTool = async () => { queries++; return { content: [] }; };
  runtime.connect = async () => ++attempts === 1 ? old : connection();
  await runtime.call('codegraph_search', {}, { cwd });
  old.closed = true;
  const results = await Promise.all(Array.from({ length: 3 }, () => runtime.call('codegraph_search', {}, { cwd })));
  assert.equal(results.length, 3); assert.equal(attempts, 2); assert.equal(closed, 1);
  assert.equal(queries, 1, 'no query is sent to a connection already known to be closed');
});

test('cancelling one shared waiter preserves the handshake and another caller', async t => {
  const runtime = new CodegraphRuntime({ autoIndex: false }), entered = deferred(), finish = deferred();
  t.after(() => runtime.dispose());
  let attempts = 0, signal;
  runtime.connect = async (_directory, value) => { attempts++; signal = value; entered.resolve(); return finish.promise; };
  const abort = new AbortController();
  const first = runtime.call('codegraph_search', {}, { cwd, signal: abort.signal });
  await entered.promise;
  const second = runtime.call('codegraph_search', {}, { cwd });
  abort.abort(Error('cancel one'));
  await assert.rejects(first, /cancel one/);
  assert.equal(signal.aborted, false);
  finish.resolve(connection());
  assert.equal((await second).content[0].text, 'fresh result'); assert.equal(attempts, 1);
});

test('a failed in-flight query is never replayed and cannot evict its replacement', async t => {
  const runtime = new CodegraphRuntime({ autoIndex: false }), old = connection();
  t.after(() => runtime.dispose());
  const entered = deferred(), finish = deferred(), failure = Error('query connection crashed');
  let attempts = 0, oldQueries = 0;
  old.client.callTool = async () => { oldQueries++; entered.resolve(); return finish.promise; };
  runtime.connect = async () => ++attempts === 1 ? old : connection();
  const first = runtime.call('codegraph_search', {}, { cwd });
  await entered.promise;
  old.closed = true;
  const next = await runtime.call('codegraph_search', {}, { cwd });
  assert.equal(next.content[0].text, 'fresh result');
  finish.reject(failure);
  await assert.rejects(first, error => error === failure);
  await runtime.call('codegraph_search', {}, { cwd });
  assert.equal(oldQueries, 1); assert.equal(attempts, 2);
});

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
