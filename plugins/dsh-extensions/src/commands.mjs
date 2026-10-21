import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { composeFrontmatter, splitFrontmatter } from './frontmatter.mjs';
import { errorText, fail, findProjectRoot, kind, tilde, writeAtomic } from './common.mjs';

const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/;

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
  return { name, path, location, description, argumentHint: typeof data['argument-hint'] === 'string' ? data['argument-hint'].trim() : '', body: body.trim(), error };
}
async function readDirectory(dir, location) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []; throw error; }
  const commands = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const name = entry.name.slice(0, -3);
    if (!COMMAND_NAME.test(name)) continue;
    commands.push(await readCommand(join(dir, entry.name), name, location));
  }
  return commands;
}

/** Markdown prompt templates registered into DSH's native `/` command registry. */
export class Commands {
  constructor(ctx, homes) {
    this.ctx = ctx; this.userDir = join(homes.dsh, 'commands');
    this.user = new Map(); this.agents = new Map(); this.registry = null;
  }
  start() {
    this.ctx.inject(['commands'], scope => {
      this.registry = scope;
      scope.effect(() => () => { this.registry = null; for (const entry of this.user.values()) entry.dispose?.(); this.user.clear(); });
      void this.syncUser().catch(error => this.ctx.logger?.warn?.(`dsh-extensions: commands: ${errorText(error)}`));
      for (const agent of this.ctx.get('agents')?.list?.() ?? []) void this.attach(agent);
    });
    this.ctx.on('agent/created', ({ agent }) => { void this.attach(agent); });
    this.ctx.on('agent/disposed', ({ agent }) => this.detach(agent));
    this.ctx.effect(() => () => { for (const agent of [...this.agents.keys()]) this.detach(agent); });
  }
  /** Commands registered by DSH and other plugins, which custom files may not shadow. */
  builtin() {
    const commands = this.registry?.commands;
    if (!commands) return [];
    // Agent-scoped commands (for example from the agent preset) only show in a session's view.
    const agent = (this.ctx.get('agents')?.list?.() ?? []).find(item => item.session?.header?.origin !== 'subagent');
    const rows = new Map();
    for (const view of agent ? [undefined, agent] : [undefined]) {
      try { for (const row of commands.list(view)) rows.set(row.name, row); } catch {}
    }
    const own = new Set([...this.user.values()].filter(entry => entry.dispose).map(entry => entry.command.name));
    for (const name of agent ? this.agents.get(agent)?.names ?? [] : []) own.add(name);
    return [...rows.values()].filter(row => !own.has(row.name)).sort((a, b) => a.name.localeCompare(b.name))
      .map(row => ({ name: row.name, description: row.description, hint: row.input?.hint ?? '' }));
  }
  definition(command) {
    return { name: command.name, description: command.description,
      input: { hint: command.argumentHint || 'arguments', attachments: true },
      handler: async invocation => {
        // Read the file again so edits apply without re-registering.
        const current = await readCommand(command.path, command.name, command.location).catch(() => command);
        const text = expandTemplate(current.body, invocation.rawInput);
        if (!text && !invocation.attachments.length) return { kind: 'error', text: `/${command.name} is empty` };
        invocation.agent.followup(createUserMessage({ content: [...invocation.attachments, ...text ? [{ type: 'text', text }] : []], source: { kind: 'user' } }));
        return { kind: 'success' };
      } };
  }
  async syncUser() {
    if (!this.registry) return;
    const commands = await readDirectory(this.userDir, 'user');
    for (const [name, entry] of this.user) { entry.dispose?.(); this.user.delete(name); }
    const taken = new Set(this.builtin().map(row => row.name));
    for (const command of commands) {
      if (taken.has(command.name)) { this.user.set(command.name, { command, conflict: true }); continue; }
      try { this.user.set(command.name, { command, dispose: this.registry.commands.register(this.definition(command)) }); }
      catch (error) { this.user.set(command.name, { command, conflict: true, error: errorText(error) }); }
    }
  }
  cwdOf(agent) { return this.ctx.get('workingDirectory')?.get?.(agent.session) ?? agent.session?.header?.cwd; }
  async attach(agent) {
    if (!this.registry || agent.session?.header?.origin === 'subagent' || this.agents.has(agent)) return;
    const entry = { names: [], dispose: null, root: null };
    this.agents.set(agent, entry);
    try {
      const cwd = this.cwdOf(agent);
      if (!cwd) return;
      entry.root = await findProjectRoot(cwd);
      await this.registerProject(agent, entry);
    } catch (error) { this.ctx.logger?.warn?.(`dsh-extensions: project commands: ${errorText(error)}`); }
  }
  async registerProject(agent, entry) {
    entry.dispose?.(); entry.dispose = null; entry.names = [];
    const commands = await readDirectory(join(entry.root, '.dsh/commands'), 'project');
    if (this.agents.get(agent) !== entry) return;
    const taken = new Set(this.builtin().map(row => row.name));
    const usable = commands.filter(command => !taken.has(command.name));
    if (!usable.length) return;
    entry.names = usable.map(command => command.name);
    // Agent-scoped rows shadow user rows of the same name for this session only.
    const fiber = agent.ctx.inject(['commands'], scope => { for (const command of usable) scope.commands.register(this.definition(command)); });
    entry.dispose = () => { try { (typeof fiber === 'function' ? fiber : fiber?.dispose)?.call(fiber); } catch {} };
  }
  detach(agent) { const entry = this.agents.get(agent); this.agents.delete(agent); entry?.dispose?.(); }
  async refreshProject(root) {
    for (const [agent, entry] of this.agents) if (entry.root === root) await this.registerProject(agent, entry).catch(() => {});
  }
  async projectDir(scope) { return scope.cwd ? join(await findProjectRoot(scope.cwd), '.dsh/commands') : null; }
  async list(scope) {
    await this.syncUser();
    const builtin = this.builtin(), taken = new Set(builtin.map(row => row.name));
    const project = await this.projectDir(scope);
    const describe = command => ({ name: command.name, description: command.description, argumentHint: command.argumentHint, path: command.path, location: command.location,
      error: command.error ?? null, conflict: taken.has(command.name) });
    return { user: [...this.user.values()].map(entry => describe(entry.command)), project: project ? (await readDirectory(project, 'project')).map(describe) : [],
      builtin, dirs: { user: tilde(this.userDir), project: tilde(project) } };
  }
  async locate(scope, location) {
    if (location === 'project') { const dir = await this.projectDir(scope); if (!dir) fail('project-required', 'Choose a workspace for project commands'); return dir; }
    return this.userDir;
  }
  async read(scope, location, name) {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Command names start with a lowercase letter and use a-z, 0-9, - or _');
    const path = join(await this.locate(scope, location), `${name}.md`);
    if (await kind(path) !== 'file') fail('command-missing', `/${name} no longer exists`, { name }, 404);
    return { ...await readCommand(path, name, location), content: await readFile(path, 'utf8') };
  }
  async save(scope, { location, name, previous, description, argumentHint, body }) {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Command names start with a lowercase letter and use a-z, 0-9, - or _');
    if (typeof body !== 'string' || !body.trim()) fail('template-required', 'The prompt template is required');
    if (this.builtin().some(row => row.name === name)) fail('command-taken', `/${name} is already provided by DSH or another plugin`, { name }, 409);
    const dir = await this.locate(scope, location), path = join(dir, `${name}.md`);
    if (name !== previous && await kind(path)) fail('command-exists', `/${name} already exists`, { name }, 409);
    await writeAtomic(path, composeFrontmatter({ description: description?.trim(), 'argument-hint': argumentHint?.trim() }, body));
    if (previous && previous !== name && COMMAND_NAME.test(previous)) await rm(join(dir, `${previous}.md`), { force: true });
    await this.afterChange(scope, location);
  }
  async remove(scope, location, name) {
    if (!COMMAND_NAME.test(name ?? '')) fail('invalid-command-name', 'Invalid command name');
    await rm(join(await this.locate(scope, location), `${name}.md`), { force: true });
    await this.afterChange(scope, location);
  }
  async afterChange(scope, location) {
    if (location === 'project') await this.refreshProject(await findProjectRoot(scope.cwd));
    else await this.syncUser();
  }
}
