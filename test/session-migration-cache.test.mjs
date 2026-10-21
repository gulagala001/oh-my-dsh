import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateSessionStorage } from '../src/session-migration.mjs';
import { hash } from '../src/context/core.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'archive'), data = join(dir, 'omd'), session = join(root, '_no-cwd', 'old');
  await mkdir(session, { recursive: true });
  const path = join(session, 'session.v3.jsonl');
  const header = { type: 'session', version: 3, id: 'old', createdAt: 1, isSeeded: false, delegationDepth: 0 };
  const ctx = { get: () => ({ config: { root, compression: 'none' } }), logger: { warn() {}, info() {} } };
  // Reaching the native lease proves admission was retried, without emulating
  // codecs/publication in this cache regression. Native publication is checked
  // separately with the built pinned-host support.
  const reached = new Error('native migration reached');
  const support = {
    parseGenerationLogFilename: name => /^session\.v([1-9][0-9]*)\.jsonl$/.exec(name)?.[1] * 1 || undefined,
    generationLogPath: (root, _cwd, id, version) => join(root, '_no-cwd', id, `session.v${version}.jsonl`),
    SessionWriteLease: { acquire: async () => { throw reached; } },
  };
  return { dir, data, session, path, header, reached, check: () => migrateSessionStorage(ctx, data, support) };
}

test('a repaired archive at the same path is reconsidered', async t => {
  const f = await fixture(t);
  await writeFile(f.path, '{damaged}\n');
  await f.check();
  await f.check(); // Unchanged damage remains cheap to skip.
  await writeFile(f.path, JSON.stringify({ ...f.header, agentPreset: 'oh-my-dsh' }) + '\n');
  await assert.rejects(f.check(), error => error === f.reached);
});

test('restored OMD ownership makes an unchanged foreign archive eligible', async t => {
  const f = await fixture(t);
  await writeFile(f.path, JSON.stringify(f.header) + '\n');
  await f.check();
  await mkdir(join(f.data, 'context-v1/sessions'), { recursive: true });
  await writeFile(join(f.data, 'context-v1/sessions', hash('old') + '.json'), '{"id":"old"}\n');
  await assert.rejects(f.check(), error => error === f.reached);
});

test('an orphaned migration journal is never treated as an empty archive', async t => {
  const f = await fixture(t);
  await writeFile(join(f.session, 'omd-v4-migration.json'), JSON.stringify({ id: 'old', complete: false }));
  await assert.rejects(f.check(), /迁移.*(?:会话|日志|来源|记录)/);
});
