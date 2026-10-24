import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as nextTick } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import { Commands } from '../plugins/dsh-extensions/src/commands.mjs';

const native = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'));
const { CommandRuntime } = await import(native.resolve('@deepseek-ai/dsh-commands'));
const { createScope } = await import(native.resolve('@deepseek-ai/dsh-scope'));

async function fixture(t) {
  const directory = await mkdtemp(join(process.env.DSHX_TEST_TMPDIR || tmpdir(), 'commands-native-'));
  const ctx = new Context(), agents = [], sent = [], events = [];
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  const runtime = ctx.plugin(CommandRuntime); await runtime;
  ctx.provide('agents', { list: () => agents });
  const file = async (root, name, body) => {
    const path = join(root, 'commands', `${name}.md`);
    await mkdir(join(root, 'commands'), { recursive: true }); await writeFile(path, body); return path;
  };
  const agent = async (name) => {
    const cwd = join(directory, name); await mkdir(join(cwd, '.git'), { recursive: true });
    const value = { session: { header: { cwd, origin: 'user' }, append: (type, data) => { events.push({ type, data }); return events.length; } }, followup: message => sent.push(message) };
    const scope = createScope(ctx, value); value.ctx = scope.ctx; agents.push(value); return value;
  };
  let commands, owner;
  const mount = async () => {
    owner = ctx.plugin({ apply(child) { commands = new Commands(child, { dsh: directory }); commands.start(); } });
    await owner; await commands.list({}); return commands;
  };
  return { directory, ctx, file, agent, mount, runtime, agents, sent, events, get owner() { return owner; } };
}

test('unchanged command lists preserve native registrations and produce no change events', async t => {
  const f = await fixture(t);
  await f.file(f.directory, 'review', 'Review changes');
  const commands = await f.mount();
  let changes = 0; f.ctx.on('commands/change', () => { changes++; });
  const before = f.ctx.commands.list()[0];
  await commands.list({}); await commands.list({});
  assert.equal(changes, 0);
  assert.equal(f.ctx.commands.list()[0], before);
});

test('one agent preset cannot reserve project command names in another project', async t => {
  const f = await fixture(t), a = await f.agent('a'), b = await f.agent('b');
  await a.ctx.inject(['commands'], scope => scope.commands.register({ name: 'review', description: 'Preset A', handler: () => ({ kind: 'success' }) }));
  await f.file(join(b.session.header.cwd, '.dsh'), 'review', 'Project B');
  const commands = await f.mount();
  await commands.attach(b); await commands.refreshProject(b.session.header.cwd);
  assert.equal(f.ctx.commands.find(b, 'review')?.description, 'Project B');
  const global = await commands.list({});
  assert.ok(!global.builtin.some(row => row.name === 'review'));
});

test('concurrent project refreshes leave exactly one removable native registration', async t => {
  const f = await fixture(t), agent = await f.agent('a');
  await f.file(join(agent.session.header.cwd, '.dsh'), 'review', 'Project A');
  const commands = await f.mount();
  await commands.refreshProject(agent.session.header.cwd);
  await Promise.all([commands.refreshProject(agent.session.header.cwd), commands.refreshProject(agent.session.header.cwd)]);
  await commands.detach(agent); await nextTick();
  assert.equal(f.ctx.commands.find(agent, 'review'), undefined);
});

test('unloading the command owner during file read prevents a late followup', async t => {
  const f = await fixture(t), agent = await f.agent('a');
  await f.file(f.directory, 'review', 'Review changes');
  await f.mount();
  const operation = f.ctx.commands.execute(agent, '/review', [], new AbortController().signal).catch(error => ({ error }));
  await f.owner.dispose();
  await operation;
  assert.equal(f.sent.length, 0);
  assert.equal(f.ctx.commands.find(agent, 'review'), undefined);
});

