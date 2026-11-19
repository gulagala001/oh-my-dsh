import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DreamStore } from '../src/dream/store.mjs';
import { DreamService } from '../src/dream/service.mjs';
import { MonitorLedger } from '../src/monitor-ledger.mjs';
import { mountHostComponent } from '../src/host-component.mjs';
import { resolveRecommendedPlugin } from '../src/recommended-plugin-catalog.mjs';

async function isolated(t) {
  const dir = await mkdtemp(join(tmpdir(), 'omd-available-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('additive memory and monitoring schemas keep new columns and version markers', async t => {
  const dir = await isolated(t);
  let memory = new DreamStore(dir);
  memory.setMeta('schema', 99);
  memory.db.exec("ALTER TABLE meta ADD COLUMN extra TEXT DEFAULT 'kept'");
  memory.close();
  memory = new DreamStore(dir);
  try {
    memory.setMeta('probe', 'written');
    assert.equal(memory.meta('schema'), 99);
    assert.equal(memory.db.prepare("SELECT extra FROM meta WHERE key='probe'").get().extra, 'kept');
  } finally { memory.close(); }

  let ledger = new MonitorLedger(dir);
  ledger.db.exec("UPDATE metadata SET value='99' WHERE key='schema'; ALTER TABLE calls ADD COLUMN extra TEXT DEFAULT 'kept'");
  ledger.close();
  ledger = new MonitorLedger(dir);
  try {
    assert(ledger.append({ id: 'probe', sessionId: 'one', kind: 'main', source: 'native', hasOutput: true }));
    assert.equal(ledger.db.prepare("SELECT extra FROM calls WHERE id='probe'").get().extra, 'kept');
    assert.equal(ledger.db.prepare("SELECT value FROM metadata WHERE key='schema'").get().value, '99');
  } finally { ledger.close(); }
});

test('a damaged Dream database leaves the foreground index usable without spending a fresh budget', async t => {
  const dir = await isolated(t);
  const file = join(dir, 'dream-v1', 'memory.sqlite');
  await mkdir(join(dir, 'dream-v1'));
  await writeFile(file, 'damaged fixture');
  const dream = new DreamService({ store: { dir }, ctx: {}, config: () => ({ dreamAutoEnabled: true }) });
  try {
    await dream.start();
    await dream.tick();
    assert.equal(dream.store.jobs(5).length, 0);
    assert.match(dream.status().notice, /记忆库暂不可用/);
    await assert.rejects(dream.enqueue('global', 'global'), /记忆库暂不可用/);
    assert.equal(await readFile(file, 'utf8'), 'damaged fixture');
  } finally { await dream.close(); }
});

test('a factory failure before mounting falls back to the native component once', async () => {
  const mounted = [], native = { name: 'native' };
  const row = { options: { name: '@deepseek-ai/dsh-ui-chat' }, parent: { tree: { import: async name => {
    assert.equal(name, row.options.name); return { default: native };
  } } } };
  const ctx = { loader: { entries: () => [row] }, plugin: (component, config) => { mounted.push([component, config]); } };
  await mountHostComponent(ctx, 'ui-chat', () => { throw Error('optional enhancement unavailable'); }, [], { setting: 1 });
  assert.deepEqual(mounted, [[native, { setting: 1 }]]);
  assert.equal(resolveRecommendedPlugin({ id: 'other', supportedHostVersions: ['older'] }, 'unlisted').unavailable, undefined);
});
