import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { DeepSeekWorkbench } from '../src/index.mjs';
import { initializeHostCapabilities } from '../src/client/host-capabilities.mjs';

const deferred = () => Promise.withResolvers();
for (const state of [{ accountDiagnostics: false }, {}, { accountDiagnostics: 'true' }, { accountDiagnostics: 1 }, { accountDiagnostics: null }, null]) {
  test(`diagnostics require boolean true: ${JSON.stringify(state)}`, async () => {
    const requests = [];
    await initializeHostCapabilities({ signal: new AbortController().signal,
      api: async (...args) => { requests.push(args[0]); return state; },
      readCapabilities() { assert.fail('must not read desktop capabilities'); },
      readNativeAccountView() { assert.fail('must not read native account view'); },
    });
    assert.deepEqual(requests, ['/state']);
  });
}
for (const phase of ['state', 'capabilities']) {
  test(`unload while ${phase} is pending prevents later reads and requests`, async () => {
    const controller = new AbortController(), pending = deferred(), reached = deferred(), requests = [];
    let reads = 0;
    const operation = initializeHostCapabilities({ signal: controller.signal,
      api: async path => { requests.push(path); if (phase === 'state') { reached.resolve(); return pending.promise; } return { accountDiagnostics: true }; },
      readCapabilities() { reads++; reached.resolve(); return pending.promise; },
      readNativeAccountView() { assert.fail('unloaded client must not read native view'); },
      onState() { assert.equal(controller.signal.aborted, false); },
    });
    await reached.promise; controller.abort();
    pending.resolve(phase === 'state' ? { accountDiagnostics: true } : { downloads: true });
    await operation;
    assert.equal(reads, phase === 'state' ? 0 : 1);
    assert.deepEqual(requests, ['/state']);
  });
}
test('an already aborted lifetime sends no request', async () => {
  await initializeHostCapabilities({ signal: AbortSignal.abort(), api() { assert.fail('aborted request'); } });
});
test('diagnostic API rejection is surfaced', async () => {
  await assert.rejects(initializeHostCapabilities({ signal: new AbortController().signal,
    api: async path => { if (path === '/state') return { accountDiagnostics: true }; throw Error('HTTP 403'); },
    readCapabilities: async () => ({}), readNativeAccountView: () => false,
  }), /HTTP 403/);
});

