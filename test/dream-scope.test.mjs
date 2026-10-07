import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { folderOf, folderTree, isDriveRoot, isUnderPath, selectedProjects } from '../src/dream/scope.mjs';
import { DreamStore } from '../src/dream/store.mjs';
import { handleDreamApi } from '../src/dream/api.mjs';

const win = process.platform === 'win32';
const at = (...parts) => (win ? 'D:\\' : '/') + parts.join(win ? '\\' : '/');


test('a drive root is recognised in every spelling and is never a folder', () => {
  if (win) for (const spelling of ['D:', 'D:/', 'D:\\', 'd:\\']) assert.equal(isDriveRoot(spelling), true, spelling);
  else assert.equal(isDriveRoot('/'), true);
  assert.equal(isDriveRoot(at('work')), false);
  assert.equal(isDriveRoot('   '), false);
  assert.equal(isDriveRoot('@unclassified'), false);
});

test('ancestor matching is segment-safe and never matches an equal path', () => {
  assert.equal(isUnderPath(at('work', 'a', 'b'), at('work', 'a')), true);
  assert.equal(isUnderPath(at('work', 'ab'), at('work', 'a')), false, 'a sibling prefix is not an ancestor');
  assert.equal(isUnderPath(at('work', 'a'), at('work', 'a')), false);
  assert.equal(isUnderPath(at('work'), at('work', 'a')), false);
  assert.equal(isUnderPath(at('work', 'a'), ''), false);
  assert.equal(isUnderPath(null, at('work')), false);
});


test('a project joins its longest strict ancestor and keeps the offered spelling', () => {
  const roots = [at('work'), at('work', 'a')];
  assert.equal(folderOf(at('work', 'a', 'b', 'c'), roots), at('work', 'a'));
  assert.equal(folderOf(at('work', 'z'), roots), at('work'));
  assert.equal(folderOf(at('other', 'z'), roots), at('other', 'z'), 'no ancestor keeps the project itself');
  assert.equal(folderOf(at('work', 'a'), roots), at('work'), 'a listed project still belongs to its parent');
});

test('relative and bare drive keys never resolve against the process cwd', () => {
  assert.equal(folderOf('@unclassified', [at('work')]), '@unclassified');
  assert.equal(folderOf('relative/deep', [at('work')]), 'relative/deep');
  assert.equal(folderOf('D:', [at('work')]), 'D:');
});

test('a drive root candidate cannot swallow a whole disk', () => {
  if (!win) return;
  assert.equal(folderOf('D:\\work\\a', ['D:']), 'D:\\work\\a');
});


test('folder tree groups projects by folder and reports missing folders last', () => {
  const projects = [at('live', 'a'), at('live', 'b'), at('gone', 'c')];
  const tree = folderTree(projects, [at('live')], folder => folder !== at('gone', 'c'));
  assert.deepEqual(tree.map(entry => entry.folder), [at('live'), at('gone', 'c')]);
  assert.deepEqual(tree[0].projects, [at('live', 'a'), at('live', 'b')]);
  assert.equal(tree[0].exists, true);
  assert.equal(tree[1].exists, false, 'a folder whose directory is gone is still worth organizing');
});

test('a throwing folder probe keeps the folder selectable instead of failing the list', () => {
  const tree = folderTree([at('live', 'a')], [at('live')], () => { throw Error('probe failed'); });
  assert.equal(tree[0].exists, true);
});

test('an empty or blank selection means every project; a folder selection narrows by folder', () => {
  const projects = [at('work', 'a'), at('work', 'b'), at('other', 'c')];
  assert.deepEqual(selectedProjects(projects, []), projects);
  assert.deepEqual(selectedProjects(projects, ['   ']), projects, 'a blank selection is not a silent narrowing');
  assert.deepEqual(selectedProjects(projects, null), projects);
  assert.deepEqual(selectedProjects(projects, [at('work')]), [at('work', 'a'), at('work', 'b')]);
  assert.deepEqual(selectedProjects(projects, [at('work', 'a')]), [at('work', 'a')]);
  assert.deepEqual(selectedProjects(projects, [at('other', 'c')]), [at('other', 'c')]);
});


test('a failed target steps the run past itself yet stays retryable and never counts as progress', t => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-dream-scope-')), store = new DreamStore(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const epoch = store.acquire(), job = store.enqueue('global', 'global');
  store.updateJob(job.id, { state: 'running' });
  store.setTargets(job.id, [{ kind: 'session', target: 'a' }, { kind: 'session', target: 'b' }, { kind: 'project', target: 'p' }], epoch);
  store.markTargetFailed(job.id, 0, epoch);
  assert.equal(store.nextTarget(job.id).target, 'b', 'this run moves past the failed target');
  assert.equal(store.finishedTargets(job.id), 0, 'a failed target is not progress');
  store.clearTargetFailures(job.id, epoch);
  assert.equal(store.nextTarget(job.id).target, 'a', 'the next run attempts the failed target again');
  store.finishTarget(job.id, 0, epoch);
  store.finishTarget(job.id, 2, epoch);
  assert.equal(store.finishedTargets(job.id), 1, 'only advanced session targets count as progress');
});


test('an archive written before the failed column opens, keeps its progress and gains the column', t => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-dream-scope-legacy-'));
  mkdirSync(join(dir, 'dream-v1'), { recursive: true });
  const legacy = new DatabaseSync(join(dir, 'dream-v1', 'memory.sqlite'));
  legacy.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,data TEXT NOT NULL);' +
    'CREATE TABLE job_targets(job TEXT NOT NULL,ordinal INTEGER NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,cut TEXT,PRIMARY KEY(job,ordinal));');
  const insert = legacy.prepare('INSERT INTO job_targets(job,ordinal,kind,target,done) VALUES(?,?,?,?,?)');
  insert.run('j', 0, 'session', 'a', 1); insert.run('j', 1, 'session', 'b', 0);
  legacy.close();
  const store = new DreamStore(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(store.finishedTargets('j'), 1, 'progress recorded by the old archive survives');
  assert.equal(store.nextTarget('j').target, 'b', 'unfinished work from the old archive is still pending');
  assert.ok(store.db.prepare('PRAGMA table_info(job_targets)').all().some(column => column.name === 'failed'));
});


test('Dream settings accept a string folder selection and reject anything else', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-dream-scope-api-')), store = new DreamStore(dir);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const saved = [];
  const hub = {
    config: () => ({ dreamProvider: '', dreamModel: '' }),
    store: { peek: () => null },
    dream: { store, notice: () => {}, tick: async () => {}, status: () => ({ settings: {} }) },
  };
  const ctx = { agents: new Map(), settings: { update: async (namespace, patch) => saved.push(patch) } };
  const call = async body => {
    const sent = [];
    await handleDreamApi({
      hub, ctx, req: { method: 'POST' }, res: {},
      url: new URL('http://local/trisoul-x/api/dream/settings'),
      send: (_res, status, data) => sent.push({ status, data }),
      readBody: async () => body,
    });
    return sent;
  };
  await call({ dreamProjects: [at('work')] });
  assert.deepEqual(saved, [{ dreamProjects: [at('work')] }]);
  await assert.rejects(call({ dreamProjects: [42] }), /字符串数组/);
  await assert.rejects(call({ dreamProjects: at('work') }), /字符串数组/);
  assert.equal(saved.length, 1, 'a rejected patch is never written');
});

