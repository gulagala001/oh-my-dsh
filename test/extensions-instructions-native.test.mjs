import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { Instructions } from '../plugins/dsh-extensions/src/instructions.mjs';

const host = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const native = await import(host.resolve('@deepseek-ai/dsh-agent-instructions'));
const { createScope } = await import(host.resolve('@deepseek-ai/dsh-scope'));

async function fixture(t, config = {}) {
  const directory = await mkdtemp(join(process.env.DSHX_TEST_TMPDIR || tmpdir(), 'instructions-native-'));
  const ctx = new Context(), agents = [], homes = { dsh: join(directory, 'home'), agents: join(directory, 'agents') };
  ctx.provide('sessionProjections', {});
  ctx.provide('workingDirectory', { get: session => session.header.cwd });
  ctx.provide('agents', { list: () => agents });
  ctx.provide('loader', { import: name => import(host.resolve(name)) });
  const key = {}, scope = createScope(ctx, key); let leases = 0;
  const provider = scope.ctx.plugin(native, { maxBytes: 65536, ...config }); await provider;
  ctx.provide('agentPresets', { defaultId: 'default', acquireScope: async () => {
    leases++; return { key, [Symbol.asyncDispose]: async () => { leases--; } };
  } });
  let instructions;
  const owner = ctx.plugin({ apply(child) { instructions = new Instructions(child, homes); } }); await owner;
  const file = async (path, text = 'instructions') => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text); return path; };
  const cwd = join(directory, 'project', 'child'); await mkdir(join(directory, 'project', '.git'), { recursive: true }); await mkdir(cwd);
  const agent = async (id, path, options) => {
    const value = { session: { id, header: { cwd: path, origin: 'user' } } };
    const own = createScope(ctx, value); value.ctx = own.ctx; agents.push(value);
    await own.ctx.plugin(native, { maxBytes: 65536, ...options }); return value;
  };
  t.after(async () => { await ctx.fiber.dispose(); assert.equal(leases, 0); await rm(directory, { recursive: true, force: true }); });
  return { directory, ctx, homes, cwd, provider, owner, instructions, file, agent };
}

test('cold preset config, native discovery, and the source byte limit agree', async t => {
  const f = await fixture(t, { instructionFileCandidates: ['RULES.md'], localInstructionFileCandidates: [], maxSourceBytes: 8 });
  const path = await f.file(join(f.cwd, 'RULES.md'), '123456789');
  await f.file(join(f.cwd, 'AGENTS.md'), 'not used');
  const listed = await f.instructions.list({ cwd: f.cwd });
  assert.deepEqual(listed.files.filter(row => row.group === 'project').map(row => row.path), [path]);
  assert.equal(listed.files.find(row => row.path === path).tooLarge, true);
  await assert.rejects(f.instructions.save({ cwd: f.cwd }, path, '123456789'), { code: 'instruction-too-large' });
  await f.instructions.save({ cwd: f.cwd }, path, 'valid');
  assert.match((await native.loadBaselineInstructions({ cwd: f.cwd, ...f.provider.config, dshHome: f.homes.dsh, agentsHome: f.homes.agents })).text, /valid/);
});

test('invalid candidate paths cannot authorize edits outside the native discovery rules', async t => {
  const candidates = ['../outside.md', 'nested/RULES.md', '.', '..', 'RULES.md'];
  const f = await fixture(t, { instructionFileCandidates: candidates, localInstructionFileCandidates: [] });
  // The previous implementation reads profile declarations instead of active fibers.
  f.ctx.provide('configEditor', { configuration: () => [{ entry: { options: { name: '@deepseek-ai/dsh-agent-instructions' } }, inherited: { instructionFileCandidates: candidates, localInstructionFileCandidates: [] } }] });
  const outside = await f.file(join(f.cwd, '../outside.md'), 'preserve');
  await f.file(join(f.cwd, 'nested/RULES.md'), 'preserve nested');
  const listed = await f.instructions.list({ cwd: f.cwd });
  assert.deepEqual(listed.files.filter(row => row.group === 'project').map(row => row.path), [join(f.cwd, 'RULES.md')]);
  await assert.rejects(f.instructions.save({ cwd: f.cwd }, outside, 'changed'), { code: 'instruction-path' });
  assert.equal(await readFile(outside, 'utf8'), 'preserve');
});

test('same-workspace presets contribute their own files without borrowing other projects', async t => {
  const f = await fixture(t);
  await f.agent('own', f.cwd, { instructionFileCandidates: ['OWN.md'] });
  await f.agent('other', join(f.directory, 'other'), { instructionFileCandidates: ['OTHER.md'] });
  const own = await f.file(join(f.cwd, 'OWN.md')), other = await f.file(join(f.cwd, 'OTHER.md'));
  const paths = (await f.instructions.list({ cwd: f.cwd })).files.map(row => row.path);
  assert.ok(paths.includes(own)); assert.ok(!paths.includes(other));
  assert.ok(!(await f.instructions.list({})).files.some(row => row.group === 'project'));
});