test('real Host state, authorization, diagnostic guard and private synthetic write', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dswb-contract-'));
  const previous = { home: process.env.DSH_HOME, diagnostics: process.env.DSW_ACCOUNT_DIAGNOSTICS };
  const ctx = new Context(); let handler, denied;
  process.env.DSH_HOME = directory;
  // No deepseekAccount service is provided: the real account probe cannot run.
  process.env.DSW_ACCOUNT_DIAGNOSTICS = '1';
  ctx.provide('webServer', { register(options) { handler = options.handler; return () => {}; } });
  ctx.provide('connection', { requestRejection() { return denied; } });
  const fiber = ctx.plugin(scope => { new DeepSeekWorkbench(scope); });
  const requests = [];
  const request = async (path, value) => {
    requests.push(path);
    const req = Readable.from(value === undefined ? [] : [Buffer.from(JSON.stringify(value))]);
    req.url = `/deepseek-workbench/api${path}`; req.method = value === undefined ? 'GET' : 'POST';
    let status, text;
    await handler(req, { writeHead(code) { status = code; }, end(body) { text = body; } });
    return { status, data: text ? JSON.parse(text) : undefined };
  };
  const api = async (path, value) => {
    const response = await request(path, value);
    if (response.status !== 200) throw Error(`HTTP ${response.status}`);
    return response.data;
  };
  try {
    await fiber;
    for (const flag of [undefined, '0', 'true', '1']) {
      if (flag === undefined) delete process.env.DSW_ACCOUNT_DIAGNOSTICS;
      else process.env.DSW_ACCOUNT_DIAGNOSTICS = flag;
      assert.equal((await api('/state')).accountDiagnostics, flag === '1');
    }
    denied = 403;
    await assert.rejects(initializeHostCapabilities({ api, signal: new AbortController().signal,
      readCapabilities() { assert.fail('denied state must not read capabilities'); },
    }), /HTTP 403/);
    assert.equal((await request('/host-capabilities', {})).status, 403);
    assert.deepEqual(await readdir(directory), []);
    denied = undefined;
    process.env.DSW_ACCOUNT_DIAGNOSTICS = '0';
    assert.equal((await request('/host-capabilities', {})).status, 404);
    await initializeHostCapabilities({ api, signal: new AbortController().signal,
      readCapabilities() { assert.fail('disabled Host must not read capabilities'); },
    });
    assert.deepEqual(await readdir(directory), []);
    process.env.DSW_ACCOUNT_DIAGNOSTICS = '1'; requests.length = 0;
    await initializeHostCapabilities({ api, signal: new AbortController().signal,
      readCapabilities: async () => ({ persistentProfiles: true, downloads: 'true' }),
      readNativeAccountView: () => true,
    });
    assert.deepEqual(requests, ['/state', '/host-capabilities']);
    const filename = join(directory, 'deepseek-workbench', 'native-ui-capabilities.json');
    const result = JSON.parse(await readFile(filename, 'utf8'));
    assert.deepEqual({ ...result, checkedAt: undefined }, { checkedAt: undefined, frontendLoaded: true, persistentProfiles: true, downloads: false, nativeAccountView: true });
    assert.equal((await stat(filename)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(join(directory, 'deepseek-workbench')), ['native-ui-capabilities.json']);
  } finally {
    await fiber.dispose();
    for (const [key, value] of [['DSH_HOME', previous.home], ['DSW_ACCOUNT_DIAGNOSTICS', previous.diagnostics]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

// Load the shipped production factory; rendering is inert, owner effects are real.
import { runInNewContext } from 'node:vm';
for (const disposal of ['owner', 'layout']) for (const phase of ['state', 'capabilities']) {
  test(`production apply ${disposal} dispose cancels pending ${phase}`, async () => {
    const pending = deferred(), reached = deferred(), requests = [], errors = [];
    let exports, disposeOwner, disposeLayout, capabilityReads = 0, nativeReads = 0;
    const window = new EventTarget();
    window.dshDesktop = { browser: { capabilities() { capabilityReads++; reached.resolve(); return pending.promise; } } };
    Object.defineProperty(window, 'dshPlatform', { get() { nativeReads++; return {}; } });
    const element = () => ({ dataset: {}, remove() {} });
    const document = { createElement: element, head: { append() {} }, body: { append() {} } };
    const react = { createElement() { return {}; }, createContext() { return {}; }, forwardRef: fn => fn, memo: fn => fn };
    window.__ModuleLoader__ = { load({ factory }) { exports = factory(name => {
      if (name === 'react') return react;
      if (name === 'react-dom/client') return { createRoot() { return { render() {}, unmount() {} }; } };
      if (name === 'react-dom') return { createPortal() {} };
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return {};
      throw Error(`Unexpected external ${name}`);
    }); } };
    runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
      window, document, AbortController, console: { error: (...args) => errors.push(args) },
      fetch: async (path, options) => {
        requests.push(path);
        assert.equal(options.signal.aborted, false);
        if (phase === 'state') { reached.resolve(); await pending.promise; }
        return { ok: true, status: 200, json: async () => ({ accountDiagnostics: true }) };
      },
    });
    exports.apply({
      effect(fn) { disposeOwner = fn(); },
      inject(deps, fn) { assert.deepEqual(Array.from(deps), ['layout']); disposeLayout = fn({ layout: {} }); },
      slots: { inject() { return () => {}; } },
    });
    await reached.promise;
    if (disposal === 'owner') disposeOwner(); else disposeLayout();
    pending.resolve({ persistentProfiles: true });
    // Flush the complete promise chain, including the production catch handler.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, ['deepseek-workbench/api/state']);
    assert.equal(capabilityReads, phase === 'state' ? 0 : 1);
    assert.equal(nativeReads, 0); assert.deepEqual(errors, []);
    disposeOwner();
  });
}
