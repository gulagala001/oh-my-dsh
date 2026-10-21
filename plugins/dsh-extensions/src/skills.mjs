import { cp, readdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { composeFrontmatter, splitFrontmatter, updateFrontmatter } from './frontmatter.mjs';
import { fail, findProjectRoot, inside, kind, writeAtomic } from './common.mjs';

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDITABLE = new Set(['user-dsh', 'user-agents', 'project-dsh', 'project-agents', 'custom']);
// DSH's frontmatter booleans also accept 1/0, yes/no and on/off.
const truthy = value => value === true || value === 1 || ['true', 'yes', 'on', '1'].includes(String(value).toLowerCase());
const falsy = value => value === false || value === 0 || ['false', 'no', 'off', '0'].includes(String(value).toLowerCase());

/** Skills stay where DSH discovers them; this only edits the files behind the native catalog. */
export class Skills {
  constructor(ctx, homes) { this.ctx = ctx; this.homes = homes; }
  async roots(scope) {
    const roots = { user: join(this.homes.dsh, 'skills') };
    if (scope.cwd) roots.project = join(await findProjectRoot(scope.cwd), '.dsh/skills');
    return roots;
  }
  /** The default roots DSH's filesystem provider reads, in its priority order. */
  async sources(scope) {
    const list = [];
    if (scope.cwd) {
      const project = await findProjectRoot(scope.cwd);
      list.push([join(project, '.dsh/skills'), 'project-dsh'], [join(project, '.agents/skills'), 'project-agents']);
    }
    list.push([join(this.homes.dsh, 'skills'), 'user-dsh', true], [join(this.homes.agents, 'skills'), 'user-agents']);
    if (process.env.DSH_BUNDLED_SKILL_DIR) list.push([resolve(process.env.DSH_BUNDLED_SKILL_DIR), 'bundled']);
    return list;
  }
  async discover(root, source, skipSystem) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
    const found = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (skipSystem && entry.name === '.system') continue;
      const path = join(root, entry.name), type = await kind(path);
      const file = type === 'directory' ? join(path, 'SKILL.md') : type === 'file' && entry.name.endsWith('.md') ? path : null;
      if (!file || await kind(file) !== 'file') continue;
      try {
        const { data } = splitFrontmatter(await readFile(file, 'utf8'));
        if (!data || typeof data.name !== 'string' || !SKILL_NAME.test(data.name) || typeof data.description !== 'string' || !data.description) continue;
        found.push({ name: data.name, description: data.description, whenToUse: typeof data.whenToUse === 'string' ? data.whenToUse : undefined, source, provider: 'filesystem', path: file,
          resourceBase: { kind: 'directory', path: type === 'directory' ? path : root },
          invocation: { modelInvocable: !truthy(data['disable-model-invocation']), userInvocable: !falsy(data['user-invocable']) } });
      } catch {}
    }
    return found;
  }
  /** Skills are agent-scoped in DSH; a live session adds the custom, bundled and plugin skills its view sees. */
  async view(scope) {
    const registry = this.ctx.get('skills'), agents = this.ctx.get('agents')?.list?.() ?? [];
    const agent = agents.find(item => item.session?.header?.origin !== 'subagent');
    if (!registry || !agent) return [];
    try { return await registry.list({ scope: agent, ...scope.cwd ? { cwd: scope.cwd } : {} }); } catch { return []; }
  }
  async list(scope) {
    const summaries = [];
    for (const [root, source, skipSystem] of await this.sources(scope)) summaries.push(...await this.discover(root, source, skipSystem));
    const known = new Set(summaries.map(skill => skill.path));
    for (const skill of await this.view(scope)) if (!skill.path || !known.has(skill.path)) summaries.push(skill);
    const skills = await Promise.all(summaries.map(async skill => {
      const directory = skill.resourceBase?.kind === 'directory' ? skill.resourceBase.path : undefined;
      const editable = EDITABLE.has(skill.source) && !!skill.path && await kind(skill.path) === 'file';
      return { name: skill.name, description: skill.description, whenToUse: skill.whenToUse, source: skill.source, provider: skill.provider,
        path: skill.path, directory, bundle: !!skill.path && basename(skill.path) === 'SKILL.md', editable,
        model: skill.invocation?.modelInvocable !== false, user: skill.invocation?.userInvocable !== false };
    }));
    return { skills, roots: await this.roots(scope) };
  }
  async find(scope, path) {
    const skill = (await this.list(scope)).skills.find(item => item.path === path);
    if (!skill) fail('skill-missing', 'This skill is no longer in the DSH catalog; refresh and try again', {}, 404);
    return skill;
  }
  async read(scope, path) {
    const skill = await this.find(scope, path);
    return { ...skill, content: await readFile(skill.path, 'utf8') };
  }
  static validate(content) {
    let parsed;
    try { parsed = splitFrontmatter(content); } catch (error) { fail('invalid-frontmatter', `Invalid YAML frontmatter: ${error.message}`); }
    if (!parsed.data) fail('frontmatter-required', 'SKILL.md needs YAML frontmatter with name and description');
    const { name, description } = parsed.data;
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) fail('invalid-skill-name', 'The skill name must be lowercase letters, digits and single hyphens');
    if (typeof description !== 'string' || !description.trim()) fail('description-required', 'A description is required');
    return parsed;
  }
  editable(skill) { if (!skill.editable) fail('skill-read-only', 'This skill is provided by DSH or a plugin and cannot be changed here', {}, 403); }
  async save(scope, path, content) {
    const skill = await this.find(scope, path); this.editable(skill);
    Skills.validate(content);
    await writeAtomic(skill.path, content);
  }
  async create(scope, { location, name, description, body }) {
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) fail('invalid-skill-name', 'The skill name must be lowercase letters, digits and single hyphens');
    if (typeof description !== 'string' || !description.trim()) fail('description-required', 'A description is required');
    const root = (await this.roots(scope))[location === 'project' ? 'project' : 'user'];
    if (!root) fail('project-required', 'Choose a workspace to create a project skill');
    const directory = join(root, name);
    if (await kind(directory)) fail('skill-exists', `A skill folder named ${name} already exists`, { name }, 409);
    await writeAtomic(join(directory, 'SKILL.md'), composeFrontmatter({ name, description: description.trim() }, body || ''));
    return join(directory, 'SKILL.md');
  }
  async invocation(scope, path, { model, user }) {
    const skill = await this.find(scope, path); this.editable(skill);
    const text = await readFile(skill.path, 'utf8');
    // The two native frontmatter switches: absent keys keep DSH's defaults.
    await writeAtomic(skill.path, updateFrontmatter(text, {
      'disable-model-invocation': model === false ? true : undefined,
      'user-invocable': user === false ? false : undefined,
    }));
  }
  async remove(scope, path) {
    const skill = await this.find(scope, path); this.editable(skill);
    if (skill.bundle) {
      const directory = dirname(skill.path);
      const roots = Object.values(await this.roots(scope)).concat(join(this.homes.agents, 'skills'));
      // Only a skill's own folder is removed, never a whole skill root.
      if (roots.some(root => resolve(root) === resolve(directory))) fail('skill-read-only', 'Refusing to remove a skill root');
      await rm(directory, { recursive: true });
    } else await rm(skill.path);
  }
  async import(scope, { location, source }) {
    if (typeof source !== 'string' || !source.trim()) fail('source-required', 'Enter the folder that contains SKILL.md');
    const from = resolve(source.trim());
    const type = await kind(from);
    const file = type === 'directory' ? join(from, 'SKILL.md') : from;
    if (await kind(file) !== 'file') fail('skill-source-missing', 'No SKILL.md was found at this location');
    const { data } = Skills.validate(await readFile(file, 'utf8'));
    const root = (await this.roots(scope))[location === 'project' ? 'project' : 'user'];
    if (!root) fail('project-required', 'Choose a workspace to create a project skill');
    const target = join(root, data.name);
    if (await kind(target)) fail('skill-exists', `A skill folder named ${data.name} already exists`, { name: data.name }, 409);
    if (type === 'directory') {
      if (inside(from, target) || inside(target, from)) fail('skill-source-overlap', 'The source folder overlaps the destination');
      await cp(from, target, { recursive: true, errorOnExist: true, filter: path => !/(?:^|[\\/])(?:\.git|node_modules)$/.test(path) });
    } else await writeAtomic(join(target, 'SKILL.md'), await readFile(file, 'utf8'));
    return join(target, 'SKILL.md');
  }
  /** The native watcher misses skill roots created after startup, so each write drops the catalog cache. */
  async refresh() {
    const skills = this.ctx.get('skills');
    if (typeof skills?.invalidateCache === 'function') skills.invalidateCache(); else await this.settle();
  }
  /** Fallback: wait briefly for the native file watcher so the next list reflects a write. */
  settle(timeout = 2500) {
    return new Promise(done => {
      let off;
      const timer = setTimeout(() => { off?.(); done(); }, timeout);
      off = this.ctx.on('skills/change', () => { clearTimeout(timer); off(); setTimeout(done, 50); });
    });
  }
}
