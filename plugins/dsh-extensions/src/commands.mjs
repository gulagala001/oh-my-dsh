import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { symbols } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { composeFrontmatter, splitFrontmatter } from './frontmatter.mjs';
import { errorText, fail, findProjectRoot, kind, tilde, writeAtomic } from './common.mjs';

const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/;
const original = value => value?.[symbols.original] ?? value;
// Cordis 4.0.5: a registration owner is usable only while LOADING or ACTIVE.
const usable = scope => scope?.fiber?.uid !== null && [1, 2].includes(scope?.fiber?.state);
const clear = rows => { for (const entry of rows.values()) entry.dispose?.(); rows.clear(); };

export function splitArguments(raw) {
  return [...raw.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(match => match[1] ?? match[2] ?? match[3]);
}
/** `$ARGUMENTS` takes the whole input and `$1`…`$9` its words; unused input is appended. */
export function expandTemplate(body, raw = '') {
  const args = raw.trim(), words = splitArguments(args);
  let used = false;
  const text = body.replace(/\$ARGUMENTS\b|\$([1-9])/g, (_, index) => { used = true; return index ? words[index - 1] ?? '' : args; }).trim();
  return !used && args ? `${text}\n\nARGUMENTS: ${args}` : text;
}

async function readCommand(path, name, location) {
  const text = await readFile(path, 'utf8');
  let data = {}, body = text, error = null;
  try { const parsed = splitFrontmatter(text); data = parsed.data ?? {}; body = parsed.body; }
  catch (failure) { error = errorText(failure); }
  const firstLine = body.split('\n').map(line => line.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '';
  const description = typeof data.description === 'string' && data.description.trim() ? data.description.trim() : firstLine.slice(0, 80) || name;
  return { name, path, location, description, argumentHint: typeof data['argument-hint'] === 'string' ? data['argument-hint'].trim() : '', body: body.trim(), content: text, error };
}
async function readDirectory(dir, location) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []; throw error; }
  const commands = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (!COMMAND_NAME.test(name)) continue;
    // The registry needs discovery metadata, never a fallback copy of a prompt.
    const { body, content, ...command } = await readCommand(join(dir, entry.name), name, location);
    commands.push(command);
  }
  return commands;
}

