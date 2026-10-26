import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { mountOptionalClient } from '../src/client/optional-client.mjs';
import { startupError } from '../src/startup.mjs';

const root = new URL('../', import.meta.url).href;
function isolated(source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('optional native, MCP and Computer Use imports do not enter the main import graph', () => {
  isolated(`
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const blocked = ['sharp', '@modelcontextprotocol/client', '@deepseek-ai/dsh-mcp-client', '#opencu/integration'];
    registerHooks({ resolve(specifier, context, next) {
      if (blocked.some(name => specifier === name || specifier.startsWith(name + '/')) && context.parentURL?.startsWith(${JSON.stringify(root)}))
        throw Object.assign(Error('missing optional dependency: ' + specifier), { code: 'MODULE_NOT_FOUND' });
      return next(specifier, context);
    } });
    await import(${JSON.stringify(new URL('../src/index.mjs', import.meta.url).href)});
    const runtime=await import(${JSON.stringify(new URL('../src/runtime.mjs', import.meta.url).href)});
    assert.equal(typeof runtime.apply,'function');
  `);
});

for (const warm of [false, true]) test(`CodeGraph shares the MCP ESM environment without retaining values (${warm ? 'loaded adapter' : 'cold helper'})`, () => {
  isolated(`
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    ${warm ? "await import('@deepseek-ai/dsh-mcp-client');" : ''}
    registerHooks({ load(url, context, next) {
      if (url.includes('/@modelcontextprotocol/') && url.endsWith('.cjs')) throw Error('duplicate CommonJS MCP graph');
      return next(url, context);
    } });
    const { codegraphEnvironment } = await import(${JSON.stringify(new URL('../src/codegraph.mjs', import.meta.url).href)});
    process.env.TERM = 'codegraph-environment-first';
    process.env.CODEGRAPH_TEST_SECRET = 'synthetic-not-inherited';
    const first = codegraphEnvironment();
    assert.equal(first.TERM, 'codegraph-environment-first');
    assert.equal(first.CODEGRAPH_TEST_SECRET, undefined);
    const { getDefaultEnvironment } = await import('@modelcontextprotocol/client/stdio');
    assert.deepEqual(first, { ...getDefaultEnvironment(), CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_DOWNLOAD: '1',
      CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_HOST_PPID: String(process.pid), NO_COLOR: '1', CODEGRAPH_EXPLORE_DEDUP: '0',
      CODEGRAPH_MCP_TOOLS: 'explore,node,search,callers,callees,impact,files,status' });
    process.env.TERM = 'codegraph-environment-second';
    assert.equal(codegraphEnvironment().TERM, 'codegraph-environment-second');
    first.TERM = 'caller-owned';
    assert.equal(codegraphEnvironment().TERM, 'codegraph-environment-second');
    process.env.TERM = '() { unsafe shell function; }';
    assert.equal(codegraphEnvironment().TERM, undefined);
  `);
});

test('a failed runtime import retains the client-owning entry and authenticated root-cause route', () => {
  isolated(`
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { Context } from '@deepseek-ai/cordis';
    registerHooks({ load(url, context, next) {
      if (url === ${JSON.stringify(new URL('../src/runtime.mjs', import.meta.url).href)})
        throw new Error('runtime import failed', { cause: Object.assign(Error('missing /native/index.cjs'), { code: 'MODULE_NOT_FOUND' }) });
      return next(url, context);
    } });
    const plugin = await import(${JSON.stringify(new URL('../src/index.mjs', import.meta.url).href)});
    const ctx = new Context(); let route, denied, settingsOwner;
    ctx.provide('settings', { configure(_policy, owner = this.ctx.fiber) { settingsOwner = owner; return () => {}; } });
    for (const name of plugin.inject.filter(name => name !== 'settings')) ctx.provide(name, {});
    ctx.provide('webServer', { register(value) { route = value; return () => { route = undefined; }; } });
    ctx.provide('connection', { requestRejection: () => denied });
    try {
      const fiber = ctx.plugin(plugin, {}); await fiber;
      assert.equal(fiber.state, 2); assert.equal(settingsOwner.uid, fiber.uid);
      const response = () => ({ writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } });
      let res = response(); route.handler({ method: 'GET' }, res);
      assert.equal(res.status, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
      const data = JSON.parse(res.body);
      assert.equal(data.status, 'error'); assert.equal(data.error.message, 'runtime import failed');
      assert.equal(data.error.cause.code, 'MODULE_NOT_FOUND'); assert.match(data.error.cause.message, /index.cjs/);
      denied = 401; res = response(); route.handler({ method: 'GET' }, res); assert.equal(res.status, 401); assert.equal(res.body, undefined);
      denied = undefined; res = response(); route.handler({ method: 'POST' }, res); assert.equal(res.status, 405);
      await fiber.dispose(); assert.equal(route, undefined);
    } finally { await ctx.fiber.dispose(); }
  `);
});

test('failed optional initialization cleans its registrations and preserves both conversation services', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const reports = [], conversation = {}, uiConversation = {}; let cleaned = false;
  const fiber = ctx.plugin({ async apply(scope) {
    scope.provide('conversation', conversation); scope.provide('uiConversation', uiConversation);
    assert.equal(await mountOptionalClient(scope, 'broken CU', async () => ({ apply(child) {
      child.provide('optionalOwned', {}); child.effect(() => () => { cleaned = true; }); throw Error('native initialization failed');
    } }), (name, error) => reports.push([name, error.message])), false);
  } });
  await fiber;
  assert.equal(fiber.state, 2); assert.equal(ctx.get('conversation'), conversation); assert.equal(ctx.get('uiConversation'), uiConversation);
  assert.equal(ctx.get('optionalOwned'), undefined); assert.equal(cleaned, true);
  assert.deepEqual(reports, [['broken CU', 'native initialization failed']]);
});

