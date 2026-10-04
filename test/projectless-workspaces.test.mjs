import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createProjectlessWorkspaceService } from '../src/projectless-workspaces.mjs';

const execute = promisify(execFile);
const directoryLink = (target, link) => fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
const fixedNow = () => new Date(2026, 9, 5, 12);
async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'omd-projectless-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const options = { root: path.join(temporary, 'chats'), storeDir: path.join(temporary, 'store'), now: fixedNow };
  return { ...options, temporary, options, service: createProjectlessWorkspaceService(options) };
}
const exists = async (file) => fs.lstat(file).then(() => true, (error) => { if (error.code === 'ENOENT') return false; throw error; });
const metadataFile = ({ root, storeDir }, id) => path.join(storeDir, 'requests', `${createHash('sha256').update(`${root}\0${id}`).digest('hex')}.json`);

test('construction and info lookup do not create directories', async (t) => {
  const f = await fixture(t);
  assert.equal(await f.service.resolve({ requestId: 'req-1' }), null);
  assert.equal(await f.service.owns(path.join(f.root, '2026-10-05', '不存在')), false);
  assert.equal(await exists(f.root), false);
  assert.equal(await exists(f.storeDir), false);
  assert.throws(() => createProjectlessWorkspaceService({ root: 'relative', storeDir: f.storeDir }), /absolute/);
  assert.throws(() => createProjectlessWorkspaceService({ root: f.root, storeDir: f.root }), /separate/);
});

test('Chinese names are preserved, unsafe components and device names are sanitized', async (t) => {
  const f = await fixture(t);
  const workspace = await f.service.prepare({ requestId: 'req-中文'.replace('中文', '1'), prompt: '整理中文项目 / 文档: 路径..检查?\n第二行' });
  assert.equal(workspace.name, '整理中文项目 文档 路径 检查');
  assert.equal(workspace.cwd, path.join(f.root, '2026-10-05', workspace.name));
  assert.equal((await fs.lstat(workspace.cwd)).isDirectory(), true);
  assert.equal(await exists(path.join(workspace.cwd, '.git')), false);
  const device = await f.service.prepare({ requestId: 'req-2', prompt: 'CON.txt' });
  assert.equal(device.name, '聊天-CON.txt');
  const superscriptDevice = await f.service.prepare({ requestId: 'req-superscript', prompt: 'COM¹' });
  assert.equal(superscriptDevice.name, '聊天-COM¹');
  const fallback = await f.service.prepare({ requestId: 'req-3', prompt: '../../' });
  assert.equal(fallback.name, '新聊天');
});

test('different requests never overwrite an existing directory or its files', async (t) => {
  const f = await fixture(t);
  const prior = path.join(f.root, '2026-10-05', '同名聊天');
  await fs.mkdir(prior, { recursive: true });
  await fs.writeFile(path.join(prior, 'user.txt'), 'keep me');
  const a = await f.service.prepare({ requestId: 'a', prompt: '同名聊天' });
  const b = await f.service.prepare({ requestId: 'b', prompt: '同名聊天' });
  assert.equal(a.name, '同名聊天-2');
  assert.equal(b.name, '同名聊天-3');
  assert.equal(await fs.readFile(path.join(prior, 'user.txt'), 'utf8'), 'keep me');
});

test('concurrent retries and separate service instances share one directory', async (t) => {
  const f = await fixture(t);
  const second = createProjectlessWorkspaceService(f.options);
  const results = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? second : f.service).prepare({ requestId: 'same-id', prompt: `第${i}个提示` })));
  assert.equal(new Set(results.map((entry) => entry.cwd)).size, 1);
  assert.equal((await fs.readdir(path.join(f.root, '2026-10-05'))).length, 1);
  assert.deepEqual(await second.resolve({ requestId: 'same-id' }), results[0]);
});

