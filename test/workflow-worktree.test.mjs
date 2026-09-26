import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { workflow } from './fixtures/workflow.mjs';
const exec = promisify(execFile);
const git = (cwd, ...args) => exec('git', args, { cwd, windowsHide: true });

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'omd-worktree-')), repo = join(root, 'repo'), storage = join(root, 'worktrees');
  await mkdir(repo); t.after(() => rm(root, { recursive: true, force: true }));
  await git(repo, 'init', '-q'); await git(repo, 'config', 'user.name', 'Workflow Fixture'); await git(repo, 'config', 'user.email', 'workflow@example.invalid');
  await writeFile(join(repo, 'file.txt'), 'baseline\n'); await writeFile(join(repo, '.gitignore'), 'ignored.txt\n');
  await git(repo, 'add', '.'); await git(repo, 'commit', '-qm', 'baseline');
  const policy = { mode: 'danger-full-access', workspaceRoot: repo };
  return { root, repo, storage, policy, create: () => workflow.WorkflowWorktree.create(repo, storage, policy) };
}

test('isolated checkout starts at HEAD, leaves parent edits intact, and removes only unchanged checkout', async t => {
  const fx = await fixture(t); await writeFile(join(fx.repo, 'file.txt'), 'parent dirty\n');
  const worktree = await fx.create();
  assert.equal(await readFile(join(worktree.artifact.path, 'file.txt'), 'utf8'), 'baseline\n');
  assert.equal(await readFile(join(fx.repo, 'file.txt'), 'utf8'), 'parent dirty\n');
  assert.equal((await worktree.settle()).retained, false);
  await assert.rejects(stat(worktree.artifact.path), /ENOENT/);
  assert.equal(await readFile(join(fx.repo, 'file.txt'), 'utf8'), 'parent dirty\n');
});

test('changed, untracked, ignored, and committed workflow worktrees survive cleanup', async t => {
  const fx = await fixture(t);
  for (const kind of ['changed', 'untracked', 'ignored', 'committed']) {
    const worktree = await fx.create(), path = worktree.artifact.path;
    const file = kind === 'ignored' ? 'ignored.txt' : kind === 'untracked' ? 'new.txt' : 'file.txt';
    await writeFile(join(path, file), kind);
    if (kind === 'committed') { await git(path, 'add', 'file.txt'); await git(path, 'commit', '-qm', 'child change'); }
    const settled = await worktree.settle(); assert.equal(settled.retained, true, kind);
    assert.equal(await readFile(join(path, file), 'utf8'), kind); assert.deepEqual(await worktree.settle(), settled);
  }
});

test('worktree creation preserves project subdirectory and does not run checkout hooks', async t => {
  const fx = await fixture(t); await mkdir(join(fx.repo, 'sub')); await writeFile(join(fx.repo, 'sub', 'tracked.txt'), 'ok');
  await git(fx.repo, 'add', 'sub'); await git(fx.repo, 'commit', '-qm', 'subdirectory');
  const hook = join(fx.repo, '.git', 'hooks', 'post-checkout');
  await writeFile(hook, '#!/bin/sh\nprintf hooked > hook-ran.txt\n', { mode: 0o755 });
  const worktree = await workflow.WorkflowWorktree.create(join(fx.repo, 'sub'), fx.storage, fx.policy);
  assert.equal(await readFile(join(worktree.artifact.cwd, 'tracked.txt'), 'utf8'), 'ok');
  await assert.rejects(stat(join(worktree.artifact.path, 'hook-ran.txt')), /ENOENT/);
  assert.equal((await worktree.settle()).retained, false);
  await assert.rejects(workflow.WorkflowWorktree.create(fx.repo, fx.storage, { ...fx.policy, mode: 'read-only' }), /writable/);
  await assert.rejects(workflow.WorkflowWorktree.create(fx.repo, fx.storage, { ...fx.policy, mode: 'workspace-write' }), /sandbox provider/);
});

test('worktree setup disables checkout filters and does not accept inherited Git redirects', async t => {
  const fx = await fixture(t), marker = join(fx.root, 'filter-ran.txt'), script = join(fx.root, 'filter.mjs');
  await writeFile(script, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'ran');`);
  await git(fx.repo, 'config', 'filter.fixture.smudge', `"${process.execPath}" "${script}"`);
  await writeFile(join(fx.repo, '.gitattributes'), '*.txt filter=fixture\n');
  await git(fx.repo, 'add', '.gitattributes'); await git(fx.repo, 'commit', '-qm', 'filter configuration');
  const previous = process.env.GIT_DIR; process.env.GIT_DIR = join(fx.root, 'not-the-repository');
  let worktree;
  try { worktree = await fx.create(); } finally { if (previous === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previous; }
  await assert.rejects(stat(marker), /ENOENT/); assert.equal((await worktree.settle()).retained, false);
});
