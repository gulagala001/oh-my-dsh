import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { monitorSnapshot, handleMonitorApi } from '../src/monitor-api.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-monitor-projection-')), now = Date.now();
  const monitor = new MonitorLedger(directory, { now: () => now });
  t.after(() => { monitor.close(); rmSync(directory, { recursive: true, force: true }); });
  const state = { id: 'fixture', activity: [], metrics: { prepare: { calls: 3, inputTokens: 60, outputTokens: 12 } } };
  const session = { requestHeader: () => ({ tools: [{ name: 'fixture' }] }), eventAt: seq => ({ seq, type: 'user/message' }), deriveEventMessage: () => ({ role: 'user' }) };
  const hub = { store: { monitorStates: () => [state], monitorErrors: new Set(), monitorState: () => state }, monitor, config: () => ({}), live: new Map(),
    context: { adapter: { contextCapacity: () => 400000 } }, dream: { store: { usage: () => ({}), jobActivity: () => ({}) } } };
  const ctx = { agents: new Map(), sessions: new Map([['fixture', session]]), tokenMeter: { measure: () => ({ totalTokens: 100, nodes: [{ seq: 1, tokens: 70 }] }) } };
  for (const [id, kind, usage] of [['one', 'main', null], ['two', 'prepare', { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }]]) {
    assert.equal(monitor.append({ id, kind, usage, sessionId: 'fixture', source: 'native', at: now - 1 }), true);
  }
  const read = view => monitorSnapshot({ hub, ctx, params: { session: 'fixture', range: 'session', view }, id: 'fixture', session, stored: state });
  return { hub, ctx, session, read, state };
}

test('context and usage projections keep consumed values while skipping unrelated work', t => {
  const f = fixture(t), full = f.read();
  f.hub.pricing = { refresh() { throw Error('No projection should price calls'); } };
  const context = f.read('context');
  for (const key of ['meter', 'frame', 'toolsTokens', 'contextCapacity']) assert.deepEqual(context[key], full[key]);
  const contextMethod = f.hub.monitor.query, states = f.hub.store.monitorStates;
  f.hub.monitor.query = () => { throw Error('Context does not query ledger'); };
  f.hub.store.monitorStates = () => { throw Error('Context does not read sidecars'); };
  assert.deepEqual(f.read('context').meter, full.meter);
  f.hub.monitor.query = contextMethod; f.hub.store.monitorStates = states;
  f.ctx.tokenMeter.measure = () => { throw Error('Usage does not read context'); };
  const usage = f.read('usage');
  assert.deepEqual(usage.metrics, full.metrics);
  assert.equal(Object.hasOwn(usage, 'activity'), false); assert.equal(Object.hasOwn(usage, 'meter'), false);
  assert.ok(usage.metrics.prepare.calls > 1, 'legacy unattributed usage remains included');
});

test('context projection preserves absent readings and optional measurement failures', t => {
  const f = fixture(t);
  f.ctx.tokenMeter.measure = () => { throw Error('unavailable meter'); };
  f.session.requestHeader = () => { throw Error('unavailable tools'); };
  f.hub.context.adapter.contextCapacity = () => { throw Error('unavailable capacity'); };
  const context = f.read('context');
  for (const key of ['meter', 'frame', 'toolsTokens', 'contextCapacity']) assert.equal(context[key], null);
  assert.match(context.coverage.message, /当前上下文读数.*工具定义读数.*模型窗口/);
  const absent = monitorSnapshot({ hub: f.hub, ctx: f.ctx, params: { view: 'context' }, id: 'fixture' });
  assert.equal(absent.meter, null); assert.equal(absent.frame, null);
});

test('projection GET routes keep identity checks and no-store with object and URL params', async t => {
  const f = fixture(t);
  for (const view of ['context', 'usage']) {
    let response, cache;
    assert.equal(await handleMonitorApi({ hub: f.hub, ctx: f.ctx, req: { method: 'GET' }, res: { setHeader: (key, value) => { if (key === 'Cache-Control') cache = value; } },
      url: new URL('http://isolated.invalid/oh-my-dsh/api/monitor?session=fixture&view=' + view), send(_res, status, data) { response = { status, data }; } }), true);
    assert.equal(response.status, 200); assert.equal(cache, 'no-store');
    const expected = f.read(view);
    for (const key of view === 'usage' ? ['metrics'] : ['meter', 'frame', 'toolsTokens', 'contextCapacity']) assert.deepEqual(response.data[key], expected[key]);
  }
  f.hub.store.monitorErrors.add('unreadable'); f.hub.monitor.error = 'isolated write failure';
  const partial = f.read('usage'); assert.equal(partial.coverage.partial, true); assert.match(partial.coverage.message, /历史档案无法读取/); assert.match(partial.coverage.message, /写入失败/);
  await assert.rejects(() => handleMonitorApi({ hub: f.hub, ctx: f.ctx, req: { method: 'GET' }, res: {}, url: new URL('http://isolated.invalid/oh-my-dsh/api/monitor?session=..&view=context') }), /会话编号/);
});