test('native execution keeps scoped precedence, live edits, errors and recovery', async t => {
  const f = await fixture(t), a = await f.agent('a'), b = await f.agent('b');
  await f.file(f.directory, 'review', 'Personal $ARGUMENTS');
  const path = await f.file(join(a.session.header.cwd, '.dsh'), 'review', '---\ndescription: Project review\n---\nProject $1');
  const commands = await f.mount();
  const execute = (agent, text) => f.ctx.commands.execute(agent, text, [], new AbortController().signal);
  assert.equal((await execute(a, '/review first')).result.kind, 'success');
  assert.equal((await execute(b, '/review second')).result.kind, 'success');
  assert.deepEqual(f.sent.map(message => message.content[0].text), ['Project first', 'Personal second']);
  await writeFile(path, '---\ndescription: Project review\n---\nEdited $ARGUMENTS');
  const before = f.ctx.commands.find(a, 'review');
  await commands.refreshProject(a.session.header.cwd);
  assert.equal(f.ctx.commands.find(a, 'review'), before);
  assert.equal((await execute(a, '/review third')).result.kind, 'success');
  assert.equal(f.sent.at(-1).content[0].text, 'Edited third');
  await writeFile(path, '---\ndescription: [invalid\n---\nbad');
  assert.equal((await execute(a, '/review')).result.kind, 'error');
  assert.equal(f.sent.length, 3);
  assert.ok((await commands.list({ cwd: a.session.header.cwd })).project[0].error);
  assert.equal((await execute(a, '/review')).result.kind, 'error');
  assert.equal(f.sent.length, 3, 'an invalid project command cannot fall back to the personal template');
  await writeFile(path, 'Recovered');
  await commands.refreshProject(a.session.header.cwd);
  assert.equal((await execute(a, '/review')).result.kind, 'success');
  await commands.remove({ cwd: a.session.header.cwd }, 'project', 'review');
  assert.equal((await execute(a, '/review after-delete')).result.kind, 'success');
  assert.equal(f.sent.at(-1).content[0].text, 'Personal after-delete');
  assert.equal(f.events.filter(event => event.type === 'command/run').length, 7);
  assert.equal(f.events.filter(event => event.type === 'command/done').length, 7);
});

test('foreign scoped definitions remain visible even with an owned personal name', async t => {
  const f = await fixture(t), agent = await f.agent('a');
  await f.file(f.directory, 'review', 'Personal');
  const commands = await f.mount();
  const foreign = agent.ctx.inject(['commands'], scope => scope.commands.register({ name: 'review', description: 'Foreign review', handler: () => ({ kind: 'success' }) }));
  await foreign;
  await f.file(join(agent.session.header.cwd, '.dsh'), 'review', 'Project');
  const page = await commands.list({ cwd: agent.session.header.cwd });
  assert.ok(page.builtin.some(row => row.description === 'Foreign review'));
  assert.equal(page.project[0].conflict, true);
  assert.equal(f.ctx.commands.find(agent, 'review').description, 'Foreign review');
  await foreign.dispose();
  await commands.refreshProject(agent.session.header.cwd);
  assert.equal(f.ctx.commands.find(agent, 'review').description, 'Project');
});

test('queued creates cannot overwrite each other and later edits still apply', async t => {
  const f = await fixture(t), commands = await f.mount();
  const outcomes = await Promise.allSettled(['first', 'second'].map(body => commands.save({}, { location: 'user', name: 'review', body })));
  assert.deepEqual(outcomes.map(result => result.status), ['fulfilled', 'rejected']);
  assert.match(outcomes[1].reason.message, /already exists/);
  assert.equal(await readFile(join(f.directory, 'commands/review.md'), 'utf8'), 'first\n');
  await commands.save({}, { location: 'user', name: 'renamed', previous: 'review', body: 'renamed body' });
  assert.deepEqual(f.ctx.commands.list().map(row => row.name), ['renamed']);
  await commands.remove({}, 'user', 'renamed');
  assert.deepEqual(f.ctx.commands.list(), []);
});

test('registry restart and plugin reload rebuild from files without ghost registrations', async t => {
  const f = await fixture(t), agent = await f.agent('a');
  await f.file(f.directory, 'personal', 'Personal');
  await f.file(join(agent.session.header.cwd, '.dsh'), 'project', 'Project');
  let commands = await f.mount();
  const before = f.ctx.commands.list(agent).map(row => row.name);
  await f.runtime.restart();
  await commands.list({ cwd: agent.session.header.cwd });
  assert.deepEqual(f.ctx.commands.list(agent).map(row => row.name), before);
  await f.owner.dispose();
  assert.deepEqual(f.ctx.commands.list(agent), []);
  commands = await f.mount();
  assert.deepEqual(f.ctx.commands.list(agent).map(row => row.name), before);
  const queued = commands.save({}, { location: 'user', name: 'late', body: 'Must not write' });
  await f.owner.dispose();
  await assert.rejects(queued, /stopped/);
  await assert.rejects(readFile(join(f.directory, 'commands/late.md')), { code: 'ENOENT' });
});

test('agent creation finishes project registration before the first native command', async t => {
  const f = await fixture(t);
  await f.file(f.directory, 'review', 'Personal');
  await f.mount();
  const agent = await f.agent('new');
  await f.file(join(agent.session.header.cwd, '.dsh'), 'review', 'Project');
  await f.ctx.serial('agent/created', { agent });
  assert.equal(f.ctx.commands.find(agent, 'review').description, 'Project');
});
