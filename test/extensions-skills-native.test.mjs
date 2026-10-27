import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { Skills } from '../plugins/dsh-extensions/src/skills.mjs';

const native = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const { SkillRegistry } = await import(native.resolve('@deepseek-ai/dsh-skill'));
const filesystem = await import(native.resolve('@deepseek-ai/dsh-skill-filesystem'));
const { createScope } = await import(native.resolve('@deepseek-ai/dsh-scope'));

async function fixture(t, config = {}) {
  const directory = await realpath(await mkdtemp(join(process.env.DSHX_TEST_TMPDIR || tmpdir(), 'skills-native-')));
  const ctx = new Context(), agents = [];
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  await ctx.plugin(SkillRegistry);
  ctx.provide('agents', { list: () => agents });
  const homes = { dsh: join(directory, 'home'), agents: join(directory, 'agents') };
  const custom = join(directory, 'custom');
  const provider = ctx.plugin(filesystem, { dshHome: homes.dsh, agentsHome: homes.agents, customSkillDirs: [custom], watch: false, ...config });
  await provider;
  const skills = new Skills(ctx, homes);
  const file = async (root, name, extra = '') => {
    const path = join(root, name, 'SKILL.md');
    await mkdir(join(root, name), { recursive: true });
    await writeFile(path, `---\nname: ${name}\ndescription: ${name} description\n${extra}---\n${name} body\n`);
    ctx.skills.invalidateCache(); return path;
  };
  const agent = async (id, cwd) => {
    await mkdir(join(cwd, '.git'), { recursive: true });
    const value = { session: { id, header: { cwd, origin: 'user' } } };
    value.ctx = createScope(ctx, value).ctx; agents.push(value); return value;
  };
  return { directory, ctx, homes, custom, skills, file, agent, provider };
}

test('catalog respects configured roots and works before any agent exists', async t => {
  const f = await fixture(t, { includeDefaultRoots: false });
  const custom = await f.file(f.custom, 'custom-skill');
  await f.file(join(f.homes.dsh, 'skills'), 'disabled-default');
  assert.deepEqual((await f.skills.list({})).skills.map(row => row.path), [custom]);
  await assert.rejects(f.skills.create({}, { name: 'invisible', description: 'not loaded' }), /root|directory/i);
});

test('workspace and global catalogs never borrow another agents scoped skills', async t => {
  const f = await fixture(t), a = await f.agent('a', join(f.directory, 'a')), b = await f.agent('b', join(f.directory, 'b'));
  await a.ctx.inject(['skills'], scope => scope.skills.register({ name: 'only-a', description: 'A preset', content: 'A body', source: 'runtime' }));
  await b.ctx.inject(['skills'], scope => scope.skills.register({ name: 'only-b', description: 'B preset', content: 'B body', source: 'runtime' }));
  assert.deepEqual((await f.skills.list({})).skills.map(row => row.name), []);
  assert.deepEqual((await f.skills.list({ cwd: b.session.header.cwd })).skills.map(row => row.name), ['only-b']);
});

test('catalog uses the native parser for invalid invocation flags', async t => {
  const f = await fixture(t);
  await f.file(join(f.homes.dsh, 'skills'), 'invalid-policy', 'user-invocable: maybe\n');
  assert.deepEqual(await f.ctx.skills.list(), []);
  assert.deepEqual((await f.skills.list({})).skills, []);
});

test('provider failures are explicit instead of an empty or partial successful catalog', async t => {
  const f = await fixture(t);
  f.ctx.skills.registerProvider(() => ({ name: 'unavailable', list: async () => { throw Error('provider unavailable'); }, get: async () => undefined }));
  await assert.rejects(f.skills.list({}), /complete|provider|catalog/i);
});

test('runtime skills without file paths can be opened through their own provider', async t => {
  const f = await fixture(t);
  f.ctx.skills.register({ name: 'runtime-note', description: 'read only', content: 'Runtime body', source: 'runtime' });
  const [row] = (await f.skills.list({})).skills;
  assert.ok(row, 'the host catalog is available without an agent');
  assert.equal(row.editable, false);
  assert.equal((await f.skills.read({}, row.key)).content, 'Runtime body');
});

test('native flat SKILL.md is a file and deleting it preserves the custom root', async t => {
  const f = await fixture(t);
  await f.agent('a', join(f.directory, 'a'));
  await mkdir(f.custom, { recursive: true });
  const path = join(f.custom, 'SKILL.md'), sibling = join(f.custom, 'keep.txt');
  await writeFile(path, '---\nname: flat-skill\ndescription: flat\n---\nbody\n');
  await writeFile(sibling, 'preserve');
  const row = (await f.skills.list({})).skills.find(row => row.path === path);
  assert.ok(row); assert.equal(row.bundle, false);
  await f.skills.remove({}, path);
  assert.equal(await readFile(sibling, 'utf8'), 'preserve');
});

test('same-name shadowed files remain manageable and native precedence stays intact', async t => {
  const f = await fixture(t), cwd = join(f.directory, 'project');
  await mkdir(join(cwd, '.git'), { recursive: true });
  const personal = await f.file(join(f.homes.dsh, 'skills'), 'review');
  const project = await f.file(join(cwd, '.dsh/skills'), 'review');
  assert.deepEqual(new Set((await f.skills.list({ cwd })).skills.map(row => row.path)), new Set([personal, project]));
  assert.equal((await f.ctx.skills.get('review', { cwd })).path, project);
  await f.skills.invocation({ cwd }, project, { model: false, user: false });
  assert.deepEqual((await f.ctx.skills.get('review', { cwd })).invocation, { modelInvocable: false, userInvocable: false });
  await f.skills.remove({ cwd }, project);
  assert.equal((await f.ctx.skills.get('review', { cwd })).path, personal);
});

