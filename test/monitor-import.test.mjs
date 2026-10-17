import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MonitorLedger } from '../src/monitor-ledger.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'omd-monitor-import-'));
  const ledger = new MonitorLedger(directory, { now: () => 1000 });
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.ok(ledger.db, ledger.error); return ledger;
}
const states = [{ id: 'isolated', activity: [{ id: 'first', at: 100, kind: 'main', firstTokenMs: 5 }, { id: 'second', at: 200, kind: 'prepare' }] }];

test('failed import commit rolls back receipts and keeps fingerprints retryable', t => {
  const ledger = fixture(t), exec = ledger.db.exec.bind(ledger.db);
  ledger.db.exec = sql => { if (sql === 'RELEASE monitor_import') throw Error('isolated commit failure'); return exec(sql); };
  ledger.import(states);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 0);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM call_timings').get().n, 0);
  assert.equal(ledger.imported.size, 0); assert.match(ledger.error, /isolated commit failure/);
  ledger.db.exec = exec; ledger.import(states);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM call_timings').get().n, 1);
  ledger.import(states); assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
});

test('partial append failures retry only missing rows and duplicate legacy entries keep distinct identities', t => {
  const ledger = fixture(t), append = ledger.append.bind(ledger);
  ledger.append = entry => entry.id === 'second' ? false : append(entry);
  ledger.import(states); assert.equal(ledger.imported.size, 0);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 1);
  ledger.append = append; ledger.import(states);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
  const entry = { at: 300, kind: 'main' };
  ledger.import([{ id: 'legacy', activity: [entry, entry, { kind: 'undated' }] }]);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls WHERE sessionId=?').get('legacy').n, 2);
  ledger.import([{ id: 'legacy', activity: [entry, entry, { kind: 'undated' }] }]);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 4);
});
