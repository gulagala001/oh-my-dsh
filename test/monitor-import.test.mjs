import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

test('cold imports skip settled receipts but still fill missing first-token timings', t => {
  const ledger = fixture(t);
  ledger.import(states); ledger.imported.clear();
  const append = ledger.append.bind(ledger); let writes = 0;
  ledger.append = entry => { writes++; return append(entry); };
  ledger.import(states);
  assert.equal(writes, 0);
  const updated = structuredClone(states); updated[0].activity[1].firstTokenMs = 0;
  ledger.import(updated); assert.equal(writes, 1);
  assert.equal(ledger.db.prepare('SELECT firstTokenMs FROM call_timings WHERE id=?').get('second').firstTokenMs, 0);
  updated[0].activity[0].firstTokenMs = 999;
  ledger.import(updated); assert.equal(writes, 1);
  assert.equal(ledger.db.prepare('SELECT firstTokenMs FROM call_timings WHERE id=?').get('first').firstTokenMs, 5);
  updated[0].activity.push({ id: 'third', at: 300, kind: 'main' });
  ledger.import(updated); assert.equal(writes, 2);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 3);
});

test('settled import checks retain normalized identities, duplicate ordinals and orphan timings', t => {
  const ledger = fixture(t), long = 'x'.repeat(600), legacy = { at: 400, kind: 'prepare', usage: { outputTokens: 2 } };
  ledger.append({ id: long, at: 50, kind: 'main', usage: { outputTokens: 1 } });
  ledger.insertTiming.run('orphan', 7);
  const input = [{ id: 'edge', activity: [
    { id: long, at: 500, kind: 'main', firstTokenMs: 0, usage: { outputTokens: 999 } },
    { id: 'orphan', at: 600, kind: 'main', firstTokenMs: 9 },
    { id: 'duplicate', at: 700, kind: 'main' }, { id: 'duplicate', at: 800, kind: 'prepare', firstTokenMs: 3 },
    legacy, legacy,
  ] }];
  ledger.import(input);
  const rows = ledger.db.prepare('SELECT * FROM calls ORDER BY id').all();
  assert.equal(rows.length, 5);
  assert.equal(rows.find(row => row.id === long.slice(0, 512)).outputTokens, 1);
  assert.equal(rows.find(row => row.id === 'duplicate').at, 700);
  assert.deepEqual(ledger.db.prepare('SELECT firstTokenMs FROM call_timings ORDER BY id').all().map(row => row.firstTokenMs), [3, 7, 0]);
  ledger.imported.clear(); ledger.import(input);
  assert.deepEqual(ledger.db.prepare('SELECT * FROM calls ORDER BY id').all(), rows);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM call_timings').get().n, 3);
});

test('failed identity lookup leaves the import retryable without publishing fingerprints', t => {
  const ledger = fixture(t), prepare = ledger.db.prepare.bind(ledger.db);
  ledger.db.prepare = sql => { if (sql.includes('FROM calls WHERE id IN')) throw Error('isolated lookup failure'); return prepare(sql); };
  ledger.import(states); assert.equal(ledger.imported.size, 0);
  assert.match(ledger.error, /isolated lookup failure/);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 0);
  ledger.db.prepare = prepare; ledger.import(states);
  assert.equal(ledger.imported.size, 1);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) n FROM calls').get().n, 2);
});


test('identity lookup reserves the writer before reading and never loses a racing receipt', t => {
  const ledger = fixture(t), file = ledger.db.prepare('PRAGMA database_list').get().file;
  const writer = new DatabaseSync(file); t.after(() => writer.close());
  const prepare = ledger.db.prepare.bind(ledger.db); let blocked = false;
  ledger.db.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.includes('FROM calls WHERE id IN')) return statement;
    return { all(...args) {
      const rows = statement.all(...args);
      assert.throws(() => writer.prepare("INSERT INTO metadata VALUES('racing','value')").run(), /locked/);
      blocked = true; return rows;
    } };
  };
  ledger.import(states); assert.equal(blocked, true); assert.equal(ledger.error, null);
  assert.equal(ledger.imported.size, 1);
  ledger.db.prepare = prepare;
  writer.prepare("INSERT INTO metadata VALUES('racing','value')").run();
  const changes = ledger.db.prepare('SELECT total_changes() n').get().n;
  ledger.imported.clear(); ledger.import(states);
  assert.equal(ledger.db.prepare('SELECT total_changes() n').get().n, changes);
});
