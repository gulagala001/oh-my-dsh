import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createProjectlessWorkspaceService } from '../src/projectless-workspaces.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(tmpdir()), 'omd-allocation-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const options = { root: path.join(base, 'chats'), storeDir: path.join(base, 'metadata'), now: () => new Date(2026, 9, 23) };
  const requestId = 'first-message', prompt = 'A separate chat', cwd = path.join(options.root, '2026-10-23', prompt);
  const requestFile = path.join(options.storeDir, 'requests', hash(`${options.root}\0${requestId}`) + '.json');
  const claimFile = path.join(options.storeDir, 'names', hash(cwd) + '.json');
  return { ...options, service: createProjectlessWorkspaceService(options), reopen: () => createProjectlessWorkspaceService(options),
    requestId, prompt, cwd, requestFile, claimFile, input: { requestId, prompt } };
}

async function interruptBeforeDirectory(t, f) {
  const mkdir = fs.mkdir;
  const injected = t.mock.method(fs, 'mkdir', async (directory, options) => {
    if (directory === f.cwd) throw Object.assign(Error('synthetic disk failure'), { code: 'ENOSPC' });
    return mkdir(directory, options);
  });
  await assert.rejects(f.service.prepare(f.input), /synthetic disk failure/);
  injected.mock.restore();
  assert.equal(JSON.parse(await fs.readFile(f.requestFile, 'utf8')).state, 'pending');
  assert.equal(await f.service.resolve(f.input), null);
}

test('interrupted allocation never adopts an occupied directory and retires only its own old claim', async t => {
  const f = await fixture(t);
  await interruptBeforeDirectory(t, f);
  await fs.mkdir(f.cwd);
  await fs.writeFile(path.join(f.cwd, 'user.txt'), 'user-owned contents');
  const recovered = await f.reopen().prepare(f.input);
  assert.notEqual(recovered.cwd, f.cwd);
  assert.equal(await fs.readFile(path.join(f.cwd, 'user.txt'), 'utf8'), 'user-owned contents');
  assert.equal(await f.service.owns(f.cwd), false);
  assert.equal(await f.service.owns(recovered.cwd), true);
  assert.deepEqual(await f.reopen().prepare({ ...f.input, prompt: 'changed retry text' }), recovered);
  assert.deepEqual(await f.service.resolve(f.input), recovered);
  assert.deepEqual(await fs.readdir(path.dirname(f.claimFile)), [hash(recovered.cwd) + '.json']);
});

test('occupied user names do not accumulate allocation claims', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.cwd, { recursive: true });
  await fs.mkdir(f.cwd + '-2');
  const result = await f.service.prepare(f.input);
  assert.equal(result.cwd, f.cwd + '-3');
  assert.deepEqual(await fs.readdir(path.dirname(f.claimFile)), [hash(result.cwd) + '.json']);
});

test('pending recovery checks the final mkdir exclusively, including a competing creator', async t => {
  const f = await fixture(t);
  await interruptBeforeDirectory(t, f);
  const mkdir = fs.mkdir; let raced = false;
  t.mock.method(fs, 'mkdir', async (directory, options) => {
    if (directory === f.cwd && !raced) {
      raced = true;
      await mkdir(directory);
      await fs.writeFile(path.join(directory, 'user.txt'), 'created during recovery');
    }
    return mkdir(directory, options);
  });
  const result = await f.reopen().prepare(f.input);
  assert.equal(raced, true);
  assert.notEqual(result.cwd, f.cwd);
  assert.equal(await f.service.owns(f.cwd), false);
  assert.equal(await f.service.owns(result.cwd), true);
  assert.equal(await fs.readFile(path.join(f.cwd, 'user.txt'), 'utf8'), 'created during recovery');
});