test('disabled native instruction loading exposes no guessed editable files', async t => {
  const f = await fixture(t, { maxBytes: 0 });
  const path = await f.file(join(f.homes.dsh, 'AGENTS.md'));
  assert.deepEqual((await f.instructions.list({})).files, []);
  await assert.rejects(f.instructions.save({}, path, 'changed'), { code: 'instruction-path' });
});

test('saving a symlink edits its target; deleting removes only the link', async t => {
  const f = await fixture(t), target = await f.file(join(f.directory, 'shared.md'), 'before');
  await mkdir(f.homes.dsh, { recursive: true }); const path = join(f.homes.dsh, 'AGENTS.md'); await symlink(target, path);
  await f.instructions.save({}, path, 'after');
  assert.equal((await lstat(path)).isSymbolicLink(), true);
  assert.equal(await readFile(target, 'utf8'), 'after');
  await f.instructions.remove({}, path);
  assert.equal(await readFile(target, 'utf8'), 'after');
});

test('unreadable metadata is an error, never a creatable missing file', async t => {
  const f = await fixture(t); await mkdir(f.homes.dsh, { recursive: true });
  const path = join(f.homes.dsh, 'AGENTS.md'); await symlink(path, path);
  await assert.rejects(f.instructions.list({}), { code: 'ELOOP' });
});

test('disposal during discovery prevents a late file write', async t => {
  const f = await fixture(t), path = await f.file(join(f.homes.dsh, 'AGENTS.md'), 'before');
  const task = f.instructions.save({}, path, 'late');
  const rejected = assert.rejects(task, /stopped|disposed|changed/i);
  await f.owner.dispose(); await rejected;
  assert.equal(await readFile(path, 'utf8'), 'before');
});

test('cancelling an accepted edit keeps original bytes and the next edit can succeed', async t => {
  const f = await fixture(t), path = await f.file(join(f.homes.dsh, 'AGENTS.md'), 'before');
  const controller = new AbortController();
  const task = f.instructions.save({}, path, 'cancelled', controller.signal);
  controller.abort(Error('request cancelled'));
  await assert.rejects(task, /cancelled/);
  assert.equal(await readFile(path, 'utf8'), 'before');
  await f.instructions.save({}, path, 'recovered');
  assert.equal((await f.instructions.read({}, path)).content, 'recovered');
});

test('a replaced standing preset revision cannot authorize a stale file commit', async t => {
  const f = await fixture(t), path = await f.file(join(f.homes.dsh, 'AGENTS.md'), 'before');
  const presets = f.ctx.agentPresets, acquire = presets.acquireScope.bind(presets); let reads = 0;
  presets.acquireScope = async (...args) => {
    const lease = await acquire(...args);
    // Initial discovery, then read validation, then the final atomic commit.
    if (++reads === 3) return { ...lease, key: {} };
    return lease;
  };
  await assert.rejects(f.instructions.save({}, path, 'retired'), { code: 'instruction-changed' });
  assert.equal(await readFile(path, 'utf8'), 'before');
  await f.instructions.save({}, path, 'retry');
  assert.equal(await readFile(path, 'utf8'), 'retry');
});

test('overlapping native candidate lists deduplicate paths and expose different source limits', async t => {
  const f = await fixture(t, { instructionFileCandidates: ['AGENTS.md', 'AGENTS.md'], maxSourceBytes: 4 });
  await f.agent('larger', f.cwd, { maxSourceBytes: 32 });
  const path = await f.file(join(f.cwd, 'AGENTS.md'), 'larger');
  const rows = (await f.instructions.list({ cwd: f.cwd })).files.filter(row => row.path === path);
  assert.equal(rows.length, 1); assert.equal(rows[0].partiallyLimited, true); assert.equal(rows[0].maxBytes, 32);
  assert.equal(rows[0].tooLarge, false);
});

test('sequential saves and delete settle in request order and cold editors read the same disk', async t => {
  const f = await fixture(t), path = join(f.homes.dsh, 'AGENTS.md');
  await Promise.all([f.instructions.save({}, path, 'first'), f.instructions.save({}, path, 'second'), f.instructions.remove({}, path)]);
  assert.equal((await f.instructions.read({}, path)).content, '');
  await f.instructions.save({}, path, 'persistent'); await f.owner.dispose();
  let cold; await f.ctx.plugin({ apply(ctx) { cold = new Instructions(ctx, f.homes); } });
  assert.equal((await cold.read({}, path)).content, 'persistent');
});
