import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { loadHostModule } from '../src/host-component.mjs';

async function overlay(t, name = 'tool-bash', metadata = {}) {
  const root = await mkdtemp(join(tmpdir(), 'omd overlay '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'node_modules', '@deepseek-ai', 'dsh-' + name);
  await mkdir(join(dir, 'lib'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-' + name, version: pkg.engines.dsh, main: 'lib/index.js', ...metadata }));
  const file = join(dir, 'lib/index.js');
  // Resolving a registration must not execute the third-party file.
  await writeFile(file, 'throw Error("overlay entry must not execute during dependency resolution");');
  return { dir, file, url: pathToFileURL(file).href };
}
const row = (name, tree) => ({ options: { name }, parent: { tree } });
const ctx = entries => ({ loader: { entries: () => entries } });
const load = (entries, name = 'tool-bash') => loadHostModule(ctx(entries), name, require => require('host-dependency'), ['host-dependency']);

test('file-registered shell components preserve the actual Loader dependency identity', async t => {
  for (const name of ['tool-bash', 'tool-pwsh']) {
    const file = await overlay(t, name), identity = Symbol(name);
    const tree = { async import(specifier) { assert.equal(specifier, 'host-dependency'); return { identity }; } };
    const result = await load([row(file.url, tree), row(file.url, tree)], name);
    assert.equal(result.identity, identity);
  }
});

test('an original package registration retains priority over private shell entries', async t => {
  const file = await overlay(t);
  const original = { async import() { return { source: 'original' }; } };
  const privateTree = { async import() { throw Error('private tree must not be selected'); } };
  assert.equal((await load([row(file.url, privateTree), row('@deepseek-ai/dsh-tool-bash', original)])).source, 'original');
});

test('private lookup rejects misleading package names, versions, submodules and non-shell components', async t => {
  const tree = { async import() { throw Error('unmatched tree must not be used'); } };
  for (const metadata of [{ name: 'another-package' }, { version: '0.0.0' }]) {
    const file = await overlay(t, 'tool-bash', metadata);
    await assert.rejects(load([row(file.url, tree)]), { code: 'OMD_HOST_COMPONENT_MISSING' });
  }
  const file = await overlay(t);
  const internal = join(file.dir, 'lib/internal.js'); await writeFile(internal, '');
  await assert.rejects(load([row(pathToFileURL(internal).href, tree)]), { code: 'OMD_HOST_COMPONENT_MISSING' });
  const jobs = await overlay(t, 'jobs-local');
  await assert.rejects(load([row(jobs.url, tree)], 'jobs-local'), { code: 'OMD_HOST_COMPONENT_MISSING' });
});

test('private lookup refuses multiple packages or multiple dependency owners', async t => {
  const first = await overlay(t), second = await overlay(t);
  const tree = { async import() { throw Error('ambiguous tree must not be used'); } };
  await assert.rejects(load([row(first.url, tree), row(second.url, tree)]), { code: 'OMD_HOST_COMPONENT_AMBIGUOUS' });
  await assert.rejects(load([row(first.url, tree), row(first.url, { ...tree })]), { code: 'OMD_HOST_COMPONENT_AMBIGUOUS' });
});
