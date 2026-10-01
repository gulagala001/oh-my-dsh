import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, parse, sep } from 'node:path';
import { prepareOffline } from '../scripts/prepare-offline.mjs';

async function fixture(t) {
  const root = realpathSync(await fs.mkdtemp(join(tmpdir(), 'omd-offline-root-')));
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(join(source, 'package.json'), '{}');
  return { root, source };
}

for (const trailingSlash of [false, true]) {
  test(`root-level output skips mkdir(root), trailing slash: ${trailingSlash}`, async t => {
    const { root, source } = await fixture(t);
    const volume = parse(root).root;
    const destination = join(volume, `omd-offline-test-${process.pid}-${Date.now()}`);
    // Simulate Windows' documented mkdir(root) EPERM without writing to the root.
    const mkdir = t.mock.method(fs, 'mkdir', async () => { throw Object.assign(new Error('mkdir root'), { code: 'EPERM' }); });
    const reachedStaging = new Error('staging reached');
    const staging = t.mock.method(fs, 'mkdtemp', async prefix => {
      assert.equal(prefix, join(volume, '.omd-offline-'));
      throw reachedStaging;
    });
    syncBuiltinESMExports();
    await assert.rejects(prepareOffline(destination + (trailingSlash ? sep : ''), source), error => error === reachedStaging);
    assert.equal(mkdir.mock.callCount(), 0);
    assert.equal(staging.mock.callCount(), 1);
  });
}

test('missing non-root parents are still created recursively', async t => {
  const { root, source } = await fixture(t);
  const destination = join(root, 'new', 'nested', 'output');
  const reachedStaging = new Error('staging reached');
  t.mock.method(fs, 'mkdtemp', async prefix => {
    assert.equal(prefix, join(dirname(destination), '.omd-offline-'));
    assert.equal((await fs.stat(dirname(destination))).isDirectory(), true);
    throw reachedStaging;
  });
  syncBuiltinESMExports();
  await assert.rejects(prepareOffline(destination, source), error => error === reachedStaging);
});

test('non-root mkdir permission errors are not swallowed', async t => {
  const { root, source } = await fixture(t);
  const denied = Object.assign(new Error('mkdir denied'), { code: 'EACCES' });
  t.mock.method(fs, 'mkdir', async () => { throw denied; });
  const staging = t.mock.method(fs, 'mkdtemp', async () => { assert.fail('must not stage after mkdir failure'); });
  syncBuiltinESMExports();
  await assert.rejects(prepareOffline(join(root, 'new', 'output'), source), error => error === denied);
  assert.equal(staging.mock.callCount(), 0);
});

test('root staging permission errors are not swallowed', async t => {
  const { root, source } = await fixture(t);
  const denied = Object.assign(new Error('staging denied'), { code: 'EPERM' });
  t.mock.method(fs, 'mkdtemp', async () => { throw denied; });
  syncBuiltinESMExports();
  await assert.rejects(prepareOffline(join(parse(root).root, `omd-offline-denied-${process.pid}`), source), error => error === denied);
});

test('a file in place of an output parent still fails without modifying it', async t => {
  const { root, source } = await fixture(t);
  const parent = join(root, 'file');
  await fs.writeFile(parent, 'preserve');
  await assert.rejects(prepareOffline(join(parent, 'output'), source), error => ['ENOTDIR', 'EEXIST', 'ENOENT'].includes(error.code));
  assert.equal(await fs.readFile(parent, 'utf8'), 'preserve');
});