test('a late optional activation failure is reported without retiring the resident shell', { timeout: 3000 }, async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const reported = Promise.withResolvers();
  const fiber = ctx.plugin({ async apply(scope) {
    scope.provide('conversation', {});
    await mountOptionalClient(scope, 'pending feature', async () => ({ inject: ['lateDependency'], apply() { throw Error('late failure'); } }), (_name, error) => reported.resolve(error));
  } });
  await fiber; assert.equal(fiber.state, 2);
  ctx.provide('lateDependency', {});
  assert.equal((await reported.promise).message, 'late failure');
  assert.equal(fiber.state, 2); assert.ok(ctx.get('conversation'));
});

test('an unloaded owner cannot mount a factory that finishes loading late', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const loaded = Promise.withResolvers(), entered = Promise.withResolvers(); let pending, reports = 0, starts = 0;
  const owner = ctx.plugin({ apply(scope) {
    pending = mountOptionalClient(scope, 'late import', () => { entered.resolve(); return loaded.promise; }, () => { reports++; });
  } });
  await entered.promise; await owner;
  await owner.dispose();
  loaded.resolve({ apply() { starts++; } });
  assert.equal(await pending, false);
  assert.equal(starts, 0); assert.equal(reports, 0);
});

test('runtime check detects a missing actual sharp native entry despite a resolvable package', () => {
  isolated(`
    import assert from 'node:assert/strict';
    import { createRequire, registerHooks } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const require = createRequire(${JSON.stringify(new URL('../package.json', import.meta.url).href)});
    const sharpRequire = createRequire(require.resolve('sharp'));
    const platform = process.platform === 'linux' && sharpRequire('detect-libc').familySync() === 'musl' ? 'linuxmusl' : process.platform;
    const entry = sharpRequire.resolve('@img/sharp-' + platform + '-' + process.arch + '/sharp.node');
    registerHooks({ load(url, context, next) {
      if (url === pathToFileURL(entry).href) throw Object.assign(Error('Cannot find module ' + entry), { code: 'MODULE_NOT_FOUND' });
      return next(url, context);
    } });
    const { checkNativeDependencies } = await import(${JSON.stringify(new URL('../scripts/check-runtime.mjs', import.meta.url).href)});
    const result = await checkNativeDependencies(${JSON.stringify(fileURLToPath(new URL('../', import.meta.url)))});
    assert.ok(result.errors.some(error => error.startsWith('sharp:') && error.includes(entry)));
    assert.ok(!result.checks.includes('sharp'));
  `);
});

test('diagnostics retain aggregate native causes and bound cyclic chains', () => {
  const cause = Object.assign(Error('missing native index.cjs'), { code: 'MODULE_NOT_FOUND' });
  const error = new AggregateError([cause], 'initialization failed', { cause });
  cause.cause = error;
  const data = startupError(error);
  assert.equal(data.cause.code, 'MODULE_NOT_FOUND');
  assert.match(JSON.stringify(data), /missing native index.cjs/);
  assert.match(JSON.stringify(data), /truncated cause/);
});