/** Markdown prompt templates registered into DSH's native `/` command registry. */
export class Commands {
  constructor(ctx, homes) {
    this.ctx = ctx; this.userDir = join(homes.dsh, 'commands');
    this.registry = null;
  }
  start() {
    return this.ctx.inject(['commands'], async scope => {
      const owner = { scope, user: new Map(), agents: new Map(), pending: Promise.resolve() };
      this.registry = owner;
      scope.effect(() => async () => {
        if (this.registry === owner) this.registry = null;
        clear(owner.user);
        const results = await Promise.allSettled([...owner.agents.keys()].map(agent => this.detach(agent, owner)));
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (errors.length) throw new AggregateError(errors, 'Command cleanup failed');
      });
      // The native registry resolves a cold Agent before executing its first
      // command. Finish this scoped overlay inside that same creation barrier.
      scope.on('agent/created', ({ agent }) => this.attach(agent, owner));
      scope.on('agent/disposed', ({ agent }) => this.detach(agent, owner));
      const ready = (this.ctx.get('agents')?.list?.() ?? []).map(agent => this.attach(agent, owner));
      ready.push(this.syncUser(owner));
      await Promise.all(ready);
    });
  }
  active(owner) { return !!owner && this.registry === owner && usable(owner.scope); }
  requireOwner(owner) { if (!this.active(owner)) fail('service-missing', 'The command service is stopped; refresh and try again', {}, 503); }
  run(action, owner = this.registry) {
    if (!this.active(owner)) return Promise.reject(new Error('The command service is stopped; refresh and try again'));
    // File changes and their native registrations share one ordered operation.
    const result = owner.pending.then(() => { this.requireOwner(owner); return action(owner); });
    owner.pending = result.catch(() => {});
    return result;
  }
  /** Native definition identities distinguish our rows from scoped shadows. */
  builtin(owner, views = [undefined]) {
    const rows = new Map();
    for (const agent of views) {
      const own = new Set([...owner.user.values(), ...(owner.agents.get(agent)?.commands.values() ?? [])]
        .filter(entry => entry.dispose).map(entry => entry.definitionId));
      for (const row of owner.scope.commands.list(agent)) if (!own.has(row.definitionId)) rows.set(row.name, row);
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
      .map(row => ({ name: row.name, description: row.description, hint: row.input?.hint ?? '' }));
  }
  definition(command, current = () => true) {
    return { definitionId: `dsh-extensions:${command.path}`, name: command.name, description: command.description,
      input: { hint: command.argumentHint || 'arguments', attachments: true },
      handler: async invocation => {
        invocation.signal?.throwIfAborted();
        if (!current()) throw Error(`/${command.name} is no longer active; refresh and try again`);
        const file = await readCommand(command.path, command.name, command.location);
        invocation.signal?.throwIfAborted();
        if (!current()) throw Error(`/${command.name} is no longer active; refresh and try again`);
        if (file.error) return { kind: 'error', text: `/${command.name}: ${file.error}` };
        const text = expandTemplate(file.body, invocation.rawInput);
        if (!text && !invocation.attachments.length) return { kind: 'error', text: `/${command.name} is empty` };
        invocation.agent.followup(createUserMessage({ content: [...invocation.attachments, ...text ? [{ type: 'text', text }] : []], source: { kind: 'user' } }));
        return { kind: 'success' };
      } };
  }
  reconcile(owner, scope, rows, commands, agent) {
    const taken = new Set(this.builtin(owner, [agent]).map(row => row.name));
    const desired = new Map(commands.map(command => [command.name, command]));
    for (const [name, entry] of rows) {
      const next = desired.get(name), previous = entry.command;
      if (!next || taken.has(name) || previous.description !== next.description || previous.argumentHint !== next.argumentHint) {
        entry.dispose?.(); rows.delete(name);
      }
    }
    for (const command of commands) {
      const previous = rows.get(command.name);
      if (previous?.dispose) { previous.command = command; previous.error = command.error; continue; }
      const entry = { command, error: command.error };
      rows.set(command.name, entry);
      // A malformed project file must report its error, not run a personal
      // command of the same name. The live handler remains the file authority.
      if (taken.has(command.name)) continue;
      const definition = this.definition(command, () => this.active(owner) && usable(scope) && rows.get(command.name) === entry);
      entry.definitionId = definition.definitionId;
      try { entry.dispose = scope.commands.register(definition); }
      catch (error) { entry.error = errorText(error); }
    }
  }
  async updateUser(owner) {
    const commands = await readDirectory(this.userDir, 'user');
    this.requireOwner(owner);
    this.reconcile(owner, owner.scope, owner.user, commands);
  }
  syncUser(owner = this.registry) { return this.run(current => this.updateUser(current), owner); }
  cwdOf(agent) { return this.ctx.get('workingDirectory')?.get?.(agent.session) ?? agent.session?.header?.cwd; }
  async attach(agent, owner = this.registry) {
    agent = original(agent);
    if (!this.active(owner) || agent.session?.header?.origin === 'subagent') return;
    if (owner.agents.has(agent)) return owner.agents.get(agent).ready;
    const entry = { commands: new Map(), root: null, scope: null, fiber: null };
    owner.agents.set(agent, entry);
    entry.ready = this.run(async () => {
      const cwd = this.cwdOf(agent);
      if (!cwd) return;
      entry.root = await findProjectRoot(cwd);
      if (!this.active(owner) || owner.agents.get(agent) !== entry) return;
      entry.fiber = agent.ctx.inject(['commands'], scope => { entry.scope = scope; scope.effect(() => () => { entry.scope = null; clear(entry.commands); }); });
      await entry.fiber;
      await this.updateProject(owner, entry.root);
    }, owner);
    return entry.ready;
  }
  async detach(agent, owner = this.registry) {
    agent = original(agent);
    const entry = owner?.agents.get(agent);
    if (!entry) return;
    owner.agents.delete(agent); clear(entry.commands);
    await entry.fiber?.dispose();
  }
  async updateProject(owner, root) {
    const commands = await readDirectory(join(root, '.dsh/commands'), 'project');
    this.requireOwner(owner);
    for (const [agent, entry] of owner.agents) if (entry.root === root && usable(entry.scope)) this.reconcile(owner, entry.scope, entry.commands, commands, agent);
    return commands;
  }
  refreshProject(root) { return this.run(owner => this.updateProject(owner, root)); }
  async projectDir(scope) { return scope.cwd ? join(await findProjectRoot(scope.cwd), '.dsh/commands') : null; }
  views(owner, root) { return root ? [undefined, ...[...owner.agents].filter(([, entry]) => entry.root === root).map(([agent]) => agent)] : [undefined]; }
  list(scope) { return this.run(async owner => {
    await this.updateUser(owner);
    const root = scope.cwd ? await findProjectRoot(scope.cwd) : null;
    const project = root ? await this.updateProject(owner, root) : [];
    const builtin = this.builtin(owner, this.views(owner, root)), taken = new Set(builtin.map(row => row.name));
    const describe = command => ({ name: command.name, description: command.description, argumentHint: command.argumentHint, path: command.path, location: command.location,
      error: command.error ?? null, conflict: taken.has(command.name) });
    return { user: [...owner.user.values()].map(entry => ({ ...describe(entry.command), error: entry.error ?? null })),
      project: project.map(command => ({ ...describe(command), error: command.error ?? [...owner.agents.values()].filter(entry => entry.root === root).map(entry => entry.commands.get(command.name)?.error).find(Boolean) ?? null })),
      builtin, dirs: { user: tilde(this.userDir), project: tilde(root ? join(root, '.dsh/commands') : null) } };
  }); }
  async locate(scope, location) {
    if (location === 'project') { const dir = await this.projectDir(scope); if (!dir) fail('project-required', 'Choose a workspace for project commands'); return dir; }
    return this.userDir;
  }
  async read(scope, location, name) {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Command names start with a lowercase letter and use a-z, 0-9, - or _');
    const path = join(await this.locate(scope, location), `${name}.md`);
    if (await kind(path) !== 'file') fail('command-missing', `/${name} no longer exists`, { name }, 404);
    return readCommand(path, name, location);
  }
  save(scope, { location, name, previous, description, argumentHint, body }) { return this.run(async owner => {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Command names start with a lowercase letter and use a-z, 0-9, - or _');
    if (typeof body !== 'string' || !body.trim()) fail('template-required', 'The prompt template is required');
    const root = location === 'project' && scope.cwd ? await findProjectRoot(scope.cwd) : null;
    if (this.builtin(owner, this.views(owner, root)).some(row => row.name === name)) fail('command-taken', `/${name} is already provided by DSH or another plugin`, { name }, 409);
    const dir = await this.locate(scope, location), path = join(dir, `${name}.md`);
    if (name !== previous && await kind(path)) fail('command-exists', `/${name} already exists`, { name }, 409);
    this.requireOwner(owner);
    await writeAtomic(path, composeFrontmatter({ description: description?.trim(), 'argument-hint': argumentHint?.trim() }, body));
    if (previous && previous !== name && COMMAND_NAME.test(previous)) await rm(join(dir, `${previous}.md`), { force: true });
    await this.afterChange(owner, scope, location, name);
  }); }
  remove(scope, location, name) { return this.run(async owner => {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Invalid command name');
    const path = join(await this.locate(scope, location), `${name}.md`);
    this.requireOwner(owner);
    await rm(path, { force: true });
    await this.afterChange(owner, scope, location);
  }); }
  async afterChange(owner, scope, location, savedName) {
    let rows;
    if (location === 'project') {
      const root = await findProjectRoot(scope.cwd);
      await this.updateProject(owner, root);
      rows = [...owner.agents.values()].filter(entry => entry.root === root).map(entry => entry.commands);
    } else { await this.updateUser(owner); rows = [owner.user]; }
    const error = savedName && rows.map(rows => rows.get(savedName)?.error).find(Boolean);
    if (error) fail('command-registration', `/${savedName} was saved but could not be registered: ${error}`, { name: savedName }, 500);
  }
}