test('same-name concurrency allocates distinct suffixes, including long names', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.service.prepare({ requestId: `id-${i}`, prompt: '中'.repeat(80) })));
  assert.equal(new Set(results.map((entry) => entry.cwd)).size, 12);
  for (const entry of results) {
    assert.ok(Buffer.byteLength(entry.name) <= 140);
    assert.deepEqual(await f.service.resolve({ requestId: entry.requestId }), entry);
  }
});

test('a fresh service on another day reuses durable mapping and preserves user files', async (t) => {
  const f = await fixture(t);
  const first = await f.service.prepare({ requestId: 'restart', prompt: '首次名称' });
  await fs.writeFile(path.join(first.cwd, 'user.txt'), 'saved');
  const restarted = createProjectlessWorkspaceService({ ...f.options, now: () => new Date(2027, 0, 1) });
  assert.deepEqual(await restarted.prepare({ requestId: 'restart', prompt: '后来改名' }), first);
  assert.equal(await fs.readFile(path.join(first.cwd, 'user.txt'), 'utf8'), 'saved');
  assert.equal(await restarted.owns(first.cwd), true);
});

test('owns recognizes only completed managed directories without reading arbitrary paths', async (t) => {
  const f = await fixture(t);
  const prior = path.join(f.root, '2026-10-05', '同名');
  await fs.mkdir(prior, { recursive: true });
  const workspace = await f.service.prepare({ requestId: 'owned', prompt: '同名' });
  assert.equal(await f.service.owns(workspace.cwd), true);
  assert.equal(await f.service.owns(prior), false, 'a skipped user directory has no ready mapping');
  for (const cwd of ['relative', f.temporary, `${workspace.cwd}/..`, `${workspace.cwd}/../同名`, null]) {
    assert.equal(await f.service.owns(cwd), false);
  }
  const file = metadataFile(f, 'owned');
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...record, state: 'pending' }));
  assert.equal(await f.service.owns(workspace.cwd), false);
});

test('pending metadata recovers after interrupted completion without deleting user data', async (t) => {
  const f = await fixture(t);
  const first = await f.service.prepare({ requestId: 'pending', prompt: '事务恢复' });
  await fs.writeFile(path.join(first.cwd, 'user.txt'), 'retain');
  const file = metadataFile(f, 'pending');
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...record, state: 'pending' }));
  const restarted = createProjectlessWorkspaceService(f.options);
  assert.equal(await restarted.resolve({ requestId: 'pending' }), null);
  assert.deepEqual(await restarted.prepare({ requestId: 'pending' }), first);
  assert.equal(await fs.readFile(path.join(first.cwd, 'user.txt'), 'utf8'), 'retain');
});

test('invalid IDs, prompts, clocks and metadata fail without arbitrary path access', async (t) => {
  const f = await fixture(t);
  for (const requestId of ['', '..', '../outside', 'a/b', 'a\\b', '\0', 'a'.repeat(201), {}, null]) {
    await assert.rejects(f.service.prepare({ requestId, prompt: 'test' }), /invalid requestId/);
  }
  await assert.rejects(f.service.prepare({ requestId: 'valid', prompt: {} }), /prompt/);
  assert.equal(await exists(f.root), false);
  assert.equal(await exists(f.storeDir), false);
  const invalidClock = createProjectlessWorkspaceService({ ...f.options, now: () => new Date(NaN) });
  await assert.rejects(invalidClock.prepare({ requestId: 'clock' }), /valid Date/);
  assert.equal(await exists(f.root), false);
  const workspace = await f.service.prepare({ requestId: 'metadata', prompt: '文件保留' });
  await fs.writeFile(path.join(workspace.cwd, 'keep.txt'), 'keep');
  const file = metadataFile(f, 'metadata');
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...record, name: '../outside' }));
  await assert.rejects(f.service.prepare({ requestId: 'metadata' }), /invalid workspace metadata/);
  assert.equal(await fs.readFile(path.join(workspace.cwd, 'keep.txt'), 'utf8'), 'keep');
});