test('editing invalid native metadata fails before replacing the existing file', async t => {
  const f = await fixture(t), path = await f.file(join(f.homes.dsh, 'skills'), 'edit');
  const before = await readFile(path, 'utf8');
  await assert.rejects(f.skills.save({}, path, before.replace('---\nedit body', 'user-invocable: maybe\n---\nedit body')), { code: 'invalid-frontmatter' });
  assert.equal(await readFile(path, 'utf8'), before);
});

test('concurrent creates have one winner and partial invocation edits preserve each other', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled(['first', 'second'].map(body => f.skills.create({}, { name: 'concurrent', description: 'test', body })));
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
  const path = results[0].value;
  assert.match(await readFile(path, 'utf8'), /first/);
  await Promise.all([f.skills.invocation({}, path, { model: false }), f.skills.invocation({}, path, { user: false })]);
  assert.deepEqual((await f.ctx.skills.get('concurrent')).invocation, { modelInvocable: false, userInvocable: false });
});

test('invalid or incomplete imports leave no active partial bundle and can be retried', async t => {
  const f = await fixture(t);
  const path = await f.file(join(f.directory, 'incoming'), 'imported', 'user-invocable: maybe\n');
  await assert.rejects(f.skills.import({}, { source: join(f.directory, 'incoming/imported') }), { code: 'invalid-frontmatter' });
  assert.deepEqual(await readdir(join(f.homes.dsh, 'skills')), []);
  await writeFile(path, '---\nname: imported\ndescription: Imported\n---\nbody');
  await writeFile(join(f.directory, 'incoming/imported/reference.txt'), 'reference');
  if (process.platform !== 'win32') {
    const fifo = join(f.directory, 'incoming/imported/bad-fifo'); execFileSync('mkfifo', [fifo]);
    await assert.rejects(f.skills.import({}, { source: join(f.directory, 'incoming/imported') }), /FIFO|copy/i);
    assert.deepEqual(await readdir(join(f.homes.dsh, 'skills')), []);
    await rm(fifo);
  }
  const alias = join(f.directory, 'import-alias');
  await symlink(join(f.directory, 'incoming/imported'), alias, 'dir');
  const imported = await f.skills.import({}, { source: alias });
  assert.equal(await readFile(join(imported, '../reference.txt'), 'utf8'), 'reference');
  assert.equal((await f.ctx.skills.get('imported')).content, 'body');
});

test('stopping the editor during a native read prevents late publication and drains the operation', async t => {
  const f = await fixture(t), started = Promise.withResolvers(), released = Promise.withResolvers();
  const provider = [...f.ctx.skills.layers.global.providers.values()][0].provider;
  const get = provider.get.bind(provider);
  provider.get = async (...args) => { started.resolve(); await released.promise; return get(...args); };
  const task = f.skills.create({}, { name: 'late', description: 'test' });
  const rejected = assert.rejects(task, /stopped/);
  await started.promise;
  const closing = f.ctx.fiber.dispose();
  released.resolve(); await rejected; await closing;
  assert.deepEqual(await readdir(join(f.homes.dsh, 'skills')), []);
});

test('symlinked bundles are removed as links, preserving the original resource directory', async t => {
  const f = await fixture(t);
  const external = await f.file(join(f.directory, 'external'), 'linked');
  await mkdir(join(f.homes.dsh, 'skills'), { recursive: true });
  const link = join(f.homes.dsh, 'skills/linked');
  await symlink(join(external, '..'), link, 'dir');
  const [row] = (await f.skills.list({})).skills;
  assert.equal(row.path, join(link, 'SKILL.md'));
  await f.skills.remove({}, row.path);
  assert.match(await readFile(external, 'utf8'), /linked body/);
  assert.deepEqual(await readdir(join(f.homes.dsh, 'skills')), []);
});

test('cold default-preset scope is read without an agent, and its lease is always released', async t => {
  const f = await fixture(t); await f.provider.dispose();
  const key = {}, scope = createScope(f.ctx, key); let leases = 0;
  await scope.ctx.plugin(filesystem, { dshHome: f.homes.dsh, agentsHome: f.homes.agents, watch: false });
  f.ctx.provide('agentPresets', { defaultId: 'test', acquireScope: async () => {
    leases++;
    return { key, [Symbol.asyncDispose]: async () => { leases--; } };
  } });
  const path = await f.file(join(f.homes.dsh, 'skills'), 'cold');
  assert.equal((await f.skills.list({})).skills[0].path, path);
  assert.equal(leases, 0);
  await f.skills.create({}, { name: 'created-cold', description: 'test' });
  assert.equal((await f.ctx.skills.get('created-cold', { scope: key })).name, 'created-cold');
  await scope.ctx.inject(['skills'], ctx => ctx.skills.registerProvider(() => ({ name: 'bad', list: async () => { throw Error('incomplete'); } })));
  await assert.rejects(f.skills.list({}), { code: 'skill-catalog-incomplete' });
  assert.equal(leases, 0);
});

test('provider replacement during validation cannot publish into its retired root', async t => {
  const f = await fixture(t), started = Promise.withResolvers(), released = Promise.withResolvers();
  const provider = [...f.ctx.skills.layers.global.providers.values()][0].provider, get = provider.get.bind(provider);
  provider.get = async (...args) => { started.resolve(); await released.promise; return get(...args); };
  const task = f.skills.create({}, { name: 'retired', description: 'test' });
  const rejected = assert.rejects(task, { code: 'skill-missing' });
  await started.promise; await f.provider.dispose(); released.resolve(); await rejected;
  assert.deepEqual(await readdir(join(f.homes.dsh, 'skills')), []);
});
