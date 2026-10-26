import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { zstdCompressSync } from 'node:zlib';
import { Context } from '@deepseek-ai/cordis';
import { Session } from '@deepseek-ai/dsh-session';
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { createModule } from '../lib/host/session-migration.factory.mjs';
import { ResultReduction } from '../src/result-reduction/service.mjs';
import { OPTIMIZATION_RECORD, installSessionRecordRepair, repairOptimizationRecords } from '../src/session-record-repair.mjs';

const here = createRequire(import.meta.url), host = createRequire(here.resolve('@deepseek-ai/dsh/package.json'));
const support = createModule(id => { try { return here(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return host(id); } });
const row = sessionId => ({ version: 1, sessionId, id: 'tool-optimization:fixture', at: 1, status: 'success', rules: [], beforeTokens: 10, afterTokens: 5, estimatedNetTokens: 5 });
async function fixture(t, compression = 'zstd', type = OPTIMIZATION_RECORD) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-records-')), root = join(dir, 'sessions'), dataDir = join(dir, 'omd');
  const session = Session.create('record-fixture');
  session.append('user/message', { id: 'user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Original conversation' }] }, { surfaceOp: 'append' });
  // Reproduce the old implementation with the REAL host; it drops this option.
  const broken = session.append(type, row(session.id), { ignorable: true });
  assert.equal(broken.ignorable, undefined);
  const header = support.sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: 0 }, 0);
  const lines = [header, ...session.snapshotEvents()].map(value => JSON.stringify(value) + '\n');
  const bytes = compression === 'zstd' ? Buffer.concat(lines.map(line => zstdCompressSync(line))) : Buffer.from(lines.join(''));
  const path = support.generationLogPath(root, undefined, session.id, 4, compression);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  const ctx = new Context(); await ctx.plugin(Persistence, { root, compression });
  t.after(async () => { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }); });
  return { dir, root, dataDir, session, bytes, path, ctx };
}
const decode = (path, compression) => support.readDecodedJsonlSource(path, 4, compression, {
  createRestore: h => support.sessionFormatCatalog.createRestore(h, { recovery: 'strict', validation: 'current' }),
});

test('optimization records survive native encoding, strict cold restore and a fork seed', async t => {
  const f = await fixture(t);
  const session = Session.create('new-record');
  const service = new ResultReduction({}, { store: { dir: f.dataDir }, config: () => ({}) }, () => true);
  service.record(session, row(session.id));
  assert.equal(service.persistenceError, null);
  assert.equal(session.eventAt(0).ignorable, true);
  assert.deepEqual(session.surface.nodes, []);
  const restore = support.sessionFormatCatalog.createRestore(support.sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: 0 }, 0), { recovery: 'strict', validation: 'current' });
  for (const event of session.snapshotEvents()) restore.decodeRow(support.sessionFormatCatalog.encodeCurrentEvent(event));
  assert.deepEqual(restore.finish().events, session.snapshotEvents());
  const child = Session.create('child', session.snapshotEvents(), { ...session.header, id: 'child', parentSession: session.id, isSeeded: true }, session.seq);
  assert.equal(child.eventAt(0).ignorable, true); assert.deepEqual(child.surface.nodes, []);
});

for (const compression of ['none', 'zstd']) test(`native refused ${compression} history repairs once, backs up exact bytes and reopens`, async t => {
  const f = await fixture(t, compression);
  await assert.rejects(f.ctx.sessionPersistence.open(f.session.id, 'read'), /not marked ignorable/);
  installSessionRecordRepair(f.ctx, f.dataDir, async () => support);
  const handles = await Promise.all([f.ctx.sessionPersistence.open(f.session.id, 'read'), f.ctx.sessionPersistence.open(f.session.id, 'read')]);
  await Promise.all(handles.map(h => h.close()));
  const restored = (await decode(f.path, compression)).artifact;
  assert.deepEqual(restored.events, f.session.snapshotEvents().map(e => e.type === OPTIMIZATION_RECORD ? { ...e, ignorable: true } : e));
  const backups = await readdir(join(f.dataDir, 'session-record-repair', f.session.id)); assert.equal(backups.length, 1);
  assert.deepEqual(await readFile(join(f.dataDir, 'session-record-repair', f.session.id, backups[0])), f.bytes);
  const after = await readFile(f.path), write = await f.ctx.sessionPersistence.open(f.session.id, 'write'); await write.close();
  assert.deepEqual(await readFile(f.path), after);
});

test('other unknown types, torn frames and live writer leases retain original bytes', async t => {
  const foreign = await fixture(t, 'zstd', 'plugin:other/required');
  installSessionRecordRepair(foreign.ctx, foreign.dataDir, async () => support);
  await assert.rejects(foreign.ctx.sessionPersistence.open(foreign.session.id, 'read'), /plugin:other\/required/);
  assert.deepEqual(await readFile(foreign.path), foreign.bytes);
  const f = await fixture(t), args = { ...f, sessionId: f.session.id, support };
  const lease = await support.SessionWriteLease.acquire(dirname(f.path), f.session.id);
  try { await assert.rejects(repairOptimizationRecords(f.path, args), /owned|ownership|another/i); }
  finally { await lease.release(); }
  assert.deepEqual(await readFile(f.path), f.bytes);
  const torn = f.bytes.subarray(0, f.bytes.length - 2); await writeFile(f.path, torn);
  await assert.rejects(repairOptimizationRecords(f.path, args), /尾帧不完整/);
  assert.deepEqual(await readFile(f.path), torn);
});

test('strict validation refuses a different required event even alongside a repairable record', async t => {
  const f = await fixture(t, 'none');
  f.session.append('plugin:other/required', {});
  const bytes = Buffer.from([support.sessionFormatCatalog.encodeCurrentHeader({ ...f.session.header, delegationDepth: 0 }, 0), ...f.session.snapshotEvents()].map(JSON.stringify).join('\n') + '\n');
  await writeFile(f.path, bytes);
  await assert.rejects(repairOptimizationRecords(f.path, { ...f, sessionId: f.session.id, support }), /other\/required/);
  assert.deepEqual(await readFile(f.path), bytes);
  assert.ok(!(await readdir(dirname(f.path))).some(name => name.startsWith('.omd-record-repair-')));
});