test('root and store symlinks are rejected; occupied name symlinks are skipped', async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.temporary, 'outside');
  await fs.mkdir(outside);
  await directoryLink(outside, f.root);
  await assert.rejects(f.service.prepare({ requestId: 'root-link' }), /unsafe directory/);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(f.root);
  const day = path.join(f.root, '2026-10-05');
  await fs.mkdir(day, { recursive: true });
  await directoryLink(outside, path.join(day, '链接名称'));
  const safe = await f.service.prepare({ requestId: 'candidate-link', prompt: '链接名称' });
  assert.equal(safe.name, '链接名称-2');
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.rm(f.storeDir, { recursive: true });
  await directoryLink(outside, f.storeDir);
  await assert.rejects(f.service.prepare({ requestId: 'store-link' }), /unsafe directory/);
});

test('replaced workspace symlinks are never followed', async (t) => {
  const f = await fixture(t);
  const workspace = await f.service.prepare({ requestId: 'replace', prompt: '原目录' });
  const outside = path.join(f.temporary, 'outside');
  await fs.mkdir(outside);
  await fs.rmdir(workspace.cwd);
  await directoryLink(outside, workspace.cwd);
  await assert.rejects(f.service.resolve({ requestId: 'replace' }), /unsafe directory/);
  await assert.rejects(f.service.prepare({ requestId: 'replace' }), /unsafe directory/);
});

test('metadata file symlinks are never followed', async (t) => {
  const f = await fixture(t);
  await f.service.prepare({ requestId: 'replace', prompt: '元数据' });
  const outside = path.join(f.temporary, 'outside');
  await fs.mkdir(outside);
  const file = metadataFile(f, 'replace');
  await fs.unlink(file);
  await fs.writeFile(path.join(outside, 'private.json'), '{}');
  try { await fs.symlink(path.join(outside, 'private.json'), file, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('Windows environment does not grant file symlink permission');
      return;
    }
    throw error;
  }
  await assert.rejects(f.service.resolve({ requestId: 'replace' }));
  assert.equal(await fs.readFile(path.join(outside, 'private.json'), 'utf8'), '{}');
});

test('filesystem failure releases the lock and retry can complete', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.root, 'a user file');
  await assert.rejects(f.service.prepare({ requestId: 'retry', prompt: '重试' }), /unsafe directory/);
  assert.equal(await fs.readFile(f.root, 'utf8'), 'a user file');
  assert.equal(await exists(path.join(f.storeDir, 'allocation.lock')), false);
  await fs.unlink(f.root);
  const workspace = await f.service.prepare({ requestId: 'retry', prompt: '重试' });
  assert.equal(workspace.name, '重试');
});

test('independent Node processes serialize allocation and reuse a request ID', async (t) => {
  const f = await fixture(t);
  const moduleUrl = new URL('../src/projectless-workspaces.mjs', import.meta.url).href;
  const launch = async (id) => {
    const source = `import { createProjectlessWorkspaceService } from ${JSON.stringify(moduleUrl)}; const service = createProjectlessWorkspaceService(${JSON.stringify({ root: f.root, storeDir: f.storeDir })}); console.log(JSON.stringify(await service.prepare({requestId:${JSON.stringify(id)},prompt:'跨进程同名'})));`;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', source]);
    return JSON.parse(stdout);
  };
  const [a, retry, b, c] = await Promise.all(['same', 'same', 'different-b', 'different-c'].map(launch));
  assert.equal(a.cwd, retry.cwd);
  assert.equal(new Set([a.cwd, b.cwd, c.cwd]).size, 3);
});

test('a dead process lock can be recovered', async (t) => {
  const f = await fixture(t);
  await fs.mkdir(f.storeDir);
  await fs.writeFile(path.join(f.storeDir, 'allocation.lock'), JSON.stringify({ pid: 2147483647, token: 'dead' }));
  const workspace = await f.service.prepare({ requestId: 'recover', prompt: '恢复' });
  assert.equal(workspace.name, '恢复');
  assert.equal(await exists(path.join(f.storeDir, 'allocation.lock')), false);
});