test('failed completion publication keeps the unconfirmed directory intact and retries safely', async t => {
  const f = await fixture(t), rename = fs.rename;
  const injected = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === f.requestFile && JSON.parse(await fs.readFile(from, 'utf8')).state === 'ready')
      throw Object.assign(Error('synthetic publication failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(f.service.prepare(f.input), /synthetic publication failure/);
  injected.mock.restore();
  assert.equal(await f.service.resolve(f.input), null);
  const result = await f.reopen().prepare(f.input);
  assert.notEqual(result.cwd, f.cwd);
  assert.equal((await fs.stat(f.cwd)).isDirectory(), true);
  assert.equal(await f.service.owns(f.cwd), false);
  assert.equal(await f.service.owns(result.cwd), true);
});

test('an unused pending name retains its original date and id across restart and concurrent retries', async t => {
  const f = await fixture(t);
  await interruptBeforeDirectory(t, f);
  const later = createProjectlessWorkspaceService({ root: f.root, storeDir: f.storeDir, now: () => new Date(2026, 9, 24) });
  const results = await Promise.all([f.reopen(), later, f.service].map(service => service.prepare({ ...f.input, prompt: 'changed draft' })));
  assert.ok(results.every(result => result.cwd === f.cwd));
  assert.equal(await later.owns(f.cwd), true);
  assert.deepEqual(await later.resolve(f.input), results[0]);
  // Confirmed provenance survives root changes and directory removal.
  const moved = createProjectlessWorkspaceService({ root: f.root + '-new', storeDir: f.storeDir });
  assert.equal(await moved.owns(f.cwd), true);
  await fs.rmdir(f.cwd);
  assert.equal(await moved.owns(f.cwd), false);
  assert.equal(await moved.owns(f.cwd, { requireDirectory: false }), true);
});

test('concurrent allocations keep other requests, user symlinks and confirmed paths intact', async t => {
  const f = await fixture(t);
  const first = await f.service.prepare(f.input), otherId = 'second-message';
  const originalClaim = await fs.readFile(f.claimFile, 'utf8');
  await fs.symlink(first.cwd, first.cwd + '-2');
  const [second, third] = await Promise.all([otherId, 'third-message'].map(requestId => f.reopen().prepare({ ...f.input, requestId })));
  assert.equal(new Set([first.cwd, second.cwd, third.cwd]).size, 3);
  assert.equal(await fs.readFile(f.claimFile, 'utf8'), originalClaim);
  assert.equal(await fs.readlink(first.cwd + '-2'), first.cwd);
  assert.deepEqual(await f.reopen().prepare(f.input), first);
  for (const result of [first, second, third]) assert.equal(await f.service.owns(result.cwd), true);
  assert.equal((await fs.readdir(path.dirname(f.claimFile))).length, 3);
});

test('directory provenance does not authorize a leftover blank Session to reuse another chat directory', async t => {
  const f = await fixture(t), owner = 'final-chat-id';
  const allocated = await f.service.prepare({ requestId: owner, prompt: 'Existing project' });
  await fs.writeFile(path.join(allocated.cwd, 'original.txt'), 'original project');
  assert.equal(await f.service.owns(allocated.cwd), true, 'Dream retains old directory provenance');
  assert.equal(await f.service.owns(allocated.cwd, { sessionId: owner }), true);
  assert.equal(await f.service.owns(allocated.cwd, { sessionId: null }), false, 'missing UI identity cannot claim ownership');
  assert.equal(await f.service.owns(allocated.cwd, { sessionId: 'leftover-blank-session' }), false);
  assert.equal(await f.reopen().owns(allocated.cwd, { sessionId: 'leftover-blank-session' }), false);
  assert.equal(await fs.readFile(path.join(allocated.cwd, 'original.txt'), 'utf8'), 'original project');
});

test('first-message directory stays inside its permission root, survives restart and cannot belong to another session', async t => {
  const f = await fixture(t);
  const draft = await f.service.prepare({ requestId: 'stable-id' });
  const input = { requestId: 'stable-id', cwd: draft.cwd, prompt: 'Build railway', firstSend: true };
  const [first, retry] = await Promise.all([f.service.nameDraft(input), f.reopen().nameDraft(input)]);
  assert.equal(first, path.join(draft.cwd, 'Build railway'));
  assert.equal(retry, first);
  await fs.writeFile(path.join(first, 'index.html'), 'keep me');
  assert.equal(await f.reopen().nameDraft({ ...input, prompt: 'Different message' }), first);
  assert.equal(await f.service.owns(first, { sessionId: input.requestId }), true);
  assert.equal(await f.service.owns(first, { sessionId: 'another-chat' }), false);
  assert.equal(await f.service.nameDraft({ ...input, requestId: 'another-chat' }), null);
  const legacy = await f.service.prepare(f.input);
  assert.equal(await f.service.nameDraft({ ...f.input, cwd: legacy.cwd }), null);
  await fs.rm(first, { recursive: true });
  await assert.rejects(f.reopen().nameDraft(input), /working directory is missing/);
});

test('interrupted naming never adopts pre-existing user files or symlinks', async t => {
  const f = await fixture(t);
  const draft = await f.service.prepare({ requestId: f.requestId });
  const input = { ...f.input, cwd: draft.cwd, firstSend: true };
  const named = path.join(draft.cwd, f.prompt);
  await fs.symlink(f.root, named);
  const rename = fs.rename;
  const injected = t.mock.method(fs, 'rename', async (from, to) => {
    if (to === f.requestFile && JSON.parse(await fs.readFile(from, 'utf8')).workingName)
      throw Object.assign(Error('synthetic naming publication failure'), { code: 'EIO' });
    return rename(from, to);
  });
  await assert.rejects(f.service.nameDraft(input), /synthetic naming publication/);
  injected.mock.restore();
  await fs.writeFile(path.join(named + '-2', 'user.txt'), 'untouched');
  assert.equal(await f.reopen().nameDraft(input), named + '-3');
  assert.equal(await fs.readFile(path.join(named + '-2', 'user.txt'), 'utf8'), 'untouched');
  assert.equal(await fs.readlink(named), f.root);
});

test('the claimed first message selects cwd before request assembly even before user/message is durable', async t => {
  const { installProjectlessDirectory } = await import('../src/projectless-directory.mjs');
  const f = await fixture(t), id = 'claimed-first-message';
  const draft = await f.service.prepare({ requestId: id });
  const events = [], hooks = new Map(), order = [];
  const session = { id, header: { cwd: draft.cwd }, snapshotEvents: () => events };
  const agent = { session, ctx: { get: () => ({ async set(_agent, cwd) {
    order.push(cwd); events.push({ type: 'working-directory/change', data: { cwd } });
  } }) } };
  installProjectlessDirectory({ on: (type, handler) => hooks.set(type, handler) }, f.service);
  hooks.get('agent/inbox/claimed')({ agent, message: { source: { kind: 'user' }, content: [{ type: 'text', text: 'First actual message' }] } });
  const context = { agent, signal: new AbortController().signal };
  await hooks.get('system-prompt/assemble')({}, context, () => order.push('assemble'));
  assert.deepEqual(order, [path.join(draft.cwd, 'First actual message'), 'assemble']);
  // A fresh runtime respects durable cwd changes, including a later manual cd.
  events.push({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'First actual message' }] } });
  events.push({ type: 'working-directory/change', data: { cwd: path.join(draft.cwd, 'manual') } });
  installProjectlessDirectory({ on: (type, handler) => hooks.set(type, handler) }, f.service);
  await hooks.get('system-prompt/assemble')({}, context, () => order.push('resume'));
  assert.deepEqual(order, [path.join(draft.cwd, 'First actual message'), 'assemble', 'resume']);
});
