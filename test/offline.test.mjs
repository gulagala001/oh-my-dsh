import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rename, rm, symlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkLinks, checkOffline } from '../scripts/check-offline.mjs';
import { prepareOffline } from '../scripts/prepare-offline.mjs';

const fixture = async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-offline-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
};

test('moving a Windows-style absolute dependency link reproduces the failed import and is diagnosed', async t => {
  const root = await fixture(t), prepared = join(root, 'prepared'), moved = join(root, 'moved');
  const dependency = join(prepared, 'node_modules/.pnpm/package/node_modules/offline-dependency');
  await mkdir(dependency, { recursive: true });
  await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'offline-dependency', type: 'module', main: 'index.mjs' }));
  await writeFile(join(dependency, 'index.mjs'), 'export const value = 14;');
  await writeFile(join(prepared, 'package.json'), '{"type":"module"}');
  await writeFile(join(prepared, 'index.mjs'), "export { value } from 'offline-dependency';");
  await symlink(dependency, join(prepared, 'node_modules/offline-dependency'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await import(pathToFileURL(join(prepared, 'index.mjs')).href)).value, 14);
  await rename(prepared, moved);
  await assert.rejects(import(pathToFileURL(join(moved, 'index.mjs')).href), { code: 'ERR_MODULE_NOT_FOUND' });
  assert.match(checkLinks(join(moved, 'node_modules')).join('\n'), /offline-dependency.*失效/);
});

test('the portable check rejects links even when the preparing directory is still available', async t => {
  const root = await fixture(t), external = join(root, 'source'), portable = join(root, 'portable');
  await mkdir(external); await mkdir(portable);
  await symlink(external, join(portable, 'dependency'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(checkLinks(portable, true).join('\n'), /离线目录外/);
});

test('wrong-platform offline directories fail before loading any native or plugin entry', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  await writeFile(join(root, 'offline-manifest.json'), JSON.stringify({ schema: 1, version: '1.0.0', platform: 'other-platform', arch: process.arch }));
  const result = await checkOffline(root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks, []);
  assert.match(result.errors.join('\n'), /同系统、同架构/);
});

test('offline preparation never overwrites an existing directory or copies into its source', async t => {
  const root = await fixture(t), source = join(root, 'source'), destination = join(root, 'existing');
  await mkdir(source); await mkdir(destination);
  await writeFile(join(destination, 'user-file'), 'preserve');
  await assert.rejects(prepareOffline(destination, source), /已存在/);
  assert.equal(await readFile(join(destination, 'user-file'), 'utf8'), 'preserve');
  await assert.rejects(prepareOffline(join(source, 'output'), source), /源码目录外/);
  const alias = join(root, 'source-alias');
  await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(prepareOffline(join(alias, 'output'), source), /源码目录外/);
});
