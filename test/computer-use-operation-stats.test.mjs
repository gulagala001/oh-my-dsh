import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';

test('long operations retain early failures, cancellations and method counts after the UI history rolls over', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-operation-stats-'));
  const manager = new ComputerUseManager(root, { native: { binary: join(root, 'missing') } });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const call = operation => manager.dispatch('test', 'target', [{ kind: 'app', id: 'fixture' }, operation]);
  manager.native.invoke = async (_session, _id, operation) => {
    if (operation === 'paste') throw new Error('early paste failed');
    if (operation === 'pressKey') throw Object.assign(new Error('stopped'), { code: 'COMPUTER_USE_STOPPED' });
    return {};
  };
  await assert.rejects(call('paste'), /early paste failed/);
  await assert.rejects(call('pressKey'), /stopped/);
  await call('getScreenshot');
  for (let i = 0; i < 65; i++) await call('getAXState');
  const status = manager.status('test');
  assert.equal(status.history.length, 60);
  assert.equal(status.history.every(item => item.ok && item.operation === 'getAXState'), true);
  assert.deepEqual(status.operationStats, {
    total: 68, succeeded: 66, failed: 1, cancelled: 1,
    methods: { paste: 1, pressKey: 1, getScreenshot: 1, getAXState: 65 },
  });
  await manager.endTurn('test');
  await call('typeText');
  assert.equal(manager.status('test').operationStats.total, 69, 'turn cleanup does not erase session evidence');
  assert.equal(status.operationStats.total, 68, 'an earlier status snapshot is immutable');
  assert.equal(manager.status('other').operationStats.total, 0, 'statistics are scoped to the session');
});
